const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const Campaign = require('../models/Campaign');
const CampaignThumbnail = require('../models/CampaignThumbnail');
const pool = require('../config/database');

router.use(requireAuth);

/**
 * GET /api/dev/stats/overview — общая статистика разработчика
 */
router.get('/overview', async (req, res) => {
  try {
    const devId = req.developer.id;

    // Общие цифры
    const overview = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM campaigns WHERE developer_id = $1 AND status != 'archived') as total_campaigns,
         (SELECT COUNT(*) FROM campaigns WHERE developer_id = $1 AND status = 'active') as active_campaigns,
         (SELECT COUNT(*) FROM campaign_thumbnails WHERE developer_id = $1 AND is_active = true) as total_thumbnails`,
      [devId]
    );

    // Агрегированная статистика за всё время
    const allTimeStats = await pool.query(
      `SELECT
         COALESCE(SUM(csd.impressions), 0) as total_impressions,
         COALESCE(SUM(csd.votes), 0) as total_votes,
         COALESCE(SUM(csd.wins), 0) as total_wins,
         COALESCE(AVG(NULLIF(csd.avg_response_time_ms, 0)), 0) as avg_response_time
       FROM campaign_thumbnail_stats_daily csd
       JOIN campaign_thumbnails ct ON ct.id = csd.campaign_thumbnail_id
       WHERE ct.developer_id = $1`,
      [devId]
    );

    // Статистика за последние 7 дней (по дням)
    const weeklyTrend = await pool.query(
      `SELECT
         csd.date,
         SUM(csd.impressions) as impressions,
         SUM(csd.votes) as votes,
         SUM(csd.wins) as wins
       FROM campaign_thumbnail_stats_daily csd
       JOIN campaign_thumbnails ct ON ct.id = csd.campaign_thumbnail_id
       WHERE ct.developer_id = $1
         AND csd.date >= CURRENT_DATE - 7
       GROUP BY csd.date
       ORDER BY csd.date ASC`,
      [devId]
    );

    // Топ-5 тамбнейлов по CTR
    const topThumbnails = await pool.query(
      `SELECT
         ct.id, ct.label, ct.file_url,
         c.game_title, c.name as campaign_name,
         COALESCE(SUM(csd.impressions), 0) as impressions,
         COALESCE(SUM(csd.votes), 0) as votes,
         COALESCE(SUM(csd.wins), 0) as wins,
         CASE WHEN COALESCE(SUM(csd.impressions), 0) > 0
              THEN ROUND(COALESCE(SUM(csd.votes), 0)::numeric / SUM(csd.impressions) * 100, 2)
              ELSE 0 END as ctr
       FROM campaign_thumbnails ct
       JOIN campaigns c ON c.id = ct.campaign_id
       LEFT JOIN campaign_thumbnail_stats_daily csd ON csd.campaign_thumbnail_id = ct.id
       WHERE ct.developer_id = $1 AND ct.is_active = true
       GROUP BY ct.id, c.game_title, c.name
       HAVING COALESCE(SUM(csd.impressions), 0) > 0
       ORDER BY ctr DESC
       LIMIT 5`,
      [devId]
    );

    res.json({
      overview: overview.rows[0],
      allTime: allTimeStats.rows[0],
      weeklyTrend: weeklyTrend.rows,
      topThumbnails: topThumbnails.rows,
    });
  } catch (err) {
    console.error('Overview stats error:', err);
    res.status(500).json({ error: 'Ошибка загрузки статистики' });
  }
});

/**
 * GET /api/dev/stats/campaigns/:id — статистика кампании
 */
router.get('/campaigns/:id', async (req, res) => {
  try {
    const campaignId = parseInt(req.params.id);
    const devId = req.developer.id;
    const days = parseInt(req.query.days) || 30;

    // Проверяем принадлежность
    const campaign = await Campaign.findById(campaignId, devId);
    if (!campaign) {
      return res.status(404).json({ error: 'Кампания не найдена' });
    }

    // Сравнительная статистика тамбнейлов
    const comparison = await CampaignThumbnail.getComparisonStats(campaignId);

    // Дневная статистика кампании
    const dailyStats = await pool.query(
      `SELECT
         csd.date,
         SUM(csd.impressions) as impressions,
         SUM(csd.votes) as votes,
         SUM(csd.wins) as wins
       FROM campaign_thumbnail_stats_daily csd
       JOIN campaign_thumbnails ct ON ct.id = csd.campaign_thumbnail_id
       WHERE ct.campaign_id = $1
         AND csd.date >= CURRENT_DATE - $2::integer
       GROUP BY csd.date
       ORDER BY csd.date ASC`,
      [campaignId, days]
    );

    // Уникальные игроки
    const uniquePlayers = await pool.query(
      `SELECT COUNT(DISTINCT session_id) as count
       FROM votes
       WHERE campaign_id = $1`,
      [campaignId]
    );

    // Процент достижения целевого числа голосов
    const totalVotes = comparison.reduce((sum, t) => sum + parseInt(t.total_votes || 0), 0);
    const progress = campaign.target_votes > 0
      ? Math.min(100, Math.round(totalVotes / campaign.target_votes * 100))
      : 0;

    res.json({
      campaign,
      comparison,
      dailyStats: dailyStats.rows,
      uniquePlayers: parseInt(uniquePlayers.rows[0]?.count || 0),
      totalVotes,
      progress,
    });
  } catch (err) {
    console.error('Campaign stats error:', err);
    res.status(500).json({ error: 'Ошибка загрузки статистики кампании' });
  }
});

/**
 * GET /api/dev/stats/thumbnails/:id — детальная статистика тамбнейла
 */
router.get('/thumbnails/:id', async (req, res) => {
  try {
    const thumbId = parseInt(req.params.id);
    const days = parseInt(req.query.days) || 30;

    // Проверяем принадлежность
    const thumb = await CampaignThumbnail.findById(thumbId);
    if (!thumb || thumb.developer_id !== req.developer.id) {
      return res.status(404).json({ error: 'Тамбнейл не найден' });
    }

    // Дневная статистика
    const dailyStats = await CampaignThumbnail.getDailyStats(thumbId, days);

    // Общие агрегаты
    const totals = await pool.query(
      `SELECT
         COALESCE(SUM(impressions), 0) as total_impressions,
         COALESCE(SUM(votes), 0) as total_votes,
         COALESCE(SUM(wins), 0) as total_wins,
         COALESCE(AVG(NULLIF(avg_response_time_ms, 0)), 0) as avg_response_time
       FROM campaign_thumbnail_stats_daily
       WHERE campaign_thumbnail_id = $1`,
      [thumbId]
    );

    const stats = totals.rows[0];
    const ctr = stats.total_impressions > 0
      ? (stats.total_votes / stats.total_impressions * 100).toFixed(2)
      : '0.00';
    const winRate = stats.total_votes > 0
      ? (stats.total_wins / stats.total_votes * 100).toFixed(2)
      : '0.00';

    // Среднее время ответа когда выбирают этот тамбнейл
    const responseTime = await pool.query(
      `SELECT AVG(response_time_ms) as avg_time, MIN(response_time_ms) as min_time, MAX(response_time_ms) as max_time
       FROM votes
       WHERE chosen_campaign_thumb_id = $1`,
      [thumbId]
    );

    res.json({
      thumbnail: thumb,
      totals: {
        ...stats,
        ctr: parseFloat(ctr),
        winRate: parseFloat(winRate),
      },
      dailyStats,
      responseTime: responseTime.rows[0],
    });
  } catch (err) {
    console.error('Thumbnail stats error:', err);
    res.status(500).json({ error: 'Ошибка загрузки статистики тамбнейла' });
  }
});

/**
 * GET /api/dev/stats/roblox-games — статистика по играм из Roblox-базы
 */
router.get('/roblox-games', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const sort = req.query.sort === 'impressions' ? 'total_impressions' : 'ctr';

    // Общие цифры по базе
    const summary = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM games) as total_games,
         (SELECT COUNT(*) FROM thumbnails WHERE is_icon = false) as total_thumbnails,
         (SELECT COUNT(*) FROM thumbnail_impressions WHERE thumbnail_id IS NOT NULL) as total_impressions,
         (SELECT COUNT(*) FROM votes WHERE chosen_thumbnail_id IS NOT NULL) as total_clicks`
    );

    // Топ игр по CTR
    const games = await pool.query(
      `SELECT
         g.id, g.name, g.universe_id, g.playing, g.visits,
         COUNT(DISTINCT t.id) as thumb_count,
         (SELECT t2.image_url FROM thumbnails t2
          WHERE t2.game_id = g.id AND t2.is_icon = false
          ORDER BY t2.id LIMIT 1) as cover_url,
         COALESCE(SUM(ti_agg.imp), 0) as total_impressions,
         COALESCE(SUM(v_agg.clicks), 0) as total_clicks,
         CASE WHEN COALESCE(SUM(ti_agg.imp), 0) > 0
              THEN ROUND(COALESCE(SUM(v_agg.clicks), 0)::numeric / SUM(ti_agg.imp) * 100, 2)
              ELSE 0 END as ctr
       FROM games g
       JOIN thumbnails t ON t.game_id = g.id AND t.is_icon = false
       LEFT JOIN (
         SELECT thumbnail_id, COUNT(*) as imp
         FROM thumbnail_impressions
         WHERE thumbnail_id IS NOT NULL
         GROUP BY thumbnail_id
       ) ti_agg ON ti_agg.thumbnail_id = t.id
       LEFT JOIN (
         SELECT chosen_thumbnail_id, COUNT(*) as clicks
         FROM votes
         WHERE chosen_thumbnail_id IS NOT NULL
         GROUP BY chosen_thumbnail_id
       ) v_agg ON v_agg.chosen_thumbnail_id = t.id
       GROUP BY g.id, g.name, g.universe_id, g.playing, g.visits
       HAVING COALESCE(SUM(ti_agg.imp), 0) > 0
       ORDER BY ${sort} DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    // Общее количество игр с показами
    const totalWithStats = await pool.query(
      `SELECT COUNT(DISTINCT t.game_id) as count
       FROM thumbnails t
       JOIN thumbnail_impressions ti ON ti.thumbnail_id = t.id
       WHERE t.is_icon = false`
    );

    res.json({
      summary: summary.rows[0],
      games: games.rows,
      total: parseInt(totalWithStats.rows[0].count),
      limit,
      offset,
    });
  } catch (err) {
    console.error('Roblox games stats error:', err);
    res.status(500).json({ error: 'Ошибка загрузки статистики' });
  }
});

module.exports = router;
