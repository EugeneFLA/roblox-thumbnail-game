require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const gameRoutes = require('./routes/game');
const authRoutes = require('./routes/auth');
const campaignRoutes = require('./routes/campaigns');
const statsRoutes = require('./routes/stats');
const adminRoutes = require('./routes/admin');
const aiRoutes = require('./routes/ai');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Serve static client files (Yandex Game)
app.use(express.static(path.join(__dirname, '..', 'client')));

// Serve developer dashboard (отдельный SPA)
app.use('/dev', express.static(path.join(__dirname, '..', 'dashboard')));

// Serve admin panel
app.use('/admin', express.static(path.join(__dirname, '..', 'admin')));

// ========== API Routes ==========

// Game API (для Яндекс Игры)
app.use('/api', gameRoutes);

// Developer API (для панели разработчиков)
app.use('/api/dev/auth', authRoutes);
app.use('/api/dev/campaigns', campaignRoutes);
app.use('/api/dev/stats', statsRoutes);

// Admin API
app.use('/api/admin', adminRoutes);

// AI generation (Meshy proxy)
app.use('/api/dev/ai', aiRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// SPA fallback для dashboard
app.get('/dev/*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dashboard', 'index.html'));
});

// SPA fallback для admin
app.get('/admin/*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'admin', 'index.html'));
});

// SPA fallback для game client
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Game client: http://localhost:${PORT}`);
  console.log(`Developer dashboard: http://localhost:${PORT}/dev`);
  console.log(`API: http://localhost:${PORT}/api`);
});

// Автоматическое обновление БД играми из Roblox — каждую ночь в 3:00
const cron = require('node-cron');
const { runSeed } = require('./scripts/seedRoblox');

cron.schedule('0 3 * * *', async () => {
  console.log('[Cron] Starting nightly game DB update...');
  try {
    await runSeed({ silent: true });
    console.log('[Cron] Game DB update complete.');
  } catch (err) {
    console.error('[Cron] Game DB update failed:', err.message);
  }
});
