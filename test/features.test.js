// Tes fitur: reset password, profil, kendaraan, notifikasi, sesi. Jalankan: node test/features.test.js
const os = require('os'), path = require('path'), fs = require('fs');
process.env.DB_PATH = path.join(os.tmpdir(), `bengkelku-feat-${Date.now()}.db`);
process.env.LOGIN_RATE_MAX = '1000';
process.env.APP_URL = 'https://bengkelku.example';
delete process.env.NODE_ENV;

const app = require('../server');
const db = require('../src/db');
const mailer = require('../src/mailer');
let passed = 0, failed = 0;
const check = (n, c, x = '') => (c ? (passed++, console.log('  ok  -', n)) : (failed++, console.log('  GAGAL -', n, x)));

function session(base) {
  let cookie = '';
  const call = async (method, url, body) => {
    const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, body: method === 'GET' ? undefined : JSON.stringify(body ?? {}) });
    const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    let data = null; try { data = await res.json(); } catch {}
    return { status: res.status, data };
  };
  return { get: (u) => call('GET', u), post: (u, b) => call('POST', u, b), put: (u, b) => call('PUT', u, b), del: (u) => call('DELETE', u) };
}

(async () => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = async (email, role, password = 'password123') => { const s = session(base); const r = await s.post('/api/auth/login', { email, password, role }); return { s, r }; };
  const emails = []; mailer.setTransport({ sendMail: async (m) => { emails.push(m); } });

  console.log('Lupa & reset password');
  const anon = session(base);
  const unknown = await anon.post('/api/auth/lupa-password', { email: 'tidakada@example.com' });
  check('email tidak terdaftar -> respons generik, tanpa token', unknown.status === 200 && !unknown.data.dev_token && /Jika email terdaftar/.test(unknown.data.message));
  check('format email salah -> 400', (await anon.post('/api/auth/lupa-password', { email: 'bukan-email' })).status === 400);

  const sesiLama = (await login('rina@example.com', 'customer')).s;
  const req1 = await anon.post('/api/auth/lupa-password', { email: 'rina@example.com' });
  check('email terdaftar -> respons sama + token (mode demo)', req1.status === 200 && req1.data.message === unknown.data.message && /^[a-f0-9]{64}$/.test(req1.data.dev_token));
  check('email dikirim berisi tautan reset (fragmen #, APP_URL)', emails.length === 1 && emails[0].to === 'rina@example.com' && emails[0].text.includes(`https://bengkelku.example/#/reset/${req1.data.dev_token}`));
  const tokenRow = db.prepare('SELECT * FROM password_reset').get();
  check('token disimpan sebagai hash (bukan teks asli)', tokenRow && tokenRow.token_hash !== req1.data.dev_token && tokenRow.token_hash.length === 64);

  check('token ngawur -> 400', (await anon.post('/api/auth/reset-password', { token: 'a'.repeat(64), password: 'passwordBaru1' })).status === 400);
  check('password baru terlalu pendek -> 400', (await anon.post('/api/auth/reset-password', { token: req1.data.dev_token, password: '123' })).status === 400);
  check('reset berhasil', (await anon.post('/api/auth/reset-password', { token: req1.data.dev_token, password: 'passwordBaru1' })).status === 200);
  check('token tidak bisa dipakai dua kali', (await anon.post('/api/auth/reset-password', { token: req1.data.dev_token, password: 'passwordLain2' })).status === 400);
  check('password lama tidak berlaku lagi', (await login('rina@example.com', 'customer')).r.status === 401);
  check('password baru berlaku', (await login('rina@example.com', 'customer', 'passwordBaru1')).r.status === 200);
  check('sesi lama otomatis tidak berlaku setelah reset', (await sesiLama.get('/api/auth/me')).status === 401);

  const req2 = await anon.post('/api/auth/lupa-password', { email: 'sinta@example.com' });
  db.prepare('UPDATE password_reset SET expires_at = ?').run(Date.now() - 1000);
  check('token kedaluwarsa -> 400', (await anon.post('/api/auth/reset-password', { token: req2.data.dev_token, password: 'passwordBaru1' })).status === 400);
  const r3 = await anon.post('/api/auth/lupa-password', { email: 'sinta@example.com' });
  const r4 = await anon.post('/api/auth/lupa-password', { email: 'sinta@example.com' });
  check('permintaan baru membatalkan token sebelumnya', (await anon.post('/api/auth/reset-password', { token: r3.data.dev_token, password: 'passwordBaru1' })).status === 400
    && (await anon.post('/api/auth/reset-password', { token: r4.data.dev_token, password: 'passwordBaru1' })).status === 200);

  console.log('Profil & ganti password');
  const budi = (await login('budi@example.com', 'customer')).s;
  const up = await budi.put('/api/auth/profile', { nama: 'Budi S. Wijaya', no_hp: '0812-3456-7890' });
  check('edit profil', up.status === 200 && up.data.user.nama === 'Budi S. Wijaya' && (await budi.get('/api/auth/me')).data.user.no_hp === '0812-3456-7890');
  check('no. HP tidak valid ditolak', (await budi.put('/api/auth/profile', { nama: 'Budi', no_hp: 'abc!!' })).status === 400);
  check('nama kosong ditolak', (await budi.put('/api/auth/profile', { nama: ' ' })).status === 400);
  check('profil butuh login', (await session(base).put('/api/auth/profile', { nama: 'X Y' })).status === 401);

  const budiLain = (await login('budi@example.com', 'customer')).s;
  check('ganti password: password lama salah -> 403', (await budi.post('/api/auth/ganti-password', { password_lama: 'salah', password_baru: 'passwordBaru9' })).status === 403);
  check('password baru sama dengan lama -> 400', (await budi.post('/api/auth/ganti-password', { password_lama: 'password123', password_baru: 'password123' })).status === 400);
  check('ganti password berhasil', (await budi.post('/api/auth/ganti-password', { password_lama: 'password123', password_baru: 'passwordBaru9' })).status === 200);
  check('sesi yang mengganti tetap login', (await budi.get('/api/auth/me')).status === 200);
  check('sesi di perangkat lain otomatis keluar', (await budiLain.get('/api/auth/me')).status === 401);
  check('login dengan password baru', (await login('budi@example.com', 'customer', 'passwordBaru9')).r.status === 200);
  const budi2 = (await login('budi@example.com', 'customer', 'passwordBaru9')).s;

  console.log('Kendaraan saya');
  const kv = (await budi2.get('/api/customer/kendaraan')).data.items;
  check('daftar kendaraan', kv.length === 2);
  check('tambah kendaraan', (await budi2.post('/api/customer/kendaraan', { jenis: 'Mobil', merk: 'Toyota Yaris', no_polisi: 'd 7777 yy', tahun: 2018 })).status === 201);
  check('no. polisi ganda -> 409', (await budi2.post('/api/customer/kendaraan', { jenis: 'Mobil', merk: 'Yaris', no_polisi: 'D 7777 YY' })).status === 409);
  check('data kendaraan tidak lengkap -> 400', (await budi2.post('/api/customer/kendaraan', { jenis: 'Pesawat', merk: 'X', no_polisi: 'Z' })).status === 400);
  const semua = (await budi2.get('/api/customer/kendaraan')).data.items;
  const baru = semua.find((k) => k.no_polisi === 'D 7777 YY');
  const adaRiwayat = semua.find((k) => k.no_polisi === 'D 3311 XYZ');
  check('no. polisi disimpan huruf besar', !!baru);
  check('kendaraan dengan riwayat booking tidak bisa dihapus (409)', (await budi2.del(`/api/customer/kendaraan/${adaRiwayat.id}`)).status === 409);
  const rina = (await login('rina@example.com', 'customer', 'passwordBaru1')).s;
  check('tidak bisa menghapus kendaraan milik orang lain (404)', (await rina.del(`/api/customer/kendaraan/${baru.id}`)).status === 404);
  check('hapus kendaraan tanpa riwayat', (await budi2.del(`/api/customer/kendaraan/${baru.id}`)).status === 200);
  const mitra1 = (await login('mitra1@example.com', 'mitra')).s;
  check('mitra tidak bisa mengakses kendaraan customer (403)', (await mitra1.get('/api/customer/kendaraan')).status === 403);

  console.log('Notifikasi');
  const unread = async (s) => (await s.get('/api/notifikasi/jumlah')).data.unread;
  const list = async (s) => (await s.get('/api/notifikasi')).data;
  const rudi = (await login('rudi@bengkelku.id', 'mekanik')).s;
  const mitra1Before = await unread(mitra1);
  const bengkel = (await budi2.get('/api/customer/bengkel?lat=-6.9175&lng=107.6191&radius=10')).data.items.find((b) => b.nama === 'Bengkel Jaya Motor');
  const bk = await budi2.post('/api/booking', { id_bengkel: bengkel.id, id_servis: [bengkel.layanan[0].id], tanggal: new Date(Date.now() + 864e5).toISOString(), keluhan: 'Tarikan berat', id_kendaraan: kv[0].id });
  check('booking baru -> mitra mendapat notifikasi', (await unread(mitra1)) === mitra1Before + 1);
  const nMitra = (await list(mitra1)).items[0];
  check('isi & tautan notifikasi benar', nMitra.judul === 'Booking baru' && nMitra.link === '#/mitra/booking' && nMitra.dibaca === 0);
  const id = bk.data.item.id;
  const rudiList = (await rudi.get('/api/mitra/mekanik').catch(() => null));
  const mRudi = (await mitra1.get('/api/mitra/mekanik')).data.items.find((m) => m.nama === 'Rudi');
  const custBefore = await unread(budi2), rudiBefore = await unread(rudi);
  await mitra1.post(`/api/booking/${id}/terima`, { id_mekanik: mRudi.id });
  check('booking diterima -> customer & mekanik diberi tahu', (await unread(budi2)) === custBefore + 1 && (await unread(rudi)) === rudiBefore + 1);
  check('notifikasi mekanik mengarah ke tugas', (await list(rudi)).items[0].link === '#/mekanik/tugas');
  await rudi.post(`/api/booking/${id}/mulai`);
  await rudi.post(`/api/booking/${id}/selesai`);
  const mitraSebelumInvoice = await unread(mitra1);
  await mitra1.post(`/api/booking/${id}/invoice`);
  const judulCust = (await list(budi2)).items.map((n) => n.judul);
  check('customer menerima: diterima, dimulai, selesai, invoice', ['Booking diterima', 'Servis dimulai', 'Servis selesai', 'Invoice tersedia'].every((j) => judulCust.includes(j)), judulCust.join('|'));
  check('mitra diberi tahu servis selesai (siap invoice)', (await list(mitra1)).items.some((n) => n.judul === 'Servis selesai'));
  await budi2.post(`/api/booking/${id}/bayar`, { metode: 'QRIS' });
  check('customer bayar -> mitra diberi tahu', (await list(mitra1)).items[0].judul === 'Pembayaran diterima' && (await unread(mitra1)) > mitraSebelumInvoice);

  const sari = (await login('sari@bengkelku.id', 'mekanik')).s;
  check('notifikasi terisolasi: mekanik lain tidak melihat tugas ini', !(await list(sari)).items.some((n) => /#\d+/.test(n.pesan) && n.pesan.includes(`#${id}`)));
  const first = (await list(budi2)).items[0];
  await budi2.post('/api/notifikasi/baca', { id: first.id });
  check('tandai satu notifikasi dibaca', (await list(budi2)).items.find((n) => n.id === first.id).dibaca === 1);
  const otherId = (await list(mitra1)).items[0].id;
  await budi2.post('/api/notifikasi/baca', { id: otherId });
  check('tidak bisa menandai notifikasi milik orang lain', (await list(mitra1)).items.find((n) => n.id === otherId).dibaca === 0);
  await budi2.post('/api/notifikasi/baca', {});
  check('tandai semua dibaca', (await unread(budi2)) === 0);
  check('notifikasi butuh login', (await session(base).get('/api/notifikasi')).status === 401);

  const kampas = (await budi2.get('/api/customer/sparepart?q=Kampas Rem Depan')).data.items[0];
  const mitra1Pre = await unread(mitra1);
  await budi2.post('/api/pesanan', { items: [{ id_sparepart: kampas.id, qty: 1 }], metode: 'QRIS' });
  check('pesanan sparepart -> mitra bengkel diberi tahu', (await unread(mitra1)) === mitra1Pre + 1 && (await list(mitra1)).items[0].link === '#/mitra/pesanan');
  const line = (await mitra1.get('/api/pesanan')).data.items[0].lines[0];
  await mitra1.post(`/api/pesanan/detail/${line.id}/maju`);
  check('pesanan siap diambil -> customer diberi tahu', /siap diambil/i.test((await list(budi2)).items[0].judul));

  console.log('Pendaftaran mitra & persetujuan');
  const admin = (await login('admin@bengkelku.id', 'admin', 'admin12345')).s;
  const adminPre = await unread(admin);
  const baruMitra = session(base);
  await baruMitra.post('/api/auth/register/mitra', { nama: 'Pak Rudi', email: 'rudi.baru@example.com', password: 'rahasia123', bengkel: { nama: 'Bengkel Rudi', alamat: 'Jl. Contoh 5', lat: -6.9, lng: 107.6, jenis: 'Motor' } });
  check('pendaftaran mitra -> admin diberi tahu', (await unread(admin)) === adminPre + 1 && (await list(admin)).items[0].link === '#/admin/bengkel');
  const pend = (await admin.get('/api/admin/bengkel')).data.items.find((b) => b.nama === 'Bengkel Rudi');
  await admin.post(`/api/admin/bengkel/${pend.id}/setujui`);
  check('persetujuan -> mitra diberi tahu', (await list(baruMitra)).items[0].judul === 'Bengkel disetujui');

  console.log('Reset password mekanik oleh mitra');
  const sesiRudi = (await login('rudi@bengkelku.id', 'mekanik')).s;
  const mitra2 = (await login('mitra2@example.com', 'mitra')).s;
  check('mitra bengkel lain tidak bisa reset (404)', (await mitra2.post(`/api/mitra/mekanik/${mRudi.id}/password`, { password: 'mekanikBaru1' })).status === 404);
  check('password terlalu pendek -> 400', (await mitra1.post(`/api/mitra/mekanik/${mRudi.id}/password`, { password: '123' })).status === 400);
  check('mitra mereset password mekaniknya', (await mitra1.post(`/api/mitra/mekanik/${mRudi.id}/password`, { password: 'mekanikBaru1' })).status === 200);
  check('sesi lama mekanik berakhir & login baru berhasil', (await sesiRudi.get('/api/auth/me')).status === 401 && (await login('rudi@bengkelku.id', 'mekanik', 'mekanikBaru1')).r.status === 200);
  const rudiBaru = (await login('rudi@bengkelku.id', 'mekanik', 'mekanikBaru1')).s;
  await rudiBaru.put('/api/auth/profile', { nama: 'Rudi Hartono' });
  check('nama mekanik ikut berubah di daftar bengkel', (await mitra1.get('/api/mitra/mekanik')).data.items.some((m) => m.nama === 'Rudi Hartono'));

  console.log('Batas permintaan reset');
  let last;
  for (let i = 0; i < 7; i++) last = await anon.post('/api/auth/lupa-password', { email: 'spam@example.com' });
  check('permintaan reset berlebihan -> 429', last.status === 429);

  console.log('Mode production tanpa demo: tautan tidak bocor di respons');
  process.env.SEED_DEMO = 'false';
  const prodLike = await session(base).post('/api/auth/lupa-password', { email: 'budi@example.com' });
  check('dev_token tidak dikirim ke klien', prodLike.status === 200 && prodLike.data.dev_token === undefined);
  process.env.SEED_DEMO = 'true';

  server.close();
  for (const f of [process.env.DB_PATH, process.env.DB_PATH + '-wal', process.env.DB_PATH + '-shm']) fs.rmSync(f, { force: true });
  console.log(`\n${passed} lulus, ${failed} gagal`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
