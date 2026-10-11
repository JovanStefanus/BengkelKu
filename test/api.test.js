// Tes integrasi API: jalankan dengan `npm test`. Memakai database sementara.
const os = require('os'), path = require('path'), fs = require('fs');
const tmp = path.join(os.tmpdir(), `bengkelku-test-${Date.now()}.db`);
process.env.DB_PATH = tmp;
process.env.LOGIN_RATE_MAX = '1000';
delete process.env.NODE_ENV;

const app = require('../server');
let passed = 0, failed = 0;

function session(base) {
  let cookie = '';
  const call = async (method, url, body, raw) => {
    const res = await fetch(base + url, {
      method,
      headers: { ...(raw ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { cookie } : {}) },
      body: method === 'GET' ? undefined : (raw ? 'x=1' : JSON.stringify(body ?? {})),
    });
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    let data = null; try { data = await res.json(); } catch {}
    return { status: res.status, data };
  };
  return { get: (u) => call('GET', u), post: (u, b) => call('POST', u, b), put: (u, b) => call('PUT', u, b), del: (u) => call('DELETE', u), raw: (u) => call('POST', u, null, true) };
}
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log('  ok  -', name); } else { failed++; console.log('  GAGAL -', name, extra); }
}

(async () => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = async (email, role, password = 'password123') => {
    const s = session(base); const r = await s.post('/api/auth/login', { email, password, role }); return { s, r };
  };
  const LOC = 'lat=-6.9175&lng=107.6191';

  console.log('Autentikasi');
  check('login tanpa cookie ditolak (401)', (await session(base).get('/api/booking')).status === 401);
  check('password salah -> 401', (await login('budi@example.com', 'customer', 'salah-salah')).r.status === 401);
  const wrongRole = await login('budi@example.com', 'admin');
  check('peran tidak cocok -> 403', wrongRole.r.status === 403 && /bukan akun Admin/.test(wrongRole.r.data.error));
  check('mengaku mitra padahal customer -> 403', (await login('budi@example.com', 'mitra')).r.status === 403);
  check('POST non-JSON -> 415', (await session(base).raw('/api/auth/login')).status === 415);

  const budi = (await login('budi@example.com', 'customer')).s;
  const mitra1 = (await login('mitra1@example.com', 'mitra')).s;
  const mitra2 = (await login('mitra2@example.com', 'mitra')).s;
  const rudi = (await login('rudi@bengkelku.id', 'mekanik')).s;
  const sari = (await login('sari@bengkelku.id', 'mekanik')).s;
  const admin = (await login('admin@bengkelku.id', 'admin', 'admin12345')).s;
  check('GET /me mengembalikan peran dari database', (await budi.get('/api/auth/me')).data.user.role === 'customer');

  console.log('Pencarian bengkel (radius)');
  const r5 = (await budi.get(`/api/customer/bengkel?${LOC}&radius=5`)).data.items;
  const r10 = (await budi.get(`/api/customer/bengkel?${LOC}&radius=10`)).data.items;
  const rAll = (await budi.get(`/api/customer/bengkel?${LOC}&radius=50`)).data.items;
  check('radius 5 km -> 3 bengkel', r5.length === 3, JSON.stringify(r5.map(b => [b.nama, b.jarak_km])));
  check('radius 10 km -> 5 bengkel', r10.length === 5, JSON.stringify(r10.map(b => [b.nama, b.jarak_km])));
  check('radius 50 km -> 6 bengkel aktif (yang pending tidak tampil)', rAll.length === 6);
  check('hasil terurut dari yang terdekat', r10.every((b, i) => i === 0 || r10[i - 1].jarak_km <= b.jarak_km));
  check('bengkel menunggu persetujuan tidak muncul', !rAll.some((b) => b.nama === 'Bengkel Sumber Rejeki'));
  check('lokasi wajib', (await budi.get('/api/customer/bengkel')).status === 400);

  console.log('Alur booking end-to-end');
  const jaya = r5.find((b) => b.nama === 'Bengkel Jaya Motor');
  const when = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 16);
  const mk = await budi.post('/api/booking', {
    id_bengkel: jaya.id, id_servis: [jaya.layanan[0].id], tanggal: when, keluhan: 'Mesin kasar',
    kendaraan: { jenis: 'Motor', merk: 'Honda Beat', no_polisi: 'd 999 zz', tahun: 2023 }, lat: -6.9175, lng: 107.6191,
  });
  check('customer membuat booking (201)', mk.status === 201 && mk.data.item.status === 'Menunggu Verifikasi', JSON.stringify(mk.data));
  check('jarak dihitung server', typeof mk.data.item.jarak_km === 'number');
  const bid = mk.data.item.id;
  const otoklik = rAll.find((b) => b.nama === 'Otoklik Service Center');
  const bad1 = await budi.post('/api/booking', { id_bengkel: otoklik.id, id_servis: [otoklik.layanan[0].id], tanggal: when, keluhan: 'x y z', kendaraan: { jenis: 'Motor', merk: 'Honda Beat', no_polisi: 'D 999 ZZ' } });
  check('motor ke bengkel khusus mobil ditolak', bad1.status === 400 && /hanya melayani mobil/.test(bad1.data.error), JSON.stringify(bad1.data));
  check('jadwal masa lalu ditolak', (await budi.post('/api/booking', { id_bengkel: jaya.id, id_servis: [jaya.layanan[0].id], tanggal: '2020-01-01T10:00', keluhan: 'abc', kendaraan: { jenis: 'Motor', merk: 'Beat', no_polisi: 'D 1 A' } })).status === 400);

  check('mitra bengkel LAIN tidak bisa melihat booking itu', (await mitra2.post(`/api/booking/${bid}/terima`, { id_mekanik: 1 })).status === 404);
  check('customer tidak bisa menerima booking (403)', (await budi.post(`/api/booking/${bid}/terima`, { id_mekanik: 1 })).status === 403);
  const mekList = (await mitra1.get('/api/mitra/mekanik')).data.items;
  const mRudi = mekList.find((m) => m.nama === 'Rudi');
  const mSari = (await mitra2.get('/api/mitra/mekanik')).data.items[0];
  check('mitra tidak bisa assign mekanik bengkel lain', (await mitra1.post(`/api/booking/${bid}/terima`, { id_mekanik: mSari.id })).status === 400);
  const acc = await mitra1.post(`/api/booking/${bid}/terima`, { id_mekanik: mRudi.id });
  check('mitra menerima + assign mekanik', acc.status === 200 && acc.data.item.status === 'Diterima' && acc.data.item.mekanik_nama === 'Rudi');
  check('menerima dua kali -> 409', (await mitra1.post(`/api/booking/${bid}/terima`, { id_mekanik: mRudi.id })).status === 409);

  check('mekanik lain tidak melihat tugas ini', (await sari.post(`/api/booking/${bid}/mulai`)).status === 404);
  check('mekanik mulai kerja', (await rudi.post(`/api/booking/${bid}/mulai`)).data.item.status === 'Dikerjakan');
  const parts = (await rudi.get('/api/mekanik/sparepart')).data.items;
  const oli = parts.find((p) => p.nama === 'Oli Mesin 1L');
  const stokAwal = oli.stok;
  check('mekanik mencatat sparepart', (await rudi.post(`/api/booking/${bid}/sparepart`, { id_sparepart: oli.id, qty: 2 })).status === 200);
  const oliSetelah = (await rudi.get('/api/mekanik/sparepart')).data.items.find((p) => p.id === oli.id);
  check('stok berkurang otomatis', oliSetelah.stok === stokAwal - 2, `${stokAwal} -> ${oliSetelah.stok}`);
  check('stok tidak cukup -> 409', (await rudi.post(`/api/booking/${bid}/sparepart`, { id_sparepart: oli.id, qty: 99 })).status === 409);
  check('invoice sebelum selesai ditolak', (await mitra1.post(`/api/booking/${bid}/invoice`)).status === 409);
  check('mekanik menyelesaikan', (await rudi.post(`/api/booking/${bid}/selesai`)).data.item.status === 'Selesai');
  const inv = await mitra1.post(`/api/booking/${bid}/invoice`);
  const expected = jaya.layanan[0].harga + 2 * 65000;
  check('invoice = jasa + sparepart', inv.data.item.invoice_total === expected, `${inv.data.item.invoice_total} vs ${expected}`);
  check('customer membayar', (await budi.post(`/api/booking/${bid}/bayar`, { metode: 'QRIS' })).data.item.invoice_status === 'Lunas');
  check('bayar dua kali -> 409', (await budi.post(`/api/booking/${bid}/bayar`, { metode: 'QRIS' })).status === 409);
  check('customer memberi rating', (await budi.post(`/api/booking/${bid}/rating`, { skor: 5, ulasan: 'Bagus' })).data.item.rating_skor === 5);
  check('rating ganda -> 409', (await budi.post(`/api/booking/${bid}/rating`, { skor: 1 })).status === 409);

  console.log('Isolasi data antar peran');
  const budiList = (await budi.get('/api/booking')).data.items;
  check('customer hanya melihat booking miliknya', budiList.every((b) => b.customer_nama === 'Budi Santoso'));
  const m2List = (await mitra2.get('/api/booking')).data.items;
  check('mitra hanya melihat booking bengkelnya', m2List.every((b) => b.bengkel_nama === 'Otoklik Service Center'));
  check('mekanik hanya melihat tugasnya', (await sari.get('/api/booking')).data.items.every((b) => b.mekanik_nama === 'Sari'));
  check('customer tidak bisa akses /api/admin', (await budi.get('/api/admin/stats')).status === 403);
  check('mekanik tidak bisa akses /api/mitra', (await rudi.get('/api/mitra/sparepart')).status === 403);

  console.log('Marketplace sparepart');
  const market = (await budi.get(`/api/customer/sparepart?${LOC}`)).data;
  const kampas = market.items.find((s) => s.nama === 'Kampas Rem Depan');
  check('marketplace menampilkan sparepart lintas bengkel', new Set(market.items.map((s) => s.id_bengkel)).size > 3 && kampas.jarak_km > 0);
  check('pencarian & filter kategori', (await budi.get('/api/customer/sparepart?q=oli&kategori=Cairan')).data.items.every((s) => /oli/i.test(s.nama) && s.kategori === 'Cairan'));
  const ord = await budi.post('/api/pesanan', { items: [{ id_sparepart: kampas.id, qty: 2 }], metode: 'QRIS' });
  check('checkout berhasil', ord.status === 201);
  const stokKampas = (await budi.get('/api/customer/sparepart?q=Kampas Rem Depan')).data.items[0].stok;
  check('stok marketplace berkurang', stokKampas === kampas.stok - 2);
  check('stok tidak cukup -> 409 dan tidak ada perubahan', (await budi.post('/api/pesanan', { items: [{ id_sparepart: kampas.id, qty: 100 }], metode: 'QRIS' })).status === 409);
  const mitraOrders = (await mitra1.get('/api/pesanan')).data.items;
  check('mitra melihat pesanan untuk bengkelnya', mitraOrders.length >= 1 && mitraOrders.every((o) => o.lines.every((l) => l.bengkel_nama === 'Bengkel Jaya Motor')));
  const line = mitraOrders[0].lines[0];
  check('mitra memproses pesanan', (await mitra1.post(`/api/pesanan/detail/${line.id}/maju`)).data.status === 'Siap Diambil');
  check('mitra lain tidak bisa memproses pesanan itu', (await mitra2.post(`/api/pesanan/detail/${line.id}/maju`)).status === 404);

  console.log('Pendaftaran & persetujuan mitra');
  const newCust = session(base);
  check('daftar customer', (await newCust.post('/api/auth/register/customer', { nama: 'Tono', email: 'tono@example.com', password: 'rahasia123' })).status === 201);
  check('email ganda -> 409', (await session(base).post('/api/auth/register/customer', { nama: 'Tono 2', email: 'TONO@example.com', password: 'rahasia123' })).status === 409);
  check('password pendek ditolak', (await session(base).post('/api/auth/register/customer', { nama: 'X Y', email: 'x@y.com', password: '123' })).status === 400);
  const newMitra = session(base);
  const reg = await newMitra.post('/api/auth/register/mitra', { nama: 'Pak Eko', email: 'eko@example.com', password: 'rahasia123', bengkel: { nama: 'Bengkel Eko', alamat: 'Jl. Merdeka 1, Bandung', lat: -6.92, lng: 107.61, jenis: 'Motor & Mobil' } });
  check('daftar mitra bengkel', reg.status === 201);
  check('bengkel baru belum tampil di pencarian', !(await budi.get(`/api/customer/bengkel?${LOC}&radius=50`)).data.items.some((b) => b.nama === 'Bengkel Eko'));
  check('mitra menambah layanan & mekanik', (await newMitra.post('/api/mitra/servis', { nama_servis: 'Servis Umum', harga: 100000, estimasi_menit: 60 })).status === 201
    && (await newMitra.post('/api/mitra/mekanik', { nama: 'Joni', email: 'joni@example.com', password: 'rahasia123', spesialisasi: 'Umum' })).status === 201);
  check('akun mekanik buatan mitra bisa login sebagai mekanik', (await login('joni@example.com', 'mekanik', 'rahasia123')).r.status === 200);
  check('mitra tidak bisa menyetujui diri sendiri', (await newMitra.post('/api/admin/bengkel/7/setujui')).status === 403);
  const pending = (await admin.get('/api/admin/bengkel')).data.items.find((b) => b.nama === 'Bengkel Eko');
  check('admin melihat pendaftaran baru', pending && pending.status === 'Menunggu Persetujuan');
  check('admin menyetujui', (await admin.post(`/api/admin/bengkel/${pending.id}/setujui`)).status === 200);
  check('bengkel baru kini muncul di pencarian', (await budi.get(`/api/customer/bengkel?${LOC}&radius=50`)).data.items.some((b) => b.nama === 'Bengkel Eko'));
  check('admin statistik', (await admin.get('/api/admin/stats')).data.bengkel_aktif === 7);

  console.log('Logout');
  await budi.post('/api/auth/logout');

  server.close();
  for (const f of [tmp, tmp + '-wal', tmp + '-shm']) fs.rmSync(f, { force: true });
  console.log(`\n${passed} lulus, ${failed} gagal`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
