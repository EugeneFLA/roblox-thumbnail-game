const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'thumbnail-master-secret-key-change-in-production';
const JWT_EXPIRES_IN = '7d';

/**
 * Генерация JWT токена
 */
function generateToken(developer) {
  return jwt.sign(
    {
      id: developer.id,
      email: developer.email,
      displayName: developer.display_name,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * Middleware: проверяет JWT токен из заголовка Authorization
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.developer = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Токен истёк, войдите снова' });
    }
    return res.status(401).json({ error: 'Недействительный токен' });
  }
}

/**
 * Middleware: опциональная авторизация (не блокирует если нет токена)
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.slice(7);
      req.developer = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      // Игнорируем невалидный токен
    }
  }

  next();
}

module.exports = { generateToken, requireAuth, optionalAuth, JWT_SECRET };
