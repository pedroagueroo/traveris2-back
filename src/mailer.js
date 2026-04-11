// ============================================================================
// MAILER — Configuración Nodemailer con Gmail SMTP
// ============================================================================
const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

/**
 * Envía un email
 * @param {{ to: string, subject: string, html: string, attachments?: Array }} opciones
 */
async function enviarEmail({ to, subject, html, attachments }) {
  const mailOptions = {
    from: `"${process.env.SMTP_FROM_NAME || 'Traveris Pro'}" <${process.env.SMTP_USER}>`,
    to,
    subject,
    html,
    attachments
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`📧 Email enviado a ${to}: ${info.messageId}`);
    return info;
  } catch (err) {
    console.error(`❌ Error enviando email a ${to}:`, err);
    throw err;
  }
}

module.exports = { enviarEmail, transporter };
