// Helper tampilan. Semua teks dinamis di-escape otomatis oleh html``, sehingga aman dari XSS.
export const actions = {};          // handler untuk atribut data-action / data-submit / data-change
export const ctx = { refresh() {}, after: [] }; // refresh diisi app.js; after = fungsi yang dijalankan setelah halaman dirender (mis. inisialisasi peta)

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const raw = (s) => ({ __raw: String(s) });
const fmt = (v) => {
  if (v === null || v === undefined || v === false || v === true) return '';
  if (Array.isArray(v)) return v.map(fmt).join('');
  if (typeof v === 'object' && '__raw' in v) return v.__raw;
  return esc(v);
};
export function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => { out += s; if (i < vals.length) out += fmt(vals[i]); });
  return { __raw: out };
}
export const toHtml = (v) => fmt(v);

export const rupiah = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
export function tgl(s) {
  if (!s) return '—';
  const d = new Date(String(s).includes('T') ? s : String(s).replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}
export const stars = (n) => (n ? '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n)) : '☆☆☆☆☆');

const BADGE = {
  'Menunggu Verifikasi': 'wait', 'Menunggu Persetujuan': 'wait', 'Belum Lunas': 'wait', 'Diproses': 'wait',
  'Diterima': 'run', 'Dikerjakan': 'run', 'Siap Diambil': 'run', 'Sebagian Siap': 'run',
  'Selesai': 'done', 'Aktif': 'done', 'Lunas': 'done',
  'Ditolak': 'bad', 'Dibatalkan': 'bad',
};
export const badge = (s) => html`<span class="badge b-${BADGE[s] || 'wait'}">${s}</span>`;

export function toast(msg, type = 'ok') {
  const el = document.createElement('div');
  el.className = 'toast' + (type === 'error' ? ' error' : '');
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.innerHTML = `<span class="toast-icon" aria-hidden="true">${type === 'error' ? '!' : '✓'}</span>` +
    `<span class="toast-msg">${esc(msg)}</span>` +
    `<button class="toast-close" type="button" aria-label="Tutup notifikasi">×</button>`;
  const box = document.getElementById('toasts');
  box.appendChild(el);
  const remove = () => { el.classList.add('out'); setTimeout(() => el.remove(), 180); };
  el.querySelector('.toast-close').addEventListener('click', remove);
  setTimeout(remove, type === 'error' ? 6000 : 3500);
}

// Kerangka pemuatan (skeleton) saat halaman sedang diambil.
export function skeleton() {
  return html`<div class="skel-page" aria-hidden="true">
    <div class="skel skel-title"></div>
    <div class="skel skel-text"></div>
    <div class="skel skel-card"></div>
    <div class="skel skel-card"></div>
  </div>`;
}

export const emptyState = (icon, title, text = '') => html`<div class="empty-state">
  <div class="es-icon" aria-hidden="true">${icon}</div><b>${title}</b>${text ? html`<p class="muted">${text}</p>` : ''}</div>`;

// Dialog aksesibel pengganti confirm()/prompt() bawaan browser.
export function dialog({ title = '', message = '', confirmLabel = 'OK', cancelLabel = 'Batal', danger = false, input = null }) {
  return new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'modal-backdrop';
    back.innerHTML =
      `<div class="modal" role="dialog" aria-modal="true"${title ? ' aria-labelledby="modal-title"' : ''}>` +
      (title ? `<h3 id="modal-title">${esc(title)}</h3>` : '') +
      (message ? `<p>${esc(message)}</p>` : '') +
      (input ? `<input class="modal-input" value="${esc(input.value ?? '')}" placeholder="${esc(input.placeholder ?? '')}"${input.type === 'password' ? ' type="password"' : ''}>` : '') +
      `<div class="actions modal-actions">` +
      `<button class="ghost" type="button" data-modal="cancel">${esc(cancelLabel)}</button>` +
      `<button class="primary${danger ? ' solid-danger' : ''}" type="button" data-modal="ok">${esc(confirmLabel)}</button>` +
      `</div></div>`;

    const prevFocus = document.activeElement;
    const field = back.querySelector('.modal-input');
    const close = (ok) => {
      document.removeEventListener('keydown', onKey, true);
      back.remove();
      if (prevFocus && prevFocus.isConnected) prevFocus.focus();
      resolve({ ok, value: field ? field.value : '' });
    };
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(false); }
      else if (e.key === 'Enter' && (e.target === field || !field)) { e.preventDefault(); close(true); }
    }
    back.addEventListener('click', (e) => {
      if (e.target === back || e.target.closest('[data-modal="cancel"]')) close(false);
      else if (e.target.closest('[data-modal="ok"]')) close(true);
    });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(back);
    (field || back.querySelector('[data-modal="ok"]')).focus();
  });
}

export const confirmDialog = (message, { title = 'Konfirmasi', confirmLabel = 'Ya, lanjutkan', cancelLabel = 'Batal', danger = false } = {}) =>
  dialog({ title, message, confirmLabel, cancelLabel, danger }).then((r) => r.ok);

export const promptDialog = (message, { title = 'Input', confirmLabel = 'Simpan', cancelLabel = 'Batal', value = '', type = 'text', placeholder = '' } = {}) =>
  dialog({ title, message, confirmLabel, cancelLabel, input: { value, type, placeholder } }).then((r) => (r.ok ? r.value : null));

// Tema terang/gelap: menghormati preferensi sistem, bisa ditimpa manual dan diingat.
const THEME_KEY = 'bk_theme';
export const currentTheme = () => document.documentElement.dataset.theme ||
  (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
export function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
}
export function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem(THEME_KEY, next);
  return next;
}

export function formData(form) {
  const o = {};
  new FormData(form).forEach((v, k) => { o[k] = k in o ? [].concat(o[k], v) : v; });
  return o;
}
export const localDateTimeMin = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Browser tidak mendukung GPS'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => reject(new Error(e.code === 1 ? 'Izin lokasi ditolak. Aktifkan izin lokasi di browser.' : 'Lokasi tidak dapat dideteksi')),
      { enableHighAccuracy: false, timeout: 10000 }
    );
  });
}
