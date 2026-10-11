// Halaman yang dimiliki semua peran: Notifikasi dan Akun Saya.
import { api, post, put } from './api.js';
import { state } from './state.js';
import { html, raw, actions, ctx, tgl, toast, formData } from './ui.js';

export async function notifikasi() {
  const { items, unread } = await api('/notifikasi');
  return html`
    <div class="pagehead"><div><h1>Notifikasi</h1><p class="muted">${unread ? `${unread} belum dibaca` : 'Semua sudah dibaca'}</p></div>
      ${unread ? html`<button class="ghost" data-action="readAll">Tandai semua dibaca</button>` : ''}</div>
    ${items.length ? items.map((n) => html`
      <button class="notif ${n.dibaca ? '' : 'unread'}" data-action="openNotif" data-id="${n.id}" data-link="${n.link || ''}">
        <span class="dot ${n.dibaca ? 'read' : ''}"></span>
        <span><b>${n.judul}</b>${n.pesan}<span class="t">${tgl(n.created_at)}</span></span>
      </button>`) : html`<div class="panel empty">Belum ada notifikasi. Pembaruan status booking dan pesanan akan muncul di sini.</div>`}`;
}
actions.openNotif = async (el) => {
  if (el.classList.contains('unread')) await post('/notifikasi/baca', { id: Number(el.dataset.id) });
  const link = el.dataset.link;
  if (link && link !== location.hash) location.hash = link; else ctx.refresh();
};
actions.readAll = async () => { await post('/notifikasi/baca', {}); ctx.refresh(); };

export function profilSection() {
  const u = state.user;
  return html`
    <form class="panel" data-submit="saveProfile">
      <h2>Profil</h2>
      <div class="grid2">
        <div><label for="pf-nama">Nama</label><input id="pf-nama" name="nama" value="${u.nama}" required maxlength="100"></div>
        <div><label for="pf-hp">No. HP</label><input id="pf-hp" name="no_hp" value="${u.no_hp || ''}" maxlength="20" inputmode="tel"></div>
      </div>
      <label for="pf-email">Email</label><input id="pf-email" value="${u.email}" disabled>
      <p class="muted" style="margin-bottom:12px">Email dipakai untuk login dan tidak dapat diubah. Peran: ${u.role_label}.</p>
      <button class="primary" type="submit">Simpan profil</button>
    </form>`;
}
export function passwordSection() {
  return html`
    <form class="panel" data-submit="changePassword">
      <h2>Ganti password</h2>
      <div class="grid3">
        <div><label for="pw-lama">Password lama</label><input id="pw-lama" name="password_lama" type="password" required autocomplete="current-password"></div>
        <div><label for="pw-baru">Password baru (min. 8)</label><input id="pw-baru" name="password_baru" type="password" required minlength="8" autocomplete="new-password"></div>
        <div><label for="pw-ulang">Ulangi password baru</label><input id="pw-ulang" name="ulangi" type="password" required minlength="8" autocomplete="new-password"></div>
      </div>
      <p class="muted" style="margin-bottom:12px">Setelah diganti, perangkat lain yang sedang login akan otomatis keluar.</p>
      <button class="primary" type="submit">Ganti password</button>
    </form>`;
}
export async function akun() {
  return html`<div class="pagehead"><div><h1>Akun Saya</h1><p class="muted">${state.user.nama} · ${state.user.role_label}</p></div></div>${profilSection()}${passwordSection()}`;
}

actions.saveProfile = async (form) => { await put('/auth/profile', formData(form)); toast('Profil diperbarui'); ctx.refresh(); };
actions.changePassword = async (form) => {
  const d = formData(form);
  if (d.password_baru !== d.ulangi) throw new Error('Konfirmasi password baru tidak sama');
  await post('/auth/ganti-password', { password_lama: d.password_lama, password_baru: d.password_baru });
  form.reset();
  toast('Password diganti. Perangkat lain otomatis keluar.');
};
