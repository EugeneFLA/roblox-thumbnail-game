/**
 * Миграция базы данных — добавление новых колонок к существующим таблицам.
 * Безопасно запускать повторно: все операции идемпотентны (IF NOT EXISTS).
 */
const pool = require('../config/database');

const MIGRATIONS = [
  {
    name: 'add_shop_columns_to_player_sessions',
    sql: `
      ALTER TABLE player_sessions
        ADD COLUMN IF NOT EXISTS hint_count          INT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS slow_count          INT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS second_chance_count INT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS streak_shield_count INT NOT NULL DEFAULT 0;
    `,
  },
  {
    name: 'add_win_count_to_campaign_thumbnails',
    sql: `
      ALTER TABLE campaign_thumbnails
        ADD COLUMN IF NOT EXISTS win_count INT NOT NULL DEFAULT 0;
    `,
  },
  {
    name: 'backfill_win_count_from_votes',
    sql: `
      UPDATE campaign_thumbnails ct
      SET win_count = (
        SELECT COUNT(*)
        FROM votes v
        WHERE v.chosen_campaign_thumb_id = ct.id
          AND v.round_type = 'campaign_pick'
      )
      WHERE win_count = 0;
    `,
  },
];

async function runMigrations() {
  console.log('Running database migrations...');
  let applied = 0;

  try {
    for (const migration of MIGRATIONS) {
      process.stdout.write(`  - ${migration.name}... `);
      try {
        await pool.query(migration.sql);
        console.log('OK');
        applied++;
      } catch (err) {
        console.log('ERROR');
        console.error(`    ${err.message}`);
        throw err;
      }
    }

    console.log(`\nMigrations complete. Applied: ${applied}/${MIGRATIONS.length}`);
  } catch (err) {
    console.error('\nMigration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
