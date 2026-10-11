const router = require('express').Router();
const db = require('../db');
const { requireRole } = require('../auth');
const { HttpError, bad, str, int, need } = require('../util');
const { notify, ownerOf } = require('../notify');

const METODE = ['Transfer Bank', 'QRIS', 'E-Wallet', 'Bayar di Tempat'];
const NEXT = { 'Diproses': 'Siap Diambil', 'Siap Diambil': 'Selesai' };

function derivedStatus(lines) {
  if (lines.every((l) => l.status === 'Selesai')) return 'Selesai';
  if (lines.every((l) => l.status === 'Diproses')) return 'Diproses';
  return 'Sebagian Siap';
}

// Customer: checkout keranjang. Stok dikurangi secara atomik di dalam satu transaksi.
router.post('/', requireRole('customer'), (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length || items.length > 30) throw bad('Keranjang kosong');
  const metode = METODE.includes(req.body?.metode) ? req.body.metode : null;
  if (!metode) throw bad('Pilih metode pembayaran');

  const merged = new Map();
  for (const it of items) {
    const id = need(int(it.id_sparepart, 1), 'Item tidak valid');
    const qty = need(int(it.qty, 1, 100), 'Jumlah tidak valid');
    merged.set(id, (merged.get(id) || 0) + qty);
  }

  const idPesanan = db.transaction(() => {
    let total = 0;
    const lines = [];
    for (const [id, qty] of merged) {
      const sp = db.prepare(
        `SELECT s.*, b.status AS bengkel_status FROM sparepart s JOIN bengkel b ON b.id = s.id_bengkel WHERE s.id = ?`
      ).get(id);
      if (!sp || !sp.aktif || sp.bengkel_status !== 'Aktif') throw bad('Ada sparepart yang sudah tidak tersedia');
      const r = db.prepare('UPDATE sparepart SET stok = stok - ? WHERE id = ? AND stok >= ?').run(qty, id, qty);
      if (!r.changes) throw new HttpError(409, `Stok "${sp.nama}" tidak mencukupi`);
      lines.push({ sp, qty });
      total += sp.harga_jual * qty;
    }
    const pid = db.prepare('INSERT INTO pesanan_sparepart (id_customer, total, metode_pembayaran) VALUES (?, ?, ?)')
      .run(req.user.id, total, metode).lastInsertRowid;
    const ins = db.prepare(
      'INSERT INTO pesanan_detail (id_pesanan, id_sparepart, id_bengkel, nama, qty, harga, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    lines.forEach(({ sp, qty }) => ins.run(pid, sp.id, sp.id_bengkel, sp.nama, qty, sp.harga_jual, sp.harga_jual * qty));
    return pid;
  })();
  const bengkelIds = db.prepare('SELECT DISTINCT id_bengkel FROM pesanan_detail WHERE id_pesanan = ?').all(idPesanan);
  bengkelIds.forEach((b) => notify(ownerOf(b.id_bengkel), 'Pesanan sparepart baru', `Pesanan #${idPesanan} dari ${req.user.nama} menunggu diproses.`, '#/mitra/pesanan'));
  res.status(201).json({ ok: true, id: idPesanan });
});

router.get('/', (req, res) => {
  const role = req.user.role;
  if (role === 'mekanik') return res.status(403).json({ error: 'Anda tidak memiliki akses ke fitur ini' });

  let headers;
  if (role === 'customer') {
    headers = db.prepare('SELECT * FROM pesanan_sparepart WHERE id_customer = ? ORDER BY id DESC LIMIT 100').all(req.user.id);
  } else if (role === 'mitra') {
    headers = db.prepare(
      `SELECT DISTINCT p.* FROM pesanan_sparepart p JOIN pesanan_detail d ON d.id_pesanan = p.id
       WHERE d.id_bengkel = ? ORDER BY p.id DESC LIMIT 100`
    ).all(req.bengkel ? req.bengkel.id : -1);
  } else {
    headers = db.prepare('SELECT * FROM pesanan_sparepart ORDER BY id DESC LIMIT 100').all();
  }

  const lineStmt = db.prepare(
    `SELECT d.id, d.nama, d.qty, d.harga, d.subtotal, d.status, d.id_bengkel, b.nama AS bengkel_nama
     FROM pesanan_detail d JOIN bengkel b ON b.id = d.id_bengkel WHERE d.id_pesanan = ?`
  );
  const custStmt = db.prepare('SELECT nama FROM users WHERE id = ?');
  const items = headers.map((h) => {
    let lines = lineStmt.all(h.id);
    if (role === 'mitra') lines = lines.filter((l) => l.id_bengkel === req.bengkel.id);
    return { ...h, customer_nama: custStmt.get(h.id_customer)?.nama, status: derivedStatus(lines), lines };
  });
  res.json({ items });
});

// Mitra: update status baris pesanan milik bengkelnya.
router.post('/detail/:id/maju', requireRole('mitra'), (req, res) => {
  const line = db.prepare('SELECT * FROM pesanan_detail WHERE id = ? AND id_bengkel = ?')
    .get(Number(req.params.id), req.bengkel ? req.bengkel.id : -1);
  if (!line) throw new HttpError(404, 'Pesanan tidak ditemukan');
  const next = NEXT[line.status];
  if (!next) throw new HttpError(409, 'Pesanan sudah selesai');
  db.prepare('UPDATE pesanan_detail SET status = ? WHERE id = ?').run(next, line.id);
  const cust = db.prepare('SELECT id_customer FROM pesanan_sparepart WHERE id = ?').get(line.id_pesanan);
  notify(cust?.id_customer, `Pesanan ${next.toLowerCase()}`, `${line.nama} (pesanan #${line.id_pesanan}): ${next}.`, '#/customer/riwayat');
  res.json({ ok: true, status: next });
});

module.exports = router;
