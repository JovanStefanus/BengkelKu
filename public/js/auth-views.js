import { post } from './api.js';
import { pickerMap } from './map.js';
import { state } from './state.js';
import { html, raw, toHtml, actions, toast, formData, getPosition, ctx } from './ui.js';

const ROLES = [
  ['customer', 'Customer', 'Cari bengkel, booking servis & beli sparepart'],
  ['mitra', 'Mitra Bengkel', 'Kelola bengkel, mekanik & sparepart'],
  ['mekanik', 'Mekanik', 'Kerjakan servis yang ditugaskan'],
  ['admin', 'Admin Platform', 'Kelola seluruh mitra & marketplace'],
];
const REGISTERABLE = ['customer', 'mitra'];
const DEMO = [
  ['Customer', 'budi@example.com', 'password123', 'customer'],
  ['Mitra Bengkel', 'mitra1@example.com', 'password123', 'mitra'],
  ['Mekanik', 'rudi@bengkelku.id', 'password123', 'mekanik'],
  ['Admin Platform', 'admin@bengkelku.id', 'admin12345', 'admin'],
];

const side = html`
  <aside class="auth-side">
    <div>
      <span class="brand"><span class="logo">🔧</span> BengkelKu</span>
      <h1>Temukan bengkel terdekat,<br>servis tanpa antre.</h1>
      <p>Marketplace bengkel motor & mobil: booking servis, pantau progres, dan beli sparepart dalam satu tempat.</p>
    </div>
    <ul><li>📍 Cari bengkel dalam radius 5–10 km</li><li>🔧 Mekanik ditugaskan langsung oleh bengkel</li><li>🛒 Marketplace sparepart lintas bengkel</li></ul>
  </aside>`;

const roleCards = (selected, only) => html`
  <div class="roles" role="radiogroup" aria-label="Pilih peran">
    ${ROLES.filter(([k]) => !only || only.includes(k)).map(([k, l, d]) => html`
      <label class="role"><input type="radio" name="role" value="${k}" ${selected === k ? raw('checked') : ''} data-change="roleChange"><b>${l}</b><span>${d}</span></label>`)}
  </div>`;

function loginHint(role) {
  if (role === 'mekanik') return 'Akun mekanik dibuat oleh pemilik bengkel tempat Anda bekerja. Hubungi bengkel Anda jika belum punya akun.';
  if (role === 'admin') return 'Akun Admin Platform dibuat oleh pengembang sistem dan tidak tersedia untuk pendaftaran.';
  return '';
}

export function login(role = 'customer') {
  return html`
  <div class="auth">${side}
    <div class="auth-main"><div class="auth-box">
      <h2>Masuk ke BengkelKu</h2>
      <p class="muted">Pilih peran Anda, lalu masukkan email & password.</p>
      <form data-submit="login" novalidate>
        ${roleCards(role)}
        <p class="hint" id="roleHint" ${loginHint(role) ? '' : raw('hidden')}>${loginHint(role)}</p>
        <label for="email">Email</label><input id="email" name="email" type="email" autocomplete="username" required>
        <label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required>
        <p class="forgot"><a href="#/lupa">Lupa password?</a></p>
        <button class="primary block" type="submit">Masuk</button>
      </form>
      <p class="switch" id="regLink" ${REGISTERABLE.includes(role) ? '' : raw('hidden')}>Belum punya akun? <a href="#/register">Daftar sekarang</a></p>
      ${state.cfg.demo ? html`
      <details class="demo"><summary>Akun demo (klik untuk mengisi otomatis)</summary>
        <table><tbody>${DEMO.map(([l, e, p, r]) => html`<tr><td>${l}</td><td><button type="button" data-action="fillDemo" data-email="${e}" data-pass="${p}" data-role="${r}">${e}</button></td></tr>`)}</tbody></table>
        <p class="muted">Password akun demo selain admin: password123</p>
      </details>` : ''}
    </div></div>
  </div>`;
}

export function register(role = 'customer') {
  return html`
  <div class="auth">${side}
    <div class="auth-main"><div class="auth-box">
      <h2>Daftar akun baru</h2>
      <p class="muted">Pendaftaran tersedia untuk Customer dan Mitra Bengkel. Akun mekanik dibuat oleh bengkel.</p>
      <form data-submit="register" novalidate>
        ${roleCards(role, REGISTERABLE)}
        <div class="grid2">
          <div><label for="nama">Nama lengkap</label><input id="nama" name="nama" required maxlength="100" autocomplete="name"></div>
          <div><label for="no_hp">No. HP</label><input id="no_hp" name="no_hp" inputmode="tel" maxlength="20" autocomplete="tel"></div>
        </div>
        <label for="email">Email</label><input id="email" name="email" type="email" required autocomplete="username">
        <label for="password">Password (min. 8 karakter)</label><input id="password" name="password" type="password" required minlength="8" autocomplete="new-password">
        <div id="mitraFields" ${role === 'mitra' ? '' : raw('hidden')}>
          <p class="hint">Bengkel Anda akan berstatus <b>Menunggu Persetujuan</b> sampai diverifikasi Admin Platform, baru kemudian muncul di pencarian customer.</p>
          <label for="bnama">Nama bengkel</label><input id="bnama" name="bnama" maxlength="100">
          <label for="balamat">Alamat bengkel</label><input id="balamat" name="balamat" maxlength="250">
          <label for="bjenis">Melayani kendaraan</label>
          <select id="bjenis" name="bjenis"><option>Motor & Mobil</option><option>Motor</option><option>Mobil</option></select>
          <label>Lokasi bengkel di peta</label>
          <div id="regmap" class="map small" role="region" aria-label="Pilih lokasi bengkel di peta"></div>
          <p class="muted" style="margin:-6px 0 12px">Klik peta atau seret penanda untuk menentukan lokasi bengkel.</p>
          <div class="grid2">
            <div><label for="blat">Latitude</label><input id="blat" name="blat" inputmode="decimal" placeholder="-6.9175"></div>
            <div><label for="blng">Longitude</label><input id="blng" name="blng" inputmode="decimal" placeholder="107.6191"></div>
          </div>
          <button class="ghost" type="button" data-action="fillBengkelLoc" style="margin-bottom:14px">📍 Isi dari lokasi saya saat ini</button>
        </div>
        <button class="primary block" type="submit">Daftar</button>
      </form>
      <p class="switch">Sudah punya akun? <a href="#/login">Masuk</a></p>
    </div></div>
  </div>`;
}

actions.roleChange = (el) => {
  const role = el.value;
  const hint = document.getElementById('roleHint');
  if (hint) { hint.textContent = loginHint(role); hint.hidden = !loginHint(role); }
  const reg = document.getElementById('regLink');
  if (reg) reg.hidden = !REGISTERABLE.includes(role);
  const mf = document.getElementById('mitraFields');
  if (mf) mf.hidden = role !== 'mitra';
  if (role === 'mitra') initRegisterMap();
};
function initRegisterMap() {
  pickerMap(document.getElementById('regmap'), document.getElementById('blat'), document.getElementById('blng'));
  setTimeout(() => window.dispatchEvent(new Event('resize')), 100); // peta di dalam blok yang baru ditampilkan perlu menghitung ulang ukurannya
}

actions.fillDemo = (el) => {
  const f = document.querySelector('form[data-submit="login"]');
  f.querySelector(`input[name=role][value=${el.dataset.role}]`).checked = true;
  actions.roleChange({ value: el.dataset.role });
  f.email.value = el.dataset.email;
  f.password.value = el.dataset.pass;
};

actions.fillBengkelLoc = async () => {
  const p = await getPosition();
  const la = document.getElementById('blat'), ln = document.getElementById('blng');
  la.value = p.lat.toFixed(6); ln.value = p.lng.toFixed(6);
  la.dispatchEvent(new Event('change')); // memindahkan penanda di peta
  toast('Koordinat diisi dari lokasi Anda');
};

actions.login = async (form) => {
  const d = formData(form);
  if (!d.email || !d.password) throw new Error('Email dan password wajib diisi');
  await post('/auth/login', { email: d.email, password: d.password, role: d.role });
  state.user = null; // dimuat ulang dari /auth/me
  location.hash = '#/';
  ctx.refresh();
};

actions.register = async (form) => {
  const d = formData(form);
  const base = { nama: d.nama, email: d.email, password: d.password, no_hp: d.no_hp || undefined };
  if (d.role === 'mitra') {
    await post('/auth/register/mitra', { ...base, bengkel: { nama: d.bnama, alamat: d.balamat, jenis: d.bjenis, lat: d.blat, lng: d.blng } });
    toast('Pendaftaran berhasil. Bengkel Anda menunggu persetujuan admin.');
  } else {
    await post('/auth/register/customer', base);
    toast('Pendaftaran berhasil. Selamat datang di BengkelKu!');
  }
  state.user = null;
  location.hash = '#/';
  ctx.refresh();
};

// ---- Lupa & reset password ----
export function lupa() {
  return html`
  <div class="auth">${side}
    <div class="auth-main"><div class="auth-box">
      <h2>Lupa password</h2>
      <p class="muted">Masukkan email akun Anda. Kami akan mengirim tautan untuk mengatur ulang password (berlaku 30 menit).</p>
      <form data-submit="forgot" novalidate style="margin-top:16px">
        <label for="email">Email</label><input id="email" name="email" type="email" required autocomplete="username">
        <button class="primary block" type="submit">Kirim tautan reset</button>
      </form>
      <div id="devbox" class="hint" style="margin-top:14px" hidden></div>
      <p class="switch"><a href="#/login">← Kembali ke login</a></p>
    </div></div>
  </div>`;
}
export function reset(token) {
  return html`
  <div class="auth">${side}
    <div class="auth-main"><div class="auth-box">
      <h2>Atur ulang password</h2>
      <p class="muted">Buat password baru untuk akun Anda.</p>
      <form data-submit="resetPassword" data-token="${token || ''}" novalidate style="margin-top:16px">
        <label for="np1">Password baru (min. 8 karakter)</label><input id="np1" name="password" type="password" required minlength="8" autocomplete="new-password">
        <label for="np2">Ulangi password baru</label><input id="np2" name="ulangi" type="password" required minlength="8" autocomplete="new-password">
        <button class="primary block" type="submit">Simpan password baru</button>
      </form>
      <p class="switch"><a href="#/lupa">Minta tautan baru</a> · <a href="#/login">Login</a></p>
    </div></div>
  </div>`;
}
actions.forgot = async (form) => {
  const d = formData(form);
  if (!d.email) throw new Error('Email wajib diisi');
  const r = await post('/auth/lupa-password', { email: d.email });
  toast(r.message);
  const box = document.getElementById('devbox');
  if (r.dev_token && box) {
    box.hidden = false;
    box.innerHTML = toHtml(html`<b>Mode demo:</b> email tidak dikirim karena SMTP belum diatur. Gunakan tautan ini: <a href="#/reset/${r.dev_token}">Atur ulang password sekarang</a>`);
  }
};
actions.resetPassword = async (form) => {
  const d = formData(form);
  if (d.password !== d.ulangi) throw new Error('Konfirmasi password tidak sama');
  await post('/auth/reset-password', { token: form.dataset.token, password: d.password });
  toast('Password berhasil diubah. Silakan login dengan password baru.');
  location.hash = '#/login';
};
