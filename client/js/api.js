/**
 * API клиент для общения с бэкендом
 */
const API = (() => {
  // В продакшене можно заменить на реальный URL бэкенда
  const BASE_URL = window.location.origin + '/api';

  async function request(path, options = {}) {
    try {
      const resp = await fetch(`${BASE_URL}${path}`, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
      });

      if (!resp.ok) {
        const errorData = await resp.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${resp.status}`);
      }

      return await resp.json();
    } catch (err) {
      console.error(`API error (${path}):`, err);
      throw err;
    }
  }

  return {
    /**
     * Получить раунд по номеру (единый эндпоинт с чередованием типов)
     */
    async getRound(roundNumber, sessionId) {
      return request(`/round?roundNumber=${roundNumber}&sessionId=${encodeURIComponent(sessionId || '')}`);
    },

    /**
     * Получить раунд "Угадай игру"
     */
    async getGuessRound() {
      return request('/round/guess');
    },

    /**
     * Получить раунд "Выбери лучший"
     */
    async getPickBestRound() {
      return request('/round/pick-best');
    },

    /**
     * Отправить голос
     */
    async sendVote(voteData) {
      return request('/vote', {
        method: 'POST',
        body: JSON.stringify(voteData),
      });
    },

    /**
     * Получить / создать сессию
     */
    async getSession(sessionId, yandexId) {
      const params = yandexId ? `?yandexId=${yandexId}` : '';
      return request(`/session/${sessionId}${params}`);
    },

    /**
     * Получить лидерборд
     */
    async getLeaderboard(limit = 50) {
      return request(`/leaderboard?limit=${limit}`);
    },

    /**
     * Отправить impressions (показы тамбнейлов)
     */
    async sendImpression(data) {
      return request('/impression', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    /**
     * Общая статистика
     */
    async getStats() {
      return request('/stats');
    },

    /**
     * Купить улучшение в магазине
     */
    async buyShopItem(sessionId, item) {
      return request('/shop/buy', {
        method: 'POST',
        body: JSON.stringify({ sessionId, item }),
      });
    },

    /**
     * Использовать купленное улучшение (без траты монет)
     */
    async useShopItem(sessionId, item) {
      return request('/shop/use', {
        method: 'POST',
        body: JSON.stringify({ sessionId, item }),
      });
    },
  };
})();
