/**
 * Инициализация базы данных — создание таблиц
 */
const pool = require('../config/database');

const SQL = `
-- =============================================
-- ЧАСТЬ 1: Базовые таблицы (Roblox парсинг)
-- =============================================

-- Roblox игры (experiences)
CREATE TABLE IF NOT EXISTS games (
  id            SERIAL PRIMARY KEY,
  universe_id   BIGINT UNIQUE NOT NULL,
  place_id      BIGINT,
  name          VARCHAR(255) NOT NULL,
  description   TEXT DEFAULT '',
  creator_name  VARCHAR(255) DEFAULT '',
  playing       INTEGER DEFAULT 0,
  visits        BIGINT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Тамбнейлы игр (из Roblox парсинга)
CREATE TABLE IF NOT EXISTS thumbnails (
  id            SERIAL PRIMARY KEY,
  game_id       INTEGER REFERENCES games(id) ON DELETE CASCADE,
  image_url     TEXT NOT NULL,
  is_icon       BOOLEAN DEFAULT FALSE,
  width         INTEGER DEFAULT 768,
  height        INTEGER DEFAULT 432,
  source        VARCHAR(32) DEFAULT 'roblox',
  campaign_thumbnail_id INTEGER,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Сессии игроков (анонимные, по Yandex player id или UUID)
CREATE TABLE IF NOT EXISTS player_sessions (
  id            SERIAL PRIMARY KEY,
  session_id    VARCHAR(64) UNIQUE NOT NULL,
  yandex_id     VARCHAR(128),
  total_score   INTEGER DEFAULT 0,
  total_rounds  INTEGER DEFAULT 0,
  correct_count INTEGER DEFAULT 0,
  streak        INTEGER DEFAULT 0,
  max_streak    INTEGER DEFAULT 0,
  level         INTEGER DEFAULT 1,
  coins         INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- ЧАСТЬ 2: Разработчики и кампании
-- =============================================

-- Аккаунты разработчиков
CREATE TABLE IF NOT EXISTS developers (
  id            SERIAL PRIMARY KEY,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name  VARCHAR(100) NOT NULL,
  company_name  VARCHAR(200),
  roblox_username VARCHAR(100),
  avatar_url    TEXT,
  is_verified   BOOLEAN DEFAULT FALSE,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Кампании тестирования тамбнейлов
CREATE TABLE IF NOT EXISTS campaigns (
  id            SERIAL PRIMARY KEY,
  developer_id  INTEGER REFERENCES developers(id) ON DELETE CASCADE,
  name          VARCHAR(255) NOT NULL,
  game_title    VARCHAR(255) NOT NULL,
  game_description TEXT NOT NULL,
  roblox_universe_id BIGINT,
  roblox_place_id BIGINT,
  status        VARCHAR(32) DEFAULT 'draft'
                CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')),
  target_votes  INTEGER DEFAULT 1000,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Тамбнейлы кампаний (загруженные разработчиками)
CREATE TABLE IF NOT EXISTS campaign_thumbnails (
  id            SERIAL PRIMARY KEY,
  campaign_id   INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
  developer_id  INTEGER REFERENCES developers(id) ON DELETE CASCADE,
  original_filename VARCHAR(255),
  file_path     TEXT NOT NULL,
  file_url      TEXT NOT NULL,
  file_size     INTEGER DEFAULT 0,
  width         INTEGER DEFAULT 1920,
  height        INTEGER DEFAULT 1080,
  label         VARCHAR(100),
  sort_order    INTEGER DEFAULT 0,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- ЧАСТЬ 3: Голосования и аналитика
-- =============================================

-- Голоса / выборы игроков (обновлённая)
CREATE TABLE IF NOT EXISTS votes (
  id                    SERIAL PRIMARY KEY,
  session_id            VARCHAR(64) NOT NULL,
  round_type            VARCHAR(32) NOT NULL
                        CHECK (round_type IN ('guess', 'pick_best', 'campaign_guess', 'campaign_pick')),
  question_game_id      INTEGER REFERENCES games(id),
  campaign_id           INTEGER REFERENCES campaigns(id),
  chosen_thumbnail_id   INTEGER REFERENCES thumbnails(id),
  chosen_campaign_thumb_id INTEGER REFERENCES campaign_thumbnails(id),
  correct_thumbnail_id  INTEGER REFERENCES thumbnails(id),
  correct_campaign_thumb_id INTEGER REFERENCES campaign_thumbnails(id),
  is_correct            BOOLEAN,
  response_time_ms      INTEGER,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Просмотры тамбнейлов (impression-tracking)
CREATE TABLE IF NOT EXISTS thumbnail_impressions (
  id                    SERIAL PRIMARY KEY,
  session_id            VARCHAR(64) NOT NULL,
  campaign_thumbnail_id INTEGER REFERENCES campaign_thumbnails(id) ON DELETE CASCADE,
  thumbnail_id          INTEGER REFERENCES thumbnails(id) ON DELETE CASCADE,
  round_type            VARCHAR(32),
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Дневная агрегированная статистика по тамбнейлам кампаний
CREATE TABLE IF NOT EXISTS campaign_thumbnail_stats_daily (
  id                    SERIAL PRIMARY KEY,
  campaign_thumbnail_id INTEGER REFERENCES campaign_thumbnails(id) ON DELETE CASCADE,
  date                  DATE NOT NULL,
  impressions           INTEGER DEFAULT 0,
  votes                 INTEGER DEFAULT 0,
  wins                  INTEGER DEFAULT 0,
  avg_response_time_ms  REAL DEFAULT 0,
  UNIQUE(campaign_thumbnail_id, date)
);

-- Агрегированная статистика по кампаниям
CREATE TABLE IF NOT EXISTS campaign_stats_daily (
  id                    SERIAL PRIMARY KEY,
  campaign_id           INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
  date                  DATE NOT NULL,
  total_impressions     INTEGER DEFAULT 0,
  total_votes           INTEGER DEFAULT 0,
  unique_players        INTEGER DEFAULT 0,
  UNIQUE(campaign_id, date)
);

-- =============================================
-- ИНДЕКСЫ
-- =============================================

CREATE INDEX IF NOT EXISTS idx_thumbnails_game_id ON thumbnails(game_id);
CREATE INDEX IF NOT EXISTS idx_thumbnails_campaign_thumb ON thumbnails(campaign_thumbnail_id);
CREATE INDEX IF NOT EXISTS idx_votes_session ON votes(session_id);
CREATE INDEX IF NOT EXISTS idx_votes_thumbnail ON votes(chosen_thumbnail_id);
CREATE INDEX IF NOT EXISTS idx_votes_campaign ON votes(campaign_id);
CREATE INDEX IF NOT EXISTS idx_votes_campaign_thumb ON votes(chosen_campaign_thumb_id);
CREATE INDEX IF NOT EXISTS idx_votes_created ON votes(created_at);
CREATE INDEX IF NOT EXISTS idx_games_universe ON games(universe_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_developer ON campaigns(developer_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaign_thumbs_campaign ON campaign_thumbnails(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_thumbs_developer ON campaign_thumbnails(developer_id);
CREATE INDEX IF NOT EXISTS idx_impressions_campaign_thumb ON thumbnail_impressions(campaign_thumbnail_id);
CREATE INDEX IF NOT EXISTS idx_impressions_created ON thumbnail_impressions(created_at);
CREATE INDEX IF NOT EXISTS idx_ct_stats_daily_thumb ON campaign_thumbnail_stats_daily(campaign_thumbnail_id);
CREATE INDEX IF NOT EXISTS idx_ct_stats_daily_date ON campaign_thumbnail_stats_daily(date);
CREATE INDEX IF NOT EXISTS idx_c_stats_daily_campaign ON campaign_stats_daily(campaign_id);
CREATE INDEX IF NOT EXISTS idx_c_stats_daily_date ON campaign_stats_daily(date);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          SERIAL PRIMARY KEY,
  developer_id INTEGER REFERENCES developers(id) ON DELETE CASCADE,
  token       VARCHAR(64) NOT NULL UNIQUE,
  code        VARCHAR(6)  NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used        BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prt_token ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_prt_developer ON password_reset_tokens(developer_id);

-- Ключи сторонних API (добавляем если столбца ещё нет)
ALTER TABLE developers ADD COLUMN IF NOT EXISTS meshy_api_key TEXT;
`;

async function initDb() {
  console.log('Initializing database...');
  try {
    await pool.query(SQL);
    console.log('Database tables created successfully.');
  } catch (err) {
    console.error('Error creating tables:', err.message);
  } finally {
    await pool.end();
  }
}

initDb();
