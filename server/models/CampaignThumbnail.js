const pool = require('../config/database');
const fs = require('fs');
const path = require('path');

class CampaignThumbnail {
  /**
   * Добавить тамбнейл в кампанию
   */
  static async create({ campaignId, developerId, originalFilename, filePath, fileUrl, fileSize, width, height, label, sortOrder }) {
    const result = await pool.query(
      `INSERT INTO campaign_thumbnails
         (campaign_id, developer_id, original_filename, file_path, file_url, file_size, width, height, label, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [campaignId, developerId, originalFilename, filePath, fileUrl, fileSize || 0, width || 1920, height || 1080, label || null, sortOrder || 0]
    );
    return result.rows[0];
  }

  /**
   * Получить тамбнейл по ID
   */
  static async findById(id) {
    const result = await pool.query(
      `SELECT ct.*,
              c.name as campaign_name, c.game_title, c.developer_id as campaign_developer_id
       FROM campaign_thumbnails ct
       JOIN campaigns c ON c.id = ct.campaign_id
       WHERE ct.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Список тамбнейлов кампании
   */
  static async findByCampaign(campaignId) {
    const result = await pool.query(
      `SELECT ct.*,
              COALESCE(stats.total_impressions, 0) as total_impressions,
              COALESCE(stats.total_votes, 0) as total_votes,
              COALESCE(stats.total_wins, 0) as total_wins,
              COALESCE(stats.avg_response_time, 0) as avg_response_time,
              CASE WHEN COALESCE(stats.total_impressions, 0) > 0
                   THEN ROUND(COALESCE(stats.total_votes, 0)::numeric / stats.total_impressions * 100, 2)
                   ELSE 0 END as ctr,
              CASE WHEN COALESCE(stats.total_votes, 0) > 0
                   THEN ROUND(COALESCE(stats.total_wins, 0)::numeric / stats.total_votes * 100, 2)
                   ELSE 0 END as win_rate
       FROM campaign_thumbnails ct
       LEFT JOIN LATERAL (
         SELECT
           SUM(impressions) as total_impressions,
           SUM(votes) as total_votes,
           SUM(wins) as total_wins,
           AVG(avg_response_time_ms) as avg_response_time
         FROM campaign_thumbnail_stats_daily
         WHERE campaign_thumbnail_id = ct.id
       ) stats ON true
       WHERE ct.campaign_id = $1 AND ct.is_active = true
       ORDER BY ct.sort_order, ct.created_at`,
      [campaignId]
    );
    return result.rows;
  }

  /**
   * Обновить тамбнейл (label, sort_order)
   */
  static async update(id, developerId, { label, sortOrder }) {
    const result = await pool.query(
      `UPDATE campaign_thumbnails SET
         label = COALESCE($3, label),
         sort_order = COALESCE($4, sort_order),
         updated_at = NOW()
       WHERE id = $1 AND developer_id = $2
       RETURNING *`,
      [id, developerId, label, sortOrder]
    );
    return result.rows[0];
  }

  /**
   * Перезалить файл тамбнейла
   */
  static async replaceFile(id, developerId, { filePath: newFilePath, fileUrl, fileSize, width, height, originalFilename }) {
    // Получаем текущий тамбнейл для удаления старого файла
    const current = await pool.query(
      'SELECT file_path FROM campaign_thumbnails WHERE id = $1 AND developer_id = $2',
      [id, developerId]
    );

    if (current.rows.length === 0) return null;

    // Удаляем старый файл
    const oldPath = current.rows[0].file_path;
    try {
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    } catch (err) {
      console.warn('Could not delete old thumbnail file:', err.message);
    }

    const result = await pool.query(
      `UPDATE campaign_thumbnails SET
         original_filename = $3,
         file_path = $4,
         file_url = $5,
         file_size = $6,
         width = $7,
         height = $8,
         updated_at = NOW()
       WHERE id = $1 AND developer_id = $2
       RETURNING *`,
      [id, developerId, originalFilename, newFilePath, fileUrl, fileSize, width, height]
    );
    return result.rows[0];
  }

  /**
   * Удалить тамбнейл (мягко — deactivate)
   */
  static async deactivate(id, developerId) {
    const result = await pool.query(
      `UPDATE campaign_thumbnails SET is_active = false, updated_at = NOW()
       WHERE id = $1 AND developer_id = $2
       RETURNING id, file_path`,
      [id, developerId]
    );
    return result.rows[0];
  }

  /**
   * Полное удаление с файлом
   */
  static async deleteWithFile(id, developerId) {
    const thumb = await pool.query(
      'SELECT file_path FROM campaign_thumbnails WHERE id = $1 AND developer_id = $2',
      [id, developerId]
    );

    if (thumb.rows.length > 0) {
      try {
        if (fs.existsSync(thumb.rows[0].file_path)) {
          fs.unlinkSync(thumb.rows[0].file_path);
        }
      } catch (err) {
        console.warn('Could not delete file:', err.message);
      }
    }

    const result = await pool.query(
      'DELETE FROM campaign_thumbnails WHERE id = $1 AND developer_id = $2 RETURNING id',
      [id, developerId]
    );
    return result.rows[0];
  }

  /**
   * Детальная статистика тамбнейла по дням
   */
  static async getDailyStats(thumbnailId, days = 30) {
    const result = await pool.query(
      `SELECT date, impressions, votes, wins, avg_response_time_ms
       FROM campaign_thumbnail_stats_daily
       WHERE campaign_thumbnail_id = $1
         AND date >= CURRENT_DATE - $2::integer
       ORDER BY date ASC`,
      [thumbnailId, days]
    );
    return result.rows;
  }

  /**
   * Сравнительная статистика всех тамбнейлов кампании
   */
  static async getComparisonStats(campaignId) {
    const result = await pool.query(
      `SELECT
         ct.id,
         ct.label,
         ct.file_url,
         ct.created_at,
         COALESCE(SUM(csd.impressions), 0) as total_impressions,
         COALESCE(SUM(csd.votes), 0) as total_votes,
         COALESCE(SUM(csd.wins), 0) as total_wins,
         COALESCE(AVG(csd.avg_response_time_ms), 0) as avg_response_time,
         CASE WHEN COALESCE(SUM(csd.impressions), 0) > 0
              THEN ROUND(SUM(csd.votes)::numeric / SUM(csd.impressions) * 100, 2)
              ELSE 0 END as ctr,
         CASE WHEN COALESCE(SUM(csd.votes), 0) > 0
              THEN ROUND(SUM(csd.wins)::numeric / SUM(csd.votes) * 100, 2)
              ELSE 0 END as win_rate
       FROM campaign_thumbnails ct
       LEFT JOIN campaign_thumbnail_stats_daily csd ON csd.campaign_thumbnail_id = ct.id
       WHERE ct.campaign_id = $1 AND ct.is_active = true
       GROUP BY ct.id
       ORDER BY win_rate DESC, total_votes DESC`,
      [campaignId]
    );
    return result.rows;
  }
}

module.exports = CampaignThumbnail;
