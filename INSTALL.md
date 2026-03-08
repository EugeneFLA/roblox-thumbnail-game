# Thumbnail Master — Руководство по установке и запуску

## Содержание

1. [Обзор системы](#1-обзор-системы)
2. [Требования](#2-требования)
3. [Установка PostgreSQL](#3-установка-postgresql)
4. [Установка проекта](#4-установка-проекта)
5. [Настройка базы данных](#5-настройка-базы-данных)
6. [Настройка переменных окружения](#6-настройка-переменных-окружения)
7. [Инициализация таблиц БД](#7-инициализация-таблиц-бд)
8. [Загрузка данных из Roblox](#8-загрузка-данных-из-roblox)
9. [Запуск сервера](#9-запуск-сервера)
10. [Проверка работоспособности](#10-проверка-работоспособности)
11. [Работа с панелью разработчиков](#11-работа-с-панелью-разработчиков)
12. [Публикация игры на Яндекс Игры](#12-публикация-игры-на-яндекс-игры)
13. [Деплой на продакшен-сервер](#13-деплой-на-продакшен-сервер)
14. [Структура проекта](#14-структура-проекта)
15. [API справочник](#15-api-справочник)
16. [Устранение неполадок](#16-устранение-неполадок)

---

## 1. Обзор системы

Проект состоит из трёх компонентов:

| Компонент | Описание | URL |
|-----------|----------|-----|
| **Игра (Game Client)** | HTML5 игра для Яндекс Игр. Игроки угадывают Roblox-игры по тамбнейлам и голосуют за лучшие картинки | `http://localhost:3000` |
| **Панель разработчиков (Dashboard)** | Веб-интерфейс для Roblox-разработчиков. Создание кампаний, загрузка тамбнейлов, просмотр статистики | `http://localhost:3000/dev` |
| **API сервер (Backend)** | Node.js + Express + PostgreSQL. Обслуживает оба клиента, хранит данные, считает статистику | `http://localhost:3000/api` |

Схема работы:
```
Roblox-разработчик                    Игрок (ребёнок)
       |                                    |
  [Dashboard]                         [Яндекс Игра]
       |                                    |
       |--- загружает тамбнейлы -->         |
       |                              показывает тамбнейлы
       |                              игрок выбирает лучший
       |                                    |
       |<-- получает статистику ---         |
       |    (CTR, Win Rate и т.д.)          |
```

---

## 2. Требования

Перед установкой убедитесь, что на компьютере установлено:

### Обязательные

| Программа | Минимальная версия | Проверка установки |
|-----------|-------------------|-------------------|
| **Node.js** | 18.x или выше | `node --version` |
| **npm** | 9.x или выше | `npm --version` |
| **PostgreSQL** | 14.x или выше | `psql --version` |

### Рекомендуемые

| Программа | Назначение |
|-----------|-----------|
| **Git** | Для версионирования кода |
| **VS Code** | Редактор кода |
| **Postman / Insomnia** | Для тестирования API |

### Скачать

- **Node.js**: https://nodejs.org/en/download (выберите LTS-версию)
- **PostgreSQL**: https://www.postgresql.org/download/windows/

---

## 3. Установка PostgreSQL

### Вариант A: Установщик для Windows

1. Скачайте установщик с https://www.postgresql.org/download/windows/
2. Запустите установщик
3. При установке:
   - **Запомните пароль**, который установите для пользователя `postgres`
   - Оставьте порт по умолчанию: **5432**
   - Locale: оставьте по умолчанию
4. Установите также **pgAdmin 4** (предлагается в установщике) — это GUI для управления БД

### Вариант B: Через Chocolatey (менеджер пакетов)

```powershell
choco install postgresql
```

### Вариант C: Docker (если Docker уже установлен)

```bash
docker run --name thumbnail-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16
```

### Проверка подключения

После установки откройте терминал и проверьте:

```bash
psql -U postgres -h localhost
```

Если запросит пароль — введите тот, что указали при установке. Если видите приглашение `postgres=#` — всё работает. Введите `\q` для выхода.

> **Примечание для Windows**: Если команда `psql` не найдена, добавьте путь к PostgreSQL в переменную PATH:
> `C:\Program Files\PostgreSQL\16\bin` (версия может отличаться)

---

## 4. Установка проекта

### Шаг 4.1 — Перейти в директорию проекта

Проект находится в:

```
C:\Projects\roblox-thumbnail-game
```

### Шаг 4.2 — Установить зависимости сервера

Откройте терминал (PowerShell или CMD) и выполните:

```bash
cd C:\Projects\roblox-thumbnail-game\server
npm install
```

Должно установиться ~200 пакетов. Дождитесь сообщения `added XXX packages`.

> **Возможная проблема с bcrypt на Windows**: Если `npm install` выдаёт ошибку компиляции `bcrypt`, установите build tools:
> ```bash
> npm install -g windows-build-tools
> ```
> Или используйте альтернативу — в файле `server/models/Developer.js` замените `bcrypt` на `bcryptjs`:
> ```bash
> cd C:\Projects\roblox-thumbnail-game\server
> npm uninstall bcrypt
> npm install bcryptjs
> ```
> Затем в файле `server/models/Developer.js` замените первую строку:
> ```js
> // Было:
> const bcrypt = require('bcrypt');
> // Стало:
> const bcrypt = require('bcryptjs');
> ```

### Шаг 4.3 — Проверить установку

```bash
node -e "console.log('Node.js OK'); require('./config/database'); console.log('DB config OK');"
```

---

## 5. Настройка базы данных

### Шаг 5.1 — Создать базу данных

Откройте терминал и выполните:

**Через командную строку (psql):**

```bash
psql -U postgres -h localhost
```

В интерактивном режиме psql:

```sql
CREATE DATABASE thumbnail_game;
```

Проверьте, что база создалась:

```sql
\l
```

В списке должна быть `thumbnail_game`. Выйдите:

```sql
\q
```

**Через pgAdmin 4:**

1. Откройте pgAdmin 4
2. Подключитесь к серверу (localhost)
3. Правой кнопкой на "Databases" → "Create" → "Database"
4. Name: `thumbnail_game`
5. Owner: `postgres`
6. Нажмите "Save"

---

## 6. Настройка переменных окружения

### Шаг 6.1 — Отредактировать файл .env

Откройте файл `C:\Projects\roblox-thumbnail-game\server\.env` в текстовом редакторе.

Содержимое по умолчанию:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=thumbnail_game
DB_USER=postgres
DB_PASSWORD=postgres
PORT=3000
CORS_ORIGIN=*
JWT_SECRET=change-this-to-a-random-secret-in-production-abc123xyz
```

### Что нужно изменить:

| Переменная | Что указать | Пример |
|-----------|------------|--------|
| `DB_PASSWORD` | Пароль PostgreSQL, который вы задали при установке | `MySecurePass123` |
| `JWT_SECRET` | Любая длинная случайная строка (для продакшена) | `a7f2b9c4e1d6f8a3b5c7d9e2f4a6b8c1` |

Остальные переменные можно оставить без изменений для локальной разработки.

### Шаг 6.2 — Проверить подключение к БД

```bash
cd C:\Projects\roblox-thumbnail-game\server
node -e "const pool = require('./config/database'); pool.query('SELECT NOW()').then(r => { console.log('Подключение к БД успешно:', r.rows[0].now); pool.end(); }).catch(e => { console.error('ОШИБКА:', e.message); pool.end(); });"
```

Ожидаемый результат:
```
Подключение к БД успешно: 2026-03-06T20:30:00.000Z
```

Если видите ошибку — проверьте:
- Запущен ли PostgreSQL (служба `postgresql-x64-16`)
- Правильный ли пароль в `.env`
- Создана ли база `thumbnail_game`

---

## 7. Инициализация таблиц БД

Этот шаг создаёт все 11 таблиц в базе данных.

```bash
cd C:\Projects\roblox-thumbnail-game\server
npm run init-db
```

Ожидаемый вывод:

```
Initializing database...
Database tables created successfully.
```

### Что создаётся:

| Таблица | Назначение |
|---------|-----------|
| `games` | Roblox-игры (из парсинга) |
| `thumbnails` | Тамбнейлы из Roblox |
| `player_sessions` | Сессии игроков |
| `votes` | Голоса / выборы игроков |
| `developers` | Аккаунты разработчиков |
| `campaigns` | Кампании тестирования |
| `campaign_thumbnails` | Загруженные тамбнейлы разработчиков |
| `thumbnail_impressions` | Показы тамбнейлов |
| `campaign_thumbnail_stats_daily` | Дневная статистика по тамбнейлам |
| `campaign_stats_daily` | Дневная статистика по кампаниям |

> **Повторный запуск безопасен** — скрипт использует `CREATE TABLE IF NOT EXISTS`, таблицы не пересоздаются если уже существуют.

---

## 8. Загрузка данных из Roblox

Этот шаг загружает реальные данные (игры, тамбнейлы, описания) с Roblox API для работы базовых раундов в игре.

```bash
cd C:\Projects\roblox-thumbnail-game\server
npm run seed
```

Ожидаемый вывод:

```
=== Roblox Data Seeder ===

Fetching popular games from Roblox...
Found 30 universe IDs

Fetching game details...
Got details for 28 games

Fetching thumbnails...
Got 95 thumbnails total

Saving to database...
Saved 28 games and 95 thumbnails.

Done!
```

### Что происходит:

1. Скрипт запрашивает `games.roblox.com` API для получения популярных игр
2. Получает детали (название, описание, создатель) через `games.roblox.com/v1/games`
3. Загружает тамбнейлы (768x432) через `thumbnails.roblox.com/v1/games/multiget/thumbnails`
4. Загружает иконки (256x256) через `thumbnails.roblox.com/v1/games/icons`
5. Сохраняет всё в таблицы `games` и `thumbnails`

> **Важно**: Скрипт обращается к публичным API Roblox. Если вы находитесь за корпоративным прокси или VPN, может потребоваться настройка прокси.

> **Повторный запуск** обновит существующие данные (используется UPSERT по `universe_id`).

---

## 9. Запуск сервера

### Режим разработки (с автоперезагрузкой)

```bash
cd C:\Projects\roblox-thumbnail-game\server
npm run dev
```

### Режим продакшен

```bash
cd C:\Projects\roblox-thumbnail-game\server
npm start
```

### Ожидаемый вывод:

```
Server running on http://localhost:3000
Game client: http://localhost:3000
Developer dashboard: http://localhost:3000/dev
API: http://localhost:3000/api
```

### Что обслуживает сервер:

| URL | Что отдаёт |
|-----|-----------|
| `http://localhost:3000` | HTML5 игра (клиент из папки `client/`) |
| `http://localhost:3000/dev` | Панель разработчиков (из папки `dashboard/`) |
| `http://localhost:3000/api/*` | REST API для игры |
| `http://localhost:3000/api/dev/*` | REST API для панели разработчиков |
| `http://localhost:3000/uploads/*` | Загруженные файлы тамбнейлов |
| `http://localhost:3000/health` | Health check endpoint |

---

## 10. Проверка работоспособности

### 10.1 — Проверить здоровье сервера

Откройте в браузере:

```
http://localhost:3000/health
```

Должен вернуть:
```json
{"status":"ok","timestamp":"2026-03-06T20:30:00.000Z"}
```

### 10.2 — Проверить API игры

```
http://localhost:3000/api/stats
```

Должен вернуть:
```json
{"gameCount":28}
```

(Число зависит от того, сколько игр загрузил seed-скрипт)

### 10.3 — Проверить игру

Откройте в браузере:

```
http://localhost:3000
```

Вы должны увидеть:
1. Экран загрузки с логотипом "THUMBNAIL MASTER"
2. Затем главное меню с кнопкой "ИГРАТЬ"
3. Нажмите "ИГРАТЬ" — появится описание Roblox-игры и 4 тамбнейла
4. Выберите тамбнейл, который соответствует описанию

> **Примечание**: Yandex Games SDK будет показывать предупреждение в консоли вне платформы Яндекса — это нормально, игра работает без SDK в режиме разработки.

### 10.4 — Проверить панель разработчиков

Откройте в браузере:

```
http://localhost:3000/dev
```

Вы должны увидеть форму входа/регистрации.

---

## 11. Работа с панелью разработчиков

### 11.1 — Регистрация

1. Откройте `http://localhost:3000/dev`
2. Нажмите "Зарегистрироваться"
3. Заполните форму:
   - **Имя** (обязательно) — ваше имя или ник
   - **Email** (обязательно) — ваш email
   - **Пароль** (обязательно) — минимум 6 символов
   - **Компания** (опционально) — название студии
   - **Roblox username** (опционально) — ваш ник в Roblox
4. Нажмите "Создать аккаунт"

### 11.2 — Создание кампании

1. В боковом меню нажмите "+ Новая кампания"
2. Заполните:
   - **Название кампании** — для вашего удобства (например "Тест обложек v2")
   - **Название игры** — как называется ваша Roblox-игра
   - **Описание игры** — описание, которое увидят игроки (минимум 20 символов)
   - **Roblox Universe ID** — опционально
   - **Целевое кол-во голосов** — сколько голосов вы хотите собрать (по умолчанию 1000)
3. Нажмите "Создать кампанию"

### 11.3 — Загрузка тамбнейлов

1. Откройте созданную кампанию
2. Нажмите кнопку "+ Загрузить"
3. Выберите 2-10 изображений (JPG, PNG, GIF, WebP; до 10 МБ каждое)
4. Рекомендуемый размер: **1920x1080** (16:9)
5. Тамбнейлы появятся в сетке

### 11.4 — Активация кампании

1. После загрузки минимум 2 тамбнейлов нажмите "Активировать"
2. Статус сменится на "Активна"
3. С этого момента тамбнейлы начнут показываться игрокам в Яндекс Игре

### 11.5 — Просмотр статистики

На странице кампании отображаются:

| Метрика | Описание |
|---------|----------|
| **Показы (Impressions)** | Сколько раз тамбнейл был показан в игре |
| **Голоса (Votes)** | Сколько раз игроки выбрали этот тамбнейл |
| **CTR** | Votes / Impressions × 100% — "кликабельность" |
| **Побед (Wins)** | Сколько раз тамбнейл был выбран как лучший |
| **Win Rate** | Wins / Votes × 100% — процент побед |
| **Ср. время** | Среднее время реакции при выборе (мс) |

В таблице сравнения тамбнейлы отсортированы по Win Rate — **верхний тамбнейл = лучший выбор для вашей игры**.

### 11.6 — Управление тамбнейлами

- **Перезалить** — заменить файл тамбнейла, сохранив статистику
- **Удалить** — полностью удалить тамбнейл и его файл
- **Пауза** — приостановить кампанию (перестанет показываться в игре)

---

## 12. Публикация игры на Яндекс Игры

### Шаг 12.1 — Подготовка клиента

Для публикации на Яндекс Игры нужно:

1. Обновить URL бэкенда в файле `client/js/api.js`:
   ```js
   // Замените на URL вашего продакшен-сервера
   const BASE_URL = 'https://your-server.com/api';
   ```

2. Убедитесь, что в `client/index.html` SDK подключен через относительный путь:
   ```html
   <script src="/sdk.js"></script>
   ```

### Шаг 12.2 — Создание архива

Упакуйте содержимое папки `client/` в ZIP-архив:

```powershell
cd C:\Projects\roblox-thumbnail-game
Compress-Archive -Path .\client\* -DestinationPath .\thumbnail-master-game.zip
```

Содержимое архива должно быть:
```
index.html          (в корне архива, не в подпапке!)
css/style.css
js/api.js
js/game.js
js/app.js
```

### Шаг 12.3 — Загрузка на Яндекс Игры

1. Зарегистрируйтесь как разработчик: https://yandex.ru/dev/games/
2. Откройте консоль разработчика
3. Нажмите "Добавить приложение"
4. Загрузите ZIP-архив
5. Заполните информацию:
   - Название: "Thumbnail Master"
   - Описание: "Угадай Roblox-игру по картинке!"
   - Категория: "Викторины"
   - Возрастной рейтинг: 0+
6. Включите монетизацию (рекламу)
7. Создайте лидерборд в консоли (если хотите использовать Yandex Leaderboards)
8. Отправьте на модерацию

### Шаг 12.4 — Настройка рекламы

В консоли Яндекс Игр:
1. Перейдите на вкладку "Реклама"
2. Зарегистрируйтесь в Рекламной Сети Яндекса (РСЯ) если ещё нет
3. Включите sticky-баннеры (опционально)
4. Rewarded video и interstitial уже интегрированы в код игры

---

## 13. Деплой на продакшен-сервер

### Вариант A: VPS (DigitalOcean, Hetzner, Timeweb)

1. Арендуйте VPS (Ubuntu 22.04, минимум 1 GB RAM)

2. Установите зависимости на сервере:
   ```bash
   # Node.js
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt install -y nodejs

   # PostgreSQL
   sudo apt install -y postgresql postgresql-contrib

   # Nginx (reverse proxy)
   sudo apt install -y nginx
   ```

3. Настройте PostgreSQL:
   ```bash
   sudo -u postgres psql
   CREATE DATABASE thumbnail_game;
   CREATE USER tmapp WITH PASSWORD 'your_secure_password';
   GRANT ALL PRIVILEGES ON DATABASE thumbnail_game TO tmapp;
   \q
   ```

4. Загрузите проект на сервер:
   ```bash
   scp -r C:\Projects\roblox-thumbnail-game user@your-server:/var/www/
   ```

5. Настройте `.env` на сервере:
   ```bash
   cd /var/www/roblox-thumbnail-game/server
   cp .env.example .env
   nano .env
   ```
   Укажите реальные пароли и JWT_SECRET.

6. Установите зависимости и инициализируйте БД:
   ```bash
   cd /var/www/roblox-thumbnail-game/server
   npm install --production
   npm run init-db
   npm run seed
   ```

7. Настройте Nginx (`/etc/nginx/sites-available/thumbnail-master`):
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;

       client_max_body_size 15M;

       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

   ```bash
   sudo ln -s /etc/nginx/sites-available/thumbnail-master /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl reload nginx
   ```

8. Запустите через pm2 (process manager):
   ```bash
   npm install -g pm2
   cd /var/www/roblox-thumbnail-game/server
   pm2 start server.js --name thumbnail-master
   pm2 save
   pm2 startup
   ```

9. Настройте HTTPS через Let's Encrypt:
   ```bash
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d your-domain.com
   ```

### Вариант B: Railway (облачный PaaS)

1. Зарегистрируйтесь на https://railway.app
2. Создайте новый проект
3. Добавьте PostgreSQL-сервис (одним кликом)
4. Подключите GitHub-репозиторий или загрузите код
5. Укажите переменные окружения в UI Railway
6. Railway автоматически задеплоит и даст URL

### Вариант C: Render

1. Зарегистрируйтесь на https://render.com
2. Создайте Web Service (подключите репозиторий)
3. Build Command: `cd server && npm install`
4. Start Command: `cd server && node server.js`
5. Добавьте PostgreSQL как managed service
6. Укажите ENV переменные

---

## 14. Структура проекта

```
C:\Projects\roblox-thumbnail-game\
│
├── client/                          # HTML5 игра для Яндекс Игр
│   ├── index.html                   # Главная — 6 экранов (загрузка, меню, игра, результаты, лидерборд, инструкция)
│   ├── css/
│   │   └── style.css                # Стили: тёмная тема, адаптив, анимации
│   ├── js/
│   │   ├── api.js                   # API-клиент для бэкенда
│   │   ├── game.js                  # Игровая логика: раунды, таймер, очки, streak
│   │   └── app.js                   # UI-контроллер + интеграция Yandex Games SDK
│   └── assets/
│       └── sounds/                  # (опционально) звуковые эффекты
│
├── dashboard/                       # Панель разработчиков (SPA)
│   ├── index.html                   # 5 секций: auth, overview, campaigns, new-campaign, detail
│   ├── css/
│   │   └── dashboard.css            # Стили: sidebar, карточки, таблицы, графики
│   └── js/
│       ├── devApi.js                # API-клиент для dev-эндпоинтов
│       └── dashboard.js             # UI логика: навигация, формы, статистика
│
├── uploads/                         # Загруженные файлы
│   └── thumbnails/                  # Тамбнейлы по папкам developer_id
│       └── {developer_id}/          # Файлы с UUID-именами
│
├── server/                          # Node.js бэкенд
│   ├── server.js                    # Express — точка входа, роутинг, static files
│   ├── package.json                 # Зависимости: express, pg, bcrypt, jwt, multer, sharp
│   ├── .env                         # Переменные окружения (не коммитить!)
│   ├── .env.example                 # Шаблон переменных
│   │
│   ├── config/
│   │   └── database.js              # PostgreSQL connection pool
│   │
│   ├── middleware/
│   │   ├── auth.js                  # JWT генерация/проверка, requireAuth middleware
│   │   └── upload.js                # Multer: storage, fileFilter (10MB, JPG/PNG/GIF/WebP)
│   │
│   ├── models/
│   │   ├── Game.js                  # Roblox-игры: getGuessRound(), getPickBestRound()
│   │   ├── Vote.js                  # Голоса: create(), getThumbnailStats()
│   │   ├── PlayerSession.js         # Сессии: getOrCreate(), updateAfterRound(), getLeaderboard()
│   │   ├── Developer.js             # Разработчики: create(), findByEmail(), verifyPassword()
│   │   ├── Campaign.js              # Кампании: CRUD, getActiveForGame()
│   │   └── CampaignThumbnail.js     # Тамбнейлы: create(), replaceFile(), getComparisonStats()
│   │
│   ├── routes/
│   │   ├── game.js                  # /api/round/*, /api/vote, /api/impression, /api/session/*
│   │   ├── auth.js                  # /api/dev/auth/register, login, me, profile
│   │   ├── campaigns.js             # /api/dev/campaigns/* + тамбнейлы
│   │   └── stats.js                 # /api/dev/stats/overview, campaigns/:id, thumbnails/:id
│   │
│   └── scripts/
│       ├── initDb.js                # Создание 11 таблиц + индексов
│       └── seedRoblox.js            # Парсинг данных из Roblox API
│
└── .gitignore                       # node_modules, .env, uploads, logs
```

---

## 15. API справочник

### Game API (для Яндекс Игры)

| Метод | Путь | Описание |
|-------|------|----------|
| `GET` | `/api/round/guess` | Раунд "Угадай игру": описание + 4 тамбнейла |
| `GET` | `/api/round/pick-best` | Раунд "Выбери лучший" из кампании |
| `POST` | `/api/vote` | Записать голос игрока |
| `POST` | `/api/impression` | Записать показ тамбнейлов |
| `GET` | `/api/session/:sessionId` | Получить/создать сессию игрока |
| `GET` | `/api/leaderboard` | Лидерборд (limit=50) |
| `GET` | `/api/stats` | Общая статистика |
| `GET` | `/health` | Health check |

### Developer API (для панели разработчиков)

Все `/api/dev/*` роуты (кроме auth) требуют заголовок:
```
Authorization: Bearer <JWT_TOKEN>
```

| Метод | Путь | Описание |
|-------|------|----------|
| `POST` | `/api/dev/auth/register` | Регистрация разработчика |
| `POST` | `/api/dev/auth/login` | Вход (возвращает JWT) |
| `GET` | `/api/dev/auth/me` | Текущий пользователь + статистика |
| `PUT` | `/api/dev/auth/profile` | Обновить профиль |
| `GET` | `/api/dev/campaigns` | Список кампаний |
| `POST` | `/api/dev/campaigns` | Создать кампанию |
| `GET` | `/api/dev/campaigns/:id` | Детали + тамбнейлы |
| `PUT` | `/api/dev/campaigns/:id` | Обновить (status: active/paused) |
| `DELETE` | `/api/dev/campaigns/:id` | Архивировать |
| `POST` | `/api/dev/campaigns/:id/thumbnails` | Загрузить (multipart, до 10 файлов) |
| `PUT` | `/api/dev/campaigns/:cid/thumbnails/:tid` | Обновить label/sortOrder |
| `POST` | `/api/dev/campaigns/:cid/thumbnails/:tid/replace` | Перезалить файл |
| `DELETE` | `/api/dev/campaigns/:cid/thumbnails/:tid` | Удалить |
| `GET` | `/api/dev/stats/overview` | Общая статистика разработчика |
| `GET` | `/api/dev/stats/campaigns/:id` | Статистика кампании + сравнение |
| `GET` | `/api/dev/stats/thumbnails/:id` | Детальная статистика тамбнейла |

---

## 16. Устранение неполадок

### Проблема: `npm install` падает на bcrypt

**Решение**: Используйте `bcryptjs` вместо `bcrypt`:
```bash
cd C:\Projects\roblox-thumbnail-game\server
npm uninstall bcrypt && npm install bcryptjs
```
В `server/models/Developer.js` замените `require('bcrypt')` на `require('bcryptjs')`.

### Проблема: "ECONNREFUSED" при подключении к БД

**Причина**: PostgreSQL не запущен.
**Решение (Windows)**: Откройте "Службы" (Win+R → `services.msc`) → найдите `postgresql-x64-16` → нажмите "Запустить".

### Проблема: "relation 'games' does not exist"

**Причина**: Таблицы не созданы.
**Решение**: Выполните `npm run init-db`.

### Проблема: "Not enough data for a round"

**Причина**: В базе нет данных Roblox (seed не выполнен).
**Решение**: Выполните `npm run seed`.

### Проблема: Игра показывает ошибку Yandex SDK

**Причина**: SDK работает только на платформе Яндекс Игр.
**Решение**: Это нормально при локальной разработке. Игра продолжает работать без SDK.

### Проблема: Тамбнейлы не загружаются (панель разработчиков)

**Причина**: Папка uploads не создана или нет прав.
**Решение**: Убедитесь что папка `C:\Projects\roblox-thumbnail-game\uploads\thumbnails` существует. Она создаётся автоматически при первой загрузке.

### Проблема: 413 Request Entity Too Large (на продакшене с Nginx)

**Причина**: Nginx ограничивает размер загружаемых файлов.
**Решение**: Добавьте в конфиг Nginx: `client_max_body_size 15M;`

### Проблема: Roblox API не отвечает при seed

**Причина**: Сетевые ограничения или Roblox API rate limits.
**Решение**: Подождите 1-2 минуты и повторите `npm run seed`. Скрипт использует паузы между запросами для соблюдения rate limits.

---

## Краткая сводка команд

```bash
# 1. Перейти в папку сервера
cd C:\Projects\roblox-thumbnail-game\server

# 2. Установить зависимости
npm install

# 3. Создать базу данных (в psql)
psql -U postgres -c "CREATE DATABASE thumbnail_game;"

# 4. Настроить .env (пароль БД, JWT_SECRET)
# Отредактируйте файл .env вручную

# 5. Создать таблицы
npm run init-db

# 6. Загрузить данные из Roblox
npm run seed

# 7. Запустить сервер (режим разработки)
npm run dev

# Игра:                http://localhost:3000
# Панель разработчиков: http://localhost:3000/dev
# Health check:         http://localhost:3000/health
```
