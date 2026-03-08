const pool = require('../config/database');

class PlayerSession {
  /**
   * Получить или создать сессию
   */
  static async getOrCreate(sessionId, yandexId = null) {
    // Пытаемся найти существующую
    let result = await pool.query(
      'SELECT * FROM player_sessions WHERE session_id = $1',
      [sessionId]
    );

    if (result.rows.length > 0) {
      return result.rows[0];
    }

    // Создаём новую
    result = await pool.query(
      `INSERT INTO player_sessions (session_id, yandex_id)
       VALUES ($1, $2)
       ON CONFLICT (session_id) DO NOTHING
       RETURNING *`,
      [sessionId, yandexId]
    );

    return result.rows[0] || (await pool.query(
      'SELECT * FROM player_sessions WHERE session_id = $1',
      [sessionId]
    )).rows[0];
  }

  /**
   * Обновить статистику после раунда
   * @param {boolean} shieldActive — активен ли щит стрика (защищает от сброса при ошибке)
   */
  static async updateAfterRound(sessionId, isCorrect, coinsEarned, shieldActive = false) {
    const useShield = shieldActive && !isCorrect;

    const result = await pool.query(
      `UPDATE player_sessions SET
         total_rounds = total_rounds + 1,
         correct_count = correct_count + $2,
         streak = CASE
           WHEN $3 THEN streak + 1
           WHEN $5 THEN streak
           ELSE 0
         END,
         max_streak = CASE
           WHEN $3 AND streak + 1 > max_streak THEN streak + 1
           ELSE max_streak
         END,
         streak_shield_count = CASE
           WHEN $5 THEN GREATEST(0, streak_shield_count - 1)
           ELSE streak_shield_count
         END,
         coins = coins + $4,
         total_score = total_score + $4,
         level = GREATEST(1, FLOOR(SQRT((total_rounds + 1) / 5.0)) + 1),
         updated_at = NOW()
       WHERE session_id = $1
       RETURNING *`,
      [sessionId, isCorrect ? 1 : 0, isCorrect, coinsEarned, useShield]
    );

    return result.rows[0];
  }

  /**
   * Топ игроков по очкам
   */
  static async getLeaderboard(limit = 50) {
    const result = await pool.query(
      `SELECT session_id, total_score, correct_count, total_rounds, max_streak, level
       FROM player_sessions
       ORDER BY total_score DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  /**
   * Позиция игрока в лидерборде
   */
  static async getRank(sessionId) {
    const result = await pool.query(
      `SELECT COUNT(*) + 1 as rank
       FROM player_sessions
       WHERE total_score > (
         SELECT total_score FROM player_sessions WHERE session_id = $1
       )`,
      [sessionId]
    );
    return parseInt(result.rows[0]?.rank || 0);
  }
}

module.exports = PlayerSession;
