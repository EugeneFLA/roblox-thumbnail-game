#!/usr/bin/env bash
# =============================================================
#  Thumbnail Master — Bootstrap Installer
#  Использование:
#    1) Скопируйте только этот файл на сервер
#    2) bash install.sh
#  Скрипт сам скачает проект с GitHub и установит всё.
# =============================================================
set -euo pipefail

# ============================================================
#  КОНФИГУРАЦИЯ — замените на ваш репозиторий
# ============================================================
REPO_URL="https://github.com/EugeneFLA/roblox-thumbnail-game.git"
REPO_BRANCH="master"
INSTALL_DIR="$HOME/roblox-thumbnail-game"

DB_NAME="thumbnail_game"
DB_USER="postgres"
DB_HOST="localhost"
DB_PORT="5432"
DB_PASSWORD=""
USE_PEER_AUTH=0

ERRORS=0
STEP=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

ok()    { echo -e "  ${GREEN}[OK]${NC} $*"; }
err()   { echo -e "  ${RED}[ERROR]${NC} $*"; }
warn()  { echo -e "  ${YELLOW}[WARN]${NC} $*"; }
info()  { echo -e "  ${BLUE}[INFO]${NC} $*"; }
step()  { STEP=$((STEP+1)); echo; echo -e "  ${CYAN}[STEP $STEP]${NC} $*"; echo "  -------------------------------------------"; }

fatal() {
  echo
  echo "  +=================================================="
  echo "  *   INSTALLATION FAILED"
  echo "  +=================================================="
  echo
  echo "  Fix the error above and run install.sh again."
  echo
  exit 1
}

# ============================================================
#  ЗАГОЛОВОК
# ============================================================
clear
echo
echo "  +=================================================="
echo "  *                                                  *"
echo "  *   THUMBNAIL MASTER — Linux Installer             *"
echo "  *                                                  *"
echo "  *   Game for Yandex Games + Developer Dashboard    *"
echo "  *                                                  *"
echo "  +=================================================="
echo
echo "  Repo:    $REPO_URL"
echo "  Install: $INSTALL_DIR"
echo
echo "  Этот скрипт:"
echo "    1. Скачает проект с GitHub"
echo "    2. Установит Node.js (если нет)"
echo "    3. Установит PostgreSQL (если нет)"
echo "    4. Создаст базу данных и таблицы"
echo "    5. Загрузит данные из Roblox API"
echo "    6. Запустит сервер"
echo
read -rp "  Нажмите Enter для продолжения..."

# ============================================================
#  STEP 1: GIT — СКАЧИВАЕМ ПРОЕКТ
# ============================================================
step "Загрузка проекта с GitHub..."

# Если REPO_URL не изменён — просим ввести
if [[ "$REPO_URL" == *"YOUR_USERNAME"* ]]; then
  echo
  warn "REPO_URL не настроен в скрипте."
  read -rp "  Введите URL репозитория (например https://github.com/user/repo.git): " REPO_URL
  if [ -z "$REPO_URL" ]; then
    err "URL репозитория не указан."
    fatal
  fi
fi

# Устанавливаем git если нет
if ! command -v git &>/dev/null; then
  info "Устанавливаем git..."
  sudo apt-get update -qq && sudo apt-get install -y git
fi
ok "git: $(git --version)"

# Клонируем или обновляем
if [ -d "$INSTALL_DIR/.git" ]; then
  info "Репозиторий уже существует, обновляем..."
  cd "$INSTALL_DIR"
  git pull origin "$REPO_BRANCH" 2>/dev/null && ok "Репозиторий обновлён." || warn "git pull не удался, продолжаем с текущей версией."
else
  if [ -d "$INSTALL_DIR" ] && [ "$(ls -A "$INSTALL_DIR" 2>/dev/null)" ]; then
    warn "Папка $INSTALL_DIR уже существует и не пустая."
    read -rp "  Перезаписать? (Y/N): " OVERWRITE
    if [[ "$OVERWRITE" =~ ^[Yy]$ ]]; then
      rm -rf "$INSTALL_DIR"
    else
      err "Прервано пользователем."
      fatal
    fi
  fi

  info "Клонируем $REPO_URL..."
  if ! git clone --branch "$REPO_BRANCH" --depth 1 "$REPO_URL" "$INSTALL_DIR"; then
    err "git clone не удался."
    echo
    echo "  Проверьте:"
    echo "    - URL репозитория верный"
    echo "    - Репозиторий публичный (или настроен SSH-ключ)"
    echo "    - Есть доступ в интернет с сервера"
    fatal
  fi
  ok "Проект скачан в $INSTALL_DIR"
fi

# Переходим в папку проекта
cd "$INSTALL_DIR"
PROJECT_ROOT="$(pwd)"
SERVER_DIR="$PROJECT_ROOT/server"
CLIENT_DIR="$PROJECT_ROOT/client"
DASHBOARD_DIR="$PROJECT_ROOT/dashboard"
UPLOADS_DIR="$PROJECT_ROOT/uploads/thumbnails"

# Проверяем ключевые файлы
FILES_OK=1
for F in \
  "$SERVER_DIR/package.json" \
  "$SERVER_DIR/server.js" \
  "$SERVER_DIR/scripts/initDb.js" \
  "$SERVER_DIR/scripts/migrate.js" \
  "$SERVER_DIR/scripts/seedRoblox.js" \
  "$CLIENT_DIR/index.html" \
  "$DASHBOARD_DIR/index.html"
do
  if [ ! -f "$F" ]; then
    err "Не найден: $F"
    FILES_OK=0
  fi
done

if [ "$FILES_OK" -eq 0 ]; then
  err "Файлы проекта неполные. Проверьте репозиторий."
  fatal
fi
ok "Все файлы проекта найдены."

# ============================================================
#  STEP 2: NODE.JS
# ============================================================
step "Проверка Node.js..."

install_node() {
  echo
  echo "  Требуется Node.js 18+."
  echo "    1) Установить через NodeSource (рекомендуется)"
  echo "    2) Установить через nvm"
  echo "    3) Пропустить (установлю вручную)"
  echo
  read -rp "  Выбор [1/2/3]: " NODE_CHOICE

  case "$NODE_CHOICE" in
    1)
      info "Устанавливаем Node.js 20 LTS..."
      if command -v curl &>/dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
      else
        wget -qO- https://deb.nodesource.com/setup_20.x | sudo -E bash -
      fi
      sudo apt-get install -y nodejs
      ;;
    2)
      NVM_DIR="$HOME/.nvm"
      if [ ! -d "$NVM_DIR" ]; then
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
      fi
      [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
      nvm install 20 && nvm use 20
      ;;
    *)
      err "Node.js 18+ обязателен. Установите вручную: https://nodejs.org/"
      fatal
      ;;
  esac
}

if ! command -v node &>/dev/null; then
  info "Node.js не найден."
  install_node
fi

NODE_VER=$(node --version 2>/dev/null || echo "")
[ -z "$NODE_VER" ] && { err "node не найден после установки."; fatal; }

NODE_MAJOR=$(echo "$NODE_VER" | sed 's/v\([0-9]*\).*/\1/')
if [ "$NODE_MAJOR" -lt 18 ] 2>/dev/null; then
  warn "Node.js $NODE_VER — нужна версия 18+."
  install_node
  NODE_VER=$(node --version)
fi
ok "Node.js: $NODE_VER"

! command -v npm &>/dev/null && { err "npm не найден."; fatal; }
ok "npm: $(npm --version)"

# ============================================================
#  STEP 3: POSTGRESQL
# ============================================================
step "Проверка PostgreSQL..."

if ! command -v psql &>/dev/null; then
  info "PostgreSQL не установлен."
  read -rp "  Установить PostgreSQL через apt? (Y/N): " INSTALL_PG
  if [[ "$INSTALL_PG" =~ ^[Yy]$ ]]; then
    sudo apt-get update -qq
    sudo apt-get install -y postgresql postgresql-contrib
  else
    err "PostgreSQL обязателен."; fatal
  fi
fi
ok "$(psql --version)"

# Запускаем сервис
PG_RUNNING=0
for SVC in postgresql postgresql@16-main postgresql@15-main postgresql@14-main; do
  if systemctl is-active --quiet "$SVC" 2>/dev/null; then
    ok "Сервис $SVC запущен."; PG_RUNNING=1; break
  fi
done
if [ "$PG_RUNNING" -eq 0 ]; then
  for SVC in postgresql postgresql@16-main postgresql@15-main postgresql@14-main; do
    if sudo systemctl start "$SVC" 2>/dev/null; then
      ok "Запущен $SVC."; PG_RUNNING=1; break
    fi
  done
fi
[ "$PG_RUNNING" -eq 0 ] && warn "Не удалось запустить PostgreSQL автоматически. Запустите вручную."

# ============================================================
#  STEP 4: ПАРОЛЬ PostgreSQL
# ============================================================
step "Настройка подключения к БД..."
echo
echo "  Введите пароль для пользователя postgres."
echo "  (Без пароля — нажмите Enter; peer auth — введите 'peer')"
echo

while true; do
  read -rsp "  postgres password: " DB_PASSWORD; echo

  if [ "$DB_PASSWORD" = "peer" ]; then
    TEST=$(sudo -u postgres psql -tAc "SELECT 1;" 2>/dev/null || true)
    if [ "$TEST" = "1" ]; then
      ok "Peer auth успешна."; USE_PEER_AUTH=1; break
    else
      err "Peer auth не работает. Введите пароль."; continue
    fi
  fi

  TEST=$(PGPASSWORD="$DB_PASSWORD" psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" \
         -d postgres -tAc "SELECT 1;" 2>/dev/null || true)
  if [ "$TEST" = "1" ]; then
    ok "Подключение к PostgreSQL успешно."; break
  else
    err "Не удалось подключиться к PostgreSQL."
    PGPASSWORD="$DB_PASSWORD" psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" \
      -d postgres -tAc "SELECT 1;" 2>&1 | head -3 || true
    read -rp "  Попробовать другой пароль? (Y/N): " RETRY
    [[ "$RETRY" =~ ^[Yy]$ ]] || fatal
  fi
done

# ============================================================
#  STEP 5: .ENV
# ============================================================
step "Создание .env..."

ENV_FILE="$SERVER_DIR/.env"
if [ -f "$ENV_FILE" ] && grep -q "DB_PASSWORD=$DB_PASSWORD" "$ENV_FILE" 2>/dev/null; then
  ok ".env уже существует."
else
  JWT_SECRET=$(openssl rand -hex 64 2>/dev/null || \
               python3 -c "import secrets; print(secrets.token_hex(64))" 2>/dev/null || \
               cat /proc/sys/kernel/random/uuid /proc/sys/kernel/random/uuid | tr -d '-\n')

  cat > "$ENV_FILE" << EOF
DB_HOST=$DB_HOST
DB_PORT=$DB_PORT
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
PORT=3000
CORS_ORIGIN=*
JWT_SECRET=$JWT_SECRET
EOF
  ok ".env создан."
fi

# ============================================================
#  STEP 6: NPM INSTALL
# ============================================================
step "Установка npm зависимостей..."

cd "$SERVER_DIR"
echo "  (30-60 секунд...)"
if ! npm install 2>/tmp/tm_npm.txt; then
  if grep -i "bcrypt" /tmp/tm_npm.txt; then
    info "bcrypt не собрался, заменяем на bcryptjs..."
    npm uninstall bcrypt &>/dev/null || true
    npm install bcryptjs &>/dev/null
    sed -i "s/require('bcrypt')/require('bcryptjs')/g" "$SERVER_DIR/models/Developer.js"
    npm install || { err "npm install не удался."; cat /tmp/tm_npm.txt; fatal; }
  else
    err "npm install не удался."; cat /tmp/tm_npm.txt; fatal
  fi
fi
rm -f /tmp/tm_npm.txt
ok "npm зависимости установлены."

# ============================================================
#  STEP 7: БАЗА ДАННЫХ
# ============================================================
step "Создание базы данных \"$DB_NAME\"..."

pg_q() {
  if [ "$USE_PEER_AUTH" -eq 1 ]; then
    sudo -u postgres psql -h "$DB_HOST" -p "$DB_PORT" "$@"
  else
    PGPASSWORD="$DB_PASSWORD" psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" "$@"
  fi
}

DB_EXISTS=$(pg_q -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME';" 2>/dev/null || true)
if [ "$DB_EXISTS" != "1" ]; then
  pg_q -d postgres -c "CREATE DATABASE $DB_NAME;" &>/dev/null && ok "База \"$DB_NAME\" создана." || { err "Не удалось создать БД."; fatal; }
else
  ok "База \"$DB_NAME\" уже существует."
fi

# ============================================================
#  STEP 8: ТАБЛИЦЫ + МИГРАЦИИ
# ============================================================
step "Инициализация таблиц..."

cd "$SERVER_DIR"
TABLE_EXISTS=$(pg_q -d "$DB_NAME" -tAc \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='games';" \
  2>/dev/null | tr -d '[:space:]' || echo "0")

if [ "${TABLE_EXISTS:-0}" -eq 0 ] 2>/dev/null; then
  node scripts/initDb.js || { err "Ошибка инициализации таблиц."; fatal; }
  ok "Таблицы созданы."
else
  ok "Таблицы уже существуют."
fi

node scripts/migrate.js && ok "Миграции применены." || { warn "Миграции: см. вывод выше."; ERRORS=$((ERRORS+1)); }

# ============================================================
#  STEP 9: UPLOADS
# ============================================================
step "Создание папки uploads..."
mkdir -p "$UPLOADS_DIR"
ok "uploads/thumbnails/ готова."

# ============================================================
#  STEP 10: SEED ROBLOX
# ============================================================
step "Загрузка данных из Roblox API..."

cd "$SERVER_DIR"
GAMES_COUNT=$(pg_q -d "$DB_NAME" -tAc "SELECT COUNT(*) FROM games;" 2>/dev/null | tr -d '[:space:]' || echo "0")

if [ "${GAMES_COUNT:-0}" -eq 0 ] 2>/dev/null; then
  echo
  read -rp "  Загрузить ~300 популярных Roblox игр? (Y/N): " RUN_SEED
  if [[ "$RUN_SEED" =~ ^[Yy]$ ]]; then
    node scripts/seedRoblox.js && ok "Данные Roblox загружены." || { warn "Загрузка не удалась (проблема с сетью?). Запустите позже: ./seed_roblox.sh"; ERRORS=$((ERRORS+1)); }
  else
    echo "  [ПРОПУЩЕНО] Запустите позже: ./seed_roblox.sh"
  fi
else
  ok "В базе уже $GAMES_COUNT игр."
  read -rp "  Обновить данные? (Y/N): " REFRESH
  [[ "$REFRESH" =~ ^[Yy]$ ]] && node scripts/seedRoblox.js && ok "Данные обновлены." || true
fi

# ============================================================
#  STEP 11: ВСПОМОГАТЕЛЬНЫЕ СКРИПТЫ
# ============================================================
step "Создание скриптов запуска..."

cat > "$PROJECT_ROOT/start_server.sh" << 'S'
#!/usr/bin/env bash
cd "$(dirname "${BASH_SOURCE[0]}")/server"
echo "  Thumbnail Master → http://$(hostname -I | awk '{print $1}'):3000"
node server.js
S
chmod +x "$PROJECT_ROOT/start_server.sh"

cat > "$PROJECT_ROOT/start_server_dev.sh" << 'S'
#!/usr/bin/env bash
cd "$(dirname "${BASH_SOURCE[0]}")/server"
npx nodemon server.js
S
chmod +x "$PROJECT_ROOT/start_server_dev.sh"

cat > "$PROJECT_ROOT/seed_roblox.sh" << S
#!/usr/bin/env bash
cd "$SERVER_DIR"
node scripts/seedRoblox.js
S
chmod +x "$PROJECT_ROOT/seed_roblox.sh"

cat > "$PROJECT_ROOT/migrate.sh" << S
#!/usr/bin/env bash
cd "$SERVER_DIR"
node scripts/migrate.js
S
chmod +x "$PROJECT_ROOT/migrate.sh"

cat > "$PROJECT_ROOT/reset_database.sh" << S
#!/usr/bin/env bash
read -rp "Введите YES для сброса БД: " C
[ "\$C" = "YES" ] || exit 0
cd "$SERVER_DIR"
node scripts/initDb.js
S
chmod +x "$PROJECT_ROOT/reset_database.sh"
ok "Скрипты созданы."

# ============================================================
#  STEP 12: ПРОВЕРКА МОДУЛЕЙ
# ============================================================
step "Проверка сервера..."

cd "$SERVER_DIR"
node -e "
try {
  require('./routes/auth'); require('./routes/campaigns');
  require('./routes/stats'); require('./routes/game');
  require('./models/Developer'); require('./models/Campaign');
  require('./models/CampaignThumbnail');
  console.log('  [OK] Все серверные модули загружаются успешно');
} catch(e) { console.log('  [ERROR] ' + e.message); process.exit(1); }
" || fatal

node -e "
const p = require('./config/database');
p.query('SELECT COUNT(*) c FROM information_schema.tables WHERE table_schema=\$1',['public'])
  .then(r => { console.log('  [OK] БД: ' + r.rows[0].c + ' таблиц'); p.end(); })
  .catch(e => { console.log('  [WARN] ' + e.message); p.end(); });
"

# ============================================================
#  ГОТОВО
# ============================================================
echo
echo "  +=================================================="
echo "  *                                                  *"
echo "  *   УСТАНОВКА ЗАВЕРШЕНА УСПЕШНО                    *"
echo "  *                                                  *"
echo "  +=================================================="
echo

[ "$ERRORS" -gt 0 ] && echo "  Предупреждений: $ERRORS (см. вывод выше)" && echo

SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")
echo "  Адреса после запуска:"
echo "    Игра:      http://$SERVER_IP:3000"
echo "    Дашборд:   http://$SERVER_IP:3000/dev"
echo "    API:       http://$SERVER_IP:3000/api"
echo
echo "  Скрипты:"
echo "    ./start_server.sh       — запуск сервера"
echo "    ./start_server_dev.sh   — запуск в режиме разработки"
echo "    ./seed_roblox.sh        — обновить данные Roblox"
echo "    ./migrate.sh            — применить миграции"
echo "    ./reset_database.sh     — сбросить базу данных"
echo "  -------------------------------------------"
echo

read -rp "  Запустить сервер сейчас? (Y/N): " START_NOW
if [[ "$START_NOW" =~ ^[Yy]$ ]]; then
  echo
  echo "  Запускаем... Ctrl+C для остановки."
  echo
  cd "$SERVER_DIR"
  node server.js
fi
