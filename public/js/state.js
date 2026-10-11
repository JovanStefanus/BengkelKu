export const DEFAULT_LOC = { lat: -6.9175, lng: 107.6191, label: 'Pusat Kota Bandung (lokasi default — klik "Gunakan lokasi saya" untuk GPS)', real: false };

function loadCart() {
  try { const c = JSON.parse(localStorage.getItem('bk_cart') || '[]'); return Array.isArray(c) ? c : []; } catch { return []; }
}

export const state = {
  user: null,
  cfg: { demo: false },
  loc: { ...DEFAULT_LOC },
  radius: 10,
  marketQ: '', marketKat: '',
  cart: loadCart(),
  kendaraan: [],
  market: new Map(),
  edit: null,
};
export const saveCart = () => localStorage.setItem('bk_cart', JSON.stringify(state.cart));
