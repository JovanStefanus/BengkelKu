import { api, post, put, del } from './api.js';
import { state } from './state.js';
import { pickerMap } from './map.js';
import { html, raw, actions, ctx, rupiah, tgl, badge, stars, toast, formData, getPosition } from './ui.js';

const statusAlert = (st) => st === 'Aktif' ? '' :
  st === 'Ditolak'
    ? html`<div class="alert err">Pendaftaran bengkel Anda <b>ditolak</b> oleh Admin Platform. Hubungi admin untuk informasi lebih lanjut.</div>`
    : html`<div class="alert warn">Bengkel Anda berstatus <b>Menunggu Persetujuan</b>. Anda sudah bisa menyiapkan layanan, mekanik, dan sparepart; bengkel baru muncul di pencarian customer setelah disetujui Admin Platform.</div>`;

async function ringkasan() {
  const l = await api('/mitra/laporan');
  const st = Object.fromEntries(l.booking_per_status.map((r) => [r.status, r.jumlah]));
  return html`
    <div class="pagehead"><div><h1>Ringkasan Bengkel</h1><p class="muted">${state.user.bengkel.nama}</p></div></div>
    ${statusAlert(l.status_bengkel)}
    <div class="stats">
      <div class="stat"><div class="l">Menunggu verifikasi</div><div class="n">${st['Menunggu Verifikasi'] || 0}</div></div>
      <div class="stat"><div class="l">Sedang berjalan</div><div class="n">${(st['Diterima'] || 0) + (st['Dikerjakan'] || 0)}</div></div>
      <div class="stat"><div class="l">Servis selesai</div><div class="n">${st['Selesai'] || 0}</div></div>
      <div class="stat"><div class="l">Rating</div><div class="n">${l.rating.avg ?? '—'} <span class="stars" style="font-size:.9rem">${l.rating.n ? '★' : ''}</span></div><div class="l">${l.rating.n} ulasan</div></div>
    </div>
    <div class="stats">
      <div class="stat"><div class="l">Pendapatan servis (lunas)</div><div class="n">${rupiah(l.pendapatan_servis)}</div></div>
      <div class="stat"><div class="l">Tagihan belum lunas</div><div class="n">${rupiah(l.tagihan_belum_lunas)}</div></div>
      <div class="stat"><div class="l">Penjualan sparepart</div><div class="n">${rupiah(l.pendapatan_sparepart)}</div></div>
    </div>
    <div class="panel"><h2>Stok sparepart menipis (&lt; 10)</h2>
      ${l.stok_menipis.length ? l.stok_menipis.map((s) => html`<span class="pill">${s.nama} · sisa ${s.stok}</span>`) : html`<p class="muted">Semua stok aman.</p>`}</div>`;
}

async function booking() {
  const [bk, mk] = await Promise.all([api('/booking'), api('/mitra/mekanik')]);
  const aktif = mk.items.filter((m) => m.aktif);
  return html`
    <div class="pagehead"><div><h1>Booking Masuk</h1><p class="muted">Terima booking, tugaskan mekanik, dan terbitkan invoice</p></div></div>
    ${statusAlert(state.user.bengkel.status)}
    ${bk.items.length ? bk.items.map((b) => html`
    <article class="card">
      <div class="row between">
        <div><h3>#${b.id} · ${b.customer_nama}</h3><p class="muted">${b.kendaraan_merk} • ${b.kendaraan_nopol} · ${tgl(b.tanggal_booking)}${b.customer_hp ? ' · ' + b.customer_hp : ''}</p></div>
        ${badge(b.status)}
      </div>
      <p class="meta">Layanan: ${b.layanan.map((l) => `${l.nama_servis} (${rupiah(l.harga)})`).join(', ')}${b.jarak_km !== null ? ` · Jarak customer ${b.jarak_km} km` : ''}</p>
      <p class="muted">Keluhan: ${b.keluhan}</p>
      <p class="muted">Mekanik: ${b.mekanik_nama || '—'}${b.sparepart.length ? ' · Sparepart: ' + b.sparepart.map((s) => `${s.nama} ×${s.qty}`).join(', ') : ''}</p>
      ${b.invoice_id ? html`<p><b>Invoice ${rupiah(b.invoice_total)}</b> ${badge(b.invoice_status)} ${b.invoice_metode ? html`<span class="muted">via ${b.invoice_metode}</span>` : ''}</p>` : ''}
      ${b.rating_skor ? html`<p class="muted">Rating: <span class="stars">${stars(b.rating_skor)}</span> ${b.rating_ulasan || ''}</p>` : ''}
      <div class="actions">
        ${b.status === 'Menunggu Verifikasi' ? html`
          <form class="inline" data-submit="acceptBooking" data-id="${b.id}">
            <select name="id_mekanik" required><option value="">Pilih mekanik…</option>${aktif.map((m) => html`<option value="${m.id}">${m.nama} (${m.tugas_aktif} tugas aktif)</option>`)}</select>
            <button class="primary sm" type="submit">Terima & tugaskan</button>
          </form>
          <button class="ghost sm danger" data-action="rejectBooking" data-id="${b.id}">Tolak</button>` : ''}
        ${b.status === 'Selesai' && !b.invoice_id ? html`<button class="primary sm" data-action="makeInvoice" data-id="${b.id}">Buat invoice</button>` : ''}
        ${b.invoice_status === 'Belum Lunas' ? html`<button class="ghost sm" data-action="markPaid" data-id="${b.id}">Tandai lunas (bayar tunai)</button>` : ''}
      </div>
    </article>`) : html`<div class="panel empty">Belum ada booking masuk.</div>`}`;
}

actions.acceptBooking = async (form) => { await post(`/booking/${form.dataset.id}/terima`, formData(form)); toast('Booking diterima dan mekanik ditugaskan'); ctx.refresh(); };
actions.rejectBooking = async (el) => { if (!confirm('Tolak booking ini?')) return; await post(`/booking/${el.dataset.id}/tolak`); toast('Booking ditolak'); ctx.refresh(); };
actions.makeInvoice = async (el) => { await post(`/booking/${el.dataset.id}/invoice`); toast('Invoice dibuat'); ctx.refresh(); };
actions.markPaid = async (el) => { await post(`/booking/${el.dataset.id}/tandai-lunas`); toast('Invoice ditandai lunas'); ctx.refresh(); };

async function pesanan() {
  const ps = await api('/pesanan');
  return html`
    <div class="pagehead"><div><h1>Pesanan Sparepart</h1><p class="muted">Pesanan dari marketplace untuk sparepart bengkel Anda</p></div></div>
    ${ps.items.length ? ps.items.map((p) => html`
      <div class="card"><div class="row between"><div><b>Pesanan #${p.id}</b> <span class="muted">· ${p.customer_nama} · ${tgl(p.tanggal)} · ${p.metode_pembayaran}</span></div></div>
        <div class="tablewrap"><table><tbody>${p.lines.map((l) => html`<tr>
          <td>${l.nama} × ${l.qty}</td><td>${rupiah(l.subtotal)}</td><td>${badge(l.status)}</td>
          <td>${l.status === 'Selesai' ? '' : html`<button class="ghost sm" data-action="advanceLine" data-id="${l.id}">${l.status === 'Diproses' ? 'Tandai siap diambil' : 'Tandai selesai'}</button>`}</td></tr>`)}</tbody></table></div></div>`)
      : html`<div class="panel empty">Belum ada pesanan sparepart.</div>`}`;
}
actions.advanceLine = async (el) => { await post(`/pesanan/detail/${el.dataset.id}/maju`); ctx.refresh(); };

async function mekanik() {
  const mk = await api('/mitra/mekanik');
  return html`
    <div class="pagehead"><div><h1>Mekanik</h1><p class="muted">Anda membuat akun untuk mekanik; mereka login dengan peran "Mekanik"</p></div></div>
    <details class="panel"><summary><b>＋ Tambah mekanik</b></summary>
      <form data-submit="addMekanik" style="margin-top:12px">
        <div class="grid2"><div><label>Nama</label><input name="nama" required maxlength="100"></div><div><label>Spesialisasi</label><input name="spesialisasi" maxlength="80" placeholder="mis. Mesin, Kelistrikan"></div>
        <div><label>Email (untuk login)</label><input name="email" type="email" required></div><div><label>Password awal (min. 8)</label><input name="password" type="password" minlength="8" required autocomplete="new-password"></div></div>
        <button class="primary" type="submit">Buat akun mekanik</button>
      </form></details>
    <div class="panel tablewrap"><table><thead><tr><th>Nama</th><th>Spesialisasi</th><th>Email</th><th>Tugas aktif</th><th>Status</th><th></th></tr></thead><tbody>
      ${mk.items.length ? mk.items.map((m) => html`<tr><td>${m.nama}</td><td>${m.spesialisasi || '—'}</td><td>${m.email}</td><td>${m.tugas_aktif}</td><td>${m.aktif ? badge('Aktif') : html`<span class="badge b-bad">Nonaktif</span>`}</td>
        <td><button class="ghost sm" data-action="toggleMekanik" data-id="${m.id}">${m.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button> <button class="ghost sm" data-action="resetMekanikPw" data-id="${m.id}" data-nama="${m.nama}">Reset password</button></td></tr>`) : html`<tr><td colspan="6" class="empty">Belum ada mekanik.</td></tr>`}
    </tbody></table></div>`;
}
actions.addMekanik = async (form) => { await post('/mitra/mekanik', formData(form)); toast('Akun mekanik dibuat'); ctx.refresh(); };
actions.resetMekanikPw = async (el) => {
  const pw = prompt(`Password baru untuk ${el.dataset.nama} (minimal 8 karakter):`);
  if (pw === null) return;
  await post(`/mitra/mekanik/${el.dataset.id}/password`, { password: pw });
  toast(`Password ${el.dataset.nama} diganti. Sampaikan ke yang bersangkutan.`);
};
actions.toggleMekanik = async (el) => { await post(`/mitra/mekanik/${el.dataset.id}/toggle`); ctx.refresh(); };

// ---- Sparepart & layanan (pola yang sama: tambah, ubah sebaris, hapus) ----
async function sparepart() {
  const r = await api('/mitra/sparepart');
  return html`
    <div class="pagehead"><div><h1>Katalog Sparepart</h1><p class="muted">Sparepart aktif otomatis tampil di Marketplace untuk semua customer</p></div></div>
    <details class="panel"><summary><b>＋ Tambah sparepart</b></summary>
      <form data-submit="saveSparepart" style="margin-top:12px"><div class="grid2">
        <div><label>Nama</label><input name="nama" required maxlength="100"></div><div><label>Kategori</label><input name="kategori" required maxlength="40" placeholder="Cairan, Rem, Mesin…"></div>
        <div><label>Stok</label><input name="stok" type="number" min="0" required></div><div><label>Harga jual (Rp)</label><input name="harga_jual" type="number" min="0" required></div></div>
        <button class="primary" type="submit">Simpan</button></form></details>
    <div class="panel tablewrap"><table><thead><tr><th>Nama</th><th>Kategori</th><th>Stok</th><th>Harga</th><th></th></tr></thead><tbody>
      ${r.items.length ? r.items.map((s) => state.edit === `sp-${s.id}` ? html`<tr><td colspan="5">
        <form class="inline" data-submit="saveSparepart" data-id="${s.id}"><input name="nama" value="${s.nama}" required><input name="kategori" value="${s.kategori}" required>
        <input name="stok" type="number" min="0" value="${s.stok}" required><input name="harga_jual" type="number" min="0" value="${s.harga_jual}" required>
        <button class="primary sm" type="submit">Simpan</button><button class="ghost sm" type="button" data-action="cancelEdit">Batal</button></form></td></tr>`
        : html`<tr><td>${s.nama}</td><td>${s.kategori}</td><td>${s.stok < 10 ? html`<span class="badge b-bad">${s.stok}</span>` : s.stok}</td><td>${rupiah(s.harga_jual)}</td>
          <td><button class="ghost sm" data-action="editRow" data-key="sp-${s.id}">Ubah</button> <button class="ghost sm danger" data-action="delSparepart" data-id="${s.id}">Hapus</button></td></tr>`)
        : html`<tr><td colspan="5" class="empty">Belum ada sparepart.</td></tr>`}
    </tbody></table></div>`;
}
actions.editRow = (el) => { state.edit = el.dataset.key; ctx.refresh(); };
actions.cancelEdit = () => { state.edit = null; ctx.refresh(); };
actions.saveSparepart = async (form) => {
  const d = formData(form);
  if (form.dataset.id) await put(`/mitra/sparepart/${form.dataset.id}`, d); else await post('/mitra/sparepart', d);
  state.edit = null; toast('Sparepart disimpan'); ctx.refresh();
};
actions.delSparepart = async (el) => { if (!confirm('Hapus sparepart ini dari katalog?')) return; await del(`/mitra/sparepart/${el.dataset.id}`); ctx.refresh(); };

async function layanan() {
  const r = await api('/mitra/servis');
  return html`
    <div class="pagehead"><div><h1>Layanan & Harga</h1><p class="muted">Layanan yang bisa dipilih customer saat booking</p></div></div>
    <details class="panel"><summary><b>＋ Tambah layanan</b></summary>
      <form data-submit="saveServis" style="margin-top:12px"><div class="grid3">
        <div><label>Nama layanan</label><input name="nama_servis" required maxlength="80"></div><div><label>Harga jasa (Rp)</label><input name="harga" type="number" min="0" required></div>
        <div><label>Estimasi (menit)</label><input name="estimasi_menit" type="number" min="5" value="60" required></div></div>
        <button class="primary" type="submit">Simpan</button></form></details>
    <div class="panel tablewrap"><table><thead><tr><th>Layanan</th><th>Harga</th><th>Estimasi</th><th></th></tr></thead><tbody>
      ${r.items.length ? r.items.map((s) => state.edit === `sv-${s.id}` ? html`<tr><td colspan="4">
        <form class="inline" data-submit="saveServis" data-id="${s.id}"><input name="nama_servis" value="${s.nama_servis}" required><input name="harga" type="number" min="0" value="${s.harga}" required>
        <input name="estimasi_menit" type="number" min="5" value="${s.estimasi_menit}" required><button class="primary sm" type="submit">Simpan</button><button class="ghost sm" type="button" data-action="cancelEdit">Batal</button></form></td></tr>`
        : html`<tr><td>${s.nama_servis}</td><td>${rupiah(s.harga)}</td><td>${s.estimasi_menit} menit</td>
          <td><button class="ghost sm" data-action="editRow" data-key="sv-${s.id}">Ubah</button> <button class="ghost sm danger" data-action="delServis" data-id="${s.id}">Hapus</button></td></tr>`)
        : html`<tr><td colspan="4" class="empty">Belum ada layanan. Tambahkan minimal satu agar customer bisa booking.</td></tr>`}
    </tbody></table></div>`;
}
actions.saveServis = async (form) => {
  const d = formData(form);
  if (form.dataset.id) await put(`/mitra/servis/${form.dataset.id}`, d); else await post('/mitra/servis', d);
  state.edit = null; toast('Layanan disimpan'); ctx.refresh();
};
actions.delServis = async (el) => { if (!confirm('Hapus layanan ini?')) return; await del(`/mitra/servis/${el.dataset.id}`); ctx.refresh(); };

async function profil() {
  const { item: b } = await api('/mitra/bengkel');
  ctx.after.push(() => pickerMap(document.getElementById('profmap'), document.getElementById('plat'), document.getElementById('plng')));
  return html`
    <div class="pagehead"><div><h1>Profil Bengkel</h1><p class="muted">Status: ${badge(b.status)}</p></div></div>
    ${statusAlert(b.status)}
    <form class="panel" data-submit="saveProfil">
      <div class="grid2">
        <div><label>Nama bengkel</label><input name="nama" value="${b.nama}" required maxlength="100"></div>
        <div><label>Melayani kendaraan</label><select name="jenis">${['Motor & Mobil', 'Motor', 'Mobil'].map((j) => html`<option ${b.jenis === j ? raw('selected') : ''}>${j}</option>`)}</select></div>
      </div>
      <label>Alamat</label><input name="alamat" value="${b.alamat}" required maxlength="250">
      <label>Lokasi bengkel di peta</label>
      <div id="profmap" class="map small" role="region" aria-label="Pilih lokasi bengkel di peta"></div>
      <p class="muted" style="margin:-6px 0 12px">Klik peta atau seret penanda. Lokasi ini dipakai untuk menghitung jarak dari customer.</p>
      <div class="grid3">
        <div><label>Latitude</label><input id="plat" name="lat" value="${b.lat}" required></div>
        <div><label>Longitude</label><input id="plng" name="lng" value="${b.lng}" required></div>
        <div><label>Jam operasional</label><input name="jam_operasional" value="${b.jam_operasional}" required maxlength="40"></div>
      </div>
      <div class="actions" style="margin:0 0 12px"><button class="ghost" type="button" data-action="fillProfilLoc">📍 Isi koordinat dari lokasi saya</button></div>
      <button class="primary" type="submit">Simpan perubahan</button>
    </form>`;
}
actions.fillProfilLoc = async () => {
  const p = await getPosition();
  const la = document.getElementById('plat'), ln = document.getElementById('plng');
  la.value = p.lat.toFixed(6); ln.value = p.lng.toFixed(6);
  la.dispatchEvent(new Event('change')); // memindahkan penanda di peta
};
actions.saveProfil = async (form) => { await put('/mitra/bengkel', formData(form)); state.user = null; toast('Profil diperbarui'); ctx.refresh(); };

export const views = { ringkasan, booking, pesanan, mekanik, sparepart, layanan, profil };
