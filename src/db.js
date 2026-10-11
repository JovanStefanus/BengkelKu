const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'bengkelku.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Skema mengikuti ERD pada dokumentasi.
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nama TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  no_hp TEXT,
  role TEXT NOT NULL CHECK (role IN ('customer','mitra','mekanik','admin')),
  token_version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bengkel (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_pemilik INTEGER NOT NULL UNIQUE REFERENCES users(id),
  nama TEXT NOT NULL,
  alamat TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  jenis TEXT NOT NULL DEFAULT 'Motor & Mobil' CHECK (jenis IN ('Motor','Mobil','Motor & Mobil')),
  jam_operasional TEXT NOT NULL DEFAULT '08.00 - 17.00',
  status TEXT NOT NULL DEFAULT 'Menunggu Persetujuan' CHECK (status IN ('Menunggu Persetujuan','Aktif','Ditolak')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mekanik (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_user INTEGER NOT NULL UNIQUE REFERENCES users(id),
  id_bengkel INTEGER NOT NULL REFERENCES bengkel(id) ON DELETE CASCADE,
  nama TEXT NOT NULL,
  spesialisasi TEXT,
  aktif INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS kendaraan (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_user INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  jenis TEXT NOT NULL CHECK (jenis IN ('Motor','Mobil')),
  merk TEXT NOT NULL,
  no_polisi TEXT NOT NULL,
  tahun INTEGER,
  UNIQUE (id_user, no_polisi)
);

CREATE TABLE IF NOT EXISTS jenis_servis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_bengkel INTEGER NOT NULL REFERENCES bengkel(id) ON DELETE CASCADE,
  nama_servis TEXT NOT NULL,
  harga INTEGER NOT NULL CHECK (harga >= 0),
  estimasi_menit INTEGER NOT NULL DEFAULT 60,
  aktif INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS booking (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_customer INTEGER NOT NULL REFERENCES users(id),
  id_bengkel INTEGER NOT NULL REFERENCES bengkel(id),
  id_kendaraan INTEGER NOT NULL REFERENCES kendaraan(id),
  id_mekanik INTEGER REFERENCES mekanik(id),
  tanggal_booking TEXT NOT NULL,
  keluhan TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Menunggu Verifikasi'
    CHECK (status IN ('Menunggu Verifikasi','Diterima','Dikerjakan','Selesai','Ditolak','Dibatalkan')),
  jarak_km REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS booking_detail (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_booking INTEGER NOT NULL REFERENCES booking(id) ON DELETE CASCADE,
  id_servis INTEGER NOT NULL REFERENCES jenis_servis(id),
  harga INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sparepart (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_bengkel INTEGER NOT NULL REFERENCES bengkel(id) ON DELETE CASCADE,
  nama TEXT NOT NULL,
  kategori TEXT NOT NULL,
  stok INTEGER NOT NULL CHECK (stok >= 0),
  harga_jual INTEGER NOT NULL CHECK (harga_jual >= 0),
  aktif INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS pemakaian_sparepart (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_booking INTEGER NOT NULL REFERENCES booking(id) ON DELETE CASCADE,
  id_sparepart INTEGER NOT NULL REFERENCES sparepart(id),
  qty INTEGER NOT NULL CHECK (qty > 0),
  harga INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pesanan_sparepart (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_customer INTEGER NOT NULL REFERENCES users(id),
  tanggal TEXT NOT NULL DEFAULT (datetime('now')),
  total INTEGER NOT NULL,
  metode_pembayaran TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pesanan_detail (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_pesanan INTEGER NOT NULL REFERENCES pesanan_sparepart(id) ON DELETE CASCADE,
  id_sparepart INTEGER NOT NULL REFERENCES sparepart(id),
  id_bengkel INTEGER NOT NULL REFERENCES bengkel(id),
  nama TEXT NOT NULL,
  qty INTEGER NOT NULL CHECK (qty > 0),
  harga INTEGER NOT NULL,
  subtotal INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'Diproses' CHECK (status IN ('Diproses','Siap Diambil','Selesai'))
);

CREATE TABLE IF NOT EXISTS invoice (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_booking INTEGER NOT NULL UNIQUE REFERENCES booking(id) ON DELETE CASCADE,
  tanggal TEXT NOT NULL DEFAULT (datetime('now')),
  total INTEGER NOT NULL,
  status_pembayaran TEXT NOT NULL DEFAULT 'Belum Lunas' CHECK (status_pembayaran IN ('Belum Lunas','Lunas')),
  metode_pembayaran TEXT
);

CREATE TABLE IF NOT EXISTS rating (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_booking INTEGER NOT NULL UNIQUE REFERENCES booking(id) ON DELETE CASCADE,
  id_bengkel INTEGER NOT NULL REFERENCES bengkel(id) ON DELETE CASCADE,
  skor INTEGER NOT NULL CHECK (skor BETWEEN 1 AND 5),
  ulasan TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS password_reset (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_user INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifikasi (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_user INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  judul TEXT NOT NULL,
  pesan TEXT NOT NULL,
  link TEXT,
  dibaca INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notif_user ON notifikasi(id_user, dibaca, id);
CREATE INDEX IF NOT EXISTS idx_booking_bengkel ON booking(id_bengkel, status);
CREATE INDEX IF NOT EXISTS idx_booking_customer ON booking(id_customer);
CREATE INDEX IF NOT EXISTS idx_sparepart_bengkel ON sparepart(id_bengkel);
`);

// Migrasi untuk database lama (dibuat sebelum fitur sesi/reset password ada).
const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
if (!userCols.includes('token_version')) {
  db.exec('ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0');
}

module.exports = db;
