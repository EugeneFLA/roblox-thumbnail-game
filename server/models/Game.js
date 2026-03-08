const pool = require('../config/database');

class Game {
  /**
   * Получить случайную игру с тамбнейлами
   */
  static async getRandom(excludeIds = []) {
    const excludeClause = excludeIds.length > 0
      ? `AND g.id NOT IN (${excludeIds.map((_, i) => `$${i + 1}`).join(',')})`
      : '';

    const result = await pool.query(
      `SELECT g.*, 
              json_agg(json_build_object(
                'id', t.id, 
                'url', t.image_url, 
                'isIcon', t.is_icon,
                'width', t.width,
                'height', t.height
              )) as thumbnails
       FROM games g
       JOIN thumbnails t ON t.game_id = g.id AND t.is_icon = false
       WHERE t.image_url IS NOT NULL ${excludeClause}
       GROUP BY g.id
       HAVING COUNT(t.id) > 0
       ORDER BY RANDOM()
       LIMIT 1`,
      excludeIds
    );

    return result.rows[0] || null;
  }

  /**
   * Получить набор для раунда "Угадай игру":
   * - 1 правильная игра с описанием
   * - 4 тамбнейла (1 правильный + 3 от других игр)
   */
  static async getGuessRound() {
    // Берём 4 случайных игры с тамбнейлами (не иконками)
    const result = await pool.query(
      `SELECT g.id, g.name, g.description, g.creator_name, g.playing,
              (SELECT t.id FROM thumbnails t 
               WHERE t.game_id = g.id AND t.is_icon = false AND t.image_url IS NOT NULL
               ORDER BY RANDOM() LIMIT 1) as thumb_id,
              (SELECT t.image_url FROM thumbnails t 
               WHERE t.game_id = g.id AND t.is_icon = false AND t.image_url IS NOT NULL
               ORDER BY RANDOM() LIMIT 1) as thumb_url
       FROM games g
       WHERE EXISTS (
         SELECT 1 FROM thumbnails t 
         WHERE t.game_id = g.id AND t.is_icon = false AND t.image_url IS NOT NULL
       )
       AND g.description IS NOT NULL
       AND length(g.description) BETWEEN 30 AND 500
       AND g.description NOT ILIKE '%your very first roblox creation%'
       AND g.description NOT ILIKE '%primeira criação%'
       AND g.description NOT ILIKE '%first creation%'
       AND g.description NOT ILIKE '%http://%'
       AND g.description NOT ILIKE '%https://%'
       AND g.description NOT ILIKE '%/cmd%'
       AND g.description NOT ILIKE '%discord.gg%'
       AND g.description NOT ILIKE '%discord.com%'
       AND g.description NOT ILIKE '% kill %'
       AND g.description NOT ILIKE '% kick %'
       AND g.description NOT ILIKE '%Server Host%'
       ORDER BY RANDOM()
       LIMIT 4`
    );

    if (result.rows.length < 4) {
      return null; // Недостаточно данных
    }

    const games = result.rows;
    const correctIndex = Math.floor(Math.random() * 4);
    const correctGame = games[correctIndex];

    return {
      description: correctGame.description,
      gameName: correctGame.name,
      creatorName: correctGame.creator_name,
      correctGameId: correctGame.id,
      correctThumbnailId: correctGame.thumb_id,
      options: games.map((g, i) => ({
        thumbnailId: g.thumb_id,
        imageUrl: g.thumb_url,
        gameId: g.id,
        isCorrect: i === correctIndex,
      })),
    };
  }

  /**
   * Получить набор для раунда "Выбери лучший":
   * - Описание игры
   * - Несколько тамбнейлов одной игры
   */
  static async getPickBestRound() {
    // Игра с несколькими тамбнейлами
    const result = await pool.query(
      `SELECT g.id, g.name, g.description, g.creator_name,
              json_agg(json_build_object(
                'id', t.id,
                'url', t.image_url
              ) ORDER BY RANDOM()) as thumbnails
       FROM games g
       JOIN thumbnails t ON t.game_id = g.id AND t.is_icon = false
       WHERE t.image_url IS NOT NULL
         AND g.description IS NOT NULL AND g.description != ''
       GROUP BY g.id
       HAVING COUNT(t.id) >= 2
       ORDER BY RANDOM()
       LIMIT 1`
    );

    if (result.rows.length === 0) return null;

    const game = result.rows[0];
    return {
      gameId: game.id,
      gameName: game.name,
      description: game.description,
      thumbnails: game.thumbnails.slice(0, 4),
    };
  }

  /**
   * Получить общее количество игр
   */
  static async getCount() {
    const result = await pool.query('SELECT COUNT(*) FROM games');
    return parseInt(result.rows[0].count);
  }
}

module.exports = Game;
