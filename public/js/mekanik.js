import { api, post } from './api.js';
import { state } from './state.js';
import { html, actions, ctx, rupiah, tgl, badge, toast, formData } from './ui.js';

async function tugas() {
  const [bk, sp] = await Promise.all([api('/booking'), api('/mekanik/sparepart')]);
  const aktif = bk.items.filter((b) => ['Diterima', 'Dikerjakan'].includes(b.status));
  const riwayat = bk.items.filter((b) => b.status === 'Selesai');
  const m = state.user.mekanik;
  return html`
    <div class="pagehead"><div><h1>Tugas Saya</h1><p class="muted">${state.user.nama} · ${m.bengkel_nama}${m.spesialisasi ? ' · ' + m.spesialisasi : ''}</p></div></div>
    <h2>Sedang ditugaskan (${aktif.length})</h2>
    ${aktif.length ? aktif.map((b) => html`
    <article class="card">
      <div class="row between">
        <div><h3>#${b.id} · ${b.kendaraan_merk} • ${b.kendaraan_nopol}</h3><p class="muted">Customer: ${b.customer_nama} · Jadwal ${tgl(b.tanggal_booking)}</p></div>
        ${badge(b.status)}
      </div>
      <p class="meta">Layanan: ${b.layanan.map((l) => l.nama_servis).join(', ')}</p>
      <p class="muted">Keluhan: ${b.keluhan}</p>
      ${b.sparepart.length ? html`<p class="muted">Sparepart dipakai: ${b.sparepart.map((s) => `${s.nama} ×${s.qty}`).join(', ')}</p>` : ''}
      <div class="actions">
        ${b.status === 'Diterima' ? html`<button class="primary sm" data-action="startJob" data-id="${b.id}">Mulai kerjakan</button>` : ''}
        ${b.status === 'Dikerjakan' ? html`
          <form class="inline" data-submit="addPart" data-id="${b.id}">
            <select name="id_sparepart" required><option value="">Sparepart yang dipakai…</option>${sp.items.map((s) => html`<option value="${s.id}">${s.nama} (stok ${s.stok}, ${rupiah(s.harga_jual)})</option>`)}</select>
            <input name="qty" type="number" min="1" max="100" value="1" style="max-width:80px" aria-label="Jumlah">
            <button class="ghost sm" type="submit">Catat</button>
          </form>
          <button class="primary sm" data-action="finishJob" data-id="${b.id}">Tandai selesai</button>` : ''}
      </div>
    </article>`) : html`<div class="panel empty">Belum ada tugas. Tugas muncul setelah pihak bengkel menugaskan Anda.</div>`}
    <h2 style="margin-top:22px">Riwayat selesai</h2>
    ${riwayat.length ? html`<div class="panel tablewrap"><table><thead><tr><th>#</th><th>Kendaraan</th><th>Layanan</th><th>Tanggal</th></tr></thead><tbody>
      ${riwayat.map((b) => html`<tr><td>${b.id}</td><td>${b.kendaraan_merk} • ${b.kendaraan_nopol}</td><td>${b.layanan.map((l) => l.nama_servis).join(', ')}</td><td>${tgl(b.tanggal_booking)}</td></tr>`)}</tbody></table></div>`
      : html`<div class="panel empty">Belum ada riwayat.</div>`}`;
}
actions.startJob = async (el) => { await post(`/booking/${el.dataset.id}/mulai`); toast('Status: Dikerjakan'); ctx.refresh(); };
actions.finishJob = async (el) => { if (!confirm('Tandai servis ini selesai?')) return; await post(`/booking/${el.dataset.id}/selesai`); toast('Servis selesai. Bengkel akan menerbitkan invoice.'); ctx.refresh(); };
actions.addPart = async (form) => { await post(`/booking/${form.dataset.id}/sparepart`, formData(form)); toast('Sparepart dicatat, stok berkurang'); ctx.refresh(); };

export const views = { tugas };
