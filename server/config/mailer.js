const nodemailer = require('nodemailer');

// Настройка транспорта из .env
// SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST || 'smtp.gmail.com',
  port:   parseInt(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@thumbnail-master.com';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function sendPasswordReset(email, { token, code }) {
  const resetUrl = `${BASE_URL}/dev?reset=${token}`;

  await transporter.sendMail({
    from: `"Thumbnail Master" <${FROM}>`,
    to: email,
    subject: 'Сброс пароля — Thumbnail Master',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#7c6af7">Сброс пароля</h2>
        <p>Вы запросили сброс пароля для аккаунта <strong>${email}</strong>.</p>

        <p style="margin-top:20px"><strong>Способ 1 — Перейти по ссылке:</strong></p>
        <a href="${resetUrl}" style="display:inline-block;background:#7c6af7;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
          Сбросить пароль
        </a>

        <p style="margin-top:24px"><strong>Способ 2 — Ввести код вручную:</strong></p>
        <div style="background:#1a1d27;border:1px solid #2a2d3e;border-radius:8px;padding:16px;text-align:center">
          <span style="font-size:2rem;font-weight:700;letter-spacing:8px;color:#f0b840">${code}</span>
        </div>

        <p style="margin-top:20px;color:#6b7280;font-size:0.85rem">
          Ссылка и код действительны в течение <strong>30 минут</strong>.<br>
          Если вы не запрашивали сброс пароля — просто проигнорируйте это письмо.
        </p>
      </div>`,
  });
}

module.exports = { sendPasswordReset };
