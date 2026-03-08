const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const pool = require('../config/database');
const Developer = require('../models/Developer');
const { generateToken, requireAuth } = require('../middleware/auth');
const { sendPasswordReset } = require('../config/mailer');

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

/**
 * POST /api/dev/auth/forgot-password
 * Запрос сброса пароля — отправляет email со ссылкой и кодом
 */
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email обязателен' });

    // Всегда возвращаем успех, чтобы не раскрывать существование email
    res.json({ ok: true, message: 'Если аккаунт существует, письмо отправлено' });

    const developer = await Developer.findByEmail(email);
    if (!developer) return;

    // Генерируем токен и 6-значный код
    const token = crypto.randomBytes(32).toString('hex');
    const code  = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 минут

    // Инвалидируем старые токены
    await pool.query(
      'UPDATE password_reset_tokens SET used=true WHERE developer_id=$1 AND used=false',
      [developer.id]
    );

    // Сохраняем новый токен
    await pool.query(
      'INSERT INTO password_reset_tokens (developer_id, token, code, expires_at) VALUES ($1,$2,$3,$4)',
      [developer.id, token, code, expiresAt]
    );

    // Отправляем email
    await sendPasswordReset(developer.email, { token, code });
  } catch (err) {
    console.error('Forgot password error:', err);
  }
});

/**
 * POST /api/dev/auth/reset-password
 * Сброс пароля по токену (из ссылки) или коду
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { token, code, email, newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Пароль должен быть не менее 6 символов' });
    }

    let row;

    if (token) {
      // Сброс по токену из ссылки
      const result = await pool.query(
        `SELECT prt.*, d.email FROM password_reset_tokens prt
         JOIN developers d ON d.id = prt.developer_id
         WHERE prt.token=$1 AND prt.used=false AND prt.expires_at > NOW()`,
        [token]
      );
      row = result.rows[0];
    } else if (code && email) {
      // Сброс по коду вручную
      const dev = await Developer.findByEmail(email);
      if (dev) {
        const result = await pool.query(
          `SELECT prt.*, d.email FROM password_reset_tokens prt
           JOIN developers d ON d.id = prt.developer_id
           WHERE prt.developer_id=$1 AND prt.code=$2 AND prt.used=false AND prt.expires_at > NOW()
           ORDER BY prt.created_at DESC LIMIT 1`,
          [dev.id, code]
        );
        row = result.rows[0];
      }
    }

    if (!row) {
      return res.status(400).json({ error: 'Неверный или истёкший токен/код' });
    }

    // Меняем пароль
    await Developer.changePassword(row.developer_id, newPassword);

    // Инвалидируем токен
    await pool.query(
      'UPDATE password_reset_tokens SET used=true WHERE id=$1',
      [row.id]
    );

    res.json({ ok: true, message: 'Пароль успешно изменён' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
