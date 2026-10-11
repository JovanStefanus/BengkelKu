# BengkelKu — Marketplace Bengkel Motor & Mobil

Aplikasi web full-stack: pelanggan mencari bengkel dalam radius 5–10 km, booking servis, memantau progres, dan membeli sparepart di marketplace. Terdiri dari 4 peran dengan dashboard terpisah: **Customer, Mitra Bengkel, Mekanik, Admin Platform**.

**Teknologi:** Node.js (≥ 22) · Express 5 · SQLite (`better-sqlite3`) · JWT di cookie `HttpOnly` · bcrypt · Nodemailer (opsional) · frontend vanilla JS (ES modules, tanpa build step) · peta Leaflet + OpenStreetMap.

## Menjalankan di komputer sendiri

```bash
npm install
cp .env.example .env      # (Windows: copy .env.example .env)
npm start                 # buka http://localhost:3000
```

Saat database masih kosong, aplikasi otomatis membuat tabel dan mengisi **data demo** (7 bengkel di sekitar Bandung, mekanik, customer, booking, sparepart).

| Peran | Email | Password |
|---|---|---|
| Customer | budi@example.com | password123 |
| Mitra Bengkel | mitra1@example.com (Bengkel Jaya Motor) | password123 |
| Mekanik | rudi@bengkelku.id (Jaya Motor) | password123 |
| Admin Platform | admin@bengkelku.id | admin12345 |

Akun demo lain: `rina@example.com`, `sinta@example.com` (customer), `mitra2..mitra7@example.com`, mekanik `sari@`, `dedi@`, `bayu@`, `fajar@`, `nanda@`, `hendra@`, `yoga@` `bengkelku.id`. Semua password `password123`.

`npm run reset` mengosongkan database lalu mengisi ulang. `npm test` menjalankan tes integrasi API (114 pengecekan, memakai database sementara).

**Jika `npm install` gagal dengan error `node-gyp`:** pastikan Node.js ≥ 22 (`node -v`). Paket `better-sqlite3` sudah membawa binary siap pakai untuk Windows/macOS/Linux sehingga tidak perlu compiler; gunakan `npm install` (bukan `npm ci`) dan **jangan memakai `package-lock.json` hasil mesin lain** — hapus file itu lalu ulangi `npm install`.

## Login & daftar per peran

Halaman login punya 4 pilihan peran. Peran yang dipilih **dicocokkan dengan peran di database** oleh server, jadi memilih "Admin Platform" dengan akun customer akan ditolak. Setelah login, tiap peran masuk ke dashboard sendiri dan tidak bisa membuka halaman/API peran lain.

| Peran | Cara mendapat akun |
|---|---|
| Customer | Daftar sendiri |
| Mitra Bengkel | Daftar sendiri dengan data bengkel; status "Menunggu Persetujuan" sampai disetujui Admin Platform |
| Mekanik | **Dibuat oleh Mitra Bengkel** (menu Mekanik), karena mekanik terikat ke satu bengkel |
| Admin Platform | Dibuat otomatis saat database pertama kali dibuat (`ADMIN_EMAIL` / `ADMIN_PASSWORD`) |

Semua peran bisa memakai "Lupa password?" di halaman login (lewat email akun).

## Fitur pendukung

- **Peta interaktif (Cari Bengkel):** titik biru = lokasi Anda, lingkaran = radius, penanda = bengkel. **Klik peta untuk memindahkan lokasi** (berguna untuk demo tanpa GPS). Popup penanda punya tombol "Lihat & booking". Mitra Bengkel menentukan lokasi bengkelnya dengan klik/seret penanda di peta (saat daftar dan di menu Profil). Jika peta gagal dimuat, halaman tetap berfungsi dengan kolom koordinat biasa.
- **Notifikasi:** ikon 🔔 di pojok atas menampilkan jumlah yang belum dibaca. Notifikasi dibuat otomatis untuk: booking baru/diterima/ditolak/dibatalkan, servis dimulai/selesai, invoice terbit, pembayaran, rating, pesanan sparepart, pendaftaran mitra, dan persetujuan admin. Klik notifikasi untuk membuka halaman terkait.
- **Akun Saya (semua peran):** ubah nama & no. HP, ganti password. Customer juga mengelola daftar kendaraan. Mitra Bengkel bisa mereset password mekaniknya.
- **Lupa password:** halaman `#/lupa` mengirim tautan berlaku 30 menit, sekali pakai. Setelah password diganti/di-reset, semua sesi login lama otomatis berakhir.

## Alur utama

1. Customer membuka **Cari Bengkel**, lokasi diambil dari GPS browser (atau titik default Bandung), memilih radius 5/10/25 km. Server menghitung jarak dengan rumus Haversine dan mengurutkan dari yang terdekat.
2. Customer memilih bengkel dan mengirim booking (layanan, kendaraan, jadwal, keluhan). **Customer tidak memilih mekanik.**
3. Mitra Bengkel menerima booking sekaligus **menugaskan mekanik**, atau menolaknya.
4. Mekanik: Mulai kerjakan → catat sparepart yang dipakai (stok berkurang otomatis) → Tandai selesai.
5. Mitra menerbitkan invoice (jasa + sparepart). Customer membayar (simulasi) atau Mitra menandai lunas untuk pembayaran tunai. Customer memberi rating.
6. **Marketplace Sparepart:** customer mencari sparepart lintas bengkel, memasukkan ke keranjang, checkout. Stok berkurang dalam satu transaksi database; Mitra memproses pesanannya.
7. Admin Platform memverifikasi mitra baru, memantau transaksi, dan memoderasi sparepart serta ulasan.

## Struktur proyek

```
server.js              Entry point Express (header keamanan, routing, error handler)
src/db.js              Skema SQLite (sesuai ERD)
src/auth.js            JWT cookie, middleware auth & requireRole
src/seed.js            Admin awal + data demo
src/routes/            auth, customer, booking, pesanan, mitra, mekanik, admin, notifikasi
src/mailer.js          Pengiriman email (SMTP opsional)   src/notify.js  Pembuat notifikasi
public/                Frontend (index.html, css/, js/ — satu file per peran, map.js, shared.js)
public/vendor/leaflet/ Leaflet 1.9.4 (BSD-2) disalin lokal karena CSP hanya mengizinkan skrip dari server sendiri
test/                  api.test.js (alur utama & hak akses), features.test.js (reset password, profil, notifikasi)
```

## Kesesuaian dengan diagram

- **ERD → tabel:** `users`, `bengkel`, `mekanik`, `kendaraan`, `jenis_servis`, `booking`, `booking_detail`, `sparepart`, `pemakaian_sparepart`, `pesanan_sparepart`, `pesanan_detail`, `invoice`, `rating`. Tambahan dibanding diagram: kolom `aktif` (hapus = nonaktifkan agar riwayat tetap utuh), `mekanik.id_user` (akun login mekanik), dan status per baris pesanan sparepart.
- **Use case → fitur:** semua use case di diagram punya halaman dan endpoint (lihat `src/routes/*`).
- **Activity diagram:** status booking `Menunggu Verifikasi → Diterima → Dikerjakan → Selesai` (atau `Ditolak` / `Dibatalkan`); perpindahan status dijaga di server sehingga tidak bisa melompati langkah.

## Deploy ke cloud

Aplikasi ini satu proses Node.js yang berjalan terus (bukan fungsi serverless) dan menyimpan data di file SQLite. Karena itu ia cocok di platform yang menjalankan server biasa, dan **tidak cocok di Vercel** (penyimpanan file di sana tidak permanen, dan SQLite tidak didukung).

| Platform | Cocok? | Catatan (info Oktober 2026, cek ulang harga di situs masing-masing) |
|---|---|---|
| Render (Web Service) | Ya, tanpa ubah kode | Paket gratis tersedia, tetapi tidur setelah 15 menit tanpa trafik dan filesystem-nya sementara. Disk permanen hanya di paket berbayar |
| Railway | Ya | Ada masa percobaan berkredit, lalu paket gratis sangat kecil atau Hobby ± $5/bulan. Mendukung volume permanen |
| Fly.io | Ya (perlu Dockerfile) | Akun baru tidak punya paket gratis; bayar per pemakaian (mesin kecil beberapa dolar/bulan) |
| Vercel | Tidak untuk versi SQLite ini | Perlu pindah ke database server (PostgreSQL/Turso) dan memecah Express jadi fungsi serverless |

Contoh di **Render** (Web Service dari repository GitHub):

1. Push proyek ini ke GitHub (`.gitignore` sudah mengecualikan `node_modules`, `data`, `.env`).
2. Render → *New → Web Service* → pilih repo. **Build command:** `npm install` · **Start command:** `npm start`. Versi Node diambil dari file `.node-version` (22) di repo ini.
3. Environment variables:
   - `NODE_ENV=production`
   - `JWT_SECRET=` string acak panjang: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` (server **menolak start** tanpa ini di production)
   - `ADMIN_PASSWORD=` password admin yang kuat
   - `SEED_DEMO=true` untuk presentasi (data contoh), `false` untuk database bersih
   - `APP_URL=` alamat publik aplikasi (mis. `https://bengkelku.onrender.com`), dipakai untuk tautan reset password. Isi setelah deploy pertama, saat URL sudah diketahui, lalu deploy ulang
   - Opsional, agar email reset benar-benar terkirim: `SMTP_URL=` (mis. `smtps://user:password@smtp.penyedia.com:465`) dan `MAIL_FROM=`
4. Setelah deploy, buka URL dari Render dan login dengan akun demo. Endpoint `/api/health` bisa dipakai sebagai health check.

**Soal lupa password di server demo:** bila `SEED_DEMO=true` dan `SMTP_URL` kosong, tautan reset **ditampilkan langsung di layar** (karena tidak ada email), artinya siapa pun yang tahu email sebuah akun bisa me-reset passwordnya. Ini sengaja untuk keperluan demo. Untuk data nyata, isi `SMTP_URL` dan set `SEED_DEMO=false`; tautan lalu hanya dikirim ke email pemilik akun. Jika SMTP tidak diisi dan demo dimatikan, tautan hanya tercetak di log server.

**Soal peta & lokasi:** tile peta dimuat dari server publik OpenStreetMap, yang cocok untuk demo dan trafik kecil. Untuk trafik besar gunakan penyedia tile sendiri/berbayar (lihat kebijakan penggunaan tile OpenStreetMap). Tombol "Gunakan lokasi saya" butuh HTTPS (atau `localhost`); koordinat dikirim ke server Anda hanya saat mencari bengkel/booking.

**Penting soal data:** di Render paket gratis, data di file SQLite hilang setiap restart, redeploy, atau setelah layanan tidur. Dengan `SEED_DEMO=true` data demo terisi ulang otomatis, jadi untuk presentasi aman, tetapi akun atau booking baru yang dibuat selama itu ikut hilang. Buka URL-nya beberapa menit sebelum presentasi agar layanan sudah bangun. Untuk data permanen: pasang disk/volume persisten dan set `DB_PATH` ke lokasinya (mis. `/var/data/bengkelku.db`), atau pindah ke PostgreSQL.

## Keamanan yang sudah diterapkan

- Password di-hash dengan bcrypt; token sesi di cookie `HttpOnly`, `SameSite=Lax`, `Secure` di production.
- Peran dan kepemilikan data selalu dicek di server (bukan dari klien): mitra hanya bisa mengakses bengkelnya, mekanik hanya tugasnya, customer hanya datanya.
- Query SQL memakai prepared statement; seluruh teks dinamis di frontend di-escape (anti-XSS); header CSP aktif.
- Request yang mengubah data wajib `Content-Type: application/json` (tambahan proteksi CSRF).
- Pembatasan percobaan login per IP+email (10 kali / 15 menit; ubah dengan `LOGIN_RATE_MAX`) dan permintaan lupa-password (5 kali / 15 menit per email).
- Token reset berukuran 256-bit, disimpan hanya sebagai hash, kedaluwarsa 30 menit, sekali pakai, dan ditaruh di fragmen URL (`#`) agar tidak masuk log server. Respons "lupa password" sama untuk email terdaftar maupun tidak (mencegah penebakan akun).
- Ganti/reset password membatalkan semua sesi login lama (`token_version`).
- Stok dikurangi dengan `UPDATE ... WHERE stok >= qty` di dalam transaksi, sehingga tidak bisa minus walau ada dua pembeli bersamaan.

## Batasan & pengembangan lanjutan

- Jarak = garis lurus (Haversine), bukan jarak tempuh jalan. Belum ada pencarian alamat (geocoding) di peta; lokasi dipilih lewat klik peta, GPS, atau koordinat.
- Pembayaran masih simulasi (belum terhubung payment gateway seperti Midtrans/Xendit).
- Email akun tidak bisa diubah dan belum diverifikasi saat daftar. Notifikasi hanya di dalam aplikasi (belum lewat email/WhatsApp/push). Belum ada upload foto bengkel/sparepart.
- Belum ada komisi platform; belum ada migrasi database terversi.
- Frontend sudah diuji lewat browser tiruan (jsdom), tetapi tampilan visual (CSS/responsif) sebaiknya Anda cek langsung di browser dan di ponsel.
