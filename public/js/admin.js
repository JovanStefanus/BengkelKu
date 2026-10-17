import { api, post, del } from './api.js';
import { html, actions, ctx, rupiah, tgl, badge, stars, toast, confirmDialog } from './ui.js';

async function ringkasan() {
  const s = await api('/admin/stats');
  return html`
    <div class="pagehead"><div><h1>Ringkasan Platform</h1><p class="muted">Seluruh mitra bengkel dan transaksi marketplace</p></div></div>
    ${s.bengkel_menunggu ? html`<div class="alert warn">Ada <b>${s.bengkel_menunggu}</b> pendaftaran bengkel menunggu persetujuan. <a href="#/admin/bengkel">Tinjau sekarang</a></div>` : ''}
    <div class="stats">
      <div class="stat"><div class="l">Bengkel aktif</div><div class="n">${s.bengkel_aktif}</div></div>
      <div class="stat"><div class="l">Menunggu persetujuan</div><div class="n">${s.bengkel_menunggu}</div></div>
      <div class="stat"><div class="l">Customer</div><div class="n">${s.total_customer}</div></div>
      <div class="stat"><div class="l">Mekanik aktif</div><div class="n">${s.total_mekanik}</div></div>
    </div>
    <div class="stats">
      <div class="stat"><div class="l">Total booking</div><div class="n">${s.total_booking}</div><div class="l">${s.booking_selesai} selesai</div></div>
      <div class="stat"><div class="l">Pendapatan servis (lunas)</div><div class="n">${rupiah(s.pendapatan_servis)}</div></div>
      <div class="stat"><div class="l">Penjualan sparepart</div><div class="n">${rupiah(s.pendapatan_sparepart)}</div></div>
    </div>
    <div class="panel tablewrap"><h2>Bengkel dengan booking terbanyak</h2><table><thead><tr><th>Bengkel</th><th>Booking</th><th>Rating</th></tr></thead><tbody>
      ${s.top_bengkel.map((b) => html`<tr><td>${b.nama}</td><td>${b.jml_booking}</td><td><span class="stars">${stars(b.rating)}</span> ${b.rating ?? '—'}</td></tr>`)}</tbody></table></div>`;
}

async function bengkel() {
  const r = await api('/admin/bengkel');
  return html`
    <div class="pagehead"><div><h1>Mitra Bengkel</h1><p class="muted">Verifikasi pendaftaran dan pantau seluruh mitra</p></div></div>
    <div class="panel tablewrap"><table><thead><tr><th>Bengkel</th><th>Pemilik</th><th>Jenis</th><th>Mekanik</th><th>Rating</th><th>Status</th><th></th></tr></thead><tbody>
      ${r.items.map((b) => html`<tr>
        <td><b>${b.nama}</b><br><span class="muted">${b.alamat}</span></td><td>${b.pemilik}<br><span class="muted">${b.pemilik_email}</span></td>
        <td>${b.jenis}</td><td>${b.jml_mekanik}</td><td>${b.rating ?? '—'}</td><td>${badge(b.status)}</td>
        <td>${b.status === 'Menunggu Persetujuan' ? html`<button class="primary sm" data-action="approveBengkel" data-id="${b.id}">Setujui</button> <button class="ghost sm danger" data-action="rejectBengkel" data-id="${b.id}">Tolak</button>`
          : b.status === 'Ditolak' ? html`<button class="ghost sm" data-action="approveBengkel" data-id="${b.id}">Setujui</button>`
          : html`<button class="ghost sm danger" data-action="rejectBengkel" data-id="${b.id}">Nonaktifkan</button>`}</td></tr>`)}</tbody></table></div>`;
}
actions.approveBengkel = async (el) => { await post(`/admin/bengkel/${el.dataset.id}/setujui`); toast('Bengkel disetujui dan kini tampil di pencarian'); ctx.refresh(); };
actions.rejectBengkel = async (el) => { if (!(await confirmDialog('Tolak / nonaktifkan bengkel ini? Bengkel tidak akan tampil di pencarian customer.', { title: 'Tolak bengkel', confirmLabel: 'Ya, tolak', danger: true }))) return; await post(`/admin/bengkel/${el.dataset.id}/tolak`); toast('Status bengkel diperbarui'); ctx.refresh(); };

async function transaksi() {
  const [bk, ps] = await Promise.all([api('/booking'), api('/pesanan')]);
  return html`
    <div class="pagehead"><div><h1>Transaksi</h1><p class="muted">Booking servis dan pesanan sparepart seluruh platform</p></div></div>
    <div class="panel tablewrap"><h2>Booking servis (terbaru)</h2><table><thead><tr><th>#</th><th>Customer</th><th>Bengkel</th><th>Mekanik</th><th>Layanan</th><th>Status</th><th>Invoice</th></tr></thead><tbody>
      ${bk.items.map((b) => html`<tr><td>${b.id}</td><td>${b.customer_nama}</td><td>${b.bengkel_nama}</td><td>${b.mekanik_nama || '—'}</td><td>${b.layanan.map((l) => l.nama_servis).join(', ')}</td><td>${badge(b.status)}</td>
        <td>${b.invoice_id ? html`${rupiah(b.invoice_total)} ${badge(b.invoice_status)}` : '—'}</td></tr>`)}</tbody></table></div>
    <div class="panel tablewrap"><h2>Pesanan sparepart (terbaru)</h2><table><thead><tr><th>#</th><th>Tanggal</th><th>Customer</th><th>Item</th><th>Status</th><th>Total</th></tr></thead><tbody>
      ${ps.items.length ? ps.items.map((p) => html`<tr><td>${p.id}</td><td>${tgl(p.tanggal)}</td><td>${p.customer_nama}</td><td>${p.lines.map((l) => `${l.nama} ×${l.qty} (${l.bengkel_nama})`).join('; ')}</td><td>${badge(p.status)}</td><td>${rupiah(p.total)}</td></tr>`)
        : html`<tr><td colspan="6" class="empty">Belum ada pesanan.</td></tr>`}</tbody></table></div>`;
}

async function moderasi() {
  const [sp, rt] = await Promise.all([api('/admin/sparepart'), api('/admin/rating')]);
  return html`
    <div class="pagehead"><div><h1>Moderasi</h1><p class="muted">Tinjau sparepart di marketplace dan ulasan customer</p></div></div>
    <div class="panel tablewrap"><h2>Sparepart</h2><table><thead><tr><th>Nama</th><th>Bengkel</th><th>Harga</th><th>Stok</th><th>Status</th><th></th></tr></thead><tbody>
      ${sp.items.map((s) => html`<tr><td>${s.nama}</td><td>${s.bengkel_nama}</td><td>${rupiah(s.harga_jual)}</td><td>${s.stok}</td>
        <td>${s.aktif ? badge('Aktif') : html`<span class="badge b-bad">Disembunyikan</span>`}</td>
        <td><button class="ghost sm" data-action="toggleSparepart" data-id="${s.id}">${s.aktif ? 'Sembunyikan' : 'Tampilkan'}</button></td></tr>`)}</tbody></table></div>
    <div class="panel tablewrap"><h2>Ulasan</h2><table><thead><tr><th>Bengkel</th><th>Customer</th><th>Skor</th><th>Ulasan</th><th></th></tr></thead><tbody>
      ${rt.items.length ? rt.items.map((r) => html`<tr><td>${r.bengkel_nama}</td><td>${r.customer_nama}</td><td><span class="stars">${stars(r.skor)}</span></td><td>${r.ulasan || '—'}</td>
        <td><button class="ghost sm danger" data-action="deleteRating" data-id="${r.id}">Hapus</button></td></tr>`) : html`<tr><td colspan="5" class="empty">Belum ada ulasan.</td></tr>`}</tbody></table></div>`;
}
actions.toggleSparepart = async (el) => { await post(`/admin/sparepart/${el.dataset.id}/toggle`); ctx.refresh(); };
actions.deleteRating = async (el) => { if (!(await confirmDialog('Hapus ulasan ini? Tindakan ini tidak dapat dibatalkan.', { title: 'Hapus ulasan', confirmLabel: 'Hapus', danger: true }))) return; await del(`/admin/rating/${el.dataset.id}`); toast('Ulasan dihapus'); ctx.refresh(); };

async function pengguna() {
  const r = await api('/admin/users');
  const label = { customer: 'Customer', mitra: 'Mitra Bengkel', mekanik: 'Mekanik', admin: 'Admin Platform' };
  return html`
    <div class="pagehead"><div><h1>Pengguna</h1><p class="muted">${r.items.length} akun terdaftar</p></div></div>
    <div class="panel tablewrap"><table><thead><tr><th>Nama</th><th>Email</th><th>Peran</th><th>Terdaftar</th></tr></thead><tbody>
      ${r.items.map((u) => html`<tr><td>${u.nama}</td><td>${u.email}</td><td>${label[u.role]}</td><td>${tgl(u.created_at)}</td></tr>`)}</tbody></table></div>`;
}

export const views = { ringkasan, bengkel, transaksi, moderasi, pengguna };
