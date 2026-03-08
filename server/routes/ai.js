const express = require('express');
const router = express.Router();
const https = require('https');
const pool = require('../config/database');
const { requireAuth } = require('../middleware/auth');

function meshyRequest(apiKey, method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.meshy.ai',
      path,
      method,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(json.message || json.error || `HTTP ${res.statusCode}`));
          } else {
            resolve(json);
          }
        } catch (e) {
          reject(new Error('Invalid JSON from Meshy'));
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function getDeveloperMeshyKey(developerId) {
  const result = await pool.query(
    'SELECT meshy_api_key FROM developers WHERE id = $1',
    [developerId]
  );
  return result.rows[0]?.meshy_api_key || null;
}

/**
 * POST /api/dev/ai/generate
 * Body: { prompt, model, aspectRatio, count }
 */
router.post('/generate', requireAuth, async (req, res) => {
  const apiKey = await getDeveloperMeshyKey(req.developer.id);
  if (!apiKey) {
    return res.status(403).json({
      error: 'Meshy API ключ не настроен. Добавьте его в Настройках.',
      needsKey: true,
    });
  }

  const { prompt, model = 'nano-banana-pro', aspectRatio = '16:9', count = 1 } = req.body;

  if (!prompt || prompt.trim().length < 3) {
    return res.status(400).json({ error: 'Prompt обязателен (минимум 3 символа)' });
  }

  const n = Math.min(Math.max(parseInt(count) || 1, 1), 4);

  try {
    const tasks = await Promise.all(
      Array.from({ length: n }, () =>
        meshyRequest(apiKey, 'POST', '/openapi/v1/text-to-image', {
          ai_model: model,
          prompt: prompt.trim(),
          aspect_ratio: aspectRatio,
        })
      )
    );

    const taskIds = tasks.map(t => t.result);
    res.json({ taskIds });
  } catch (err) {
    console.error('Meshy generate error:', err.message);
    res.status(502).json({ error: err.message });
  }
});

/**
 * GET /api/dev/ai/status/:taskId
 */
router.get('/status/:taskId', requireAuth, async (req, res) => {
  const apiKey = await getDeveloperMeshyKey(req.developer.id);
  if (!apiKey) {
    return res.status(403).json({ error: 'Meshy API ключ не настроен' });
  }

  try {
    const data = await meshyRequest(apiKey, 'GET', `/openapi/v1/text-to-image/${req.params.taskId}`);
    res.json({
      status: data.status,
      progress: data.progress || 0,
      imageUrls: data.image_urls || [],
    });
  } catch (err) {
    console.error('Meshy status error:', err.message);
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
