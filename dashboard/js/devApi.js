/**
 * API клиент для панели разработчиков
 */
const DevAPI = (() => {
  const BASE = window.location.origin + '/api/dev';

  function getToken() {
    return localStorage.getItem('dev_token');
  }

  function setToken(token) {
    localStorage.setItem('dev_token', token);
  }

  function clearToken() {
    localStorage.removeItem('dev_token');
  }

  async function request(path, options = {}) {
    const headers = { ...options.headers };
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    // Не ставим Content-Type для FormData (multipart/form-data)
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    const resp = await fetch(`${BASE}${path}`, { ...options, headers });

    if (resp.status === 401) {
      clearToken();
      window.location.reload();
      throw new Error('Unauthorized');
    }

    const data = await resp.json();

    if (!resp.ok) {
      throw new Error(data.error || `HTTP ${resp.status}`);
    }

    return data;
  }

  return {
    getToken,
    setToken,
    clearToken,

    // ===== AUTH =====
    async register(data) {
      const result = await request('/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (result.token) setToken(result.token);
      return result;
    },

    async login(email, password) {
      const result = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      if (result.token) setToken(result.token);
      return result;
    },

    async getMe() {
      return request('/auth/me');
    },

    logout() {
      clearToken();
    },

    // ===== CAMPAIGNS =====
    async getCampaigns(status) {
      const q = status ? `?status=${status}` : '';
      return request(`/campaigns${q}`);
    },

    async getCampaign(id) {
      return request(`/campaigns/${id}`);
    },

    async createCampaign(data) {
      return request('/campaigns', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    async updateCampaign(id, data) {
      return request(`/campaigns/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },

    async deleteCampaign(id) {
      return request(`/campaigns/${id}`, { method: 'DELETE' });
    },

    // ===== THUMBNAILS =====
    async uploadThumbnails(campaignId, files, labels = []) {
      const formData = new FormData();
      for (const f of files) formData.append('thumbnails', f);
      for (const l of labels) formData.append('labels', l);

      return request(`/campaigns/${campaignId}/thumbnails`, {
        method: 'POST',
        body: formData,
      });
    },

    async updateThumbnail(campaignId, thumbId, data) {
      return request(`/campaigns/${campaignId}/thumbnails/${thumbId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },

    async replaceThumbnail(campaignId, thumbId, file) {
      const formData = new FormData();
      formData.append('thumbnail', file);
      return request(`/campaigns/${campaignId}/thumbnails/${thumbId}/replace`, {
        method: 'POST',
        body: formData,
      });
    },

    async deleteThumbnail(campaignId, thumbId) {
      return request(`/campaigns/${campaignId}/thumbnails/${thumbId}`, { method: 'DELETE' });
    },

    // ===== STATS =====
    async getOverviewStats() {
      return request('/stats/overview');
    },

    async getCampaignStats(campaignId, days = 30) {
      return request(`/stats/campaigns/${campaignId}?days=${days}`);
    },

    async getThumbnailStats(thumbId, days = 30) {
      return request(`/stats/thumbnails/${thumbId}?days=${days}`);
    },

    async getRobloxGamesStats(limit = 50, offset = 0, sort = 'ctr') {
      return request(`/stats/roblox-games?limit=${limit}&offset=${offset}&sort=${sort}`);
    },
  };
})();
