const pool = require('../config/database');

class Vote {
  /**
   * Записать голос
   */
  static async create({
    sessionId,
    roundType,
    questionGameId,
    chosenThumbnailId,
    correctThumbnailId,
    isCorrect,
    responseTimeMs,
  }) {
    const result = await pool.query(
      `INSERT INTO votes (session_id, round_type, question_game_id, chosen_thumbnail_id, correct_thumbnail_id, is_correct, response_time_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [sessionId, roundType, questionGameId, chosenThumbnailId, correctThumbnailId, isCorrect, responseTimeMs]
    );
    return result.rows[0];
  }

  /**
   * Статистика по тамбнейлу — сколько раз его выбирали
   */
  static async getThumbnailStats(thumbnailId) {
    const result = await pool.query(
      `SELECT 
         COUNT(*) as total_votes,
         COUNT(*) FILTER (WHERE round_type = 'guess' AND is_correct = true) as correct_guesses,
         COUNT(*) FILTER (WHERE round_type = 'guess') as total_guesses,
         COUNT(*) FILTER (WHERE round_type = 'pick_best') as pick_best_votes,
         AVG(response_time_ms) as avg_response_time
       FROM votes 
       WHERE chosen_thumbnail_id = $1`,
      [thumbnailId]
    );
    return result.rows[0];
  }

  /**
   * Топ тамбнейлов по количеству выборов в режиме "pick_best"
   */
  static async getTopThumbnails(limit = 20) {
    const result = await pool.query(
      `SELECT 
         t.id as thumbnail_id,
         t.image_url,
         g.name as game_name,
         COUNT(v.id) as vote_count,
         AVG(v.response_time_ms) as avg_response_time
       FROM votes v
       JOIN thumbnails t ON t.id = v.chosen_thumbnail_id
       JOIN games g ON g.id = t.game_id
       WHERE v.round_type = 'pick_best'
       GROUP BY t.id, t.image_url, g.name
       ORDER BY vote_count DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }
}

module.exports = Vote;
