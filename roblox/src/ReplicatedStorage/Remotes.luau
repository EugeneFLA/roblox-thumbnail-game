-- Remotes.luau
-- Создаёт и возвращает RemoteEvents / RemoteFunctions
-- Используется и клиентом, и сервером

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local function getOrCreate(parent, className, name)
	local existing = parent:FindFirstChild(name)
	if existing then return existing end
	local obj = Instance.new(className)
	obj.Name = name
	obj.Parent = parent
	return obj
end

local folder = getOrCreate(ReplicatedStorage:WaitForChild("ThumbnailMaster"), "Folder", "Remotes")

local Remotes = {
	-- Сервер → клиент: новый раунд готов
	RoundStarted    = getOrCreate(folder, "RemoteEvent",    "RoundStarted"),

	-- Клиент → сервер: голос игрока
	SubmitVote      = getOrCreate(folder, "RemoteEvent",    "SubmitVote"),

	-- Сервер → клиент: результат голоса
	VoteResult      = getOrCreate(folder, "RemoteEvent",    "VoteResult"),

	-- Сервер → клиент: итоги сессии
	SessionEnd      = getOrCreate(folder, "RemoteEvent",    "SessionEnd"),

	-- Клиент → сервер: запрос данных игрока (очки, место в таблице)
	GetPlayerData   = getOrCreate(folder, "RemoteFunction", "GetPlayerData"),
}

return Remotes
