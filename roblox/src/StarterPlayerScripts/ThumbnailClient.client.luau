-- ThumbnailClient.client.luau
-- Клиентская логика: получение раундов, отображение UI, отправка голосов

local Players           = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService      = game:GetService("TweenService")

local Config  = require(ReplicatedStorage:WaitForChild("ThumbnailMaster"):WaitForChild("Config"))
local Remotes = require(ReplicatedStorage:WaitForChild("ThumbnailMaster"):WaitForChild("Remotes"))

local LocalPlayer = Players.LocalPlayer
local PlayerGui   = LocalPlayer:WaitForChild("PlayerGui")

-- ========== ПОЛУЧАЕМ GUI ==========
-- Структура: ThumbnailGame > Root > Header / ContentArea
--                                   ContentArea > WaitingFrame / RoundFrame / ResultBanner

local ScreenGui    = PlayerGui:WaitForChild("ThumbnailGame")
local Root         = ScreenGui:WaitForChild("Root")
local Header       = Root:WaitForChild("Header")
local ScoreLabel   = Header:WaitForChild("ScoreLabel")
local TimerLabel   = Header:WaitForChild("TimerLabel")
local ContentArea  = Root:WaitForChild("ContentArea")
local TimerBar     = ContentArea:WaitForChild("TimerBar"):WaitForChild("Fill")
local WaitingFrame = ContentArea:WaitForChild("WaitingFrame")
local RoundFrame   = ContentArea:WaitForChild("RoundFrame")
local GameName     = RoundFrame:WaitForChild("GameNameBg"):WaitForChild("GameName")
local DescLabel    = RoundFrame:WaitForChild("DescBg"):WaitForChild("DescLabel")
local OptionsFrame = RoundFrame:WaitForChild("OptionsFrame")
local ResultBanner = ContentArea:WaitForChild("ResultBanner")
local ResultText   = ResultBanner:WaitForChild("ResultText")
local ResultIcon   = ResultBanner:WaitForChild("ResultIcon")
local PointsText   = ResultBanner:WaitForChild("PointsText")

-- ========== СОСТОЯНИЕ ==========

local currentRound    = nil
local hasVoted        = false
local roundStartTime  = 0
local timerThread     = nil
local score           = 0

-- ========== УТИЛИТЫ ==========

local function setVisible(frame, visible)
	frame.Visible = visible
end

local function tweenColor(element, color, duration)
	TweenService:Create(element,
		TweenInfo.new(duration or 0.3),
		{ BackgroundColor3 = color }
	):Play()
end

local function updateScore(newScore)
	score = newScore
	ScoreLabel.Text = "Очки: " .. tostring(score)
end

-- ========== ТАЙМЕР ==========

local function stopTimer()
	if timerThread then
		task.cancel(timerThread)
		timerThread = nil
	end
end

local function startTimer(seconds)
	stopTimer()
	TimerBar.Size = UDim2.new(1, 0, 1, 0)

	timerThread = task.spawn(function()
		local elapsed = 0
		local interval = 0.05
		while elapsed < seconds do
			task.wait(interval)
			elapsed += interval
			local progress = 1 - (elapsed / seconds)
			TimerBar.Size = UDim2.new(math.max(0, progress), 0, 1, 0)
			TimerLabel.Text = tostring(math.max(0, math.ceil(seconds - elapsed)))

			-- Меняем цвет таймера при < 5 секунд
			if seconds - elapsed < 5 then
				tweenColor(TimerBar, Color3.fromRGB(220, 60, 60), 0.3)
			end
		end
		TimerLabel.Text = "0"
		TimerBar.Size = UDim2.new(0, 0, 1, 0)
	end)
end

-- ========== ОТОБРАЖЕНИЕ ВАРИАНТОВ ==========

local function createOptionButton(thumbData, index, onClickFn)
	local btn = Instance.new("ImageButton")
	btn.Name = "Option_" .. index
	btn.Image = thumbData.imageUrl or ""
	btn.Size = UDim2.new(0.48, 0, 0.48, 0)
	btn.BackgroundColor3 = Color3.fromRGB(30, 30, 30)
	btn.BorderSizePixel  = 0
	btn.ScaleType        = Enum.ScaleType.Fit
	btn.LayoutOrder      = index

	-- Подсветка при наведении
	btn.MouseEnter:Connect(function()
		tweenColor(btn, Color3.fromRGB(60, 60, 80), 0.15)
	end)
	btn.MouseLeave:Connect(function()
		tweenColor(btn, Color3.fromRGB(30, 30, 30), 0.15)
	end)

	btn.Activated:Connect(function()
		onClickFn(thumbData, btn)
	end)

	-- Скругление
	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0, 8)
	corner.Parent = btn

	-- Stroke
	local stroke = Instance.new("UIStroke")
	stroke.Color     = Color3.fromRGB(80, 80, 100)
	stroke.Thickness = 2
	stroke.Parent    = btn

	return btn
end

local function clearOptions()
	for _, child in ipairs(OptionsFrame:GetChildren()) do
		if child:IsA("ImageButton") or child:IsA("Frame") then
			child:Destroy()
		end
	end
end

local function onVoteClick(thumbData, btn)
	if hasVoted then return end
	hasVoted = true

	local responseTime = math.floor((os.clock() - roundStartTime) * 1000)

	-- Визуально блокируем все кнопки
	for _, child in ipairs(OptionsFrame:GetChildren()) do
		if child:IsA("ImageButton") then
			child.Active = false
			TweenService:Create(child,
				TweenInfo.new(0.2),
				{ ImageTransparency = 0.5 }
			):Play()
		end
	end

	-- Выделяем выбранную
	tweenColor(btn, Color3.fromRGB(50, 80, 160), 0.2)

	-- Отправляем голос
	Remotes.SubmitVote:FireServer({
		chosenId     = thumbData.id,
		responseTime = responseTime,
	})
end

-- ========== ПОКАЗ РАУНДА ==========

local function showRound(round)
	currentRound   = round
	hasVoted       = false
	roundStartTime = os.clock()

	setVisible(WaitingFrame, false)
	setVisible(ResultBanner, false)
	setVisible(RoundFrame, true)

	-- Описание и название
	GameName.Text  = round.gameName or ""
	DescLabel.Text = round.description or ""

	-- Цвет TimerBar сбрасываем
	TimerBar.BackgroundColor3 = Color3.fromRGB(80, 160, 80)

	-- Очищаем старые варианты
	clearOptions()

	-- Создаём сетку
	local layout = Instance.new("UIGridLayout")
	layout.CellSize    = UDim2.new(0.48, 0, 0.48, 0)
	layout.CellPadding = UDim2.new(0.02, 0, 0.02, 0)
	layout.SortOrder          = Enum.SortOrder.LayoutOrder
	layout.Parent             = OptionsFrame

	for i, opt in ipairs(round.options or {}) do
		local btn = createOptionButton(opt, i, onVoteClick)
		btn.Parent = OptionsFrame
	end

	startTimer(Config.TIMER_SECONDS)
end

-- ========== РЕЗУЛЬТАТ ГОЛОСА ==========

local function showVoteResult(data)
	stopTimer()
	updateScore(data.totalScore or score)

	ResultBanner.Visible = true

	if data.correct then
		ResultIcon.Text               = "✓"
		ResultText.Text               = "Правильно!"
		ResultBanner.BackgroundColor3 = Color3.fromRGB(40, 130, 60)
		PointsText.Text               = "+" .. tostring(data.points) .. " очков"
		PointsText.TextColor3         = Color3.fromRGB(200, 255, 200)
	else
		ResultIcon.Text               = "✗"
		ResultText.Text               = "Неправильно"
		ResultBanner.BackgroundColor3 = Color3.fromRGB(160, 40, 40)
		PointsText.Text               = "+0 очков"
		PointsText.TextColor3         = Color3.fromRGB(255, 200, 200)
	end

	-- Скрываем баннер через 2.5 сек
	task.delay(2.5, function()
		ResultBanner.Visible = false
	end)
end

-- ========== ОЖИДАНИЕ СЛЕДУЮЩЕГО РАУНДА ==========

local function showWaiting()
	setVisible(RoundFrame, false)
	setVisible(ResultBanner, false)
	setVisible(WaitingFrame, true)
	stopTimer()
end

-- ========== REMOTE-СОБЫТИЯ ==========

Remotes.RoundStarted.OnClientEvent:Connect(function(round)
	showRound(round)
end)

Remotes.VoteResult.OnClientEvent:Connect(function(data)
	showVoteResult(data)
end)

-- ========== ИНИЦИАЛИЗАЦИЯ ==========

local function init()
	setVisible(WaitingFrame, true)
	setVisible(RoundFrame, false)
	setVisible(ResultBanner, false)

	-- Запрашиваем данные игрока
	local pdata = Remotes.GetPlayerData:InvokeServer()
	if pdata then
		updateScore(pdata.score or 0)
	end

	print("[ThumbnailMaster] Client initialized for " .. LocalPlayer.Name)
end

init()
