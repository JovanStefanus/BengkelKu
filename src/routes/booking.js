const router = require('express').Router();
const db = require('../db');
const { requireRole } = require('../auth');
const { HttpError, bad, notFound, str, int, num, need, round1, haversine } = require('../util');
const { readKendaraan } = require('../vehicle');
const { notify, ownerOf, mekanikUser } = require('../notify');

const BOOKING_SQL = `
SELECT bk.id, bk.tanggal_booking, bk.keluhan, bk.status, bk.jarak_km, bk.created_at,
       bk.id_bengkel, b.nama AS bengkel_nama, b.alamat AS bengkel_alamat,
       bk.id_customer, u.nama AS customer_nama, u.no_hp AS customer_hp,
       k.jenis AS kendaraan_jenis, k.merk AS kendaraan_merk, k.no_polisi AS kendaraan_nopol,
       bk.id_mekanik, m.nama AS mekanik_nama,
       i.id AS invoice_id, i.total AS invoice_total, i.status_pembayaran AS invoice_status, i.metode_pembayaran AS invoice_metode,
       r.skor AS rating_skor, r.ulasan AS rating_ulasan
FROM booking bk
JOIN bengkel b ON b.id = bk.id_bengkel
JOIN users u ON u.id = bk.id_customer
JOIN kendaraan k ON k.id = bk.id_kendaraan
LEFT JOIN mekanik m ON m.id = bk.id_mekanik
LEFT JOIN invoice i ON i.id_booking = bk.id
LEFT JOIN rating r ON r.id_booking = bk.id`;

function hydrate(rows) {
  const layanan = db.prepare(
    `SELECT js.nama_servis, bd.harga FROM booking_detail bd JOIN jenis_servis js ON js.id = bd.id_servis WHERE bd.id_booking = ?`
  );
  const parts = db.prepare(
    `SELECT sp.nama, ps.qty, ps.harga FROM pemakaian_sparepart ps JOIN sparepart sp ON sp.id = ps.id_sparepart WHERE ps.id_booking = ?`
  );
  return rows.map((r) => ({ ...r, layanan: layanan.all(r.id), sparepart: parts.all(r.id) }));
}

// Filter data berdasarkan peran: tiap peran hanya melihat miliknya.
function scope(req) {
  switch (req.user.role) {
    case 'customer': return { where: 'bk.id_customer = ?', arg: req.user.id };
    case 'mitra': return { where: 'bk.id_bengkel = ?', arg: req.bengkel ? req.bengkel.id : -1 };
    case 'mekanik': return { where: 'bk.id_mekanik = ?', arg: req.mekanik.id };
    default: return { where: '1 = 1', arg: null };
  }
}

function getOwned(req, id) {
  const { where, arg } = scope(req);
  const sql = `${BOOKING_SQL} WHERE bk.id = ? AND ${where}`;
  const row = arg === null ? db.prepare(sql).get(id) : db.prepare(sql).get(id, arg);
  if (!row) throw notFound('Booking tidak ditemukan');
  return row;
}

router.get('/', (req, res) => {
  const { where, arg } = scope(req);
  const sql = `${BOOKING_SQL} WHERE ${where} ORDER BY bk.id DESC LIMIT 300`;
  const rows = arg === null ? db.prepare(sql).all() : db.prepare(sql).all(arg);
  res.json({ items: hydrate(rows) });
});

// Transisi status atomik: hanya berhasil jika status sekarang sesuai.
function transition(id, from, to, extra = '', args = []) {
  const r = db.prepare(`UPDATE booking SET status = ?${extra} WHERE id = ? AND status = ?`).run(to, ...args, id, from);
  if (r.changes === 0) throw new HttpError(409, `Status booking harus "${from}" untuk aksi ini`);
}
const done = (req, res) => res.json({ ok: true, item: hydrate([getOwned(req, Number(req.params.id))])[0] });

// ---- Customer ----
router.post('/', requireRole('customer'), (req, res) => {
  const b = req.body || {};
  const bengkel = db.prepare("SELECT * FROM bengkel WHERE id = ? AND status = 'Aktif'").get(int(b.id_bengkel, 1));
  if (!bengkel) throw notFound('Bengkel tidak ditemukan atau belum aktif');

  const ids = Array.isArray(b.id_servis) ? [...new Set(b.id_servis.map((x) => int(x, 1)))] : [];
  if (!ids.length || ids.length > 10 || ids.includes(null)) throw bad('Pilih minimal satu layanan');
  const servis = ids.map((id) => {
    const s = db.prepare('SELECT * FROM jenis_servis WHERE id = ? AND id_bengkel = ? AND aktif = 1').get(id, bengkel.id);
    if (!s) throw bad('Layanan tidak tersedia di bengkel ini');
    return s;
  });

  const tgl = new Date(b.tanggal);
  if (Number.isNaN(tgl.getTime())) throw bad('Jadwal tidak valid');
  if (tgl.getTime() < Date.now() - 5 * 60 * 1000) throw bad('Jadwal tidak boleh di masa lalu');
  if (tgl.getTime() > Date.now() + 365 * 24 * 3600 * 1000) throw bad('Jadwal terlalu jauh');
  const keluhan = need(str(b.keluhan, { min: 3, max: 500 }), 'Keluhan wajib diisi (3-500 karakter)');

  const lat = num(b.lat, -90, 90), lng = num(b.lng, -180, 180);
  const jarak = lat !== null && lng !== null ? round1(haversine(lat, lng, bengkel.lat, bengkel.lng)) : null;

  const id = db.transaction(() => {
    let kend;
    if (int(b.id_kendaraan, 1)) {
      kend = db.prepare('SELECT * FROM kendaraan WHERE id = ? AND id_user = ?').get(int(b.id_kendaraan, 1), req.user.id);
      if (!kend) throw notFound('Kendaraan tidak ditemukan');
    } else {
      const k = readKendaraan(b.kendaraan);
      kend = db.prepare('SELECT * FROM kendaraan WHERE id_user = ? AND no_polisi = ?').get(req.user.id, k.no_polisi);
      if (!kend) {
        const kid = db.prepare('INSERT INTO kendaraan (id_user, jenis, merk, no_polisi, tahun) VALUES (?, ?, ?, ?, ?)')
          .run(req.user.id, k.jenis, k.merk, k.no_polisi, k.tahun).lastInsertRowid;
        kend = db.prepare('SELECT * FROM kendaraan WHERE id = ?').get(kid);
      }
    }
    if (bengkel.jenis !== 'Motor & Mobil' && bengkel.jenis !== kend.jenis)
      throw bad(`Bengkel ini hanya melayani ${bengkel.jenis.toLowerCase()}`);

    const bid = db.prepare(
      `INSERT INTO booking (id_customer, id_bengkel, id_kendaraan, tanggal_booking, keluhan, jarak_km) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(req.user.id, bengkel.id, kend.id, b.tanggal, keluhan, jarak).lastInsertRowid;
    const ins = db.prepare('INSERT INTO booking_detail (id_booking, id_servis, harga) VALUES (?, ?, ?)');
    servis.forEach((s) => ins.run(bid, s.id, s.harga));
    return bid;
  })();
  notify(bengkel.id_pemilik, 'Booking baru', `${req.user.nama} · ${servis.map((x) => x.nama_servis).join(', ')}`, '#/mitra/booking');
  req.params.id = id;
  res.status(201);
  done(req, res);
});

router.post('/:id/batal', requireRole('customer'), (req, res) => {
  const id = Number(req.params.id); const bk = getOwned(req, id);
  transition(id, 'Menunggu Verifikasi', 'Dibatalkan');
  notify(ownerOf(bk.id_bengkel), 'Booking dibatalkan', `Booking #${id} dari ${bk.customer_nama} dibatalkan customer.`, '#/mitra/booking');
  done(req, res);
});

router.post('/:id/bayar', requireRole('customer'), (req, res) => {
  const id = Number(req.params.id); const bk = getOwned(req, id);
  const metode = ['Transfer Bank', 'QRIS', 'E-Wallet'].includes(req.body?.metode) ? req.body.metode : null;
  if (!metode) throw bad('Pilih metode pembayaran');
  const r = db.prepare("UPDATE invoice SET status_pembayaran = 'Lunas', metode_pembayaran = ? WHERE id_booking = ? AND status_pembayaran = 'Belum Lunas'").run(metode, id);
  if (!r.changes) throw new HttpError(409, 'Tidak ada tagihan yang perlu dibayar');
  notify(ownerOf(bk.id_bengkel), 'Pembayaran diterima', `Invoice booking #${id} dibayar via ${metode}.`, '#/mitra/booking');
  done(req, res);
});

router.post('/:id/rating', requireRole('customer'), (req, res) => {
  const id = Number(req.params.id); const bk = getOwned(req, id);
  if (bk.status !== 'Selesai') throw new HttpError(409, 'Rating hanya bisa diberikan setelah servis selesai');
  const skor = need(int(req.body?.skor, 1, 5), 'Skor harus 1-5');
  const ulasan = req.body?.ulasan ? need(str(req.body.ulasan, { max: 300 }), 'Ulasan maksimal 300 karakter') : null;
  try {
    db.prepare('INSERT INTO rating (id_booking, id_bengkel, skor, ulasan) VALUES (?, ?, ?, ?)').run(id, bk.id_bengkel, skor, ulasan);
  } catch (e) {
    if (String(e.code).startsWith('SQLITE_CONSTRAINT')) throw new HttpError(409, 'Booking ini sudah diberi rating');
    throw e;
  }
  notify(ownerOf(bk.id_bengkel), 'Rating baru', `Booking #${id} diberi ${skor} bintang oleh ${bk.customer_nama}.`, '#/mitra/booking');
  done(req, res);
});

// ---- Mitra Bengkel ----
router.post('/:id/terima', requireRole('mitra'), (req, res) => {
  const id = Number(req.params.id); getOwned(req, id);
  const idMek = need(int(req.body?.id_mekanik, 1), 'Pilih mekanik yang menangani');
  const mek = db.prepare('SELECT id, nama, id_user FROM mekanik WHERE id = ? AND id_bengkel = ? AND aktif = 1').get(idMek, req.bengkel.id);
  if (!mek) throw bad('Mekanik tidak valid untuk bengkel Anda');
  const bk = getOwned(req, id);
  transition(id, 'Menunggu Verifikasi', 'Diterima', ', id_mekanik = ?', [mek.id]);
  notify(bk.id_customer, 'Booking diterima', `${bk.bengkel_nama} menerima booking #${id}. Mekanik: ${mek.nama}.`, '#/customer/riwayat');
  notify(mek.id_user, 'Tugas baru', `Booking #${id} · ${bk.kendaraan_merk} (${bk.kendaraan_nopol}) ditugaskan kepada Anda.`, '#/mekanik/tugas');
  done(req, res);
});

router.post('/:id/tolak', requireRole('mitra'), (req, res) => {
  const id = Number(req.params.id); const bk = getOwned(req, id);
  transition(id, 'Menunggu Verifikasi', 'Ditolak');
  notify(bk.id_customer, 'Booking ditolak', `${bk.bengkel_nama} tidak dapat menerima booking #${id}. Silakan pilih bengkel lain.`, '#/customer/cari');
  done(req, res);
});

router.post('/:id/invoice', requireRole('mitra'), (req, res) => {
  const id = Number(req.params.id); const bk = getOwned(req, id);
  if (bk.status !== 'Selesai') throw new HttpError(409, 'Invoice hanya bisa dibuat setelah servis selesai');
  if (bk.invoice_id) throw new HttpError(409, 'Invoice sudah dibuat');
  const jasa = db.prepare('SELECT COALESCE(SUM(harga), 0) AS t FROM booking_detail WHERE id_booking = ?').get(id).t;
  const part = db.prepare('SELECT COALESCE(SUM(qty * harga), 0) AS t FROM pemakaian_sparepart WHERE id_booking = ?').get(id).t;
  db.prepare('INSERT INTO invoice (id_booking, total) VALUES (?, ?)').run(id, jasa + part);
  notify(bk.id_customer, 'Invoice tersedia', `Tagihan booking #${id} sebesar Rp ${(jasa + part).toLocaleString('id-ID')} siap dibayar.`, '#/customer/riwayat');
  done(req, res);
});

router.post('/:id/tandai-lunas', requireRole('mitra'), (req, res) => {
  const id = Number(req.params.id); const bk = getOwned(req, id);
  const r = db.prepare("UPDATE invoice SET status_pembayaran = 'Lunas', metode_pembayaran = 'Tunai' WHERE id_booking = ? AND status_pembayaran = 'Belum Lunas'").run(id);
  if (!r.changes) throw new HttpError(409, 'Tidak ada tagihan yang perlu dilunasi');
  notify(bk.id_customer, 'Pembayaran dicatat', `Invoice booking #${id} ditandai lunas (tunai).`, '#/customer/riwayat');
  done(req, res);
});

// ---- Mekanik ----
router.post('/:id/mulai', requireRole('mekanik'), (req, res) => {
  const id = Number(req.params.id); const bk = getOwned(req, id);
  transition(id, 'Diterima', 'Dikerjakan');
  notify(bk.id_customer, 'Servis dimulai', `Kendaraan ${bk.kendaraan_merk} (${bk.kendaraan_nopol}) mulai dikerjakan di ${bk.bengkel_nama}.`, '#/customer/riwayat');
  done(req, res);
});

router.post('/:id/sparepart', requireRole('mekanik'), (req, res) => {
  const id = Number(req.params.id); const bk = getOwned(req, id);
  if (bk.status !== 'Dikerjakan') throw new HttpError(409, 'Sparepart hanya bisa dicatat saat servis dikerjakan');
  const idSp = need(int(req.body?.id_sparepart, 1), 'Pilih sparepart');
  const qty = need(int(req.body?.qty ?? 1, 1, 100), 'Jumlah harus 1-100');
  db.transaction(() => {
    const sp = db.prepare('SELECT * FROM sparepart WHERE id = ? AND id_bengkel = ? AND aktif = 1').get(idSp, bk.id_bengkel);
    if (!sp) throw bad('Sparepart tidak tersedia di bengkel ini');
    const r = db.prepare('UPDATE sparepart SET stok = stok - ? WHERE id = ? AND stok >= ?').run(qty, sp.id, qty);
    if (!r.changes) throw new HttpError(409, `Stok ${sp.nama} tidak cukup`);
    db.prepare('INSERT INTO pemakaian_sparepart (id_booking, id_sparepart, qty, harga) VALUES (?, ?, ?, ?)').run(id, sp.id, qty, sp.harga_jual);
  })();
  done(req, res);
});

router.post('/:id/selesai', requireRole('mekanik'), (req, res) => {
  const id = Number(req.params.id); const bk = getOwned(req, id);
  transition(id, 'Dikerjakan', 'Selesai');
  notify(bk.id_customer, 'Servis selesai', `Servis ${bk.kendaraan_merk} (${bk.kendaraan_nopol}) selesai. Invoice akan segera diterbitkan bengkel.`, '#/customer/riwayat');
  notify(ownerOf(bk.id_bengkel), 'Servis selesai', `Booking #${id} selesai dikerjakan ${req.mekanik.nama}. Silakan terbitkan invoice.`, '#/mitra/booking');
  done(req, res);
});

module.exports = router;
