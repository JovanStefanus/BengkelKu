const jwt = require('jsonwebtoken');
const db = require('./db');

const isProd = process.env.NODE_ENV === 'production';
const SECRET = process.env.JWT_SECRET || (isProd ? null : 'dev-only-secret-ganti-di-production');
if (!SECRET) {
  console.error('JWT_SECRET wajib diisi saat NODE_ENV=production');
  process.exit(1);
}
const COOKIE = 'bk_token';
const MAX_AGE_SEC = 7 * 24 * 3600;

const ROLE_LABEL = { customer: 'Customer', mitra: 'Mitra Bengkel', mekanik: 'Mekanik', admin: 'Admin Platform' };

function issueToken(res, user) {
  const token = jwt.sign({ sub: user.id, v: user.token_version || 0 }, SECRET, { expiresIn: MAX_AGE_SEC });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: isProd, maxAge: MAX_AGE_SEC * 1000, path: '/' });
}
function clearToken(res) { res.clearCookie(COOKIE, { path: '/' }); }

function readCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) {
      try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return null; }
    }
  }
  return null;
}

// Middleware: wajib login. Peran SELALU dibaca dari database, bukan dari klien.
function auth(req, res, next) {
  const token = readCookie(req, COOKIE);
  if (!token) return res.status(401).json({ error: 'Silakan login terlebih dahulu' });
  let payload;
  try { payload = jwt.verify(token, SECRET); }
  catch { return res.status(401).json({ error: 'Sesi berakhir, silakan login ulang' }); }

  const user = db.prepare('SELECT id, nama, email, no_hp, role, token_version FROM users WHERE id = ?').get(payload.sub);
  if (!user) return res.status(401).json({ error: 'Akun tidak ditemukan' });
  // Ganti/reset password menaikkan token_version sehingga sesi lama otomatis tidak berlaku.
  if ((payload.v || 0) !== user.token_version) return res.status(401).json({ error: 'Sesi berakhir, silakan login ulang' });

  if (user.role === 'mitra') {
    req.bengkel = db.prepare('SELECT * FROM bengkel WHERE id_pemilik = ?').get(user.id);
  } else if (user.role === 'mekanik') {
    req.mekanik = db.prepare(
      `SELECT m.*, b.nama AS bengkel_nama FROM mekanik m JOIN bengkel b ON b.id = m.id_bengkel WHERE m.id_user = ?`
    ).get(user.id);
    if (!req.mekanik || !req.mekanik.aktif) return res.status(401).json({ error: 'Akun mekanik tidak aktif' });
  }
  req.user = user;
  next();
}

const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Anda tidak memiliki akses ke fitur ini' });

function profile(req) {
  const { token_version, ...rest } = req.user;
  const u = { ...rest, role_label: ROLE_LABEL[req.user.role] };
  if (req.bengkel) u.bengkel = req.bengkel;
  if (req.mekanik) u.mekanik = { id: req.mekanik.id, id_bengkel: req.mekanik.id_bengkel, bengkel_nama: req.mekanik.bengkel_nama, spesialisasi: req.mekanik.spesialisasi };
  return u;
}

module.exports = { auth, requireRole, issueToken, clearToken, profile, ROLE_LABEL };
