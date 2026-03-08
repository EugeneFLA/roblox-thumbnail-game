const express = require('express');
const router = express.Router();
const Developer = require('../models/Developer');
const { generateToken, requireAuth } = require('../middleware/auth');

/**
 * POST /api/dev/auth/register
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, displayName, companyName, robloxUsername } = req.body;

    // Валидация
    if (!email || !password || !displayName) {
      return res.status(400).json({ error: 'Email, пароль и имя обязательны' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Пароль должен быть не менее 6 символов' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Некорректный email' });
    }

    // Проверяем уникальность email
    const existing = await Developer.findByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'Аккаунт с таким email уже существует' });
    }

    // Создаём аккаунт
    const developer = await Developer.create({
      email,
      password,
      displayName,
      companyName,
      robloxUsername,
    });

    const token = generateToken(developer);

    res.status(201).json({
      token,
      developer: {
        id: developer.id,
        email: developer.email,
        displayName: developer.display_name,
        companyName: developer.company_name,
        robloxUsername: developer.roblox_username,
      },
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Ошибка при регистрации' });
  }
});

/**
 * POST /api/dev/auth/login
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email и пароль обязательны' });
    }

    const developer = await Developer.findByEmail(email);
    if (!developer) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    const isValid = await Developer.verifyPassword(password, developer.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    const token = generateToken(developer);

    res.json({
      token,
      developer: {
        id: developer.id,
        email: developer.email,
        displayName: developer.display_name,
        companyName: developer.company_name,
        robloxUsername: developer.roblox_username,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Ошибка при входе' });
  }
});

/**
 * GET /api/dev/auth/me — текущий пользователь
 */
router.get('/me', requireAuth, async (req, res) => {
  try {
    const developer = await Developer.findById(req.developer.id);
    if (!developer) {
      return res.status(404).json({ error: 'Аккаунт не найден' });
    }

    const stats = await Developer.getOverviewStats(req.developer.id);

    res.json({ developer, stats });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/**
 * PUT /api/dev/auth/profile — обновить профиль
 */
router.put('/profile', requireAuth, async (req, res) => {
  try {
    const { displayName, companyName, robloxUsername } = req.body;
    const developer = await Developer.update(req.developer.id, {
      displayName,
      companyName,
      robloxUsername,
    });
    res.json({ developer });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Ошибка обновления профиля' });
  }
});

module.exports = router;
