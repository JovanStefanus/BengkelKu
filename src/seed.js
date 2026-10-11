const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('./db');

const DEMO_PASSWORD = 'password123';
const hash = (p) => bcrypt.hashSync(p, 10);

function seedAdmin() {
  const email = process.env.ADMIN_EMAIL || 'admin@bengkelku.id';
  let password = process.env.ADMIN_PASSWORD;
  if (!password) {
    if (process.env.NODE_ENV === 'production' && process.env.SEED_DEMO === 'false') {
      password = crypto.randomBytes(9).toString('base64url');
      console.log(`[seed] ADMIN_PASSWORD tidak diatur. Password admin sementara: ${password}`);
    } else {
      password = 'admin12345';
    }
  }
  db.prepare("INSERT INTO users (nama, email, password_hash, role) VALUES ('Admin Platform', ?, ?, 'admin')").run(email, hash(password));
}

function seedDemo() {
  // Semua akun demo memakai password yang sama, jadi cukup di-hash sekali (bcrypt sengaja lambat;
  // di-hash 20 kali membuat start lama di server dengan CPU kecil). Hanya untuk akun demo.
  const demoHash = hash(DEMO_PASSWORD);
  const user = (nama, email, role, hp) =>
    db.prepare('INSERT INTO users (nama, email, password_hash, no_hp, role) VALUES (?, ?, ?, ?, ?)')
      .run(nama, email, demoHash, hp || null, role).lastInsertRowid;

  const customers = {
    budi: user('Budi Santoso', 'budi@example.com', 'customer', '081234567801'),
    rina: user('Rina Wijaya', 'rina@example.com', 'customer', '081234567802'),
    sinta: user('Sinta Dewi', 'sinta@example.com', 'customer', '081234567803'),
  };
  const kend = (u, jenis, merk, nopol, tahun) =>
    db.prepare('INSERT INTO kendaraan (id_user, jenis, merk, no_polisi, tahun) VALUES (?, ?, ?, ?, ?)').run(u, jenis, merk, nopol, tahun).lastInsertRowid;
  const k = {
    vario: kend(customers.budi, 'Motor', 'Honda Vario 150', 'D 3311 XYZ', 2021),
    nmax: kend(customers.budi, 'Motor', 'Yamaha NMAX', 'D 5541 AB', 2022),
    avanza: kend(customers.rina, 'Mobil', 'Toyota Avanza', 'D 8821 KL', 2019),
    brio: kend(customers.sinta, 'Mobil', 'Honda Brio', 'D 1234 ST', 2020),
  };

  // Koordinat di sekitar pusat Kota Bandung (-6.9175, 107.6191)
  const data = [
    { key: 'jaya', nama: 'Bengkel Jaya Motor', alamat: 'Jl. Surapati No. 21, Bandung', lat: -6.9010, lng: 107.6340, jenis: 'Motor & Mobil', status: 'Aktif', owner: ['Pak Hadi', 'mitra1@example.com'],
      mekanik: [['Rudi', 'rudi@bengkelku.id', 'Mesin & servis rutin'], ['Agus', 'agus@bengkelku.id', 'Kelistrikan']],
      servis: [['Servis Rutin', 120000, 60], ['Ganti Oli', 85000, 30], ['Perbaikan Rem', 150000, 90]],
      sparepart: [['Oli Mesin 1L', 'Cairan', 24, 65000], ['Kampas Rem Depan', 'Rem', 12, 85000], ['Busi Standar', 'Mesin', 40, 25000]] },
    { key: 'otoklik', nama: 'Otoklik Service Center', alamat: 'Jl. Ir. H. Juanda (Dago) No. 88, Bandung', lat: -6.8850, lng: 107.6130, jenis: 'Mobil', status: 'Aktif', owner: ['Bu Lestari', 'mitra2@example.com'],
      mekanik: [['Sari', 'sari@bengkelku.id', 'Rem & suspensi'], ['Dedi', 'dedi@bengkelku.id', 'AC & kelistrikan']],
      servis: [['Servis Berkala', 250000, 120], ['Ganti Aki', 480000, 45], ['Spooring & Balancing', 180000, 60]],
      sparepart: [['Aki Kering 45Ah', 'Kelistrikan', 6, 450000], ['Filter Udara Mobil', 'Mesin', 15, 75000], ['Kampas Rem Mobil', 'Rem', 10, 220000]] },
    { key: 'makmur', nama: 'Bengkel Makmur Jaya', alamat: 'Jl. Buah Batu No. 140, Bandung', lat: -6.9560, lng: 107.6350, jenis: 'Motor', status: 'Aktif', owner: ['Pak Slamet', 'mitra3@example.com'],
      mekanik: [['Bayu', 'bayu@bengkelku.id', 'Motor matic']],
      servis: [['Servis Rutin', 100000, 60], ['Ganti Ban', 180000, 45]],
      sparepart: [['Ban Luar Motor', 'Ban', 20, 210000], ['Busi Racing', 'Mesin', 30, 35000]] },
    { key: 'speed', nama: 'Speed Garage', alamat: 'Jl. Setiabudi No. 55, Bandung', lat: -6.8600, lng: 107.5950, jenis: 'Motor & Mobil', status: 'Aktif', owner: ['Pak Dimas', 'mitra4@example.com'],
      mekanik: [['Fajar', 'fajar@bengkelku.id', 'Tune up'], ['Nanda', 'nanda@bengkelku.id', 'Mesin']],
      servis: [['Tune Up', 200000, 90], ['Servis Rem', 140000, 60]],
      sparepart: [['Minyak Rem DOT4', 'Cairan', 18, 45000], ['Oli Mesin 1L', 'Cairan', 8, 70000]] },
    { key: 'cahaya', nama: 'Bengkel Cahaya Baru', alamat: 'Jl. Raya Cimahi No. 12, Cimahi', lat: -6.8700, lng: 107.5300, jenis: 'Mobil', status: 'Aktif', owner: ['Pak Anton', 'mitra5@example.com'],
      mekanik: [['Hendra', 'hendra@bengkelku.id', 'AC mobil']],
      servis: [['Servis AC Mobil', 220000, 90]],
      sparepart: [['Freon AC Mobil', 'Cairan', 10, 120000]] },
    { key: 'rejeki', nama: 'Bengkel Sumber Rejeki', alamat: 'Jl. Antapani Lama No. 7, Bandung', lat: -6.9120, lng: 107.6600, jenis: 'Motor', status: 'Menunggu Persetujuan', owner: ['Pak Joko', 'mitra6@example.com'],
      mekanik: [], servis: [['Servis Rutin', 90000, 60]], sparepart: [['Oli Gardan', 'Cairan', 14, 25000]] },
    { key: 'sinar', nama: 'Bengkel Sinar Terang', alamat: 'Jl. A.H. Nasution No. 30, Cibiru, Bandung', lat: -6.9150, lng: 107.7000, jenis: 'Motor & Mobil', status: 'Aktif', owner: ['Pak Wawan', 'mitra7@example.com'],
      mekanik: [['Yoga', 'yoga@bengkelku.id', 'Servis umum']],
      servis: [['Servis Rutin', 110000, 60], ['Ganti Oli', 80000, 30]],
      sparepart: [['Filter Oli', 'Mesin', 25, 40000], ['Rantai Motor', 'Motor', 9, 150000]] },
  ];

  const B = {};
  for (const d of data) {
    const uid = user(d.owner[0], d.owner[1], 'mitra');
    const id = db.prepare('INSERT INTO bengkel (id_pemilik, nama, alamat, lat, lng, jenis, status) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(uid, d.nama, d.alamat, d.lat, d.lng, d.jenis, d.status).lastInsertRowid;
    B[d.key] = { id, mekanik: {}, servis: [], sparepart: [] };
    for (const [n, email, spes] of d.mekanik) {
      const mu = user(n, email, 'mekanik');
      B[d.key].mekanik[n] = db.prepare('INSERT INTO mekanik (id_user, id_bengkel, nama, spesialisasi) VALUES (?, ?, ?, ?)').run(mu, id, n, spes).lastInsertRowid;
    }
    for (const [n, h, e] of d.servis)
      B[d.key].servis.push({ id: db.prepare('INSERT INTO jenis_servis (id_bengkel, nama_servis, harga, estimasi_menit) VALUES (?, ?, ?, ?)').run(id, n, h, e).lastInsertRowid, harga: h });
    for (const [n, kat, stok, h] of d.sparepart)
      B[d.key].sparepart.push({ id: db.prepare('INSERT INTO sparepart (id_bengkel, nama, kategori, stok, harga_jual) VALUES (?, ?, ?, ?, ?)').run(id, n, kat, stok, h).lastInsertRowid, harga: h });
  }

  // Booking: riwayat selesai (dengan invoice & rating) + yang sedang berjalan
  const iso = (daysFromNow, hh = 9) => { const d = new Date(Date.now() + daysFromNow * 864e5); d.setHours(hh, 0, 0, 0); return d.toISOString(); };
  function booking({ cust, bk, kend: kv, mek, servisIdx, status, keluhan, hari, jarak, parts = [], invoice, rating }) {
    const bg = B[bk];
    const bid = db.prepare('INSERT INTO booking (id_customer, id_bengkel, id_kendaraan, id_mekanik, tanggal_booking, keluhan, status, jarak_km) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(cust, bg.id, kv, mek ? bg.mekanik[mek] : null, iso(hari), keluhan, status, jarak).lastInsertRowid;
    let total = 0;
    for (const i of servisIdx) { const s = bg.servis[i]; db.prepare('INSERT INTO booking_detail (id_booking, id_servis, harga) VALUES (?, ?, ?)').run(bid, s.id, s.harga); total += s.harga; }
    for (const [pi, qty] of parts) { const p = bg.sparepart[pi]; db.prepare('INSERT INTO pemakaian_sparepart (id_booking, id_sparepart, qty, harga) VALUES (?, ?, ?, ?)').run(bid, p.id, qty, p.harga); total += p.harga * qty; }
    if (invoice) db.prepare('INSERT INTO invoice (id_booking, total, status_pembayaran, metode_pembayaran) VALUES (?, ?, ?, ?)').run(bid, total, invoice, invoice === 'Lunas' ? 'QRIS' : null);
    if (rating) db.prepare('INSERT INTO rating (id_booking, id_bengkel, skor, ulasan) VALUES (?, ?, ?, ?)').run(bid, bg.id, rating[0], rating[1]);
  }
  const C = customers;
  booking({ cust: C.budi, bk: 'jaya', kend: k.vario, mek: 'Rudi', servisIdx: [0, 1], status: 'Selesai', keluhan: 'Servis rutin + ganti oli', hari: -20, jarak: 2.4, parts: [[0, 1]], invoice: 'Lunas', rating: [5, 'Pengerjaan cepat dan rapi.'] });
  booking({ cust: C.rina, bk: 'jaya', kend: k.avanza, mek: 'Agus', servisIdx: [2], status: 'Selesai', keluhan: 'Rem bunyi', hari: -12, jarak: 3.1, parts: [[1, 1]], invoice: 'Lunas', rating: [4, 'Harga wajar.'] });
  booking({ cust: C.sinta, bk: 'otoklik', kend: k.brio, mek: 'Sari', servisIdx: [0], status: 'Selesai', keluhan: 'Servis 40.000 km', hari: -9, jarak: 4.0, invoice: 'Lunas', rating: [5, 'Mekanik ramah dan menjelaskan dengan jelas.'] });
  booking({ cust: C.budi, bk: 'makmur', kend: k.nmax, mek: 'Bayu', servisIdx: [0], status: 'Selesai', keluhan: 'Servis rutin', hari: -6, jarak: 4.7, invoice: 'Lunas', rating: [4, 'Antre sebentar tapi hasil bagus.'] });
  booking({ cust: C.rina, bk: 'speed', kend: k.avanza, mek: 'Fajar', servisIdx: [0], status: 'Selesai', keluhan: 'Tune up', hari: -4, jarak: 6.9, invoice: 'Lunas', rating: [4, 'Mesin jadi halus.'] });
  booking({ cust: C.sinta, bk: 'sinar', kend: k.brio, mek: 'Yoga', servisIdx: [1], status: 'Selesai', keluhan: 'Ganti oli', hari: -3, jarak: 8.9, invoice: 'Belum Lunas', rating: [5, 'Mantap.'] });
  booking({ cust: C.rina, bk: 'otoklik', kend: k.avanza, mek: 'Sari', servisIdx: [0], status: 'Dikerjakan', keluhan: 'Rem depan bunyi', hari: 0, jarak: 3.8 });
  booking({ cust: C.budi, bk: 'jaya', kend: k.nmax, mek: null, servisIdx: [1], status: 'Menunggu Verifikasi', keluhan: 'Ganti oli + cek aki', hari: 1, jarak: 2.4 });
  booking({ cust: C.sinta, bk: 'jaya', kend: k.brio, mek: 'Rudi', servisIdx: [0], status: 'Diterima', keluhan: 'Servis berkala', hari: 2, jarak: 2.6 });

  // Satu pesanan sparepart contoh
  const pid = db.prepare("INSERT INTO pesanan_sparepart (id_customer, total, metode_pembayaran) VALUES (?, ?, 'QRIS')").run(C.budi, 85000).lastInsertRowid;
  const sp = B.jaya.sparepart[1];
  db.prepare('INSERT INTO pesanan_detail (id_pesanan, id_sparepart, id_bengkel, nama, qty, harga, subtotal) VALUES (?, ?, ?, ?, 1, ?, ?)')
    .run(pid, sp.id, B.jaya.id, 'Kampas Rem Depan', sp.harga, sp.harga);
}

function seedIfEmpty() {
  if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0) return;
  db.transaction(() => {
    seedAdmin();
    if (process.env.SEED_DEMO !== 'false') seedDemo();
  })();
  console.log(`[seed] Database diisi${process.env.SEED_DEMO !== 'false' ? ' (dengan data demo)' : ''}.`);
}

function reset() {
  db.pragma('foreign_keys = OFF');
  for (const t of ['notifikasi', 'password_reset', 'rating', 'invoice', 'pesanan_detail', 'pesanan_sparepart', 'pemakaian_sparepart', 'booking_detail', 'booking',
    'sparepart', 'jenis_servis', 'kendaraan', 'mekanik', 'bengkel', 'users']) db.exec(`DELETE FROM ${t}`);
  db.exec("DELETE FROM sqlite_sequence");
  db.pragma('foreign_keys = ON');
  seedIfEmpty();
}

module.exports = { seedIfEmpty, reset, DEMO_PASSWORD };

if (require.main === module) {
  const fs = require('fs'), path = require('path');
  if (fs.existsSync(path.join(__dirname, '..', '.env')) && process.loadEnvFile) process.loadEnvFile(path.join(__dirname, '..', '.env'));
  if (process.argv.includes('--reset')) { reset(); console.log('Database di-reset.'); } else seedIfEmpty();
}
