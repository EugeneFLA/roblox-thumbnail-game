/**
 * Dashboard UI — логика панели разработчиков
 */
(function () {
  'use strict';

  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);

  // State
  let currentDeveloper = null;
  let currentCampaignId = null;

  // ========== HELPERS ==========
  function showPage(id) {
    $$('.page').forEach(p => p.classList.remove('active'));
    $(`#page-${id}`)?.classList.add('active');
  }

  function showSection(id) {
    $$('.section').forEach(s => s.classList.remove('active'));
    $(`#section-${id}`)?.classList.add('active');
    $$('.nav-link').forEach(l => l.classList.remove('active'));
    $$(`.nav-link[data-section="${id}"]`).forEach(l => l.classList.add('active'));
  }

  function formatNumber(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(n);
  }

  function statusBadge(status) {
    const map = { draft: 'badge-draft', active: 'badge-active', paused: 'badge-paused', completed: 'badge-completed', archived: 'badge-draft' };
    const labels = { draft: 'Черновик', active: 'Активна', paused: 'Пауза', completed: 'Завершена', archived: 'Архив' };
    return `<span class="badge ${map[status] || 'badge-draft'}">${labels[status] || status}</span>`;
  }

  function showError(elId, msg) {
    const el = $(`#${elId}`);
    if (el) { el.textContent = msg; setTimeout(() => el.textContent = '', 5000); }
  }

  // ========== AUTH ==========
  function setupAuth() {
    const allAuthForms = () => ['form-login','form-register','form-forgot','form-reset'].forEach(id => $('#'+id).classList.add('hidden'));

    // Toggle forms
    $('#show-register').addEventListener('click', e => { e.preventDefault(); allAuthForms(); $('#form-register').classList.remove('hidden'); });
    $('#show-login').addEventListener('click', e => { e.preventDefault(); allAuthForms(); $('#form-login').classList.remove('hidden'); });
    $('#show-forgot').addEventListener('click', e => { e.preventDefault(); allAuthForms(); $('#form-forgot').classList.remove('hidden'); });
    $('#show-reset-code').addEventListener('click', e => { e.preventDefault(); allAuthForms(); showResetForm(null); });
    $('#back-to-login-1').addEventListener('click', e => { e.preventDefault(); allAuthForms(); $('#form-login').classList.remove('hidden'); });
    $('#back-to-login-2').addEventListener('click', e => { e.preventDefault(); allAuthForms(); $('#form-login').classList.remove('hidden'); });

    // Login
    $('#form-login').addEventListener('submit', async e => {
      e.preventDefault();
      try {
        const result = await DevAPI.login($('#login-email').value, $('#login-password').value);
        currentDeveloper = result.developer;
        enterDashboard();
      } catch (err) {
        showError('login-error', err.message);
      }
    });

    // Register
    $('#form-register').addEventListener('submit', async e => {
      e.preventDefault();
      try {
        const result = await DevAPI.register({
          email: $('#reg-email').value,
          password: $('#reg-password').value,
          displayName: $('#reg-name').value,
          companyName: $('#reg-company').value || undefined,
          robloxUsername: $('#reg-roblox').value || undefined,
        });
        currentDeveloper = result.developer;
        enterDashboard();
      } catch (err) {
        showError('reg-error', err.message);
      }
    });

    // Forgot password
    $('#form-forgot').addEventListener('submit', async e => {
      e.preventDefault();
      $('#forgot-error').textContent = '';
      $('#forgot-success').textContent = '';
      try {
        const email = $('#forgot-email').value;
        await DevAPI.request('POST', '/auth/forgot-password', { email });
        $('#forgot-success').textContent = 'Письмо отправлено! Проверьте почту.';
        setTimeout(() => {
          allAuthForms();
          showResetForm(null, email);
        }, 2000);
      } catch (err) {
        $('#forgot-error').textContent = err.message;
      }
    });

    // Reset password
    $('#form-reset').addEventListener('submit', async e => {
      e.preventDefault();
      $('#reset-error').textContent = '';
      $('#reset-success').textContent = '';
      const token = $('#form-reset').dataset.resetToken || null;
      const code  = $('#reset-code').value;
      const email = $('#reset-email').value;
      const newPassword = $('#reset-new-password').value;
      try {
        await DevAPI.request('POST', '/auth/reset-password', { token, code: code || undefined, email: email || undefined, newPassword });
        $('#reset-success').textContent = 'Пароль изменён! Выполняется вход...';
        setTimeout(() => { allAuthForms(); $('#form-login').classList.remove('hidden'); }, 2000);
      } catch (err) {
        $('#reset-error').textContent = err.message;
      }
    });

    // Обработка ссылки сброса (?reset=TOKEN)
    const urlParams = new URLSearchParams(window.location.search);
    const resetToken = urlParams.get('reset');
    if (resetToken) {
      allAuthForms();
      showResetForm(resetToken);
      window.history.replaceState({}, '', '/dev');
    }

    // Logout
    $('#btn-logout').addEventListener('click', () => {
      DevAPI.logout();
      currentDeveloper = null;
      showPage('auth');
    });
  }

  function showResetForm(token, email) {
    const form = $('#form-reset');
    form.classList.remove('hidden');
    form.dataset.resetToken = token || '';
    $('#reset-error').textContent = '';
    $('#reset-success').textContent = '';
    if (token) {
      // По ссылке — скрываем поля email и код
      $('#reset-token-hint').style.display = 'block';
      $('#reset-token-hint').textContent = 'Ссылка для сброса подтверждена. Введите новый пароль.';
      $('#reset-email-group').style.display = 'none';
      $('#reset-code-group').style.display = 'none';
    } else {
      $('#reset-token-hint').style.display = 'none';
      $('#reset-email-group').style.display = 'block';
      $('#reset-code-group').style.display = 'block';
      if (email) $('#reset-email').value = email;
    }
  }

  // ========== DASHBOARD INIT ==========
  async function enterDashboard() {
    showPage('dashboard');
    $('#sidebar-user-name').textContent = currentDeveloper?.displayName || 'Developer';
    showSection('overview');
    loadOverview();
  }

  // ========== OVERVIEW ==========
  async function loadOverview() {
    try {
      const data = await DevAPI.getOverviewStats();

      $('#ov-campaigns').textContent = formatNumber(parseInt(data.overview.total_campaigns));
      $('#ov-thumbnails').textContent = formatNumber(parseInt(data.overview.total_thumbnails));
      $('#ov-impressions').textContent = formatNumber(parseInt(data.allTime.total_impressions));
      $('#ov-votes').textContent = formatNumber(parseInt(data.allTime.total_votes));

      // Top thumbnails
      const topEl = $('#top-thumbnails-list');
      if (data.topThumbnails.length === 0) {
        topEl.innerHTML = '<p class="text-muted">Данные появятся после начала тестирования</p>';
      } else {
        topEl.innerHTML = data.topThumbnails.map(t => `
          <div class="top-list-item">
            <img class="top-list-img" src="${t.file_url}" alt="${t.label}">
            <div class="top-list-info">
              <div class="top-list-label">${t.label || 'Без метки'}</div>
              <div class="top-list-game">${t.game_title} &middot; ${t.campaign_name}</div>
            </div>
            <div class="top-list-stat">
              <div class="top-list-stat-value">${t.ctr}%</div>
              <div class="top-list-stat-label">CTR</div>
            </div>
          </div>
        `).join('');
      }

      // Weekly chart
      renderWeeklyChart(data.weeklyTrend);
    } catch (err) {
      console.error('Overview load error:', err);
    }
  }

  function renderWeeklyChart(data) {
    const container = $('#weekly-chart');
    if (!data || data.length === 0) {
      container.innerHTML = '<p class="text-muted">Данные появятся после начала тестирования</p>';
      return;
    }
    const maxVal = Math.max(...data.map(d => Math.max(parseInt(d.impressions), parseInt(d.votes))), 1);
    container.innerHTML = `<div class="chart-bars">${data.map(d => {
      const impH = Math.max(2, (parseInt(d.impressions) / maxVal) * 100);
      const votH = Math.max(2, (parseInt(d.votes) / maxVal) * 100);
      const dateStr = new Date(d.date).toLocaleDateString('ru', { day: 'numeric', month: 'short' });
      return `<div class="chart-bar-group">
        <div class="chart-bar impressions" style="height:${impH}px" title="Показы: ${d.impressions}"></div>
        <div class="chart-bar votes" style="height:${votH}px" title="Голоса: ${d.votes}"></div>
        <div class="chart-bar-label">${dateStr}</div>
      </div>`;
    }).join('')}</div>
    <div style="display:flex;gap:16px;margin-top:8px;justify-content:center">
      <span class="text-muted"><span style="color:var(--accent-blue)">&block;</span> Показы</span>
      <span class="text-muted"><span style="color:var(--accent-green)">&block;</span> Голоса</span>
    </div>`;
  }

  // ========== ROBLOX GAMES DB ==========
  let rgState = { offset: 0, limit: 50, sort: 'ctr', total: 0 };

  async function loadRobloxGames() {
    const container = $('#rg-table-container');
    container.innerHTML = '<p class="text-muted">Загрузка...</p>';

    try {
      const data = await DevAPI.getRobloxGamesStats(rgState.limit, rgState.offset, rgState.sort);
      const s = data.summary;

      $('#rg-games').textContent = formatNumber(parseInt(s.total_games));
      $('#rg-thumbnails').textContent = formatNumber(parseInt(s.total_thumbnails));
      $('#rg-impressions').textContent = formatNumber(parseInt(s.total_impressions));
      $('#rg-clicks').textContent = formatNumber(parseInt(s.total_clicks));

      rgState.total = data.total;
      const totalCtr = s.total_impressions > 0
        ? (parseInt(s.total_clicks) / parseInt(s.total_impressions) * 100).toFixed(2)
        : '0.00';
      $('#rg-games-with-stats').textContent = `(${formatNumber(data.total)} с показами · общий CTR ${totalCtr}%)`;

      if (data.games.length === 0) {
        container.innerHTML = '<p class="text-muted">Нет данных — начните играть, чтобы накопить статистику</p>';
        $('#rg-pagination').style.display = 'none';
        return;
      }

      container.innerHTML = `<table class="data-table">
        <thead><tr>
          <th>Игра</th>
          <th>Тамбнейлов</th>
          <th>Показов</th>
          <th>Кликов</th>
          <th>CTR</th>
        </tr></thead>
        <tbody>${data.games.map(g => `
          <tr>
            <td>
              <div class="rg-game-cell">
                ${g.cover_url ? `<img class="thumb-mini" src="${g.cover_url}" alt="">` : '<div class="thumb-mini thumb-placeholder"></div>'}
                <div>
                  <div class="rg-game-name">${g.name}</div>
                  <div class="text-muted" style="font-size:11px">${formatNumber(parseInt(g.playing || 0))} онлайн · ${formatNumber(parseInt(g.visits || 0))} посещений</div>
                </div>
              </div>
            </td>
            <td>${g.thumb_count}</td>
            <td>${formatNumber(parseInt(g.total_impressions))}</td>
            <td>${formatNumber(parseInt(g.total_clicks))}</td>
            <td class="${parseFloat(g.ctr) >= 50 ? 'winner' : ''}">${g.ctr}%</td>
          </tr>`).join('')}
        </tbody>
      </table>`;

      // Пагинация
      const pageEl = $('#rg-pagination');
      const showing = rgState.offset + data.games.length;
      $('#rg-page-info').textContent = `${rgState.offset + 1}–${showing} из ${data.total}`;
      pageEl.style.display = data.total > rgState.limit ? '' : 'none';
      $('#rg-prev').disabled = rgState.offset === 0;
      $('#rg-next').disabled = showing >= data.total;

    } catch (err) {
      container.innerHTML = `<p class="text-muted">Ошибка: ${err.message}</p>`;
    }
  }

  function setupRobloxGames() {
    $('#rg-sort').addEventListener('change', function () {
      rgState.sort = this.value;
      rgState.offset = 0;
      loadRobloxGames();
    });
    $('#rg-prev').addEventListener('click', () => {
      rgState.offset = Math.max(0, rgState.offset - rgState.limit);
      loadRobloxGames();
    });
    $('#rg-next').addEventListener('click', () => {
      rgState.offset += rgState.limit;
      loadRobloxGames();
    });
  }

  // ========== CAMPAIGNS LIST ==========
  async function loadCampaigns() {
    const container = $('#campaigns-list');
    container.innerHTML = '<p class="text-muted">Загрузка...</p>';

    try {
      const data = await DevAPI.getCampaigns();
      if (data.campaigns.length === 0) {
        container.innerHTML = '<p class="text-muted">У вас пока нет кампаний. Создайте первую!</p>';
        return;
      }

      container.innerHTML = data.campaigns.map(c => `
        <div class="campaign-card" data-campaign-id="${c.id}">
          <div class="campaign-card-header">
            <span class="campaign-card-name">${c.name}</span>
            ${statusBadge(c.status)}
          </div>
          <div class="campaign-card-game">${c.game_title}</div>
          <div class="campaign-card-stats">
            <div class="campaign-card-stat">
              <div class="campaign-card-stat-value">${c.thumbnail_count || 0}</div>
              <div class="campaign-card-stat-label">Тамбнейлов</div>
            </div>
            <div class="campaign-card-stat">
              <div class="campaign-card-stat-value">${formatNumber(parseInt(c.total_impressions || 0))}</div>
              <div class="campaign-card-stat-label">Показов</div>
            </div>
            <div class="campaign-card-stat">
              <div class="campaign-card-stat-value">${formatNumber(parseInt(c.total_votes || 0))}</div>
              <div class="campaign-card-stat-label">Голосов</div>
            </div>
          </div>
        </div>
      `).join('');

      // Click handlers
      container.querySelectorAll('.campaign-card').forEach(card => {
        card.addEventListener('click', () => openCampaignDetail(parseInt(card.dataset.campaignId)));
      });
    } catch (err) {
      container.innerHTML = `<p class="text-muted">Ошибка загрузки: ${err.message}</p>`;
    }
  }

  // ========== CAMPAIGN DETAIL ==========
  async function openCampaignDetail(campaignId) {
    currentCampaignId = campaignId;
    showSection('campaign-detail');

    try {
      const [campData, statsData] = await Promise.all([
        DevAPI.getCampaign(campaignId),
        DevAPI.getCampaignStats(campaignId),
      ]);

      const c = campData.campaign;

      $('#detail-campaign-name').textContent = c.name;
      $('#detail-campaign-status').outerHTML = statusBadge(c.status);
      $('#detail-game-desc').textContent = c.game_description;

      // Stats
      $('#det-impressions').textContent = formatNumber(statsData.totalVotes > 0 ? parseInt(statsData.comparison.reduce((s, t) => s + parseInt(t.total_impressions), 0)) : 0);
      $('#det-votes').textContent = formatNumber(statsData.totalVotes);
      $('#det-players').textContent = formatNumber(statsData.uniquePlayers);
      $('#det-progress').textContent = statsData.progress + '%';

      // Buttons visibility
      $('#btn-activate-campaign').style.display = (c.status === 'draft' || c.status === 'paused') ? '' : 'none';
      $('#btn-pause-campaign').style.display = c.status === 'active' ? '' : 'none';

      // Thumbnails
      renderThumbnails(campData.thumbnails, campaignId);

      // Comparison table
      renderComparison(statsData.comparison);
    } catch (err) {
      console.error('Campaign detail error:', err);
    }
  }

  function renderThumbnails(thumbnails, campaignId) {
    const grid = $('#thumbnails-grid');
    if (!thumbnails || thumbnails.length === 0) {
      grid.innerHTML = '<p class="text-muted">Загрузите тамбнейлы для тестирования (минимум 2)</p>';
      return;
    }

    grid.innerHTML = thumbnails.map(t => `
      <div class="thumb-card" data-thumb-id="${t.id}">
        <div class="thumb-card-img-wrap">
          <img src="${t.file_url}" alt="${t.label || 'Thumbnail'}">
          <div class="thumb-card-img-overlay">
            <button class="btn-icon" data-expand-thumb="${t.file_url}" data-expand-label="${t.label || 'Thumbnail'}" title="Развернуть">⛶</button>
            <a class="btn-icon" href="${t.file_url}" download title="Скачать">⬇</a>
          </div>
        </div>
        <div class="thumb-card-info">
          <div class="thumb-card-label">${t.label || 'Без метки'}</div>
          <div class="thumb-card-stats">
            <span class="thumb-card-stat">Показы: <strong>${formatNumber(parseInt(t.total_impressions || 0))}</strong></span>
            <span class="thumb-card-stat">Голоса: <strong>${formatNumber(parseInt(t.total_votes || 0))}</strong></span>
            <span class="thumb-card-stat">CTR: <strong>${t.ctr || 0}%</strong></span>
          </div>
          <div class="thumb-card-actions">
            <label class="btn btn-small btn-outline upload-btn">
              Перезалить
              <input type="file" accept="image/*" hidden data-replace-thumb="${t.id}" data-campaign="${campaignId}">
            </label>
            <button class="btn btn-small btn-danger" data-delete-thumb="${t.id}" data-campaign="${campaignId}">Удалить</button>
          </div>
        </div>
      </div>
    `).join('');

    // Expand handlers
    grid.querySelectorAll('button[data-expand-thumb]').forEach(btn => {
      btn.addEventListener('click', () => openThumbModal(btn.dataset.expandThumb, btn.dataset.expandLabel));
    });

    // Replace handlers
    grid.querySelectorAll('input[data-replace-thumb]').forEach(input => {
      input.addEventListener('change', async () => {
        if (!input.files[0]) return;
        try {
          await DevAPI.replaceThumbnail(input.dataset.campaign, input.dataset.replaceThumb, input.files[0]);
          openCampaignDetail(parseInt(input.dataset.campaign));
        } catch (err) { alert('Ошибка: ' + err.message); }
      });
    });

    // Delete handlers
    grid.querySelectorAll('button[data-delete-thumb]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Удалить тамбнейл?')) return;
        try {
          await DevAPI.deleteThumbnail(btn.dataset.campaign, btn.dataset.deleteThumb);
          openCampaignDetail(parseInt(btn.dataset.campaign));
        } catch (err) { alert('Ошибка: ' + err.message); }
      });
    });
  }

  function renderComparison(comparison) {
    const body = $('#comparison-body');
    const card = $('#comparison-card');

    if (!comparison || comparison.length === 0) {
      card.style.display = 'none';
      return;
    }

    card.style.display = '';
    const maxCtr = Math.max(...comparison.map(c => parseFloat(c.ctr) || 0));

    body.innerHTML = comparison.map(t => {
      const isWinner = parseFloat(t.ctr) === maxCtr && maxCtr > 0;
      return `<tr>
        <td><img class="thumb-mini" src="${t.file_url}" alt=""></td>
        <td>${t.label || '-'}</td>
        <td>${formatNumber(parseInt(t.total_impressions))}</td>
        <td>${formatNumber(parseInt(t.total_votes))}</td>
        <td>${t.ctr}%</td>
        <td>${formatNumber(parseInt(t.total_wins))}</td>
        <td class="${isWinner ? 'winner' : ''}">${t.win_rate}%</td>
        <td>${Math.round(parseFloat(t.avg_response_time) || 0)} мс</td>
      </tr>`;
    }).join('');
  }

  // ========== CAMPAIGN FORM ==========
  function resetCampaignForm() {
    $('#campaign-edit-id').value = '';
    $('#camp-name').value = '';
    $('#camp-game-title').value = '';
    $('#camp-game-desc').value = '';
    $('#camp-universe-id').value = '';
    $('#camp-target-votes').value = '1000';
    $('#campaign-form-title').textContent = 'Новая кампания';
    $('#btn-save-campaign').textContent = 'Создать кампанию';
    $('#campaign-error').textContent = '';
  }

  async function openEditCampaign(campaignId) {
    try {
      const data = await DevAPI.getCampaign(campaignId);
      const c = data.campaign;
      $('#campaign-edit-id').value = c.id;
      $('#camp-name').value = c.name;
      $('#camp-game-title').value = c.game_title;
      $('#camp-game-desc').value = c.game_description;
      $('#camp-universe-id').value = c.roblox_universe_id || '';
      $('#camp-target-votes').value = c.target_votes;
      $('#campaign-form-title').textContent = 'Редактировать кампанию';
      $('#btn-save-campaign').textContent = 'Сохранить';
      showSection('new-campaign');
    } catch (err) {
      alert('Ошибка: ' + err.message);
    }
  }

  // ========== EVENT HANDLERS ==========
  function setupNavigation() {
    $$('.nav-link').forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        const section = link.dataset.section;
        showSection(section);
        if (section === 'overview') loadOverview();
        if (section === 'campaigns') loadCampaigns();
        if (section === 'campaigns') loadCampaigns();
        if (section === 'roblox-games') { rgState.offset = 0; loadRobloxGames(); }
        if (section === 'new-campaign') resetCampaignForm();
      });
    });

    $('#btn-new-campaign-top').addEventListener('click', () => { resetCampaignForm(); showSection('new-campaign'); });
    $('#btn-cancel-campaign').addEventListener('click', () => showSection('campaigns'));
    $('#btn-back-campaigns').addEventListener('click', () => { showSection('campaigns'); loadCampaigns(); });

    // Campaign form submit
    $('#form-campaign').addEventListener('submit', async e => {
      e.preventDefault();
      const editId = $('#campaign-edit-id').value;
      const data = {
        name: $('#camp-name').value,
        gameTitle: $('#camp-game-title').value,
        gameDescription: $('#camp-game-desc').value,
        robloxUniverseId: $('#camp-universe-id').value ? parseInt($('#camp-universe-id').value) : undefined,
        targetVotes: parseInt($('#camp-target-votes').value) || 1000,
      };

      try {
        if (editId) {
          await DevAPI.updateCampaign(editId, data);
          openCampaignDetail(parseInt(editId));
        } else {
          const result = await DevAPI.createCampaign(data);
          openCampaignDetail(result.campaign.id);
        }
      } catch (err) {
        showError('campaign-error', err.message);
      }
    });

    // Upload thumbnails
    $('#upload-thumbnails').addEventListener('change', async function () {
      if (!this.files.length || !currentCampaignId) return;
      try {
        await DevAPI.uploadThumbnails(currentCampaignId, this.files);
        this.value = '';
        openCampaignDetail(currentCampaignId);
      } catch (err) {
        alert('Ошибка загрузки: ' + err.message);
      }
    });

    // Campaign actions
    $('#btn-edit-campaign').addEventListener('click', () => { if (currentCampaignId) openEditCampaign(currentCampaignId); });

    $('#btn-activate-campaign').addEventListener('click', async () => {
      if (!currentCampaignId) return;
      try {
        await DevAPI.updateCampaign(currentCampaignId, { status: 'active' });
        openCampaignDetail(currentCampaignId);
      } catch (err) { alert(err.message); }
    });

    $('#btn-pause-campaign').addEventListener('click', async () => {
      if (!currentCampaignId) return;
      try {
        await DevAPI.updateCampaign(currentCampaignId, { status: 'paused' });
        openCampaignDetail(currentCampaignId);
      } catch (err) { alert(err.message); }
    });
  }

  // ========== AI GENERATION ==========
  function setupAiGenerate() {
    const promptEl   = $('#ai-prompt');
    const promptLen  = $('#ai-prompt-len');
    const ratioGroup = $('#ai-ratio-group');
    const countGroup = $('#ai-count-group');
    const btnGen     = $('#btn-ai-generate');
    const errEl      = $('#ai-error');
    const resultsGrid = $('#ai-results-grid');
    const btnClear   = $('#btn-ai-clear');

    // Счётчик символов
    promptEl.addEventListener('input', () => {
      promptLen.textContent = promptEl.value.length;
    });

    // Кнопки соотношения сторон — убираем дубль из HTML и делаем уникальные
    // Инициализируем: активный — 16:9
    let selectedRatio = '16:9';
    let selectedCount = 2;

    // Перестраиваем ratio кнопки программно (HTML содержит дубль)
    ratioGroup.innerHTML = ['16:9','1:1','4:3','3:4','9:16'].map(r =>
      `<button class="ratio-btn${r === selectedRatio ? ' active' : ''}" data-ratio="${r}">${r}</button>`
    ).join('');

    ratioGroup.addEventListener('click', e => {
      const btn = e.target.closest('.ratio-btn');
      if (!btn) return;
      selectedRatio = btn.dataset.ratio;
      ratioGroup.querySelectorAll('.ratio-btn').forEach(b => b.classList.toggle('active', b === btn));
    });

    countGroup.addEventListener('click', e => {
      const btn = e.target.closest('.count-btn');
      if (!btn) return;
      selectedCount = parseInt(btn.dataset.count);
      countGroup.querySelectorAll('.count-btn').forEach(b => b.classList.toggle('active', b === btn));
    });

    // Очистить результаты
    btnClear.addEventListener('click', () => {
      resultsGrid.innerHTML = `
        <div class="ai-placeholder">
          <div class="ai-placeholder-icon">🎨</div>
          <p>Здесь появятся сгенерированные тамбнейлы</p>
        </div>`;
      btnClear.style.display = 'none';
    });

    // Генерация
    btnGen.addEventListener('click', async () => {
      const prompt = promptEl.value.trim();
      const model  = $('#ai-model').value;

      errEl.textContent = '';
      if (!prompt) { errEl.textContent = 'Введите описание изображения'; return; }

      btnGen.disabled = true;
      $('#ai-btn-text').textContent = 'Запрос...';

      // Убираем плейсхолдер
      const placeholder = resultsGrid.querySelector('.ai-placeholder');
      if (placeholder) placeholder.remove();
      btnClear.style.display = 'inline-block';

      try {
        const data = await DevAPI.request('POST', '/ai/generate', {
          prompt, model,
          aspectRatio: selectedRatio,
          count: selectedCount,
        });

        // Для каждой задачи создаём карточку с прогрессом и запускаем поллинг
        for (const taskId of data.taskIds) {
          const card = createPendingCard(taskId);
          resultsGrid.prepend(card);
          pollTask(taskId, card, model);
        }
      } catch (err) {
        if (err.needsKey || err.message.includes('Meshy API ключ')) {
          errEl.innerHTML = `Meshy API ключ не настроен. <a href="#" class="link-to-settings">Перейти в Настройки →</a>`;
          errEl.querySelector('.link-to-settings').addEventListener('click', e => {
            e.preventDefault();
            showSection('settings');
          });
        } else {
          errEl.textContent = err.message;
        }
      } finally {
        btnGen.disabled = false;
        $('#ai-btn-text').textContent = 'Генерировать';
      }
    });

    function createPendingCard(taskId) {
      const card = document.createElement('div');
      card.className = 'ai-pending-card';
      card.dataset.taskId = taskId;
      card.innerHTML = `
        <div class="ai-pending-inner">
          <div class="ai-spinner"></div>
          <div class="ai-progress-bar-wrap">
            <div class="ai-progress-bar" style="width:0%"></div>
          </div>
          <div class="ai-progress-text">Генерация... 0%</div>
        </div>`;
      return card;
    }

    async function pollTask(taskId, card, model) {
      const INTERVAL = 3000;
      const MAX_POLLS = 120; // 6 минут максимум
      let polls = 0;

      const poll = async () => {
        if (polls++ > MAX_POLLS) {
          card.innerHTML = `<div class="ai-pending-inner"><p class="text-muted">Таймаут генерации</p></div>`;
          return;
        }

        try {
          const data = await DevAPI.request('GET', `/ai/status/${taskId}`);
          const { status, progress, imageUrls } = data;

          if (status === 'SUCCEEDED' && imageUrls.length > 0) {
            replaceWithResult(card, imageUrls[0], model);
          } else if (status === 'FAILED' || status === 'CANCELED') {
            card.innerHTML = `<div class="ai-pending-inner"><p style="color:var(--accent)">Ошибка генерации</p></div>`;
          } else {
            // Обновляем прогресс
            const bar = card.querySelector('.ai-progress-bar');
            const txt = card.querySelector('.ai-progress-text');
            if (bar) bar.style.width = `${progress}%`;
            if (txt) txt.textContent = `Генерация... ${progress}%`;
            setTimeout(poll, INTERVAL);
          }
        } catch (err) {
          setTimeout(poll, INTERVAL * 2);
        }
      };

      setTimeout(poll, INTERVAL);
    }

    function replaceWithResult(card, imageUrl, model) {
      card.className = 'ai-result-card';
      card.innerHTML = `
        <div class="ai-result-img-wrap">
          <img src="${imageUrl}" alt="AI thumbnail" loading="lazy">
          <div class="ai-result-overlay">
            <button class="btn btn-small btn-primary btn-expand-ai">Увеличить</button>
            <a class="btn btn-small btn-outline" href="${imageUrl}" download target="_blank">⬇ Скачать</a>
          </div>
        </div>
        <div class="ai-result-actions">
          <span class="ai-result-model">${model}</span>
          <a class="btn btn-small btn-outline" href="${imageUrl}" download target="_blank">⬇</a>
        </div>`;

      card.querySelector('.btn-expand-ai').addEventListener('click', () => {
        openThumbModal(imageUrl, model);
      });
    }
  }

  // ========== SETTINGS ==========
  function setupSettings() {
    const form       = $('#form-settings');
    const keyInput   = $('#settings-meshy-key');
    const btnToggle  = $('#btn-toggle-key');
    const btnRemove  = $('#btn-remove-key');
    const errEl      = $('#settings-error');
    const successEl  = $('#settings-success');
    const statusEl   = $('#settings-key-status');

    // Показать/скрыть ключ
    btnToggle.addEventListener('click', () => {
      keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
    });

    // Загрузить текущий статус ключа
    async function loadKeyStatus() {
      try {
        const data = await DevAPI.request('GET', '/auth/settings');
        if (data.hasMeshyKey) {
          statusEl.innerHTML = `<span class="key-status key-status-ok">✓ API ключ сохранён: <code>${data.meshyApiKeyMasked}</code></span>`;
          keyInput.placeholder = data.meshyApiKeyMasked;
        } else {
          statusEl.innerHTML = `<span class="key-status key-status-none">API ключ не настроен</span>`;
        }
      } catch (e) { /* ignore */ }
    }

    // Вызываем при переходе в настройки
    document.querySelector('.nav-link[data-section="settings"]')
      .addEventListener('click', loadKeyStatus);

    // Сохранить
    form.addEventListener('submit', async e => {
      e.preventDefault();
      errEl.textContent = '';
      successEl.textContent = '';
      const key = keyInput.value.trim();
      if (!key) { errEl.textContent = 'Введите API ключ'; return; }
      try {
        await DevAPI.request('PUT', '/auth/settings', { meshyApiKey: key });
        successEl.textContent = 'Ключ сохранён!';
        keyInput.value = '';
        loadKeyStatus();
        setTimeout(() => successEl.textContent = '', 3000);
      } catch (err) {
        errEl.textContent = err.message;
      }
    });

    // Удалить
    btnRemove.addEventListener('click', async () => {
      if (!confirm('Удалить Meshy API ключ?')) return;
      try {
        await DevAPI.request('PUT', '/auth/settings', { meshyApiKey: null });
        statusEl.innerHTML = `<span class="key-status key-status-none">API ключ не настроен</span>`;
        keyInput.placeholder = 'msy_••••••••••••••••••••••••••••••••';
        successEl.textContent = 'Ключ удалён';
        setTimeout(() => successEl.textContent = '', 3000);
      } catch (err) {
        errEl.textContent = err.message;
      }
    });
  }

  // ========== INIT ==========
  async function init() {
    setupAuth();
    setupNavigation();
    setupRobloxGames();
    setupAiGenerate();
    setupSettings();

    // Проверяем токен
    if (DevAPI.getToken()) {
      try {
        const data = await DevAPI.getMe();
        currentDeveloper = data.developer;
        enterDashboard();
      } catch (err) {
        DevAPI.clearToken();
        showPage('auth');
      }
    } else {
      showPage('auth');
    }
  }

  // ── Модальное окно просмотра тамбнейла ──────────────────────────────
  function openThumbModal(url, label) {
    let modal = document.getElementById('thumb-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'thumb-modal';
      modal.innerHTML = `
        <div class="thumb-modal-backdrop"></div>
        <div class="thumb-modal-content">
          <div class="thumb-modal-header">
            <span class="thumb-modal-label"></span>
            <div class="thumb-modal-btns">
              <a class="btn btn-small btn-outline thumb-modal-download" download>⬇ Скачать</a>
              <button class="btn btn-small btn-outline thumb-modal-close">✕</button>
            </div>
          </div>
          <img class="thumb-modal-img" src="" alt="">
        </div>`;
      document.body.appendChild(modal);
      modal.querySelector('.thumb-modal-backdrop').addEventListener('click', closeThumbModal);
      modal.querySelector('.thumb-modal-close').addEventListener('click', closeThumbModal);
      document.addEventListener('keydown', e => { if (e.key === 'Escape') closeThumbModal(); });
    }
    modal.querySelector('.thumb-modal-img').src = url;
    modal.querySelector('.thumb-modal-label').textContent = label;
    modal.querySelector('.thumb-modal-download').href = url;
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function closeThumbModal() {
    const modal = document.getElementById('thumb-modal');
    if (modal) { modal.style.display = 'none'; document.body.style.overflow = ''; }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
