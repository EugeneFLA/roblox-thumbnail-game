const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const Campaign = require('../models/Campaign');
const CampaignThumbnail = require('../models/CampaignThumbnail');
const upload = require('../middleware/upload');
const path = require('path');

// Все роуты требуют авторизации
router.use(requireAuth);

/**
 * GET /api/dev/campaigns — список кампаний разработчика
 */
router.get('/', async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;
    const campaigns = await Campaign.findByDeveloper(req.developer.id, {
      status,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
    const total = await Campaign.countByDeveloper(req.developer.id);
    res.json({ campaigns, total });
  } catch (err) {
    console.error('List campaigns error:', err);
    res.status(500).json({ error: 'Ошибка загрузки кампаний' });
  }
});

/**
 * POST /api/dev/campaigns — создать кампанию
 */
router.post('/', async (req, res) => {
  try {
    const { name, gameTitle, gameDescription, robloxUniverseId, robloxPlaceId, targetVotes } = req.body;

    if (!name || !gameTitle || !gameDescription) {
      return res.status(400).json({ error: 'Название, название игры и описание обязательны' });
    }

    if (gameDescription.length < 20) {
      return res.status(400).json({ error: 'Описание должно быть не менее 20 символов' });
    }

    const campaign = await Campaign.create({
      developerId: req.developer.id,
      name,
      gameTitle,
      gameDescription,
      robloxUniverseId,
      robloxPlaceId,
      targetVotes,
    });

    res.status(201).json({ campaign });
  } catch (err) {
    console.error('Create campaign error:', err);
    res.status(500).json({ error: 'Ошибка создания кампании' });
  }
});

/**
 * GET /api/dev/campaigns/:id — детали кампании
 */
router.get('/:id', async (req, res) => {
  try {
    const campaign = await Campaign.findById(parseInt(req.params.id), req.developer.id);
    if (!campaign) {
      return res.status(404).json({ error: 'Кампания не найдена' });
    }

    const thumbnails = await CampaignThumbnail.findByCampaign(campaign.id);

    res.json({ campaign, thumbnails });
  } catch (err) {
    console.error('Get campaign error:', err);
    res.status(500).json({ error: 'Ошибка загрузки кампании' });
  }
});

/**
 * PUT /api/dev/campaigns/:id — обновить кампанию
 */
router.put('/:id', async (req, res) => {
  try {
    const { name, gameTitle, gameDescription, robloxUniverseId, robloxPlaceId, targetVotes, status } = req.body;

    // Валидация статуса
    if (status === 'active') {
      // Проверяем что есть хотя бы 2 тамбнейла
      const thumbs = await CampaignThumbnail.findByCampaign(parseInt(req.params.id));
      if (thumbs.length < 2) {
        return res.status(400).json({ error: 'Для активации нужно минимум 2 тамбнейла' });
      }
    }

    const campaign = await Campaign.update(parseInt(req.params.id), req.developer.id, {
      name, gameTitle, gameDescription, robloxUniverseId, robloxPlaceId, targetVotes, status,
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Кампания не найдена' });
    }

    res.json({ campaign });
  } catch (err) {
    console.error('Update campaign error:', err);
    res.status(500).json({ error: 'Ошибка обновления кампании' });
  }
});

/**
 * DELETE /api/dev/campaigns/:id — архивировать кампанию
 */
router.delete('/:id', async (req, res) => {
  try {
    const result = await Campaign.archive(parseInt(req.params.id), req.developer.id);
    if (!result) {
      return res.status(404).json({ error: 'Кампания не найдена' });
    }
    res.json({ message: 'Кампания архивирована' });
  } catch (err) {
    console.error('Delete campaign error:', err);
    res.status(500).json({ error: 'Ошибка удаления кампании' });
  }
});

// =============================================
// ТАМБНЕЙЛЫ КАМПАНИИ
// =============================================

/**
 * POST /api/dev/campaigns/:id/thumbnails — загрузить тамбнейлы
 */
router.post('/:id/thumbnails', upload.array('thumbnails', 10), async (req, res) => {
  try {
    const campaignId = parseInt(req.params.id);

    // Проверяем принадлежность кампании
    const campaign = await Campaign.findById(campaignId, req.developer.id);
    if (!campaign) {
      return res.status(404).json({ error: 'Кампания не найдена' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Файлы не загружены' });
    }

    const thumbnails = [];
    const labels = req.body.labels ? (Array.isArray(req.body.labels) ? req.body.labels : [req.body.labels]) : [];

    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];

      // Получаем размеры изображения через sharp
      let width = 1920, height = 1080;
      try {
        const sharp = require('sharp');
        const metadata = await sharp(file.path).metadata();
        width = metadata.width;
        height = metadata.height;
      } catch (e) {
        console.warn('Could not read image dimensions:', e.message);
      }

      const fileUrl = `/uploads/thumbnails/${req.developer.id}/${file.filename}`;

      const thumb = await CampaignThumbnail.create({
        campaignId,
        developerId: req.developer.id,
        originalFilename: file.originalname,
        filePath: file.path,
        fileUrl,
        fileSize: file.size,
        width,
        height,
        label: labels[i] || `Вариант ${i + 1}`,
        sortOrder: i,
      });

      thumbnails.push(thumb);
    }

    res.status(201).json({ thumbnails });
  } catch (err) {
    console.error('Upload thumbnails error:', err);
    res.status(500).json({ error: 'Ошибка загрузки тамбнейлов' });
  }
});

/**
 * PUT /api/dev/campaigns/:campaignId/thumbnails/:thumbId — обновить тамбнейл
 */
router.put('/:campaignId/thumbnails/:thumbId', async (req, res) => {
  try {
    const { label, sortOrder } = req.body;
    const thumb = await CampaignThumbnail.update(
      parseInt(req.params.thumbId),
      req.developer.id,
      { label, sortOrder }
    );

    if (!thumb) {
      return res.status(404).json({ error: 'Тамбнейл не найден' });
    }

    res.json({ thumbnail: thumb });
  } catch (err) {
    console.error('Update thumbnail error:', err);
    res.status(500).json({ error: 'Ошибка обновления тамбнейла' });
  }
});

/**
 * POST /api/dev/campaigns/:campaignId/thumbnails/:thumbId/replace — перезалить файл
 */
router.post('/:campaignId/thumbnails/:thumbId/replace', upload.single('thumbnail'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Файл не загружен' });
    }

    let width = 1920, height = 1080;
    try {
      const sharp = require('sharp');
      const metadata = await sharp(req.file.path).metadata();
      width = metadata.width;
      height = metadata.height;
    } catch (e) {
      console.warn('Could not read image dimensions:', e.message);
    }

    const fileUrl = `/uploads/thumbnails/${req.developer.id}/${req.file.filename}`;

    const thumb = await CampaignThumbnail.replaceFile(
      parseInt(req.params.thumbId),
      req.developer.id,
      {
        filePath: req.file.path,
        fileUrl,
        fileSize: req.file.size,
        width,
        height,
        originalFilename: req.file.originalname,
      }
    );

    if (!thumb) {
      return res.status(404).json({ error: 'Тамбнейл не найден' });
    }

    res.json({ thumbnail: thumb });
  } catch (err) {
    console.error('Replace thumbnail error:', err);
    res.status(500).json({ error: 'Ошибка перезаливки тамбнейла' });
  }
});

/**
 * DELETE /api/dev/campaigns/:campaignId/thumbnails/:thumbId — удалить тамбнейл
 */
router.delete('/:campaignId/thumbnails/:thumbId', async (req, res) => {
  try {
    const result = await CampaignThumbnail.deleteWithFile(
      parseInt(req.params.thumbId),
      req.developer.id
    );

    if (!result) {
      return res.status(404).json({ error: 'Тамбнейл не найден' });
    }

    res.json({ message: 'Тамбнейл удалён' });
  } catch (err) {
    console.error('Delete thumbnail error:', err);
    res.status(500).json({ error: 'Ошибка удаления тамбнейла' });
  }
});

module.exports = router;
