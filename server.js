const fs = require('fs');
const path = require('path');
if (fs.existsSync(path.join(__dirname, '.env')) && process.loadEnvFile) process.loadEnvFile(path.join(__dirname, '.env'));

const express = require('express');
require('./src/db');
const { seedIfEmpty } = require('./src/seed');
const { auth } = require('./src/auth');
const { HttpError } = require('./src/util');

seedIfEmpty();
if (process.env.NODE_ENV === 'production' && process.env.SMTP_URL && !process.env.APP_URL)
  console.warn('[peringatan] APP_URL belum diatur: tautan reset password memakai header Host dari request. Isi APP_URL (mis. https://bengkelku.onrender.com).');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin', // OpenStreetMap mewajibkan Referer pada permintaan tile peta
    'Content-Security-Policy':
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src https://fonts.gstatic.com; img-src 'self' data: https://tile.openstreetmap.org https://*.tile.openstreetmap.org; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  });
  next();
});

app.use(express.json({ limit: '100kb' }));

// Perlindungan CSRF tambahan: request yang mengubah data wajib berformat JSON (tidak bisa dikirim form lintas-situs).
app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !req.is('application/json')) {
    return res.status(415).json({ error: 'Content-Type harus application/json' });
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.get('/api/config', (req, res) => res.json({ demo: process.env.SEED_DEMO !== 'false' }));
app.use('/api/auth', require('./src/routes/auth'));

app.use('/api', auth); // semua route di bawah ini wajib login
app.use('/api/customer', require('./src/routes/customer'));
app.use('/api/booking', require('./src/routes/booking'));
app.use('/api/pesanan', require('./src/routes/pesanan'));
app.use('/api/mitra', require('./src/routes/mitra'));
app.use('/api/mekanik', require('./src/routes/mekanik'));
app.use('/api/admin', require('./src/routes/admin'));
app.use('/api/notifikasi', require('./src/routes/notifikasi'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Body JSON tidak valid' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Data terlalu besar' });
  if (String(err.code).startsWith('SQLITE_CONSTRAINT')) return res.status(409).json({ error: 'Data tidak valid atau sudah ada' });
  console.error(err);
  res.status(500).json({ error: 'Terjadi kesalahan pada server' });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`BengkelKu berjalan di http://localhost:${PORT}`));
}
module.exports = app;
