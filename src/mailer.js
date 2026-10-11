// Pengiriman email (opsional). Jika SMTP_URL tidak diisi, isi email dicetak ke log server.
let transport = null;

function getTransport() {
  if (transport) return transport;
  if (!process.env.SMTP_URL) return null;
  transport = require('nodemailer').createTransport(process.env.SMTP_URL);
  return transport;
}

async function sendMail({ to, subject, text }) {
  const t = getTransport();
  if (!t) {
    console.log(`[mail] SMTP_URL belum diatur, email tidak dikirim.\n  Kepada : ${to}\n  Subjek : ${subject}\n  ${text.replace(/\n/g, '\n  ')}`);
    return { sent: false };
  }
  await t.sendMail({ from: process.env.MAIL_FROM || 'BengkelKu <no-reply@bengkelku.local>', to, subject, text });
  return { sent: true };
}

const smtpConfigured = () => !!process.env.SMTP_URL;
module.exports = { sendMail, smtpConfigured, setTransport: (t) => { transport = t; } };
