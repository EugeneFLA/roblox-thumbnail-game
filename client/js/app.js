/**
 * Главный модуль приложения — связывает UI, игровую логику и Yandex SDK
 */
(function () {
  'use strict';

  // ========== DOM ELEMENTS ==========
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const screens = {
    loading: $('#screen-loading'),
    menu: $('#screen-menu'),
    game: $('#screen-game'),
    results: $('#screen-results'),
    leaderboard: $('#screen-leaderboard'),
    shop: $('#screen-shop'),
    howto: $('#screen-howto'),
  };

  const els = {
    loadingBar: $('#loading-bar'),
    loadingText: $('#loading-text'),
    // Menu
    menuScore: $('#menu-score'),
    menuCoins: $('#menu-coins'),
    menuLevel: $('#menu-level'),
    btnPlay: $('#btn-play'),
    btnShop: $('#btn-shop'),
    btnLeaderboard: $('#btn-leaderboard'),
    btnHowToPlay: $('#btn-how-to-play'),
    // Game
    hudRound: $('#hud-round'),
    hudStreak: $('#hud-streak'),
    hudCoins: $('#hud-coins'),
    streakContainer: $('#streak-container'),
    timerBar: $('#timer-bar'),
    hudPowerups: $('#hud-powerups'),
    descriptionText: $('#description-text'),
    optionsGrid: $('#options-grid'),
    roundResult: $('#round-result'),
    resultIcon: $('#result-icon'),
    resultText: $('#result-text'),
    resultCoins: $('#result-coins'),
    resultGameName: $('#result-game-name'),
    // Results
    resultsCorrect: $('#results-correct'),
    resultsTotal: $('#results-total'),
    resultsCoinsEarned: $('#results-coins-earned'),
    resultsMaxStreak: $('#results-max-streak'),
    resultsLevel: $('#results-level'),
    btnPlayAgain: $('#btn-play-again'),
    btnWatchAd: $('#btn-watch-ad'),
    btnBackMenu: $('#btn-back-menu'),
    // Leaderboard
    leaderboardList: $('#leaderboard-list'),
    btnLbBack: $('#btn-lb-back'),
    // Shop
    shopGrid: $('#shop-grid'),
    shopCoinsDisplay: $('#shop-coins-display'),
    btnShopBack: $('#btn-shop-back'),
    btnShopRound: $('#btn-shop-round'),
    btnShopResults: $('#btn-shop-results'),
    // Howto
    btnHowtoBack: $('#btn-howto-back'),
  };

  // ========== YANDEX SDK ==========
  let ysdk = null;
  let yandexPlayer = null;

  async function initYandexSDK() {
    try {
      updateLoading(20, 'Подключение к Яндекс...');
      ysdk = await YaGames.init();
      console.log('Yandex SDK initialized');

      updateLoading(40, 'Получение данных игрока...');

      // Сообщаем о готовности
      if (ysdk.features && ysdk.features.LoadingAPI) {
        ysdk.features.LoadingAPI.ready();
      }

      // Получаем игрока
      try {
        yandexPlayer = await ysdk.getPlayer({ signed: false });
        console.log('Player loaded, id:', yandexPlayer.getUniqueID());
      } catch (e) {
        console.warn('Player not authorized');
      }

      return true;
    } catch (err) {
      console.warn('Yandex SDK not available (running outside Yandex Games?):', err.message);
      return false;
    }
  }

  /**
   * Показать fullscreen рекламу (между играми)
   */
  function showInterstitialAd() {
    if (!ysdk) return Promise.resolve();

    return new Promise((resolve) => {
      ysdk.adv.showFullscreenAdv({
        callbacks: {
          onOpen: () => {
            console.log('Interstitial ad opened');
            if (ysdk.features && ysdk.features.GameplayAPI) {
              ysdk.features.GameplayAPI.stop();
            }
          },
          onClose: (wasShown) => {
            console.log('Interstitial ad closed, wasShown:', wasShown);
            if (ysdk.features && ysdk.features.GameplayAPI) {
              ysdk.features.GameplayAPI.start();
            }
            resolve(wasShown);
          },
          onError: (error) => {
            console.warn('Interstitial ad error:', error);
            resolve(false);
          },
        },
      });
    });
  }

  /**
   * Показать rewarded video (за удвоение монет)
   */
  function showRewardedAd() {
    if (!ysdk) return Promise.resolve(true); // Без SDK считаем как просмотренное

    return new Promise((resolve) => {
      ysdk.adv.showRewardedVideo({
        callbacks: {
          onOpen: () => {
            console.log('Rewarded video opened');
          },
          onRewarded: () => {
            console.log('Rewarded!');
            resolve(true);
          },
          onClose: () => {
            console.log('Rewarded video closed');
          },
          onError: (error) => {
            console.warn('Rewarded video error:', error);
            resolve(false);
          },
        },
      });
    });
  }

  // ========== SCREEN MANAGEMENT ==========
  function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    if (screens[name]) {
      screens[name].classList.add('active');
    }
  }

  function updateLoading(percent, text) {
    els.loadingBar.style.width = percent + '%';
    if (text) els.loadingText.textContent = text;
  }

  // ========== MENU ==========
  function updateMenuStats() {
    const stats = Game.getStats();
    els.menuScore.textContent = stats.totalCoins;
    els.menuCoins.textContent = stats.totalCoins;
    els.menuLevel.textContent = stats.level;
  }

  // ========== GAME UI ==========

  /**
   * Предзагрузить изображения
   */
  function preloadImages(urls) {
    return Promise.all(
      urls.map(url => new Promise((resolve) => {
        const img = new Image();
        img.onload = resolve;
        img.onerror = resolve; // не блокируем при ошибке
        img.src = url;
      }))
    );
  }

  /**
   * Отрисовать раунд
   */
  async function renderRound(roundData, roundNumber) {
    // Скрываем результат предыдущего раунда
    els.roundResult.classList.remove('visible');

    // HUD
    els.hudRound.textContent = roundNumber;
    els.hudCoins.textContent = Game.getStats().coinsEarned;

    const isCampaign = roundData.roundType === 'campaign_pick';

    // Обновляем HUD улучшений
    renderPowerUpHUD(Game.powerUps);

    // Предзагружаем изображения
    await preloadImages((roundData.options || []).map(o => o.imageUrl));

    if (isCampaign) {
      renderCampaignPickRound(roundData);
    } else {
      renderGuessRound(roundData);
    }

    // Таймер
    els.timerBar.style.width = '100%';
    els.timerBar.classList.remove('warning');
  }

  /**
   * Отрисовать guess-раунд: описание + 4 карточки
   */
  function renderGuessRound(roundData) {
    // Скрываем баннер названия игры от campaign_pick раундов
    const prevBanner = document.querySelector('.campaign-game-name');
    if (prevBanner) prevBanner.style.display = 'none';

    // Показываем карточку описания
    const descCard = document.querySelector('.description-card');
    if (descCard) descCard.style.display = '';

    const labelEl = document.querySelector('.description-label');
    if (labelEl) labelEl.textContent = 'Какой тамбнейл подходит к игре?';

    // Показываем название + описание игры
    let desc = roundData.description || '';
    if (desc.length > 250) desc = desc.substring(0, 250) + '...';
    const gameName = roundData.gameName || '';
    els.descriptionText.textContent = gameName ? gameName + ' — ' + desc : desc;

    const options = [...roundData.options].sort(() => Math.random() - 0.5);

    els.optionsGrid.className = 'options-grid';
    els.optionsGrid.innerHTML = '';
    options.forEach((opt) => {
      const optId = opt.thumbnailId;
      const card = document.createElement('div');
      card.className = 'option-card';
      card.dataset.thumbnailId = optId;
      card.innerHTML = `
        <img src="${opt.imageUrl}" alt="Game thumbnail" loading="eager">
        <div class="option-overlay"><span class="check-icon"></span></div>
      `;
      card.addEventListener('click', () => {
        if (card.classList.contains('disabled')) return;
        Game.handleAnswer(optId);
      });
      els.optionsGrid.appendChild(card);
    });
  }

  /**
   * Отрисовать campaign_pick раунд: название игры + 2 карточки с VS
   */
  function renderCampaignPickRound(roundData) {
    // Скрываем обычное описание, показываем название игры
    const descCard = document.querySelector('.description-card');
    if (descCard) descCard.style.display = 'none';

    const labelEl = document.querySelector('.description-label');
    if (labelEl) labelEl.textContent = 'Какая картинка лучше подходит к игре?';

    // Берём первые 2 опции (не перемешиваем — порядок от сервера)
    const options = (roundData.options || []).slice(0, 2);

    els.optionsGrid.className = 'options-grid options-grid--vs';
    els.optionsGrid.innerHTML = '';

    options.forEach((opt, index) => {
      const optId = opt.campaignThumbnailId || opt.thumbnailId;

      const card = document.createElement('div');
      card.className = 'option-card campaign-card';
      card.dataset.thumbnailId = optId;
      card.innerHTML = `
        <img src="${opt.imageUrl}" alt="Game thumbnail" loading="eager">
        <div class="option-overlay"><span class="check-icon"></span></div>
      `;
      card.addEventListener('click', () => {
        if (card.classList.contains('disabled')) return;
        Game.handleAnswer(optId);
      });
      els.optionsGrid.appendChild(card);

      // VS разделитель между карточками
      if (index === 0 && options.length > 1) {
        const vs = document.createElement('div');
        vs.className = 'vs-divider';
        vs.textContent = 'VS';
        els.optionsGrid.appendChild(vs);
      }
    });

    // Показываем название игры над сеткой
    let gameNameBanner = document.querySelector('.campaign-game-name');
    if (!gameNameBanner) {
      gameNameBanner = document.createElement('div');
      gameNameBanner.className = 'campaign-game-name';
      els.optionsGrid.parentNode.insertBefore(gameNameBanner, els.optionsGrid);
    }
    gameNameBanner.textContent = roundData.gameName || 'Выбери лучший тамбнейл';
    gameNameBanner.style.display = '';
  }

  /**
   * Показать результат раунда
   */
  function showRoundResult(result) {
    const cards = els.optionsGrid.querySelectorAll('.option-card');

    cards.forEach(card => {
      card.classList.add('disabled');
      const thumbId = parseInt(card.dataset.thumbnailId);

      if (result.isCampaignRound) {
        // В раунде кампании — подсвечиваем выбранный зелёным (любой выбор хорош)
        if (thumbId === result.chosenThumbnailId) {
          card.classList.add('correct');
          card.querySelector('.check-icon').textContent = '\u2705';
        }
      } else {
        // Обычный guess-раунд
        if (thumbId === result.correctThumbnailId) {
          card.classList.add('correct');
          card.querySelector('.check-icon').textContent = '\u2705';
        } else if (thumbId === result.chosenThumbnailId && !result.isCorrect) {
          card.classList.add('wrong');
          card.querySelector('.check-icon').textContent = '\u274C';
        }
      }
    });

    // Показываем оверлей
    if (result.timeout) {
      els.resultIcon.textContent = '\u23F0';
      els.resultText.textContent = 'Время вышло!';
      els.resultText.style.color = 'var(--accent)';
      els.resultGameName.textContent = result.gameName || '';
    } else if (result.isCampaignRound) {
      if (result.isFirst) {
        els.resultIcon.textContent = '\u{1F31F}';
        els.resultText.textContent = 'Ты первый! +30 монет';
        els.resultText.style.color = 'var(--accent-gold)';
        els.resultGameName.textContent = 'Твой голос открыл статистику!';
      } else if (result.isPopular) {
        els.resultIcon.textContent = '\u{1F44D}';
        els.resultText.textContent = `Ты с большинством! +30 монет`;
        els.resultText.style.color = 'var(--accent-green)';
        els.resultGameName.textContent = `${result.popularityPercent}% игроков выбрали то же`;
      } else {
        els.resultIcon.textContent = '\u{1F3A8}';
        els.resultText.textContent = `У тебя особый вкус! +15 монет`;
        els.resultText.style.color = 'var(--accent-gold)';
        els.resultGameName.textContent = `${result.popularityPercent}% игроков выбрали это`;
      }
    } else if (result.isCorrect) {
      els.resultIcon.textContent = '\u{1F389}';
      els.resultText.textContent = 'Правильно!';
      els.resultText.style.color = 'var(--accent-green)';
      els.resultGameName.textContent = result.gameName || '';
    } else {
      els.resultIcon.textContent = '\u{1F614}';
      els.resultText.textContent = 'Неправильно';
      els.resultText.style.color = 'var(--accent)';
      els.resultGameName.textContent = result.gameName || '';
    }

    els.resultCoins.textContent = result.coinsEarned > 0
      ? `+${result.coinsEarned} монет`
      : '';

    els.roundResult.classList.add('visible');

    // Streak UI
    updateStreakUI(result.streak);

    // Coin popup animation
    if (result.coinsEarned > 0) {
      showCoinPopup(result.coinsEarned);
    }
  }

  /**
   * Обновить streak UI
   */
  function updateStreakUI(streak) {
    if (streak >= 2) {
      els.streakContainer.classList.add('visible');
      els.hudStreak.textContent = streak;
    } else {
      els.streakContainer.classList.remove('visible');
    }
  }

  /**
   * Анимация получения монет
   */
  function showCoinPopup(amount) {
    const popup = document.createElement('div');
    popup.className = 'coin-popup';
    popup.textContent = `+${amount}`;
    popup.style.left = '50%';
    popup.style.top = '50%';
    popup.style.transform = 'translateX(-50%)';
    document.body.appendChild(popup);

    setTimeout(() => popup.remove(), 1000);
  }

  /**
   * Обновить HUD-статистику
   */
  function updateGameHUD(stats) {
    els.hudCoins.textContent = stats.coinsEarned;
  }

  /**
   * Таймер визуализация
   */
  function updateTimer(fraction, remaining) {
    els.timerBar.style.width = (fraction * 100) + '%';

    if (fraction < 0.3) {
      els.timerBar.classList.add('warning');
    } else {
      els.timerBar.classList.remove('warning');
    }
  }

  // ========== SHOP ==========
  const SHOP_ITEMS_CONFIG = [
    { id: 'hint',          icon: '\uD83D\uDCA1', name: 'Подсказка',    cost: 100, desc: 'Убирает один неверный вариант' },
    { id: 'slow',          icon: '\u23F3',       name: 'Замедление',   cost: 200, desc: '+5 секунд к таймеру' },
    { id: 'second_chance', icon: '\uD83D\uDD04', name: 'Второй шанс',  cost: 300, desc: 'Позволяет ответить ещё раз' },
    { id: 'streak_shield', icon: '\uD83D\uDEE1\uFE0F', name: 'Щит стрика', cost: 500, desc: 'Защищает серию от ошибки' },
  ];

  function renderShop() {
    const stats = Game.getStats();
    const coins = stats.totalCoins;
    const powerUps = Game.powerUps;
    const owned = {
      hint: powerUps.hintCount,
      slow: powerUps.slowCount,
      second_chance: powerUps.secondChanceCount,
      streak_shield: powerUps.streakShieldCount,
    };

    els.shopCoinsDisplay.textContent = `\uD83E\uFA99 ${coins} монет`;
    els.shopGrid.innerHTML = '';

    SHOP_ITEMS_CONFIG.forEach(item => {
      const canAfford = coins >= item.cost;
      const div = document.createElement('div');
      div.className = 'shop-item';
      div.innerHTML = `
        <div class="shop-item-icon">${item.icon}</div>
        <div class="shop-item-name">${item.name}</div>
        <div class="shop-item-desc">${item.desc}</div>
        <div class="shop-item-cost">${item.cost} монет</div>
        <div class="shop-item-owned">Есть: ${owned[item.id]}</div>
        <button class="btn btn-primary btn-buy" ${canAfford ? '' : 'disabled'} data-item="${item.id}">
          Купить
        </button>
      `;
      div.querySelector('.btn-buy').addEventListener('click', async () => {
        try {
          await Game.buyShopItem(item.id);
          renderShop();
        } catch (err) {
          console.warn('Shop buy failed:', err.message);
        }
      });
      els.shopGrid.appendChild(div);
    });
  }

  // ========== HUD POWER-UPS ==========
  function renderPowerUpHUD(powerUps) {
    if (!els.hudPowerups) return;
    els.hudPowerups.innerHTML = '';

    const buttons = [
      {
        id: 'hint', icon: '💡', label: 'Подсказка',
        count: powerUps.hintCount,
        tip: 'Убрать один неверный вариант',
        fn: () => Game.useHint(),
      },
      {
        id: 'slow', icon: '⏳', label: '+5 сек',
        count: powerUps.slowCount,
        tip: 'Добавить 5 секунд к таймеру',
        fn: () => Game.useSlow(),
      },
      {
        id: 'second_chance', icon: '🔄', label: '2-й шанс',
        count: powerUps.secondChanceCount,
        tip: 'Авто: второй шанс при ошибке',
        fn: null,
        auto: true,
      },
      {
        id: 'streak_shield', icon: '🛡️', label: 'Щит',
        count: powerUps.streakShieldCount,
        tip: 'Авто: сохранить серию при ошибке',
        fn: null,
        auto: true,
      },
    ];

    buttons.forEach(b => {
      const btn = document.createElement('button');
      const isEmpty = b.count <= 0;
      btn.className = 'powerup-btn' + (isEmpty ? ' powerup-btn--empty' : '') + (b.auto ? ' powerup-btn--auto' : '');
      btn.title = b.tip + (isEmpty ? ' (нет зарядов — купи в магазине)' : ` (${b.count} шт.)`);
      btn.innerHTML = `<span class="pu-icon">${b.icon}</span><span class="pu-label">${b.label}</span><span class="pu-count">${b.count}</span>`;
      if (!isEmpty && b.fn) {
        btn.addEventListener('click', b.fn);
      } else {
        btn.disabled = isEmpty;
      }
      els.hudPowerups.appendChild(btn);
    });
  }

  // ========== SECOND CHANCE OVERLAY ==========
  function showSecondChanceOverlay() {
    const gameScreen = screens.game;
    const overlay = document.createElement('div');
    overlay.className = 'second-chance-overlay';
    overlay.id = 'second-chance-overlay';
    overlay.innerHTML = `
      <div class="result-icon">\uD83D\uDD04</div>
      <h3>Второй шанс?</h3>
      <p>Ответ неверный. Используй второй шанс и попробуй снова!</p>
      <div class="second-chance-buttons">
        <button class="btn btn-primary" id="btn-sc-accept">Попробовать!</button>
        <button class="btn btn-secondary" id="btn-sc-skip">Пропустить</button>
      </div>
    `;
    gameScreen.appendChild(overlay);

    // Авто-пропуск через 5 секунд
    const autoSkip = setTimeout(() => {
      removeOverlay();
      Game.skipSecondChance();
    }, 5000);

    function removeOverlay() {
      clearTimeout(autoSkip);
      overlay.remove();
    }

    overlay.querySelector('#btn-sc-accept').addEventListener('click', () => {
      removeOverlay();
      Game.acceptSecondChance();
    });
    overlay.querySelector('#btn-sc-skip').addEventListener('click', () => {
      removeOverlay();
      Game.skipSecondChance();
    });
  }

  // ========== RESULTS SCREEN ==========
  function showResults(results) {
    els.resultsCorrect.textContent = results.correctCount;
    els.resultsTotal.textContent = results.totalRounds;
    els.resultsCoinsEarned.textContent = results.coinsEarned;
    els.resultsMaxStreak.textContent = results.maxStreak;
    els.resultsLevel.textContent = results.level;

    showScreen('results');

    // Показываем рекламу между сессиями
    showInterstitialAd();
  }

  // ========== LEADERBOARD ==========
  async function loadLeaderboard() {
    els.leaderboardList.innerHTML = '<p style="text-align:center;color:var(--text-muted)">Загрузка...</p>';
    showScreen('leaderboard');

    try {
      const leaders = await API.getLeaderboard(50);

      if (leaders.length === 0) {
        els.leaderboardList.innerHTML =
          '<p style="text-align:center;color:var(--text-muted)">Пока нет результатов. Будь первым!</p>';
        return;
      }

      els.leaderboardList.innerHTML = leaders
        .map((p, i) => {
          let topClass = '';
          if (i === 0) topClass = 'top-1';
          else if (i === 1) topClass = 'top-2';
          else if (i === 2) topClass = 'top-3';

          const rankEmoji = i === 0 ? '\u{1F947}' : i === 1 ? '\u{1F948}' : i === 2 ? '\u{1F949}' : '';

          return `
            <div class="lb-row ${topClass}">
              <span class="lb-rank">${rankEmoji || (i + 1)}</span>
              <span class="lb-name">Игрок ${p.session_id.slice(-6)}</span>
              <span class="lb-score">${p.total_score}</span>
            </div>
          `;
        })
        .join('');
    } catch (err) {
      els.leaderboardList.innerHTML =
        '<p style="text-align:center;color:var(--text-muted)">Не удалось загрузить таблицу лидеров</p>';
    }
  }

  // ========== EVENT HANDLERS ==========
  function setupEventHandlers() {
    // Menu
    els.btnPlay.addEventListener('click', async () => {
      showScreen('game');

      // Yandex Gameplay start
      if (ysdk && ysdk.features && ysdk.features.GameplayAPI) {
        ysdk.features.GameplayAPI.start();
      }

      await Game.startNewGame();
    });

    let shopFromRound = false;

    els.btnShop.addEventListener('click', () => {
      shopFromRound = false;
      renderShop();
      showScreen('shop');
    });

    els.btnShopRound.addEventListener('click', () => {
      shopFromRound = true;
      Game.cancelAutoAdvance();
      renderShop();
      showScreen('shop');
    });

    els.btnShopBack.addEventListener('click', () => {
      if (shopFromRound) {
        shopFromRound = false;
        showScreen('game');
        Game.proceedToNextRound();
      } else {
        updateMenuStats();
        showScreen('menu');
      }
    });
    els.btnLeaderboard.addEventListener('click', () => loadLeaderboard());
    els.btnHowToPlay.addEventListener('click', () => showScreen('howto'));
    els.btnHowtoBack.addEventListener('click', () => showScreen('menu'));
    els.btnLbBack.addEventListener('click', () => showScreen('menu'));

    // Results
    els.btnPlayAgain.addEventListener('click', async () => {
      showScreen('game');
      if (ysdk && ysdk.features && ysdk.features.GameplayAPI) {
        ysdk.features.GameplayAPI.start();
      }
      await Game.startNewGame();
    });

    els.btnWatchAd.addEventListener('click', async () => {
      const rewarded = await showRewardedAd();
      if (rewarded) {
        const bonus = Game.doubleCoins();
        els.resultsCoinsEarned.textContent = Game.getGameResults().coinsEarned;
        els.btnWatchAd.disabled = true;
        els.btnWatchAd.textContent = 'Монеты удвоены!';
        els.btnWatchAd.style.opacity = '0.5';
        showCoinPopup(bonus);
      }
    });

    els.btnBackMenu.addEventListener('click', () => {
      updateMenuStats();
      showScreen('menu');
    });

    els.btnShopResults.addEventListener('click', () => {
      shopFromRound = false;
      renderShop();
      showScreen('shop');
    });
  }

  // ========== GAME CALLBACKS ==========
  function setupGameCallbacks() {
    Game.onRoundReady = (roundData, roundNumber) => {
      renderRound(roundData, roundNumber);
    };

    Game.onRoundResult = (result) => {
      showRoundResult(result);
    };

    Game.onGameOver = (results) => {
      // Yandex Gameplay stop
      if (ysdk && ysdk.features && ysdk.features.GameplayAPI) {
        ysdk.features.GameplayAPI.stop();
      }
      showResults(results);
    };

    Game.onStatsUpdate = (stats) => {
      updateGameHUD(stats);
    };

    Game.onTimerTick = (fraction, remaining) => {
      updateTimer(fraction, remaining);
    };

    Game.onHintReady = (wrongId) => {
      const cards = els.optionsGrid.querySelectorAll('.option-card');
      cards.forEach(card => {
        if (parseInt(card.dataset.thumbnailId) === wrongId) {
          card.classList.add('hint-removed');
        }
      });
    };

    Game.onSecondChanceOffered = () => {
      showSecondChanceOverlay();
    };

    Game.onPowerUpsUpdate = (powerUps) => {
      renderPowerUpHUD(powerUps);
    };
  }

  // ========== INITIALIZATION ==========
  async function init() {
    updateLoading(10, 'Инициализация...');

    // Setup event handlers
    setupEventHandlers();
    setupGameCallbacks();

    // Init Yandex SDK
    await initYandexSDK();

    updateLoading(60, 'Проверка сервера...');

    // Check backend health
    try {
      await API.getStats();
      updateLoading(80, 'Загрузка данных...');
    } catch (err) {
      console.warn('Backend not available, game may not work correctly');
      updateLoading(80, 'Сервер недоступен...');
    }

    updateLoading(100, 'Готово!');

    // Small delay for loading animation
    setTimeout(() => {
      updateMenuStats();
      showScreen('menu');
    }, 500);
  }

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
