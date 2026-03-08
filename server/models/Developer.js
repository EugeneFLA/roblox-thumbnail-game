const pool = require('../config/database');
const bcrypt = require('bcrypt');

const SALT_ROUNDS = 12;

class Developer {
  /**
   * Регистрация нового разработчика
   */
  static async create({ email, password, displayName, companyName, robloxUsername }) {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const result = await pool.query(
      `INSERT INTO developers (email, password_hash, display_name, company_name, roblox_username)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, display_name, company_name, roblox_username, created_at`,
      [email.toLowerCase().trim(), passwordHash, displayName, companyName || null, robloxUsername || null]
    );

    return result.rows[0];
  }

  /**
   * Найти по email
   */
  static async findByEmail(email) {
    const result = await pool.query(
      'SELECT * FROM developers WHERE email = $1 AND is_active = true',
      [email.toLowerCase().trim()]
    );
    return result.rows[0] || null;
  }

  /**
   * Найти по ID
   */
  static async findById(id) {
    const result = await pool.query(
      `SELECT id, email, display_name, company_name, roblox_username, avatar_url,
              is_verified, created_at, updated_at
       FROM developers WHERE id = $1 AND is_active = true`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Проверить пароль
   */
  static async verifyPassword(plainPassword, hashedPassword) {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  /**
   * Обновить профиль
   */
  static async update(id, { displayName, companyName, robloxUsername }) {
    const result = await pool.query(
      `UPDATE developers SET
         display_name = COALESCE($2, display_name),
         company_name = COALESCE($3, company_name),
         roblox_username = COALESCE($4, roblox_username),
         updated_at = NOW()
       WHERE id = $1
       RETURNING id, email, display_name, company_name, roblox_username`,
      [id, displayName, companyName, robloxUsername]
    );
    return result.rows[0];
  }

  /**
   * Сменить пароль
   */
  static async changePassword(id, newPassword) {
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await pool.query(
      'UPDATE developers SET password_hash = $2, updated_at = NOW() WHERE id = $1',
      [id, passwordHash]
    );
  }

  /**
   * Общая статистика разработчика
   */
  static async getOverviewStats(developerId) {
    const result = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM campaigns WHERE developer_id = $1) as total_campaigns,
         (SELECT COUNT(*) FROM campaigns WHERE developer_id = $1 AND status = 'active') as active_campaigns,
         (SELECT COUNT(*) FROM campaign_thumbnails WHERE developer_id = $1) as total_thumbnails,
         (SELECT COALESCE(SUM(impressions), 0) FROM campaign_thumbnail_stats_daily csd
          JOIN campaign_thumbnails ct ON ct.id = csd.campaign_thumbnail_id
          WHERE ct.developer_id = $1) as total_impressions,
         (SELECT COALESCE(SUM(votes), 0) FROM campaign_thumbnail_stats_daily csd
          JOIN campaign_thumbnails ct ON ct.id = csd.campaign_thumbnail_id
          WHERE ct.developer_id = $1) as total_votes`,
      [developerId]
    );
    return result.rows[0];
  }
}

module.exports = Developer;
