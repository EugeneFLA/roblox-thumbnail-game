const pool = require('../config/database');

class Campaign {
  /**
   * Создать кампанию
   */
  static async create({ developerId, name, gameTitle, gameDescription, robloxUniverseId, robloxPlaceId, targetVotes }) {
    const result = await pool.query(
      `INSERT INTO campaigns (developer_id, name, game_title, game_description, roblox_universe_id, roblox_place_id, target_votes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [developerId, name, gameTitle, gameDescription, robloxUniverseId || null, robloxPlaceId || null, targetVotes || 1000]
    );
    return result.rows[0];
  }

  /**
   * Получить кампанию по ID (только если принадлежит разработчику)
   */
  static async findById(id, developerId = null) {
    const devClause = developerId ? 'AND developer_id = $2' : '';
    const params = developerId ? [id, developerId] : [id];

    const result = await pool.query(
      `SELECT c.*,
              (SELECT COUNT(*) FROM campaign_thumbnails ct WHERE ct.campaign_id = c.id AND ct.is_active = true) as thumbnail_count,
              (SELECT COALESCE(SUM(csd.impressions), 0) FROM campaign_thumbnail_stats_daily csd
               JOIN campaign_thumbnails ct ON ct.id = csd.campaign_thumbnail_id
               WHERE ct.campaign_id = c.id) as total_impressions,
              (SELECT COALESCE(SUM(csd.votes), 0) FROM campaign_thumbnail_stats_daily csd
               JOIN campaign_thumbnails ct ON ct.id = csd.campaign_thumbnail_id
               WHERE ct.campaign_id = c.id) as total_votes
       FROM campaigns c
       WHERE c.id = $1 ${devClause}`,
      params
    );
    return result.rows[0] || null;
  }

  /**
   * Список кампаний разработчика
   */
  static async findByDeveloper(developerId, { status, limit = 50, offset = 0 } = {}) {
    const statusClause = status ? 'AND c.status = $2' : '';
    const params = status
      ? [developerId, status, limit, offset]
      : [developerId, limit, offset];

    const limitIdx = status ? '$3' : '$2';
    const offsetIdx = status ? '$4' : '$3';

    const result = await pool.query(
      `SELECT c.*,
              (SELECT COUNT(*) FROM campaign_thumbnails ct WHERE ct.campaign_id = c.id AND ct.is_active = true) as thumbnail_count,
              (SELECT COALESCE(SUM(csd.impressions), 0) FROM campaign_thumbnail_stats_daily csd
               JOIN campaign_thumbnails ct ON ct.id = csd.campaign_thumbnail_id
               WHERE ct.campaign_id = c.id) as total_impressions,
              (SELECT COALESCE(SUM(csd.votes), 0) FROM campaign_thumbnail_stats_daily csd
               JOIN campaign_thumbnails ct ON ct.id = csd.campaign_thumbnail_id
               WHERE ct.campaign_id = c.id) as total_votes
       FROM campaigns c
       WHERE c.developer_id = $1 ${statusClause}
       ORDER BY c.updated_at DESC
       LIMIT ${limitIdx} OFFSET ${offsetIdx}`,
      params
    );
    return result.rows;
  }

  /**
   * Обновить кампанию
   */
  static async update(id, developerId, { name, gameTitle, gameDescription, robloxUniverseId, robloxPlaceId, targetVotes, status }) {
    const result = await pool.query(
      `UPDATE campaigns SET
         name = COALESCE($3, name),
         game_title = COALESCE($4, game_title),
         game_description = COALESCE($5, game_description),
         roblox_universe_id = COALESCE($6, roblox_universe_id),
         roblox_place_id = COALESCE($7, roblox_place_id),
         target_votes = COALESCE($8, target_votes),
         status = COALESCE($9, status),
         updated_at = NOW()
       WHERE id = $1 AND developer_id = $2
       RETURNING *`,
      [id, developerId, name, gameTitle, gameDescription, robloxUniverseId, robloxPlaceId, targetVotes, status]
    );
    return result.rows[0];
  }

  /**
   * Удалить кампанию (мягкое удаление — архивирование)
   */
  static async archive(id, developerId) {
    const result = await pool.query(
      `UPDATE campaigns SET status = 'archived', updated_at = NOW()
       WHERE id = $1 AND developer_id = $2
       RETURNING id`,
      [id, developerId]
    );
    return result.rows[0];
  }

  /**
   * Получить активные кампании для показа в игре
   */
  static async getActiveForGame(limit = 5) {
    const result = await pool.query(
      `SELECT c.id, c.game_title, c.game_description,
              json_agg(json_build_object(
                'id', ct.id,
                'url', ct.file_url,
                'label', ct.label,
                'width', ct.width,
                'height', ct.height
              ) ORDER BY ct.sort_order) as thumbnails
       FROM campaigns c
       JOIN campaign_thumbnails ct ON ct.campaign_id = c.id AND ct.is_active = true
       WHERE c.status = 'active'
       GROUP BY c.id
       HAVING COUNT(ct.id) >= 2
       ORDER BY RANDOM()
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  /**
   * Количество кампаний разработчика
   */
  static async countByDeveloper(developerId) {
    const result = await pool.query(
      'SELECT COUNT(*) FROM campaigns WHERE developer_id = $1 AND status != $2',
      [developerId, 'archived']
    );
    return parseInt(result.rows[0].count);
  }
}

module.exports = Campaign;
