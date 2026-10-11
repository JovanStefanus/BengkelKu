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
  el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), type === 'error' ? 6000 : 3500);
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
