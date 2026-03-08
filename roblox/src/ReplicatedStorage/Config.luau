-- Config.luau
-- Настройки подключения к бэкенду
-- Замените BACKEND_URL на реальный URL вашего сервера при деплое

local Config = {
	-- URL бэкенда. В продакшене замените на публичный адрес сервера.
	-- Например: "https://your-server.com/api"
	BACKEND_URL = "https://your-server.com/api",

	-- Количество раундов в одной сессии
	ROUNDS_PER_SESSION = 10,

	-- Задержка между раундами (секунды)
	ROUND_DELAY = 3,

	-- Время на ответ (секунды)
	TIMER_SECONDS = 15,

	-- Очки за правильный ответ
	POINTS_CORRECT = 100,

	-- Бонус за быстрый ответ (< 5 сек)
	POINTS_FAST_BONUS = 50,
}

return Config
