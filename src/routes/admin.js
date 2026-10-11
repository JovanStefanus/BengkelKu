const router = require('express').Router();
const db = require('../db');
const { requireRole } = require('../auth');
const { HttpError, notFound } = require('../util');
const { notify, ownerOf } = require('../notify');

router.use(requireRole('admin'));

router.get('/stats', (req, res) => {
  const one = (sql) => db.prepare(sql).get();
  res.json({
    bengkel_aktif: one("SELECT COUNT(*) AS n FROM bengkel WHERE status = 'Aktif'").n,
    bengkel_menunggu: one("SELECT COUNT(*) AS n FROM bengkel WHERE status = 'Menunggu Persetujuan'").n,
    total_customer: one("SELECT COUNT(*) AS n FROM users WHERE role = 'customer'").n,
    total_mekanik: one('SELECT COUNT(*) AS n FROM mekanik WHERE aktif = 1').n,
    total_booking: one('SELECT COUNT(*) AS n FROM booking').n,
    booking_selesai: one("SELECT COUNT(*) AS n FROM booking WHERE status = 'Selesai'").n,
    pendapatan_servis: one("SELECT COALESCE(SUM(total),0) AS t FROM invoice WHERE status_pembayaran = 'Lunas'").t,
    pendapatan_sparepart: one('SELECT COALESCE(SUM(total),0) AS t FROM pesanan_sparepart').t,
    top_bengkel: db.prepare(
      `SELECT b.id, b.nama, COUNT(bk.id) AS jml_booking, (SELECT ROUND(AVG(skor),1) FROM rating r WHERE r.id_bengkel = b.id) AS rating
       FROM bengkel b LEFT JOIN booking bk ON bk.id_bengkel = b.id WHERE b.status = 'Aktif'
       GROUP BY b.id ORDER BY jml_booking DESC LIMIT 5`
    ).all(),
  });
});

router.get('/bengkel', (req, res) => {
  res.json({
    items: db.prepare(
      `SELECT b.id, b.nama, b.alamat, b.jenis, b.status, b.created_at, u.nama AS pemilik, u.email AS pemilik_email,
              (SELECT COUNT(*) FROM mekanik m WHERE m.id_bengkel = b.id AND m.aktif = 1) AS jml_mekanik,
              (SELECT ROUND(AVG(skor),1) FROM rating r WHERE r.id_bengkel = b.id) AS rating
       FROM bengkel b JOIN users u ON u.id = b.id_pemilik
       ORDER BY CASE b.status WHEN 'Menunggu Persetujuan' THEN 0 ELSE 1 END, b.id`
    ).all(),
  });
});

function setStatus(status) {
  return (req, res) => {
    const r = db.prepare('UPDATE bengkel SET status = ? WHERE id = ?').run(status, Number(req.params.id));
    if (!r.changes) throw notFound('Bengkel tidak ditemukan');
    notify(ownerOf(Number(req.params.id)), status === 'Aktif' ? 'Bengkel disetujui' : 'Bengkel tidak disetujui',
      status === 'Aktif' ? 'Bengkel Anda kini tampil di pencarian customer.' : 'Pendaftaran/status bengkel Anda ditolak oleh Admin Platform.', '#/mitra/profil');
    res.json({ ok: true });
  };
}
router.post('/bengkel/:id/setujui', setStatus('Aktif'));
router.post('/bengkel/:id/tolak', setStatus('Ditolak'));

router.get('/pesanan-ringkas', (req, res) => {
  res.json({
    items: db.prepare(
      `SELECT p.id, p.tanggal, p.total, p.metode_pembayaran, u.nama AS customer_nama
       FROM pesanan_sparepart p JOIN users u ON u.id = p.id_customer ORDER BY p.id DESC LIMIT 50`
    ).all(),
  });
});

// Moderasi: sparepart & rating
router.get('/sparepart', (req, res) => {
  res.json({
    items: db.prepare(
      `SELECT s.id, s.nama, s.kategori, s.stok, s.harga_jual, s.aktif, b.nama AS bengkel_nama
       FROM sparepart s JOIN bengkel b ON b.id = s.id_bengkel ORDER BY s.id DESC LIMIT 100`
    ).all(),
  });
});
router.post('/sparepart/:id/toggle', (req, res) => {
  const r = db.prepare('UPDATE sparepart SET aktif = 1 - aktif WHERE id = ?').run(Number(req.params.id));
  if (!r.changes) throw notFound();
  res.json({ ok: true });
});
router.get('/rating', (req, res) => {
  res.json({
    items: db.prepare(
      `SELECT r.id, r.skor, r.ulasan, r.created_at, b.nama AS bengkel_nama, u.nama AS customer_nama
       FROM rating r JOIN bengkel b ON b.id = r.id_bengkel JOIN booking bk ON bk.id = r.id_booking JOIN users u ON u.id = bk.id_customer
       ORDER BY r.id DESC LIMIT 100`
    ).all(),
  });
});
router.delete('/rating/:id', (req, res) => {
  const r = db.prepare('DELETE FROM rating WHERE id = ?').run(Number(req.params.id));
  if (!r.changes) throw notFound();
  res.json({ ok: true });
});

router.get('/users', (req, res) => {
  res.json({ items: db.prepare('SELECT id, nama, email, role, created_at FROM users ORDER BY id DESC LIMIT 200').all() });
});

module.exports = router;
