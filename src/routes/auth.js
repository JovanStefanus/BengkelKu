const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { auth, issueToken, clearToken, profile, ROLE_LABEL } = require('../auth');
const { HttpError, bad, str, num, need } = require('../util');
const createLimiter = require('../limiter');
const crypto = require('crypto');
const { sendMail, smtpConfigured } = require('../mailer');
const { notify, admins } = require('../notify');

const loginLimiter = createLimiter({ max: Number(process.env.LOGIN_RATE_MAX) || 10 });
const resetLimiter = createLimiter({ max: Number(process.env.RESET_RATE_MAX) || 5 });
const resetConfirmLimiter = createLimiter({ max: 30 }); // token 256-bit tidak bisa ditebak; cukup batas longgar per IP
const RESET_TTL_MS = 30 * 60 * 1000;
const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');
// Mode demo (tanpa email): tautan reset ditampilkan di layar. JANGAN dipakai untuk data nyata.
const exposeResetLink = () => process.env.SEED_DEMO !== 'false' && !smtpConfigured();
function validPassword(p, label = 'Password') {
  if (typeof p !== 'string' || p.length < 8 || p.length > 72) throw bad(`${label} minimal 8 karakter`);
  return p;
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DUMMY_HASH = bcrypt.hashSync('dummy-password', 10); // menyamakan waktu respons saat email tidak ada

function readAccount(b = {}) {
  const nama = need(str(b.nama, { min: 2, max: 100 }), 'Nama wajib diisi (2-100 karakter)');
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(email) || email.length > 150) throw bad('Format email tidak valid');
  if (typeof b.password !== 'string' || b.password.length < 8 || b.password.length > 72)
    throw bad('Password minimal 8 karakter');
  let no_hp = null;
  if (b.no_hp !== undefined && b.no_hp !== null && b.no_hp !== '') {
    no_hp = need(str(b.no_hp, { min: 6, max: 20 }), 'No. HP tidak valid');
    if (!/^[0-9+\-\s]+$/.test(no_hp)) throw bad('No. HP hanya boleh berisi angka');
  }
  return { nama, email, password: b.password, no_hp };
}

const insertUser = db.prepare(
  'INSERT INTO users (nama, email, password_hash, no_hp, role) VALUES (?, ?, ?, ?, ?)'
);
function emailTaken(email) {
  return !!db.prepare('SELECT 1 FROM users WHERE email = ?').get(email);
}

// Daftar: hanya Customer dan Mitra Bengkel. Mekanik dibuat oleh bengkel; Admin dibuat oleh pengembang.
router.post('/register/customer', (req, res) => {
  const a = readAccount(req.body);
  if (emailTaken(a.email)) throw new HttpError(409, 'Email sudah terdaftar');
  const id = insertUser.run(a.nama, a.email, bcrypt.hashSync(a.password, 10), a.no_hp, 'customer').lastInsertRowid;
  issueToken(res, { id });
  res.status(201).json({ ok: true });
});

router.post('/register/mitra', (req, res) => {
  const a = readAccount(req.body);
  const bg = req.body.bengkel || {};
  const nama = need(str(bg.nama, { min: 3, max: 100 }), 'Nama bengkel wajib diisi');
  const alamat = need(str(bg.alamat, { min: 5, max: 250 }), 'Alamat bengkel wajib diisi');
  const lat = need(num(bg.lat, -90, 90), 'Latitude bengkel tidak valid');
  const lng = need(num(bg.lng, -180, 180), 'Longitude bengkel tidak valid');
  const jenis = ['Motor', 'Mobil', 'Motor & Mobil'].includes(bg.jenis) ? bg.jenis : null;
  if (!jenis) throw bad('Pilih jenis kendaraan yang dilayani');
  if (emailTaken(a.email)) throw new HttpError(409, 'Email sudah terdaftar');

  const id = db.transaction(() => {
    const uid = insertUser.run(a.nama, a.email, bcrypt.hashSync(a.password, 10), a.no_hp, 'mitra').lastInsertRowid;
    db.prepare('INSERT INTO bengkel (id_pemilik, nama, alamat, lat, lng, jenis) VALUES (?, ?, ?, ?, ?, ?)')
      .run(uid, nama, alamat, lat, lng, jenis);
    admins().forEach((a) => notify(a, 'Pendaftaran mitra baru', `${nama} menunggu persetujuan Anda.`, '#/admin/bengkel'));
    return uid;
  })();
  issueToken(res, { id });
  res.status(201).json({ ok: true });
});

router.post('/login', loginLimiter, (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const role = req.body?.role;
  if (!ROLE_LABEL[role]) throw bad('Pilih peran untuk login');

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  const ok = bcrypt.compareSync(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) throw new HttpError(401, 'Email atau password salah');

  // Peran yang dipilih di form dicocokkan dengan peran di database.
  if (user.role !== role) {
    throw new HttpError(403, `Akun ini bukan akun ${ROLE_LABEL[role]}. Pilih peran "${ROLE_LABEL[user.role]}" untuk masuk.`);
  }
  if (user.role === 'mekanik') {
    const m = db.prepare('SELECT aktif FROM mekanik WHERE id_user = ?').get(user.id);
    if (!m || !m.aktif) throw new HttpError(403, 'Akun mekanik ini dinonaktifkan oleh bengkel');
  }
  loginLimiter.clear(req);
  issueToken(res, user);
  res.json({ ok: true, role: user.role });
});

// ---- Lupa & reset password ----
router.post('/lupa-password', resetLimiter, async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(email)) throw bad('Format email tidak valid');
  const out = { ok: true, message: 'Jika email terdaftar, tautan untuk mengatur ulang password telah dikirim.' };

  const user = db.prepare('SELECT id, nama FROM users WHERE email = ?').get(email);
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    db.transaction(() => {
      db.prepare('DELETE FROM password_reset WHERE id_user = ?').run(user.id);
      db.prepare('INSERT INTO password_reset (id_user, token_hash, expires_at) VALUES (?, ?, ?)')
        .run(user.id, sha256(token), Date.now() + RESET_TTL_MS);
    })();
    // Token di fragmen URL (#) agar tidak ikut terkirim ke server/log/referrer.
    const base = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    const link = `${base}/#/reset/${token}`;
    try {
      await sendMail({
        to: email, subject: 'Atur ulang password BengkelKu',
        text: `Halo ${user.nama},\n\nKlik tautan berikut untuk mengatur ulang password Anda (berlaku 30 menit):\n${link}\n\nJika Anda tidak merasa meminta ini, abaikan email ini.`,
      });
    } catch (e) { console.error('[mail] gagal mengirim:', e.message); }
    if (exposeResetLink()) out.dev_token = token; // hanya mode demo
  }
  res.json(out); // respons sama baik email terdaftar maupun tidak (mencegah penebakan akun)
});

router.post('/reset-password', resetConfirmLimiter, (req, res) => {
  const token = typeof req.body?.token === 'string' && /^[a-f0-9]{64}$/.test(req.body.token) ? req.body.token : null;
  const password = validPassword(req.body?.password, 'Password baru');
  const row = token && db.prepare('SELECT * FROM password_reset WHERE token_hash = ? AND used = 0 AND expires_at > ?').get(sha256(token), Date.now());
  if (!row) throw bad('Tautan reset tidak valid atau sudah kedaluwarsa. Minta tautan baru.');
  db.transaction(() => {
    db.prepare('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?').run(bcrypt.hashSync(password, 10), row.id_user);
    db.prepare('DELETE FROM password_reset WHERE id_user = ?').run(row.id_user);
  })();
  res.json({ ok: true });
});

// ---- Profil & ganti password (user yang sedang login) ----
router.put('/profile', auth, (req, res) => {
  const nama = need(str(req.body?.nama, { min: 2, max: 100 }), 'Nama wajib diisi (2-100 karakter)');
  let no_hp = null;
  if (req.body?.no_hp) {
    no_hp = need(str(req.body.no_hp, { min: 6, max: 20 }), 'No. HP tidak valid');
    if (!/^[0-9+\-\s]+$/.test(no_hp)) throw bad('No. HP hanya boleh berisi angka');
  }
  db.transaction(() => {
    db.prepare('UPDATE users SET nama = ?, no_hp = ? WHERE id = ?').run(nama, no_hp, req.user.id);
    if (req.user.role === 'mekanik') db.prepare('UPDATE mekanik SET nama = ? WHERE id_user = ?').run(nama, req.user.id);
  })();
  const fresh = db.prepare('SELECT id, nama, email, no_hp, role FROM users WHERE id = ?').get(req.user.id);
  res.json({ ok: true, user: { ...fresh } });
});

router.post('/ganti-password', auth, (req, res) => {
  const lama = typeof req.body?.password_lama === 'string' ? req.body.password_lama : '';
  const baru = validPassword(req.body?.password_baru, 'Password baru');
  const row = db.prepare('SELECT password_hash, token_version FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(lama, row.password_hash)) throw new HttpError(403, 'Password lama salah');
  if (baru === lama) throw bad('Password baru harus berbeda dari password lama');
  const version = row.token_version + 1;
  db.prepare('UPDATE users SET password_hash = ?, token_version = ? WHERE id = ?').run(bcrypt.hashSync(baru, 10), version, req.user.id);
  issueToken(res, { id: req.user.id, token_version: version }); // sesi ini tetap login; sesi lain otomatis keluar
  res.json({ ok: true });
});

router.post('/logout', (req, res) => { clearToken(res); res.json({ ok: true }); });
router.get('/me', auth, (req, res) => res.json({ user: profile(req) }));

module.exports = router;
