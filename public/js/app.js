import { api, post } from './api.js';
import { state, DEFAULT_LOC } from './state.js';
import { html, toHtml, actions, ctx, toast, skeleton, currentTheme, initTheme, toggleTheme } from './ui.js';
import * as auth from './auth-views.js';
import { views as customer } from './customer.js';
import { views as mitra } from './mitra.js';
import { views as mekanik } from './mekanik.js';
import { views as admin } from './admin.js';
import { notifikasi, akun } from './shared.js';

initTheme();

// Halaman Notifikasi & Akun dimiliki semua peran; Customer punya versi Akun sendiri (dengan daftar kendaraan).
const VIEWS = {
  customer: { notifikasi, akun, ...customer },
  mitra: { notifikasi, akun, ...mitra },
  mekanik: { notifikasi, akun, ...mekanik },
  admin: { notifikasi, akun, ...admin },
};
const NAV = {
  customer: [['cari', 'Cari Bengkel'], ['marketplace', 'Marketplace Sparepart'], ['riwayat', 'Riwayat Saya']],
  mitra: [['ringkasan', 'Ringkasan'], ['booking', 'Booking'], ['pesanan', 'Pesanan Sparepart'], ['mekanik', 'Mekanik'], ['sparepart', 'Sparepart'], ['layanan', 'Layanan'], ['profil', 'Profil']],
  mekanik: [['tugas', 'Tugas Saya']],
  admin: [['ringkasan', 'Ringkasan'], ['bengkel', 'Mitra Bengkel'], ['transaksi', 'Transaksi'], ['moderasi', 'Moderasi'], ['pengguna', 'Pengguna']],
};
const app = document.getElementById('app');
const setApp = (content) => { app.innerHTML = toHtml(content); };

function shell(content, page) {
  const u = state.user;
  const dark = currentTheme() === 'dark';
  return html`
    <a class="skip" href="#konten" data-action="skipContent">Lewati ke konten</a>
    <header class="topbar">
      <a class="brand" href="#/"><span class="logo">🔧</span> BengkelKu</a>
      <nav class="nav" aria-label="Menu utama">${NAV[u.role].map(([k, l]) => html`<a href="#/${u.role}/${k}" ${k === page ? html`class="active" aria-current="page"` : ''}>${l}</a>`)}</nav>
      <div class="userbox">
        <button class="theme-toggle" data-action="toggleTheme" aria-label="Ganti tema terang/gelap" title="Ganti tema">${dark ? '☀️' : '🌙'}</button>
        <a class="bell" href="#/${u.role}/notifikasi" aria-label="Notifikasi" ${page === 'notifikasi' ? html`aria-current="page"` : ''}>🔔<span class="count" id="bellcount" hidden></span></a>
        <a class="userlink" href="#/${u.role}/akun" title="Akun saya">${u.nama}</a><span class="role">${u.role_label}</span>
        <button data-action="logout">Keluar</button>
      </div>
    </header>
    <main id="konten" tabindex="-1">${content}</main>`;
}

let routing = 0;
let currentPage = null; // halaman yang sedang tampil (untuk fokus & reset gulir hanya saat berpindah)
async function route() {
  const token = ++routing; // abaikan hasil render lama jika pengguna berpindah halaman
  const [first, second] = location.hash.replace(/^#\/?/, '').split('/');

  // Selalu ambil profil terbaru (peran & status bengkel) dari server.
  try { state.user = (await api('/auth/me')).user; } catch { state.user = null; }

  if (!state.user) {
    currentPage = null;
    if (!['login', 'register', 'lupa', 'reset'].includes(first)) { location.hash = '#/login'; return; }
    if (!('demoLoaded' in state)) { try { state.cfg = await api('/config'); } catch { /* abaikan */ } state.demoLoaded = true; }
    setApp(first === 'register' ? auth.register() : first === 'lupa' ? auth.lupa() : first === 'reset' ? auth.reset(second) : auth.login());
    return;
  }

  const role = state.user.role;
  const pages = VIEWS[role];
  if (first !== role || !pages[second]) { location.hash = `#/${role}/${NAV[role][0][0]}`; return; }

  try {
    ctx.after = [];
    if (second !== currentPage) setApp(shell(skeleton(), second)); // skeleton saat halaman sedang diambil
    const content = await pages[second]();
    if (token !== routing) return;
    const changed = second !== currentPage;
    currentPage = second;
    setApp(shell(content, second));
    if (changed) {
      window.scrollTo(0, 0);
      const h = app.querySelector('h1'); // arahkan fokus ke judul demi pembaca layar
      if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
    }
    ctx.after.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } }); // mis. inisialisasi peta setelah elemen ada di halaman
    refreshBell();
  } catch (err) {
    if (token !== routing) return;
    if (err.status === 401) { location.hash = '#/login'; return; }
    setApp(shell(html`<div class="alert err">Gagal memuat halaman: ${err.message}</div>`, second));
  }
}
// Angka notifikasi belum dibaca pada ikon lonceng.
async function refreshBell() {
  if (!state.user) return;
  try {
    const { unread } = await api('/notifikasi/jumlah');
    const el = document.getElementById('bellcount');
    if (el) { el.textContent = unread > 99 ? '99+' : String(unread); el.hidden = unread === 0; }
  } catch { /* abaikan */ }
}
setInterval(refreshBell, 30000);

// Render ulang halaman aktif tanpa menggulung ke atas (dipakai setelah aksi).
ctx.refresh = async () => {
  const y = window.scrollY;
  await route();
  window.scrollTo(0, y);
};

actions.logout = async () => {
  await post('/auth/logout');
  state.user = null;
  currentPage = null;
  state.cart = []; localStorage.removeItem('bk_cart');
  // Data pilihan pengguna sebelumnya tidak boleh terbawa ke pengguna berikutnya di browser yang sama.
  Object.assign(state, { loc: { ...DEFAULT_LOC }, radius: 10, marketQ: '', marketKat: '', edit: null, kendaraan: [] });
  location.hash = '#/login';
  route();
};

// Lompat ke konten (skip link) tanpa mengubah URL.
actions.skipContent = () => {
  const m = document.getElementById('konten');
  if (m) { m.focus({ preventScroll: true }); m.scrollIntoView({ block: 'start' }); }
};
// Ganti tema tanpa memuat ulang halaman.
actions.toggleTheme = (el) => { el.textContent = toggleTheme() === 'dark' ? '☀️' : '🌙'; };

async function run(fn, el, e, btn) {
  if (!fn) return;
  if (btn) btn.disabled = true;
  try { await fn(el, e); }
  catch (err) {
    if (err.status === 401 && state.user) { state.user = null; location.hash = '#/login'; }
    toast(err.message || 'Terjadi kesalahan', 'error');
  } finally { if (btn && btn.isConnected) btn.disabled = false; }
}
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (el && !el.disabled) { e.preventDefault(); run(actions[el.dataset.action], el, e, el); }
});
document.addEventListener('submit', (e) => {
  const f = e.target.closest('form[data-submit]');
  if (!f) return;
  e.preventDefault();
  run(actions[f.dataset.submit], f, e, f.querySelector('button[type=submit]'));
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  if (el) run(actions[el.dataset.change], el, e);
});

window.addEventListener('hashchange', route);
route();
