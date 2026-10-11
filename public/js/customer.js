import { api, post, del } from './api.js';
import { showSearchMap } from './map.js';
import { profilSection, passwordSection } from './shared.js';
import { state, saveCart, DEFAULT_LOC } from './state.js';
import { html, raw, actions, ctx, rupiah, tgl, badge, stars, toast, formData, localDateTimeMin, getPosition } from './ui.js';

// ---------- Cari bengkel & booking ----------
async function cari() {
  const { lat, lng } = state.loc;
  const [bk, kv] = await Promise.all([
    api(`/customer/bengkel?lat=${lat}&lng=${lng}&radius=${state.radius}`),
    api('/customer/kendaraan'),
  ]);
  state.kendaraan = kv.items;
  ctx.after.push(() => showSearchMap(document.getElementById('searchmap'), {
    loc: state.loc, radiusKm: state.radius, items: bk.items,
    onPick: (ll) => { state.loc = { lat: ll.lat, lng: ll.lng, label: 'Titik yang Anda pilih di peta', real: false }; ctx.refresh(); },
  }));
  return html`
    <div class="pagehead"><div><h1>Cari Bengkel Terdekat</h1><p class="muted">📍 ${state.loc.label}</p></div></div>
    <div class="panel mapbox">
      <div id="searchmap" class="map" role="region" aria-label="Peta bengkel di sekitar Anda"></div>
      <p class="muted">Titik biru = lokasi Anda, lingkaran = radius pencarian, penanda = bengkel. <b>Klik peta</b> untuk memindahkan lokasi Anda.</p>
    </div>
    <div class="panel toolbar">
      <button class="ghost" data-action="useLocation">📍 Gunakan lokasi saya</button>
      <label>Radius pencarian
        <select data-change="setRadius">${[5, 10, 25].map((r) => html`<option value="${r}" ${state.radius === r ? raw('selected') : ''}>${r} km</option>`)}</select>
      </label>
      <span class="muted">${bk.items.length} bengkel ditemukan, diurutkan dari yang terdekat</span>
    </div>
    ${bk.items.length ? bk.items.map(bengkelCard) : html`<div class="panel empty">Tidak ada bengkel aktif dalam radius ${state.radius} km. Coba perbesar radius.</div>`}`;
}

function bengkelCard(b) {
  const cocok = state.kendaraan.filter((k) => b.jenis === 'Motor & Mobil' || k.jenis === b.jenis);
  return html`
  <article class="card" id="bk-${b.id}">
    <div class="row between">
      <div><h3>${b.nama}</h3><p class="muted">${b.alamat}</p></div>
      <div class="dist">${b.jarak_km} km</div>
    </div>
    <p class="meta"><span class="stars">${stars(b.rating)}</span> ${b.rating ?? 'Belum ada rating'} (${b.jml_rating} ulasan) · ${b.jenis} · Buka ${b.jam_operasional} · ${b.jml_mekanik} mekanik aktif</p>
    <p>${b.layanan.map((l) => html`<span class="pill">${l.nama_servis} · ${rupiah(l.harga)}</span>`)}</p>
    <button class="ghost" data-action="toggleBook" data-id="${b.id}">Booking servis di sini</button>
    <form class="bookform" id="bf-${b.id}" data-submit="submitBooking" hidden>
      <input type="hidden" name="id_bengkel" value="${b.id}">
      <label>Layanan yang dibutuhkan</label>
      <div class="checks">${b.layanan.map((l) => html`<label><input type="checkbox" name="id_servis" value="${l.id}"> ${l.nama_servis} (${rupiah(l.harga)})</label>`)}</div>
      <div class="grid2">
        <div><label>Kendaraan</label>
          <select name="id_kendaraan" data-change="kendaraanChange">
            ${cocok.map((k, i) => html`<option value="${k.id}" ${i === 0 ? raw('selected') : ''}>${k.merk} • ${k.no_polisi}</option>`)}
            <option value="">＋ Kendaraan baru…</option>
          </select></div>
        <div><label>Jadwal kedatangan</label><input type="datetime-local" name="tanggal" min="${localDateTimeMin()}"></div>
      </div>
      <div class="newveh" ${cocok.length ? raw('hidden') : ''}>
        <div class="grid3">
          <div><label>Jenis</label><select name="k_jenis">${['Motor', 'Mobil'].filter((j) => b.jenis === 'Motor & Mobil' || b.jenis === j).map((j) => html`<option>${j}</option>`)}</select></div>
          <div><label>Merk / model</label><input name="k_merk" maxlength="60" placeholder="Honda Beat"></div>
          <div><label>No. polisi</label><input name="k_nopol" maxlength="12" placeholder="D 1234 AB"></div>
        </div>
      </div>
      <label>Keluhan</label><textarea name="keluhan" rows="2" maxlength="500" placeholder="Jelaskan keluhan kendaraan Anda"></textarea>
      <p class="muted" style="margin-bottom:10px">Mekanik akan ditugaskan oleh pihak bengkel setelah booking Anda diterima.</p>
      <button class="primary" type="submit">Kirim booking ke ${b.nama}</button>
    </form>
  </article>`;
}

actions.useLocation = async () => {
  try {
    const p = await getPosition();
    state.loc = { ...p, label: 'Lokasi Anda saat ini (GPS)', real: true };
    toast('Lokasi terdeteksi');
  } catch (e) {
    state.loc = { ...DEFAULT_LOC };
    toast(e.message + ' Memakai lokasi default.', 'error');
  }
  ctx.refresh();
};
actions.focusBengkel = (el) => {
  const form = document.getElementById('bf-' + el.dataset.id);
  if (form) form.hidden = false;
  document.getElementById('bk-' + el.dataset.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
};
actions.setRadius = (el) => { state.radius = Number(el.value); ctx.refresh(); };
actions.toggleBook = (el) => { const f = document.getElementById('bf-' + el.dataset.id); f.hidden = !f.hidden; };
actions.kendaraanChange = (el) => { el.closest('form').querySelector('.newveh').hidden = el.value !== ''; };
actions.submitBooking = async (form) => {
  const d = formData(form);
  const body = { id_bengkel: d.id_bengkel, id_servis: [].concat(d.id_servis || []), tanggal: d.tanggal ? new Date(d.tanggal).toISOString() : '', keluhan: d.keluhan, lat: state.loc.lat, lng: state.loc.lng };
  if (d.id_kendaraan) body.id_kendaraan = d.id_kendaraan;
  else body.kendaraan = { jenis: d.k_jenis, merk: d.k_merk, no_polisi: d.k_nopol };
  if (!body.id_servis.length) throw new Error('Pilih minimal satu layanan');
  if (!d.tanggal) throw new Error('Pilih jadwal kedatangan');
  await post('/booking', body);
  toast('Booking terkirim. Menunggu konfirmasi bengkel.');
  location.hash = '#/customer/riwayat';
};

// ---------- Marketplace sparepart ----------
async function marketplace() {
  const qs = new URLSearchParams({ lat: state.loc.lat, lng: state.loc.lng });
  if (state.marketQ) qs.set('q', state.marketQ);
  if (state.marketKat) qs.set('kategori', state.marketKat);
  const data = await api('/customer/sparepart?' + qs);
  state.market = new Map(data.items.map((s) => [s.id, s]));
  const total = state.cart.reduce((s, c) => s + c.harga * c.qty, 0);
  return html`
    <div class="pagehead"><div><h1>Marketplace Sparepart</h1><p class="muted">Beli sparepart dari berbagai bengkel tanpa harus booking servis</p></div></div>
    <form class="panel toolbar" data-submit="marketSearch">
      <input name="q" placeholder="Cari sparepart (mis. oli, kampas)" value="${state.marketQ}" style="max-width:300px;margin:0" maxlength="60">
      <select name="kategori" style="width:auto;margin:0"><option value="">Semua kategori</option>
        ${data.kategori.map((k) => html`<option ${state.marketKat === k ? raw('selected') : ''}>${k}</option>`)}</select>
      <button class="ghost" type="submit">Cari</button>
    </form>
    <div class="market">
      <div class="spgrid">
        ${data.items.length ? data.items.map((s) => html`
          <div class="sp">
            <b>${s.nama}</b>
            <span class="muted">${s.kategori} · ${s.bengkel_nama}${s.jarak_km !== null ? ` · ${s.jarak_km} km` : ''}</span>
            <span class="price">${rupiah(s.harga_jual)}</span>
            <span class="muted">${s.stok > 0 ? 'Stok ' + s.stok : 'Stok habis'}</span>
            <button class="ghost sm" data-action="addCart" data-id="${s.id}" ${s.stok > 0 ? '' : raw('disabled')}>＋ Keranjang</button>
          </div>`) : html`<div class="panel empty" style="grid-column:1/-1">Sparepart tidak ditemukan.</div>`}
      </div>
      <aside class="panel cart">
        <h2>Keranjang</h2>
        ${state.cart.length ? html`
          <ul>${state.cart.map((c) => html`<li><span>${c.nama}<br><span class="muted">${c.bengkel_nama} · ${rupiah(c.harga)}</span></span>
            <span class="qty"><button class="ghost sm" data-action="cartDec" data-id="${c.id}" aria-label="Kurangi">−</button>${c.qty}<button class="ghost sm" data-action="cartInc" data-id="${c.id}" aria-label="Tambah">＋</button></span></li>`)}</ul>
          <p><b>Total: ${rupiah(total)}</b></p>
          <form data-submit="checkout">
            <label>Metode pembayaran</label>
            <select name="metode"><option>QRIS</option><option>Transfer Bank</option><option>E-Wallet</option><option>Bayar di Tempat</option></select>
            <button class="primary block" type="submit">Checkout</button>
          </form>` : html`<p class="muted">Keranjang masih kosong.</p>`}
      </aside>
    </div>`;
}

actions.marketSearch = (form) => { const d = formData(form); state.marketQ = (d.q || '').trim(); state.marketKat = d.kategori || ''; ctx.refresh(); };
actions.addCart = (el) => {
  const s = state.market.get(Number(el.dataset.id));
  if (!s) return;
  const ex = state.cart.find((c) => c.id === s.id);
  if (ex) { if (ex.qty >= s.stok) return toast('Jumlah melebihi stok tersedia', 'error'); ex.qty += 1; }
  else state.cart.push({ id: s.id, nama: s.nama, bengkel_nama: s.bengkel_nama, harga: s.harga_jual, qty: 1 });
  saveCart(); ctx.refresh();
};
actions.cartInc = (el) => { const c = state.cart.find((x) => x.id === Number(el.dataset.id)); const s = state.market.get(c.id); if (s && c.qty >= s.stok) return toast('Jumlah melebihi stok tersedia', 'error'); c.qty += 1; saveCart(); ctx.refresh(); };
actions.cartDec = (el) => { const c = state.cart.find((x) => x.id === Number(el.dataset.id)); c.qty -= 1; if (c.qty <= 0) state.cart = state.cart.filter((x) => x !== c); saveCart(); ctx.refresh(); };
actions.checkout = async (form) => {
  const d = formData(form);
  await post('/pesanan', { items: state.cart.map((c) => ({ id_sparepart: c.id, qty: c.qty })), metode: d.metode });
  state.cart = []; saveCart();
  toast('Pesanan berhasil dibuat');
  location.hash = '#/customer/riwayat';
};

// ---------- Riwayat ----------
async function riwayat() {
  const [bk, ps] = await Promise.all([api('/booking'), api('/pesanan')]);
  return html`
    <div class="pagehead"><div><h1>Riwayat Saya</h1><p class="muted">Pantau status servis dan pesanan sparepart</p></div></div>
    <h2>Booking servis</h2>
    ${bk.items.length ? bk.items.map(bookingCard) : html`<div class="panel empty">Belum ada booking. Mulai dari menu Cari Bengkel.</div>`}
    <h2 style="margin-top:22px">Pesanan sparepart</h2>
    ${ps.items.length ? ps.items.map((p) => html`
      <div class="card"><div class="row between"><div><b>Pesanan #${p.id}</b> <span class="muted">· ${tgl(p.tanggal)} · ${p.metode_pembayaran}</span></div><div>${badge(p.status)} <b>${rupiah(p.total)}</b></div></div>
        <div class="tablewrap"><table><tbody>${p.lines.map((l) => html`<tr><td>${l.nama} × ${l.qty}</td><td class="muted">${l.bengkel_nama}</td><td>${badge(l.status)}</td><td>${rupiah(l.subtotal)}</td></tr>`)}</tbody></table></div></div>`)
      : html`<div class="panel empty">Belum ada pesanan sparepart.</div>`}`;
}

function bookingCard(b) {
  return html`
  <article class="card">
    <div class="row between">
      <div><h3>${b.bengkel_nama} <span class="muted">#${b.id}</span></h3><p class="muted">${b.kendaraan_merk} • ${b.kendaraan_nopol} · Jadwal ${tgl(b.tanggal_booking)}</p></div>
      <div>${badge(b.status)}</div>
    </div>
    <p class="meta">Layanan: ${b.layanan.map((l) => l.nama_servis).join(', ')} · Mekanik: ${b.mekanik_nama || 'belum ditugaskan'}${b.jarak_km !== null ? ` · Jarak ${b.jarak_km} km` : ''}</p>
    <p class="muted">Keluhan: ${b.keluhan}</p>
    ${b.sparepart.length ? html`<p class="muted">Sparepart dipakai: ${b.sparepart.map((s) => `${s.nama} ×${s.qty}`).join(', ')}</p>` : ''}
    ${b.invoice_id ? html`<p><b>Invoice: ${rupiah(b.invoice_total)}</b> ${badge(b.invoice_status)} ${b.invoice_metode ? html`<span class="muted">via ${b.invoice_metode}</span>` : ''}</p>` : ''}
    <div class="actions">
      ${b.status === 'Menunggu Verifikasi' ? html`<button class="ghost sm danger" data-action="cancelBooking" data-id="${b.id}">Batalkan booking</button>` : ''}
      ${b.invoice_status === 'Belum Lunas' ? html`
        <form class="inline" data-submit="payBooking" data-id="${b.id}">
          <select name="metode"><option>QRIS</option><option>Transfer Bank</option><option>E-Wallet</option></select>
          <button class="primary sm" type="submit">Bayar ${rupiah(b.invoice_total)}</button></form>` : ''}
      ${b.status === 'Selesai' && !b.rating_skor ? html`
        <form class="inline" data-submit="rateBooking" data-id="${b.id}">
          <select name="skor"><option value="5">★★★★★ 5</option><option value="4">★★★★ 4</option><option value="3">★★★ 3</option><option value="2">★★ 2</option><option value="1">★ 1</option></select>
          <input name="ulasan" placeholder="Ulasan singkat (opsional)" maxlength="300">
          <button class="ghost sm" type="submit">Kirim rating</button></form>` : ''}
      ${b.rating_skor ? html`<span class="muted">Rating Anda: <span class="stars">${stars(b.rating_skor)}</span></span>` : ''}
    </div>
  </article>`;
}

actions.cancelBooking = async (el) => { if (!confirm('Batalkan booking ini?')) return; await post(`/booking/${el.dataset.id}/batal`); toast('Booking dibatalkan'); ctx.refresh(); };
actions.payBooking = async (form) => { await post(`/booking/${form.dataset.id}/bayar`, formData(form)); toast('Pembayaran berhasil (simulasi)'); ctx.refresh(); };
actions.rateBooking = async (form) => { await post(`/booking/${form.dataset.id}/rating`, formData(form)); toast('Terima kasih atas penilaian Anda'); ctx.refresh(); };

// ---------- Akun saya (profil, kendaraan, password) ----------
async function akun() {
  const kv = await api('/customer/kendaraan');
  return html`
    <div class="pagehead"><div><h1>Akun Saya</h1><p class="muted">${state.user.nama} · Customer</p></div></div>
    ${profilSection()}
    <div class="panel">
      <h2>Kendaraan saya</h2>
      <div class="tablewrap"><table><thead><tr><th>Jenis</th><th>Merk / model</th><th>No. polisi</th><th>Tahun</th><th></th></tr></thead><tbody>
        ${kv.items.length ? kv.items.map((k) => html`<tr><td>${k.jenis}</td><td>${k.merk}</td><td>${k.no_polisi}</td><td>${k.tahun ?? '—'}</td>
          <td><button class="ghost sm danger" data-action="delVehicle" data-id="${k.id}">Hapus</button></td></tr>`) : html`<tr><td colspan="5" class="empty">Belum ada kendaraan tersimpan.</td></tr>`}
      </tbody></table></div>
      <form data-submit="addVehicle" style="margin-top:14px">
        <label>Tambah kendaraan</label>
        <div class="inline">
          <select name="jenis"><option>Motor</option><option>Mobil</option></select>
          <input name="merk" placeholder="Merk / model (mis. Honda Beat)" required maxlength="60">
          <input name="no_polisi" placeholder="No. polisi (D 1234 AB)" required maxlength="12">
          <input name="tahun" type="number" placeholder="Tahun" min="1980" max="2100" style="max-width:100px">
          <button class="primary sm" type="submit">Tambah</button>
        </div>
      </form>
    </div>
    ${passwordSection()}`;
}
actions.addVehicle = async (form) => { await post('/customer/kendaraan', formData(form)); toast('Kendaraan ditambahkan'); ctx.refresh(); };
actions.delVehicle = async (el) => { if (!confirm('Hapus kendaraan ini?')) return; await del(`/customer/kendaraan/${el.dataset.id}`); toast('Kendaraan dihapus'); ctx.refresh(); };

export const views = { cari, marketplace, riwayat, akun };
