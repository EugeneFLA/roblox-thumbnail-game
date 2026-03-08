# ThumbnailMaster — Roblox Game (Rojo)

Roblox-версия игры для тестирования тамбнейлов.
Подключается к тому же бэкенду что и веб-версия.

## Требования

- [Rojo](https://rojo.space) 6.2+
- Roblox Studio

## Настройка

### 1. Укажите URL бэкенда

Откройте [`src/ReplicatedStorage/Config.luau`](src/ReplicatedStorage/Config.luau)
и замените `BACKEND_URL`:

```lua
BACKEND_URL = "https://your-server.com/api",
```

> Для локальной разработки нельзя использовать `localhost` из Roblox Studio —
> нужен публичный URL. Используйте [ngrok](https://ngrok.com):
> `ngrok http 3000` → вставьте полученный URL.

### 2. Разрешите HTTP-запросы в Studio

В Roblox Studio: **Game Settings → Security → Allow HTTP Requests = ON**

### 3. Синхронизация через Rojo

```bash
cd roblox
rojo serve
```

Затем в Roblox Studio подключитесь к Rojo-серверу (плагин Rojo).

## Структура проекта

```
roblox/
├── default.project.json          # Rojo конфиг
└── src/
    ├── ReplicatedStorage/
    │   ├── Config.luau           # URL бэкенда, настройки
    │   └── Remotes.luau          # RemoteEvents/Functions
    ├── ServerScriptService/
    │   └── GameServer.server.luau  # Серверная логика, HTTP-запросы к API
    ├── StarterGui/
    │   └── ThumbnailGame/
    │       ├── init.meta.json    # ScreenGui свойства
    │       └── MainGui.luau      # Создание UI через код
    └── StarterPlayerScripts/
        └── ThumbnailClient.client.luau  # Клиентская логика, UI
```

## Игровой процесс

1. Игрок заходит → сервер создаёт сессию на бэкенде
2. Сервер загружает раунд через `/api/round` (единый эндпоинт, чередует типы)
3. Все игроки видят один и тот же раунд одновременно
4. За правильный ответ: **100 очков** + **50 бонус** если ответил быстрее 5 сек
5. Голоса записываются в ту же БД что и веб-версия
6. Статистика по кликам видна в панели разработчика → **База Roblox**

## Типы раундов

| Тип | Описание |
|-----|----------|
| `guess` | 4 тамбнейла + описание игры → угадай правильный |
| `pick_best` | 2 тамбнейла кампании → выбери лучший (оба варианта засчитываются) |
