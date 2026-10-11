const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireRole } = require('../auth');
const { HttpError, bad, notFound, str, int, num, need } = require('../util');

router.use(requireRole('mitra'));
router.use((req, res, next) => (req.bengkel ? next() : res.status(404).json({ error: 'Data bengkel tidak ditemukan' })));

// ---- Profil bengkel ----
router.get('/bengkel', (req, res) => res.json({ item: req.bengkel }));

router.put('/bengkel', (req, res) => {
  const b = req.body || {};
  const nama = need(str(b.nama, { min: 3, max: 100 }), 'Nama bengkel wajib diisi');
  const alamat = need(str(b.alamat, { min: 5, max: 250 }), 'Alamat wajib diisi');
  const lat = need(num(b.lat, -90, 90), 'Latitude tidak valid');
  const lng = need(num(b.lng, -180, 180), 'Longitude tidak valid');
  const jenis = ['Motor', 'Mobil', 'Motor & Mobil'].includes(b.jenis) ? b.jenis : null;
  if (!jenis) throw bad('Jenis kendaraan tidak valid');
  const jam = need(str(b.jam_operasional, { min: 3, max: 40 }), 'Jam operasional wajib diisi');
  db.prepare('UPDATE bengkel SET nama = ?, alamat = ?, lat = ?, lng = ?, jenis = ?, jam_operasional = ? WHERE id = ?')
    .run(nama, alamat, lat, lng, jenis, jam, req.bengkel.id);
  res.json({ item: db.prepare('SELECT * FROM bengkel WHERE id = ?').get(req.bengkel.id) });
});

// ---- Mekanik (akun dibuat oleh bengkel) ----
router.get('/mekanik', (req, res) => {
  const items = db.prepare(
    `SELECT m.id, m.nama, m.spesialisasi, m.aktif, u.email, u.no_hp,
            (SELECT COUNT(*) FROM booking bk WHERE bk.id_mekanik = m.id AND bk.status IN ('Diterima','Dikerjakan')) AS tugas_aktif
     FROM mekanik m JOIN users u ON u.id = m.id_user WHERE m.id_bengkel = ? ORDER BY m.aktif DESC, m.nama`
  ).all(req.bengkel.id);
  res.json({ items });
});

router.post('/mekanik', (req, res) => {
  const b = req.body || {};
  const nama = need(str(b.nama, { min: 2, max: 100 }), 'Nama mekanik wajib diisi');
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150) throw bad('Format email tidak valid');
  if (typeof b.password !== 'string' || b.password.length < 8 || b.password.length > 72) throw bad('Password minimal 8 karakter');
  const spes = b.spesialisasi ? need(str(b.spesialisasi, { max: 80 }), 'Spesialisasi terlalu panjang') : null;
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new HttpError(409, 'Email sudah terdaftar');

  db.transaction(() => {
    const uid = db.prepare("INSERT INTO users (nama, email, password_hash, role) VALUES (?, ?, ?, 'mekanik')")
      .run(nama, email, bcrypt.hashSync(b.password, 10)).lastInsertRowid;
    db.prepare('INSERT INTO mekanik (id_user, id_bengkel, nama, spesialisasi) VALUES (?, ?, ?, ?)').run(uid, req.bengkel.id, nama, spes);
  })();
  res.status(201).json({ ok: true });
});

router.post('/mekanik/:id/toggle', (req, res) => {
  const m = db.prepare('SELECT * FROM mekanik WHERE id = ? AND id_bengkel = ?').get(Number(req.params.id), req.bengkel.id);
  if (!m) throw notFound('Mekanik tidak ditemukan');
  if (m.aktif) {
    const busy = db.prepare("SELECT COUNT(*) AS n FROM booking WHERE id_mekanik = ? AND status IN ('Diterima','Dikerjakan')").get(m.id).n;
    if (busy) throw new HttpError(409, 'Mekanik masih punya tugas aktif');
  }
  db.prepare('UPDATE mekanik SET aktif = ? WHERE id = ?').run(m.aktif ? 0 : 1, m.id);
  res.json({ ok: true });
});

router.post('/mekanik/:id/password', (req, res) => {
  const m = db.prepare('SELECT * FROM mekanik WHERE id = ? AND id_bengkel = ?').get(Number(req.params.id), req.bengkel.id);
  if (!m) throw notFound('Mekanik tidak ditemukan');
  const pw = req.body?.password;
  if (typeof pw !== 'string' || pw.length < 8 || pw.length > 72) throw bad('Password minimal 8 karakter');
  db.prepare('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?').run(bcrypt.hashSync(pw, 10), m.id_user);
  res.json({ ok: true });
});

// ---- CRUD generik untuk sparepart & layanan (hapus = nonaktifkan agar riwayat tetap utuh) ----
function readSparepart(b = {}) {
  return [
    need(str(b.nama, { min: 2, max: 100 }), 'Nama sparepart wajib diisi'),
    need(str(b.kategori, { min: 2, max: 40 }), 'Kategori wajib diisi'),
    need(int(b.stok, 0, 100000), 'Stok harus angka >= 0'),
    need(int(b.harga_jual, 0, 1e9), 'Harga harus angka >= 0'),
  ];
}
router.get('/sparepart', (req, res) => {
  res.json({ items: db.prepare('SELECT * FROM sparepart WHERE id_bengkel = ? AND aktif = 1 ORDER BY nama').all(req.bengkel.id) });
});
router.post('/sparepart', (req, res) => {
  const [nama, kategori, stok, harga] = readSparepart(req.body);
  db.prepare('INSERT INTO sparepart (id_bengkel, nama, kategori, stok, harga_jual) VALUES (?, ?, ?, ?, ?)')
    .run(req.bengkel.id, nama, kategori, stok, harga);
  res.status(201).json({ ok: true });
});
router.put('/sparepart/:id', (req, res) => {
  const [nama, kategori, stok, harga] = readSparepart(req.body);
  const r = db.prepare('UPDATE sparepart SET nama = ?, kategori = ?, stok = ?, harga_jual = ? WHERE id = ? AND id_bengkel = ? AND aktif = 1')
    .run(nama, kategori, stok, harga, Number(req.params.id), req.bengkel.id);
  if (!r.changes) throw notFound();
  res.json({ ok: true });
});
router.delete('/sparepart/:id', (req, res) => {
  const r = db.prepare('UPDATE sparepart SET aktif = 0 WHERE id = ? AND id_bengkel = ?').run(Number(req.params.id), req.bengkel.id);
  if (!r.changes) throw notFound();
  res.json({ ok: true });
});

function readServis(b = {}) {
  return [
    need(str(b.nama_servis, { min: 3, max: 80 }), 'Nama layanan wajib diisi'),
    need(int(b.harga, 0, 1e9), 'Harga harus angka >= 0'),
    need(int(b.estimasi_menit ?? 60, 5, 1440), 'Estimasi 5-1440 menit'),
  ];
}
router.get('/servis', (req, res) => {
  res.json({ items: db.prepare('SELECT * FROM jenis_servis WHERE id_bengkel = ? AND aktif = 1 ORDER BY nama_servis').all(req.bengkel.id) });
});
router.post('/servis', (req, res) => {
  const [nama, harga, est] = readServis(req.body);
  db.prepare('INSERT INTO jenis_servis (id_bengkel, nama_servis, harga, estimasi_menit) VALUES (?, ?, ?, ?)').run(req.bengkel.id, nama, harga, est);
  res.status(201).json({ ok: true });
});
router.put('/servis/:id', (req, res) => {
  const [nama, harga, est] = readServis(req.body);
  const r = db.prepare('UPDATE jenis_servis SET nama_servis = ?, harga = ?, estimasi_menit = ? WHERE id = ? AND id_bengkel = ? AND aktif = 1')
    .run(nama, harga, est, Number(req.params.id), req.bengkel.id);
  if (!r.changes) throw notFound();
  res.json({ ok: true });
});
router.delete('/servis/:id', (req, res) => {
  const r = db.prepare('UPDATE jenis_servis SET aktif = 0 WHERE id = ? AND id_bengkel = ?').run(Number(req.params.id), req.bengkel.id);
  if (!r.changes) throw notFound();
  res.json({ ok: true });
});

// ---- Ringkasan / laporan bengkel ----
router.get('/laporan', (req, res) => {
  const id = req.bengkel.id;
  const one = (sql, ...a) => db.prepare(sql).get(...a);
  const perStatus = db.prepare('SELECT status, COUNT(*) AS jumlah FROM booking WHERE id_bengkel = ? GROUP BY status').all(id);
  res.json({
    status_bengkel: req.bengkel.status,
    booking_per_status: perStatus,
    total_booking: perStatus.reduce((s, r) => s + r.jumlah, 0),
    pendapatan_servis: one("SELECT COALESCE(SUM(i.total),0) AS t FROM invoice i JOIN booking bk ON bk.id = i.id_booking WHERE bk.id_bengkel = ? AND i.status_pembayaran = 'Lunas'", id).t,
    tagihan_belum_lunas: one("SELECT COALESCE(SUM(i.total),0) AS t FROM invoice i JOIN booking bk ON bk.id = i.id_booking WHERE bk.id_bengkel = ? AND i.status_pembayaran = 'Belum Lunas'", id).t,
    pendapatan_sparepart: one('SELECT COALESCE(SUM(subtotal),0) AS t FROM pesanan_detail WHERE id_bengkel = ?', id).t,
    rating: one('SELECT ROUND(AVG(skor),1) AS avg, COUNT(*) AS n FROM rating WHERE id_bengkel = ?', id),
    stok_menipis: db.prepare('SELECT id, nama, stok FROM sparepart WHERE id_bengkel = ? AND aktif = 1 AND stok < 10 ORDER BY stok').all(id),
  });
});

module.exports = router;
