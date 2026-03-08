const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { runSeed } = require('../scripts/seedRoblox');

// Простая аутентификация по паролю из .env
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

function requireAdmin(req, res, next) {
  const auth = req.headers['x-admin-password'];
  if (auth !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// POST /api/admin/login
router.post('/login', (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Неверный пароль' });
  res.json({ ok: true });
});

// GET /api/admin/games?page=1&search=&limit=50
router.get('/games', requireAdmin, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 50);
    const offset = (page - 1) * limit;
    const search = req.query.search ? `%${req.query.search}%` : '%';

    const [dataRes, countRes] = await Promise.all([
      pool.query(
        `SELECT g.id, g.universe_id, g.name, g.description, g.creator_name, g.playing,
                COUNT(t.id) AS thumb_count
         FROM games g
         LEFT JOIN thumbnails t ON t.game_id = g.id
         WHERE g.name ILIKE $1 OR g.creator_name ILIKE $1
         GROUP BY g.id
         ORDER BY g.id DESC
         LIMIT $2 OFFSET $3`,
        [search, limit, offset]
      ),
      pool.query(
        `SELECT COUNT(*) FROM games WHERE name ILIKE $1 OR creator_name ILIKE $1`,
        [search]
      ),
    ]);

    res.json({
      games: dataRes.rows,
      total: parseInt(countRes.rows[0].count),
      page,
      limit,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/games/:id
router.get('/games/:id', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT g.*, json_agg(t ORDER BY t.id) AS thumbnails
       FROM games g
       LEFT JOIN thumbnails t ON t.game_id = g.id
       WHERE g.id = $1
       GROUP BY g.id`,
      [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/games/:id
router.put('/games/:id', requireAdmin, async (req, res) => {
  try {
    const { name, description, creator_name } = req.body;
    await pool.query(
      `UPDATE games SET name=$1, description=$2, creator_name=$3 WHERE id=$4`,
      [name, description, creator_name, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/games/:id
router.delete('/games/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM games WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/games — добавить игру по universe_id
router.post('/games', requireAdmin, async (req, res) => {
  try {
    const { universe_id } = req.body;
    if (!universe_id) return res.status(400).json({ error: 'universe_id required' });

    // Получаем данные из Roblox API
    const detailsRes = await fetch(`https://games.roblox.com/v1/games?universeIds=${universe_id}`);
    const details = await detailsRes.json();
    const game = details.data && details.data[0];
    if (!game) return res.status(404).json({ error: 'Игра не найдена в Roblox' });

    // Получаем тамбнейлы
    const thumbRes = await fetch(
      `https://thumbnails.roblox.com/v1/games/multiget/thumbnails?universeIds=${universe_id}&countPerUniverse=10&size=768x432&format=Png`
    );
    const thumbData = await thumbRes.json();
    const thumbs = (thumbData.data || []).find(d => d.universeId == universe_id);

    // Upsert игры
    const upsert = await pool.query(
      `INSERT INTO games (universe_id, name, description, creator_name, playing)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (universe_id) DO UPDATE SET
         name=EXCLUDED.name, description=EXCLUDED.description,
         creator_name=EXCLUDED.creator_name, playing=EXCLUDED.playing
       RETURNING id`,
      [universe_id, game.name, game.description, game.creator?.name || '', game.playing || 0]
    );
    const gameId = upsert.rows[0].id;

    // Сохраняем тамбнейлы
    if (thumbs && thumbs.thumbnails) {
      for (const t of thumbs.thumbnails) {
        if (t.state === 'Completed' && t.imageUrl) {
          await pool.query(
            `INSERT INTO thumbnails (game_id, image_url, is_icon, width, height)
             VALUES ($1,$2,false,768,432)
             ON CONFLICT DO NOTHING`,
            [gameId, t.imageUrl]
          );
        }
      }
    }

    res.json({ ok: true, gameId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/seed — запустить обновление БД
let seedRunning = false;
router.post('/seed', requireAdmin, async (req, res) => {
  if (seedRunning) return res.status(409).json({ error: 'Обновление уже запущено' });
  seedRunning = true;
  res.json({ ok: true, message: 'Обновление запущено' });
  try {
    await runSeed({ silent: false });
    console.log('[Admin] Seed complete');
  } catch (err) {
    console.error('[Admin] Seed error:', err.message);
  } finally {
    seedRunning = false;
  }
});

// GET /api/admin/seed/status
router.get('/seed/status', requireAdmin, (req, res) => {
  res.json({ running: seedRunning });
});

// GET /api/admin/stats
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM games) AS games,
        (SELECT COUNT(*) FROM thumbnails) AS thumbnails,
        (SELECT COUNT(*) FROM player_sessions) AS sessions,
        (SELECT COUNT(*) FROM votes) AS votes,
        (SELECT COUNT(*) FROM developers) AS developers,
        (SELECT COUNT(*) FROM campaigns) AS campaigns
    `);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
