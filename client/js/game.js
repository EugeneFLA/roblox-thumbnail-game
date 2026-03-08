/**
 * Игровая логика — управление раундами, таймером, очками
 */
const Game = (() => {
  // Настройки
  const ROUNDS_PER_SESSION = 10;
  const TIMER_DURATION = 15000; // 15 секунд на раунд
  const BASE_COINS = 10;
  const CORRECT_COINS = 25;
  const TIME_BONUS_MAX = 15; // максимум бонус за скорость
  const STREAK_MULTIPLIER = 5; // монет за каждый streak
  const NEXT_ROUND_DELAY = 2000; // пауза после ответа

  let nextRoundTimer = null; // handle для отмены авто-перехода

  // Состояние
  let state = {
    currentRound: 0,
    correctCount: 0,
    streak: 0,
    maxStreak: 0,
    coinsEarned: 0,
    totalCoins: 0,
    level: 1,
    roundData: null,
    timerInterval: null,
    timerStart: 0,
    timerRemaining: 0,
    answered: false,
    sessionId: null,
    powerUps: {
      hintCount: 0,
      slowCount: 0,
      secondChanceCount: 0,
      streakShieldCount: 0,
    },
    secondChanceUsed: false,
    secondChancePending: false,
  };

  // Callback'и для UI
  let onRoundReady = null;
  let onRoundResult = null;
  let onGameOver = null;
  let onStatsUpdate = null;
  let onTimerTick = null;
  let onHintReady = null;
  let onSecondChanceOffered = null;
  let onPowerUpsUpdate = null;

  /**
   * Генерация session ID
   */
  function generateSessionId() {
    return 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 8);
  }

  /**
   * Инициализация новой игровой сессии
   */
  async function startNewGame() {
    state.currentRound = 0;
    state.correctCount = 0;
    state.streak = 0;
    state.maxStreak = 0;
    state.coinsEarned = 0;

    if (!state.sessionId) {
      state.sessionId = localStorage.getItem('thumbnailGameSessionId');
      if (!state.sessionId) {
        state.sessionId = generateSessionId();
        localStorage.setItem('thumbnailGameSessionId', state.sessionId);
      }
    }

    // Загружаем или создаём сессию на сервере
    state.secondChanceUsed = false;

    try {
      const session = await API.getSession(state.sessionId);
      state.totalCoins = session.coins || 0;
      state.level = session.level || 1;
      state.powerUps.hintCount = session.hintCount || 0;
      state.powerUps.slowCount = session.slowCount || 0;
      state.powerUps.secondChanceCount = session.secondChanceCount || 0;
      state.powerUps.streakShieldCount = session.streakShieldCount || 0;
      if (onStatsUpdate) onStatsUpdate(getStats());
      if (onPowerUpsUpdate) onPowerUpsUpdate({ ...state.powerUps });
    } catch (err) {
      console.warn('Could not load session from server, using local state');
    }

    await loadNextRound();
  }

  /**
   * Загрузить следующий раунд
   */
  async function loadNextRound() {
    state.currentRound++;
    state.answered = false;

    if (state.currentRound > ROUNDS_PER_SESSION) {
      if (onGameOver) onGameOver(getGameResults());
      return;
    }

    try {
      const roundData = await API.getRound(state.currentRound, state.sessionId);
      state.roundData = roundData;

      if (onRoundReady) onRoundReady(roundData, state.currentRound);

      // Отправляем impression (не ждём ответа)
      const campaignThumbIds = (roundData.options || [])
        .filter(o => o.campaignThumbnailId)
        .map(o => o.campaignThumbnailId);
      const thumbIds = (roundData.options || [])
        .filter(o => o.thumbnailId && !o.campaignThumbnailId)
        .map(o => o.thumbnailId);

      API.sendImpression({
        sessionId: state.sessionId,
        campaignThumbnailIds: campaignThumbIds.length > 0 ? campaignThumbIds : undefined,
        thumbnailIds: thumbIds.length > 0 ? thumbIds : undefined,
        roundType: roundData.roundType || 'guess',
      }).catch(() => {});

      startTimer();
    } catch (err) {
      console.error('Failed to load round:', err);
      // Retry after delay
      setTimeout(loadNextRound, 2000);
    }
  }

  /**
   * Запустить таймер раунда
   */
  function startTimer() {
    stopTimer();
    state.timerStart = Date.now();

    state.timerInterval = setInterval(() => {
      const elapsed = Date.now() - state.timerStart;
      const remaining = Math.max(0, TIMER_DURATION - elapsed);
      state.timerRemaining = remaining;
      const fraction = remaining / TIMER_DURATION;

      if (onTimerTick) onTimerTick(fraction, remaining);

      if (remaining <= 0) {
        stopTimer();
        // Время вышло — считаем как неправильный ответ
        if (!state.answered) {
          handleAnswer(null);
        }
      }
    }, 50);
  }

  /**
   * Остановить таймер
   */
  function stopTimer() {
    if (state.timerInterval) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
    }
  }

  /**
   * Обработать ответ игрока
   * @param {number|null} chosenId — id выбранного тамбнейла (thumbnailId или campaignThumbnailId), null = время вышло
   */
  async function handleAnswer(chosenId) {
    if (state.answered) return;
    state.answered = true;
    stopTimer();

    const responseTime = Date.now() - state.timerStart;
    const roundData = state.roundData;
    const isCampaignRound = roundData.roundType === 'campaign_pick';

    // Определяем правильность
    const correctOption = roundData.options.find(o => o.isCorrect);
    const chosenThumbnailId = isCampaignRound ? null : chosenId;
    const chosenCampaignThumbId = isCampaignRound ? chosenId : null;

    // Для campaign_pick нет правильного ответа — любой выбор = +монеты
    const isCorrect = isCampaignRound
      ? (chosenId !== null)
      : (chosenThumbnailId !== null && correctOption && chosenThumbnailId === correctOption.thumbnailId);

    // Предлагаем второй шанс (только для guess, при ошибке, если не было timeout)
    if (!isCorrect && !isCampaignRound && chosenId !== null &&
        state.powerUps.secondChanceCount > 0 && !state.secondChanceUsed) {
      state.answered = false; // позволяем ответить снова
      state.secondChancePending = true;
      stopTimer();
      if (onSecondChanceOffered) onSecondChanceOffered();
      return;
    }

    // Определяем использование щита стрика
    const shieldUsed = !isCorrect && !isCampaignRound && chosenId !== null &&
      state.powerUps.streakShieldCount > 0;

    // Подсчёт монет
    let coins = BASE_COINS;
    if (isCorrect) {
      coins = CORRECT_COINS;
      // Бонус за скорость: чем быстрее, тем больше
      const timeFraction = 1 - (responseTime / TIMER_DURATION);
      coins += Math.round(TIME_BONUS_MAX * timeFraction);

      state.streak++;
      if (state.streak > state.maxStreak) {
        state.maxStreak = state.streak;
      }

      // Streak бонус
      if (state.streak >= 3) {
        coins += Math.min(state.streak * STREAK_MULTIPLIER, 50);
      }

      state.correctCount++;
    } else {
      if (!shieldUsed) {
        state.streak = 0;
      } else {
        // Щит защищает стрик, но уменьшаем счётчик локально
        state.powerUps.streakShieldCount = Math.max(0, state.powerUps.streakShieldCount - 1);
        if (onPowerUpsUpdate) onPowerUpsUpdate({ ...state.powerUps });
      }
      coins = chosenThumbnailId === null ? 0 : BASE_COINS; // 0 за timeout
    }

    state.coinsEarned += coins;
    state.totalCoins += coins;

    // Для campaign_pick ждём ответа — нужны данные популярности
    // Для guess — fire-and-forget чтобы не тормозить UI
    let popularityPercent = null;
    let isPopular = null;
    let isFirst = false;

    const campaignThumbIds = isCampaignRound
      ? (roundData.options || []).map(o => o.campaignThumbnailId).filter(Boolean)
      : undefined;

    const votePayload = {
      sessionId: state.sessionId,
      roundType: isCampaignRound ? 'campaign_pick' : 'guess',
      questionGameId: roundData.correctGameId || null,
      campaignId: roundData.campaignId || null,
      chosenThumbnailId: chosenThumbnailId,
      chosenCampaignThumbId: chosenCampaignThumbId,
      correctThumbnailId: correctOption ? correctOption.thumbnailId : null,
      correctCampaignThumbId: null,
      isCorrect,
      responseTimeMs: responseTime,
      campaignThumbIds,
      shieldUsed: shieldUsed || false,
    };

    if (isCampaignRound) {
      try {
        const voteResp = await API.sendVote(votePayload);
        if (voteResp.popularityPercent !== undefined) {
          popularityPercent = voteResp.popularityPercent;
          isPopular = voteResp.isPopular;
          isFirst = voteResp.isFirst || false;
          // Обновляем монеты из ответа сервера
          coins = voteResp.coinsEarned || coins;
        }
      } catch (err) {
        console.warn('Vote send failed:', err);
      }
    } else {
      API.sendVote(votePayload).catch(err => console.warn('Vote send failed:', err));
    }

    // UI callback
    const result = {
      isCorrect,
      isCampaignRound,
      correctThumbnailId: correctOption ? correctOption.thumbnailId : null,
      chosenThumbnailId: chosenId,
      coinsEarned: coins,
      streak: state.streak,
      gameName: roundData.gameName,
      timeout: chosenId === null,
      popularityPercent,
      isPopular,
      isFirst,
    };

    if (onRoundResult) onRoundResult(result);
    if (onStatsUpdate) onStatsUpdate(getStats());

    // Переход к следующему раунду
    nextRoundTimer = setTimeout(() => loadNextRound(), NEXT_ROUND_DELAY);
  }

  /**
   * Получить текущую статистику
   */
  function getStats() {
    return {
      round: state.currentRound,
      totalRounds: ROUNDS_PER_SESSION,
      correctCount: state.correctCount,
      streak: state.streak,
      maxStreak: state.maxStreak,
      coinsEarned: state.coinsEarned,
      totalCoins: state.totalCoins,
      level: state.level,
    };
  }

  /**
   * Результаты игры
   */
  function getGameResults() {
    return {
      correctCount: state.correctCount,
      totalRounds: ROUNDS_PER_SESSION,
      coinsEarned: state.coinsEarned,
      maxStreak: state.maxStreak,
      level: state.level,
      totalCoins: state.totalCoins,
    };
  }

  /**
   * Удвоить монеты за просмотр рекламы
   */
  function doubleCoins() {
    const bonus = state.coinsEarned;
    state.coinsEarned += bonus;
    state.totalCoins += bonus;
    if (onStatsUpdate) onStatsUpdate(getStats());
    return bonus;
  }

  /**
   * Купить улучшение в магазине
   */
  async function buyShopItem(item) {
    const resp = await API.buyShopItem(state.sessionId, item);
    state.totalCoins = resp.session.coins;
    state.powerUps.hintCount = resp.session.hintCount;
    state.powerUps.slowCount = resp.session.slowCount;
    state.powerUps.secondChanceCount = resp.session.secondChanceCount;
    state.powerUps.streakShieldCount = resp.session.streakShieldCount;
    if (onStatsUpdate) onStatsUpdate(getStats());
    if (onPowerUpsUpdate) onPowerUpsUpdate({ ...state.powerUps });
    return resp;
  }

  /**
   * Использовать подсказку — убирает один неверный вариант
   */
  async function useHint() {
    if (state.powerUps.hintCount <= 0 || !state.roundData) return;
    const wrongOptions = (state.roundData.options || []).filter(o => !o.isCorrect);
    if (wrongOptions.length === 0) return;

    const target = wrongOptions[Math.floor(Math.random() * wrongOptions.length)];
    const wrongId = target.thumbnailId || target.campaignThumbnailId;

    state.powerUps.hintCount--;
    if (onPowerUpsUpdate) onPowerUpsUpdate({ ...state.powerUps });
    if (onHintReady) onHintReady(wrongId);

    API.useShopItem(state.sessionId, 'hint').catch(() => {
      state.powerUps.hintCount++;
      if (onPowerUpsUpdate) onPowerUpsUpdate({ ...state.powerUps });
    });
  }

  /**
   * Использовать замедление — +5 секунд к таймеру
   */
  async function useSlow() {
    if (state.powerUps.slowCount <= 0 || state.answered) return;
    const ADD_MS = 5000;

    state.powerUps.slowCount--;
    if (onPowerUpsUpdate) onPowerUpsUpdate({ ...state.powerUps });

    // Сдвигаем timerStart назад чтобы добавить время
    state.timerStart -= ADD_MS;

    API.useShopItem(state.sessionId, 'slow').catch(() => {
      state.powerUps.slowCount++;
      state.timerStart += ADD_MS;
      if (onPowerUpsUpdate) onPowerUpsUpdate({ ...state.powerUps });
    });
  }

  /**
   * Принять предложение второго шанса
   */
  async function acceptSecondChance() {
    if (!state.secondChancePending) return;
    state.secondChancePending = false;
    state.secondChanceUsed = true;
    state.powerUps.secondChanceCount--;
    if (onPowerUpsUpdate) onPowerUpsUpdate({ ...state.powerUps });

    // Возобновляем таймер с половиной оставшегося времени
    const halfRemaining = Math.max(state.timerRemaining / 2, 3000);
    state.timerStart = Date.now() - (TIMER_DURATION - halfRemaining);
    startTimer();

    API.useShopItem(state.sessionId, 'second_chance').catch(() => {
      state.powerUps.secondChanceCount++;
      if (onPowerUpsUpdate) onPowerUpsUpdate({ ...state.powerUps });
    });
  }

  /**
   * Пропустить второй шанс
   */
  function skipSecondChance() {
    if (!state.secondChancePending) return;
    state.secondChancePending = false;
    state.answered = true;

    const roundData = state.roundData;
    const correctOption = roundData.options.find(o => o.isCorrect);
    state.streak = 0;
    const coins = BASE_COINS;
    state.coinsEarned += coins;
    state.totalCoins += coins;

    const result = {
      isCorrect: false,
      isCampaignRound: false,
      correctThumbnailId: correctOption ? correctOption.thumbnailId : null,
      chosenThumbnailId: null,
      coinsEarned: coins,
      streak: state.streak,
      gameName: roundData.gameName,
      timeout: false,
      popularityPercent: null,
      isPopular: null,
      isFirst: false,
    };

    if (onRoundResult) onRoundResult(result);
    if (onStatsUpdate) onStatsUpdate(getStats());
    nextRoundTimer = setTimeout(() => loadNextRound(), NEXT_ROUND_DELAY);
  }

  // Публичный API
  function cancelAutoAdvance() {
    if (nextRoundTimer !== null) {
      clearTimeout(nextRoundTimer);
      nextRoundTimer = null;
    }
  }

  function proceedToNextRound() {
    cancelAutoAdvance();
    loadNextRound();
  }

  return {
    startNewGame,
    handleAnswer,
    doubleCoins,
    buyShopItem,
    useHint,
    useSlow,
    acceptSecondChance,
    skipSecondChance,
    getStats,
    getGameResults,
    cancelAutoAdvance,
    proceedToNextRound,

    get sessionId() { return state.sessionId; },
    get currentRound() { return state.currentRound; },
    get powerUps() { return { ...state.powerUps }; },

    // Регистрация callback'ов
    set onRoundReady(fn) { onRoundReady = fn; },
    set onRoundResult(fn) { onRoundResult = fn; },
    set onGameOver(fn) { onGameOver = fn; },
    set onStatsUpdate(fn) { onStatsUpdate = fn; },
    set onTimerTick(fn) { onTimerTick = fn; },
    set onHintReady(fn) { onHintReady = fn; },
    set onSecondChanceOffered(fn) { onSecondChanceOffered = fn; },
    set onPowerUpsUpdate(fn) { onPowerUpsUpdate = fn; },

    ROUNDS_PER_SESSION,
  };
})();
