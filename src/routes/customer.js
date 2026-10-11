const router = require('express').Router();
const db = require('../db');
const { requireRole } = require('../auth');
const { HttpError, bad, notFound, str, int, num, need, round1, haversine } = require('../util');
const { readKendaraan } = require('../vehicle');

router.use(requireRole('customer'));

const RATING_SQL = `(SELECT ROUND(AVG(skor), 1) FROM rating r WHERE r.id_bengkel = b.id) AS rating,
                    (SELECT COUNT(*) FROM rating r WHERE r.id_bengkel = b.id) AS jml_rating`;

function readLocation(q) {
  const lat = need(num(q.lat, -90, 90), 'Lokasi (lat/lng) wajib diisi');
  const lng = need(num(q.lng, -180, 180), 'Lokasi (lat/lng) wajib diisi');
  return { lat, lng };
}

// Cari bengkel aktif dalam radius tertentu dari lokasi customer, urut dari yang terdekat.
router.get('/bengkel', (req, res) => {
  const { lat, lng } = readLocation(req.query);
  const radius = num(req.query.radius, 0.1, 100) ?? 10;
  const rows = db.prepare(
    `SELECT b.id, b.nama, b.alamat, b.lat, b.lng, b.jenis, b.jam_operasional, ${RATING_SQL},
            (SELECT COUNT(*) FROM mekanik m WHERE m.id_bengkel = b.id AND m.aktif = 1) AS jml_mekanik
     FROM bengkel b WHERE b.status = 'Aktif'`
  ).all();
  const layanan = db.prepare(
    'SELECT id, nama_servis, harga, estimasi_menit FROM jenis_servis WHERE id_bengkel = ? AND aktif = 1 ORDER BY nama_servis'
  );
  const out = rows
    .map((b) => ({ ...b, jarak_km: round1(haversine(lat, lng, b.lat, b.lng)) }))
    .filter((b) => b.jarak_km <= radius)
    .sort((a, b) => a.jarak_km - b.jarak_km)
    .map((b) => ({ ...b, layanan: layanan.all(b.id) }));
  res.json({ radius, items: out });
});

// Marketplace sparepart lintas-bengkel.
router.get('/sparepart', (req, res) => {
  const q = str(req.query.q, { max: 60 });
  const kategori = str(req.query.kategori, { max: 40 });
  const rows = db.prepare(
    `SELECT s.id, s.nama, s.kategori, s.stok, s.harga_jual, b.id AS id_bengkel, b.nama AS bengkel_nama, b.lat, b.lng
     FROM sparepart s JOIN bengkel b ON b.id = s.id_bengkel
     WHERE s.aktif = 1 AND b.status = 'Aktif'
       AND (@q IS NULL OR s.nama LIKE @like)
       AND (@kategori IS NULL OR s.kategori = @kategori)
     ORDER BY s.nama LIMIT 200`
  ).all({ q, like: q ? `%${q}%` : null, kategori });

  const lat = num(req.query.lat, -90, 90), lng = num(req.query.lng, -180, 180);
  const items = rows.map(({ lat: la, lng: ln, ...s }) => ({
    ...s, jarak_km: lat !== null && lng !== null ? round1(haversine(lat, lng, la, ln)) : null,
  }));
  const kategoriList = db.prepare(
    `SELECT DISTINCT s.kategori FROM sparepart s JOIN bengkel b ON b.id = s.id_bengkel
     WHERE s.aktif = 1 AND b.status = 'Aktif' ORDER BY s.kategori`
  ).all().map((r) => r.kategori);
  res.json({ items, kategori: kategoriList });
});

router.get('/kendaraan', (req, res) => {
  res.json({ items: db.prepare('SELECT * FROM kendaraan WHERE id_user = ? ORDER BY id DESC').all(req.user.id) });
});

router.post('/kendaraan', (req, res) => {
  const k = readKendaraan(req.body);
  if (db.prepare('SELECT 1 FROM kendaraan WHERE id_user = ? AND no_polisi = ?').get(req.user.id, k.no_polisi))
    throw new HttpError(409, 'No. polisi ini sudah terdaftar di akun Anda');
  db.prepare('INSERT INTO kendaraan (id_user, jenis, merk, no_polisi, tahun) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, k.jenis, k.merk, k.no_polisi, k.tahun);
  res.status(201).json({ ok: true });
});

router.delete('/kendaraan/:id', (req, res) => {
  const id = Number(req.params.id);
  const k = db.prepare('SELECT id FROM kendaraan WHERE id = ? AND id_user = ?').get(id, req.user.id);
  if (!k) throw notFound('Kendaraan tidak ditemukan');
  if (db.prepare('SELECT 1 FROM booking WHERE id_kendaraan = ?').get(id))
    throw new HttpError(409, 'Kendaraan ini memiliki riwayat booking sehingga tidak bisa dihapus');
  db.prepare('DELETE FROM kendaraan WHERE id = ?').run(id);
  res.json({ ok: true });
});

module.exports = router;
