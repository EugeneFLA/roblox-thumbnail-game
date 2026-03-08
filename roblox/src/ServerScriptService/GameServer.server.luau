-- GameServer.server.luau
-- Серверная логика: загрузка раундов с бэкенда, обработка голосов

local HttpService       = game:GetService("HttpService")
local Players           = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config  = require(ReplicatedStorage:WaitForChild("ThumbnailMaster"):WaitForChild("Config"))
local Remotes = require(ReplicatedStorage:WaitForChild("ThumbnailMaster"):WaitForChild("Remotes"))

-- ========== СОСТОЯНИЕ СЕРВЕРА ==========

-- Данные игроков: sessionId, очки, история раундов
local playerData = {}       -- [userId] = { sessionId, score, roundIndex, history }

-- Текущий общий раунд (все игроки видят одно и то же)
local currentRound   = nil
local roundInProgress = false
local roundNumber    = 1

-- ========== HTTP-УТИЛИТЫ ==========

local function httpGet(path)
	local url = Config.BACKEND_URL .. path
	local ok, result = pcall(function()
		return HttpService:GetAsync(url, true)
	end)
	if not ok then
		warn("[ThumbnailMaster] GET " .. path .. " failed: " .. tostring(result))
		return nil
	end
	local ok2, data = pcall(function()
		return HttpService:JSONDecode(result)
	end)
	if not ok2 then
		warn("[ThumbnailMaster] JSON decode failed: " .. tostring(data))
		return nil
	end
	return data
end

local function httpPost(path, body)
	local url     = Config.BACKEND_URL .. path
	local encoded = HttpService:JSONEncode(body)
	local ok, result = pcall(function()
		return HttpService:PostAsync(url, encoded, Enum.HttpContentType.ApplicationJson, false)
	end)
	if not ok then
		warn("[ThumbnailMaster] POST " .. path .. " failed: " .. tostring(result))
		return nil
	end
	local ok2, data = pcall(function()
		return HttpService:JSONDecode(result)
	end)
	return ok2 and data or nil
end

-- ========== СЕССИИ ИГРОКОВ ==========

local function getOrCreateSession(player)
	local uid = tostring(player.UserId)
	if playerData[uid] then return playerData[uid] end

	-- Уникальный sessionId на основе UserId + случайного числа
	local sessionId = "roblox_" .. uid .. "_" .. tostring(math.random(100000, 999999))

	-- Регистрируем сессию на бэкенде
	local data = httpGet("/session/" .. sessionId)
	if data and data.session then
		sessionId = data.session.session_id
	end

	playerData[uid] = {
		sessionId  = sessionId,
		score      = 0,
		roundIndex = 0,
		history    = {},
	}

	print("[ThumbnailMaster] Session created for " .. player.Name .. ": " .. sessionId)
	return playerData[uid]
end

-- ========== ЗАГРУЗКА РАУНДОВ ==========

local function fetchRound(sessionId)
	-- Используем единый эндпоинт /round?roundNumber=N
	local path = "/round?roundNumber=" .. tostring(roundNumber)
		.. "&sessionId=" .. HttpService:UrlEncode(sessionId)
	return httpGet(path)
end

-- Преобразует ответ бэкенда в формат для клиентов
local function normalizeRound(rawRound, sessionId)
	if not rawRound then return nil end

	local roundType = rawRound.type or rawRound.roundType or "guess"

	if roundType == "guess" then
		-- Режим "Угадай игру": 4 тамбнейла + описание
		local options = {}
		if rawRound.thumbnails then
			for i, t in ipairs(rawRound.thumbnails) do
				options[i] = {
					id       = t.id,
					imageUrl = t.url or t.imageUrl,
					isIcon   = t.isIcon or false,
				}
			end
		end
		return {
			type        = "guess",
			description = rawRound.description or "",
			gameName    = rawRound.gameName or "",
			correctId   = rawRound.correctThumbId or rawRound.correctThumbnailId,
			options     = options,
			sessionId   = sessionId,
		}

	elseif roundType == "campaign_pick" or roundType == "pick_best" then
		-- Режим "Выбери лучший": 2 тамбнейла кампании
		local options = {}
		if rawRound.thumbnails then
			for i, t in ipairs(rawRound.thumbnails) do
				options[i] = {
					id           = t.id,
					imageUrl     = t.url or t.imageUrl,
					campaignThumbId = t.campaignThumbId,
					label        = t.label,
				}
			end
		end
		return {
			type        = "pick_best",
			description = rawRound.description or rawRound.gameDescription or "",
			gameName    = rawRound.gameName or rawRound.gameTitle or "",
			campaignId  = rawRound.campaignId,
			options     = options,
			sessionId   = sessionId,
		}
	end

	return nil
end

-- ========== ИГРОВОЙ ЦИКЛ ==========

local function broadcastRound(round)
	currentRound   = round
	roundInProgress = true
	print("[ThumbnailMaster] Broadcasting round #" .. roundNumber .. " type=" .. round.type)
	Remotes.RoundStarted:FireAllClients(round)
end

local function startNextRound()
	roundInProgress = false
	task.wait(Config.ROUND_DELAY)

	-- Берём sessionId первого онлайн-игрока для запроса раунда (раунд общий)
	local refSessionId = "roblox_global"
	for _, player in ipairs(Players:GetPlayers()) do
		local uid  = tostring(player.UserId)
		local pdat = playerData[uid]
		if pdat then
			refSessionId = pdat.sessionId
			break
		end
	end

	local raw       = fetchRound(refSessionId)
	local round     = normalizeRound(raw, refSessionId)

	if not round then
		warn("[ThumbnailMaster] Failed to fetch round, retrying in 5s...")
		task.wait(5)
		startNextRound()
		return
	end

	roundNumber += 1
	broadcastRound(round)

	-- Таймер раунда
	task.delay(Config.TIMER_SECONDS + 2, function()
		if roundInProgress then
			startNextRound()
		end
	end)
end

-- ========== ГОЛОСОВАНИЕ ==========

-- Отслеживаем, кто уже проголосовал в текущем раунде
local votedThisRound = {}

Remotes.SubmitVote.OnServerEvent:Connect(function(player, voteData)
	local uid = tostring(player.UserId)
	if votedThisRound[uid] then return end   -- повторный голос игнорируем
	votedThisRound[uid] = true

	local pdat = getOrCreateSession(player)

	if not currentRound then
		Remotes.VoteResult:FireClient(player, { correct = false, points = 0, score = pdat.score })
		return
	end

	-- Определяем, правильный ли ответ
	local isCorrect = false
	local responseTime = voteData.responseTime or 0

	if currentRound.type == "guess" then
		isCorrect = tostring(voteData.chosenId) == tostring(currentRound.correctId)
	elseif currentRound.type == "pick_best" then
		-- В режиме pick_best нет "правильного" ответа — принимаем любой
		isCorrect = true
	end

	-- Начисляем очки
	local points = 0
	if isCorrect then
		points = Config.POINTS_CORRECT
		if responseTime > 0 and responseTime < 5000 then
			points += Config.POINTS_FAST_BONUS
		end
	end
	pdat.score += points

	-- Отправляем голос на бэкенд
	local backendPayload = {
		sessionId        = pdat.sessionId,
		roundType        = currentRound.type == "guess" and "guess" or "campaign_pick",
		chosenThumbnailId = currentRound.type == "guess" and voteData.chosenId or nil,
		chosenCampaignThumbId = currentRound.type == "pick_best" and voteData.chosenId or nil,
		correctThumbnailId   = currentRound.type == "guess" and currentRound.correctId or nil,
		campaignId       = currentRound.campaignId,
		isCorrect        = isCorrect,
		responseTimeMs   = responseTime,
		platform         = "roblox",
	}
	task.spawn(function()
		httpPost("/vote", backendPayload)
	end)

	-- Результат игроку
	Remotes.VoteResult:FireClient(player, {
		correct    = isCorrect,
		correctId  = currentRound.correctId,
		points     = points,
		totalScore = pdat.score,
	})

	print(string.format("[ThumbnailMaster] %s voted | correct=%s | +%d pts | total=%d",
		player.Name, tostring(isCorrect), points, pdat.score))
end)

-- ========== ДАННЫЕ ИГРОКА (RemoteFunction) ==========

Remotes.GetPlayerData.OnServerInvoke = function(player)
	local pdat = getOrCreateSession(player)
	return {
		score     = pdat.score,
		sessionId = pdat.sessionId,
	}
end

-- ========== СОБЫТИЯ ПОДКЛЮЧЕНИЯ ==========

Players.PlayerAdded:Connect(function(player)
	getOrCreateSession(player)
	-- Если раунд уже идёт — сразу отправляем его новому игроку
	if currentRound and roundInProgress then
		task.wait(1)   -- небольшая задержка на загрузку клиента
		Remotes.RoundStarted:FireClient(player, currentRound)
	end
end)

Players.PlayerRemoving:Connect(function(player)
	local uid = tostring(player.UserId)
	playerData[uid] = nil
end)

-- ========== СТАРТ ==========

print("[ThumbnailMaster] Server starting...")

-- Даём время клиентам загрузиться
task.wait(3)

-- Сбрасываем voted при каждом новом раунде
Remotes.RoundStarted.OnServerEvent:Connect(function() end)  -- placeholder

-- Подменяем broadcastRound, чтобы сбрасывать votedThisRound
local _origBroadcast = broadcastRound
broadcastRound = function(round)
	votedThisRound = {}
	_origBroadcast(round)
end

startNextRound()
