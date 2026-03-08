const express = require('express');
const router = express.Router();
const Game = require('../models/Game');
const Vote = require('../models/Vote');
const PlayerSession = require('../models/PlayerSession');
const Campaign = require('../models/Campaign');
const pool = require('../config/database');

/**
 * Раунды campaign_pick в сессии из 10 раундов
 */
const CAMPAIGN_PICK_ROUNDS = new Set([3, 6, 9]);

/**
 * GET /api/round
 * Единый эндпоинт раундов с чередованием по номеру раунда.
 * Раунды 3, 6, 9 → campaign_pick (если есть активные кампании, иначе fallback на guess).
 * Остальные → guess.
 */
router.get('/round', async (req, res) => {
  try {
    const roundNumber = Math.min(Math.max(parseInt(req.query.roundNumber) || 1, 1), 10);

    if (CAMPAIGN_PICK_ROUNDS.has(roundNumber)) {
      const campaignRound = await getCampaignPickRound();
      if (campaignRound) {
        return res.json(campaignRound);
      }
      // Fallback на guess если нет активных кампаний
    }

    const round = await Game.getGuessRound();
    if (!round) {
      return res.status(503).json({ error: 'Not enough data for a round' });
    }
    res.json(round);
  } catch (err) {
    console.error('Error getting round:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/round/guess
 * Получить раунд "Угадай игру" — описание + 4 тамбнейла.
 * С вероятностью 30% подставляет раунд из активной кампании разработчика.
 */
router.get('/round/guess', async (req, res) => {
  try {
    // 30% шанс показать кампанию разработчика
    if (Math.random() < 0.3) {
      const campaignRound = await getCampaignPickRound();
      if (campaignRound) {
        return res.json(campaignRound);
      }
    }

    const round = await Game.getGuessRound();
    if (!round) {
      return res.status(503).json({ error: 'Not enough data for a round' });
    }
    res.json(round);
  } catch (err) {
    console.error('Error getting guess round:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/round/pick-best
 * Получить раунд "Выбери лучший" — описание + несколько тамбнейлов одной игры (кампания разработчика)
 */
router.get('/round/pick-best', async (req, res) => {
  try {
    const round = await getCampaignPickRound();
    if (!round) {
      // fallback на стандартный pick-best из Roblox данных
      const fallback = await Game.getPickBestRound();
      if (!fallback) {
        return res.status(503).json({ error: 'Not enough data for a round' });
      }
      return res.json(fallback);
    }
    res.json(round);
  } catch (err) {
    console.error('Error getting pick-best round:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Генерирует раунд "Выбери лучший" из активной кампании разработчика
 */
async function getCampaignPickRound() {
  try {
    const activeCampaigns = await Campaign.getActiveForGame(1);
    if (activeCampaigns.length === 0) return null;

    const campaign = activeCampaigns[0];
    return {
      roundType: 'campaign_pick',
      campaignId: campaign.id,
      gameName: campaign.game_title,
      description: campaign.game_description,
      options: campaign.thumbnails.map(t => ({
        thumbnailId: null,
        campaignThumbnailId: t.id,
        imageUrl: t.url,
        label: t.label,
        isCorrect: false, // Нет правильного — просто выбор лучшего
      })),
    };
  } catch (err) {
    console.error('Error getting campaign round:', err);
    return null;
  }
}

/**
 * POST /api/vote
 * Записать голос игрока (поддерживает и обычные раунды и кампании)
 */
router.post('/vote', async (req, res) => {
  try {
    const {
      sessionId,
      roundType,
      questionGameId,
      campaignId,
      chosenThumbnailId,
      chosenCampaignThumbId,
      correctThumbnailId,
      correctCampaignThumbId,
      isCorrect,
      responseTimeMs,
      shieldUsed,
    } = req.body;

    if (!sessionId || !roundType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Сохраняем голос
    const vote = await pool.query(
      `INSERT INTO votes (session_id, round_type, question_game_id, campaign_id,
         chosen_thumbnail_id, chosen_campaign_thumb_id,
         correct_thumbnail_id, correct_campaign_thumb_id,
         is_correct, response_time_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        sessionId, roundType,
        questionGameId || null, campaignId || null,
        chosenThumbnailId || null, chosenCampaignThumbId || null,
        correctThumbnailId || null, correctCampaignThumbId || null,
        isCorrect !== undefined ? isCorrect : null,
        responseTimeMs || null,
      ]
    );

    // Обновляем дневную статистику для тамбнейлов кампании
    if (roundType === 'campaign_pick' && campaignId) {
      await updateCampaignStats(campaignId, chosenCampaignThumbId, sessionId, responseTimeMs);
    }

    // Подсчёт монет + данные популярности для campaign_pick
    let coinsEarned = 0;
    let popularityData = null;

    if (roundType === 'campaign_pick') {
      if (chosenCampaignThumbId) {
        // Инкрементируем win_count выбранного тамбнейла
        await pool.query(
          'UPDATE campaign_thumbnails SET win_count = win_count + 1 WHERE id = $1',
          [chosenCampaignThumbId]
        );

        // Получаем статистику по всем тамбнейлам раунда
        const { campaignThumbIds } = req.body;
        if (campaignThumbIds && Array.isArray(campaignThumbIds) && campaignThumbIds.length >= 2) {
          const statsResult = await pool.query(
            'SELECT id, win_count FROM campaign_thumbnails WHERE id = ANY($1)',
            [campaignThumbIds]
          );
          const totalWins = statsResult.rows.reduce((sum, r) => sum + parseInt(r.win_count), 0);
          const chosenRow = statsResult.rows.find(r => r.id === parseInt(chosenCampaignThumbId));
          const chosenWins = chosenRow ? parseInt(chosenRow.win_count) : 0;

          if (totalWins <= 1) {
            popularityData = { isFirst: true, popularityPercent: 100, isPopular: true };
          } else {
            const otherWins = totalWins - chosenWins;
            const popularityPercent = Math.round(chosenWins / totalWins * 100);
            const isPopular = chosenWins >= otherWins;
            popularityData = { isFirst: false, popularityPercent, isPopular };
          }
        }

        coinsEarned = popularityData && popularityData.isPopular ? 30 : 15;
      }
    } else if ((roundType === 'guess' || roundType === 'campaign_guess') && isCorrect) {
      coinsEarned = 25;
    } else if (roundType === 'guess' || roundType === 'campaign_guess') {
      coinsEarned = 10;
    }

    // Обновляем сессию (передаём shieldUsed для защиты стрика)
    const session = await PlayerSession.updateAfterRound(
      sessionId,
      isCorrect || false,
      coinsEarned,
      shieldUsed || false
    );

    // Бонус за streak
    let streakBonus = 0;
    if (session && session.streak >= 3) {
      streakBonus = Math.min(session.streak * 5, 50);
      await PlayerSession.updateAfterRound(sessionId, false, streakBonus);
    }

    const responsePayload = {
      voteId: vote.rows[0].id,
      coinsEarned: coinsEarned + streakBonus,
      streakBonus,
      session: session ? {
        totalScore: session.total_score,
        coins: session.coins + streakBonus,
        streak: session.streak,
        maxStreak: session.max_streak,
        level: session.level,
        correctCount: session.correct_count,
        totalRounds: session.total_rounds,
      } : null,
    };

    if (popularityData) {
      responsePayload.popularityPercent = popularityData.popularityPercent;
      responsePayload.isPopular = popularityData.isPopular;
      responsePayload.isFirst = popularityData.isFirst || false;
    }

    res.json(responsePayload);
  } catch (err) {
    console.error('Error recording vote:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/impression
 * Записать показ тамбнейлов (когда раунд отображается игроку)
 */
router.post('/impression', async (req, res) => {
  try {
    const { sessionId, campaignThumbnailIds, thumbnailIds, roundType } = req.body;

    if (!sessionId) return res.status(400).json({ error: 'Missing sessionId' });

    const inserts = [];

    // Impressions для кампанийных тамбнейлов
    if (campaignThumbnailIds && campaignThumbnailIds.length > 0) {
      for (const ctId of campaignThumbnailIds) {
        inserts.push(pool.query(
          `INSERT INTO thumbnail_impressions (session_id, campaign_thumbnail_id, round_type) VALUES ($1, $2, $3)`,
          [sessionId, ctId, roundType || 'campaign_pick']
        ));

        // Обновляем дневную статистику показов
        inserts.push(pool.query(
          `INSERT INTO campaign_thumbnail_stats_daily (campaign_thumbnail_id, date, impressions)
           VALUES ($1, CURRENT_DATE, 1)
           ON CONFLICT (campaign_thumbnail_id, date)
           DO UPDATE SET impressions = campaign_thumbnail_stats_daily.impressions + 1`,
          [ctId]
        ));
      }
    }

    // Impressions для обычных тамбнейлов
    if (thumbnailIds && thumbnailIds.length > 0) {
      for (const tId of thumbnailIds) {
        inserts.push(pool.query(
          `INSERT INTO thumbnail_impressions (session_id, thumbnail_id, round_type) VALUES ($1, $2, $3)`,
          [sessionId, tId, roundType || 'guess']
        ));
      }
    }

    await Promise.all(inserts);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error recording impression:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Обновить дневную статистику кампании после голоса
 */
async function updateCampaignStats(campaignId, chosenCampaignThumbId, sessionId, responseTimeMs) {
  try {
    // Обновляем голоса для выбранного тамбнейла
    if (chosenCampaignThumbId) {
      await pool.query(
        `INSERT INTO campaign_thumbnail_stats_daily (campaign_thumbnail_id, date, votes, wins, avg_response_time_ms)
         VALUES ($1, CURRENT_DATE, 1, 1, $2)
         ON CONFLICT (campaign_thumbnail_id, date)
         DO UPDATE SET
           votes = campaign_thumbnail_stats_daily.votes + 1,
           wins = campaign_thumbnail_stats_daily.wins + 1,
           avg_response_time_ms = (campaign_thumbnail_stats_daily.avg_response_time_ms * campaign_thumbnail_stats_daily.votes + $2)
                                  / (campaign_thumbnail_stats_daily.votes + 1)`,
        [chosenCampaignThumbId, responseTimeMs || 0]
      );
    }

    // Обновляем общую статистику кампании
    await pool.query(
      `INSERT INTO campaign_stats_daily (campaign_id, date, total_votes, unique_players)
       VALUES ($1, CURRENT_DATE, 1, 1)
       ON CONFLICT (campaign_id, date)
       DO UPDATE SET
         total_votes = campaign_stats_daily.total_votes + 1`,
      [campaignId]
    );
  } catch (err) {
    console.error('Error updating campaign stats:', err);
  }
}

/**
 * GET /api/session/:sessionId
 */
router.get('/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { yandexId } = req.query;
    const session = await PlayerSession.getOrCreate(sessionId, yandexId);

    if (!session) {
      return res.status(500).json({ error: 'Failed to get session' });
    }

    const rank = await PlayerSession.getRank(sessionId);

    res.json({
      sessionId: session.session_id,
      totalScore: session.total_score,
      coins: session.coins,
      streak: session.streak,
      maxStreak: session.max_streak,
      level: session.level,
      correctCount: session.correct_count,
      totalRounds: session.total_rounds,
      rank,
      hintCount: session.hint_count || 0,
      slowCount: session.slow_count || 0,
      secondChanceCount: session.second_chance_count || 0,
      streakShieldCount: session.streak_shield_count || 0,
    });
  } catch (err) {
    console.error('Error getting session:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/leaderboard
 */
router.get('/leaderboard', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const leaders = await PlayerSession.getLeaderboard(limit);
    res.json(leaders);
  } catch (err) {
    console.error('Error getting leaderboard:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/shop/buy
 * Купить улучшение за монеты
 */
const SHOP_ITEMS = {
  hint:          { cost: 100, column: 'hint_count' },
  slow:          { cost: 200, column: 'slow_count' },
  second_chance: { cost: 300, column: 'second_chance_count' },
  streak_shield: { cost: 500, column: 'streak_shield_count' },
};

router.post('/shop/buy', async (req, res) => {
  try {
    const { sessionId, item } = req.body;

    if (!sessionId || !item) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const shopItem = SHOP_ITEMS[item];
    if (!shopItem) {
      return res.status(400).json({ error: 'Unknown shop item' });
    }

    // Атомарное списание монет и инкремент колонки
    // WHERE coins >= cost предотвращает двойную трату
    const result = await pool.query(
      `UPDATE player_sessions
       SET coins = coins - $1,
           ${shopItem.column} = ${shopItem.column} + 1,
           updated_at = NOW()
       WHERE session_id = $2
         AND coins >= $1
       RETURNING coins, hint_count, slow_count, second_chance_count, streak_shield_count, level`,
      [shopItem.cost, sessionId]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Not enough coins' });
    }

    const s = result.rows[0];
    res.json({
      ok: true,
      session: {
        coins: s.coins,
        hintCount: s.hint_count,
        slowCount: s.slow_count,
        secondChanceCount: s.second_chance_count,
        streakShieldCount: s.streak_shield_count,
        level: s.level,
      },
    });
  } catch (err) {
    console.error('Error buying shop item:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/shop/use
 * Использовать купленное улучшение (декремент без списания монет)
 */
const USE_COLUMNS = {
  hint: 'hint_count',
  slow: 'slow_count',
  second_chance: 'second_chance_count',
  streak_shield: 'streak_shield_count',
};

router.post('/shop/use', async (req, res) => {
  try {
    const { sessionId, item } = req.body;
    const col = USE_COLUMNS[item];
    if (!sessionId || !col) {
      return res.status(400).json({ error: 'Missing or invalid fields' });
    }

    const result = await pool.query(
      `UPDATE player_sessions
       SET ${col} = ${col} - 1, updated_at = NOW()
       WHERE session_id = $1 AND ${col} > 0
       RETURNING hint_count, slow_count, second_chance_count, streak_shield_count`,
      [sessionId]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'No charges left' });
    }

    const s = result.rows[0];
    res.json({
      ok: true,
      session: {
        hintCount: s.hint_count,
        slowCount: s.slow_count,
        secondChanceCount: s.second_chance_count,
        streakShieldCount: s.streak_shield_count,
      },
    });
  } catch (err) {
    console.error('Error using shop item:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/stats
 */
router.get('/stats', async (req, res) => {
  try {
    const gameCount = await Game.getCount();
    res.json({ gameCount });
  } catch (err) {
    console.error('Error getting stats:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
