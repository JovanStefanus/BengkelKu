// Peta interaktif (Leaflet + tile OpenStreetMap). Jika Leaflet/tile gagal dimuat, halaman tetap berfungsi tanpa peta.
import { esc } from './ui.js';

const TILE = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
const DEFAULT = { lat: -6.9175, lng: 107.6191 };
export const mapAvailable = () => typeof window.L !== 'undefined';

let searchInstance = null;
function baseMap(el, center, zoom) {
  const map = window.L.map(el, { scrollWheelZoom: false }).setView([center.lat, center.lng], zoom);
  window.L.tileLayer(TILE, { maxZoom: 19, attribution: ATTR }).addTo(map);
  return map;
}
const hideBox = (el) => { const box = el.closest('.mapbox') || el; box.hidden = true; };

// Peta pencarian: lokasi customer, lingkaran radius, dan penanda tiap bengkel. Klik peta = pindah lokasi.
export function showSearchMap(el, { loc, radiusKm, items, onPick }) {
  if (!el) return;
  if (!mapAvailable()) return hideBox(el);
  try {
    if (searchInstance) { try { searchInstance.remove(); } catch { /* sudah terlepas dari DOM */ } searchInstance = null; }
    const L = window.L;
    const map = baseMap(el, loc, 12);
    searchInstance = map;
    el._map = map; // pegangan untuk pengujian/debug
    const circle = L.circle([loc.lat, loc.lng], { radius: radiusKm * 1000, color: '#c98f12', weight: 2, fillColor: '#f5b731', fillOpacity: 0.1 }).addTo(map);
    L.circleMarker([loc.lat, loc.lng], { radius: 8, color: '#fff', weight: 3, fillColor: '#2a56c6', fillOpacity: 1 }).addTo(map).bindTooltip('Lokasi Anda');
    items.forEach((b) => {
      L.marker([b.lat, b.lng], { title: b.nama, alt: b.nama }).addTo(map).bindPopup(
        `<b>${esc(b.nama)}</b><br>${b.jarak_km} km · ★ ${b.rating ?? '–'}<br>` +
        `<button type="button" data-action="focusBengkel" data-id="${b.id}">Lihat &amp; booking</button>`
      );
    });
    map.fitBounds(circle.getBounds(), { padding: [16, 16] });
    map.on('click', (e) => onPick(e.latlng));
  } catch (e) {
    console.error('Peta gagal dimuat:', e);
    hideBox(el);
  }
}

// Pemilih lokasi: klik peta atau seret penanda; kolom latitude/longitude ikut terisi (dan sebaliknya).
export function pickerMap(el, latInput, lngInput) {
  if (!el || !latInput || !lngInput) return;
  if (!mapAvailable()) { el.hidden = true; return; }
  if (el.dataset.ready) return;
  try {
    const L = window.L;
    const read = () => {
      const la = parseFloat(latInput.value), ln = parseFloat(lngInput.value);
      return Number.isFinite(la) && Number.isFinite(ln) && Math.abs(la) <= 90 && Math.abs(ln) <= 180 ? { lat: la, lng: ln } : null;
    };
    const start = read();
    const map = baseMap(el, start || DEFAULT, start ? 15 : 12);
    el.dataset.ready = '1';
    el._map = map;
    let marker = null;
    const place = (lat, lng, pan) => {
      if (!marker) {
        marker = L.marker([lat, lng], { draggable: true }).addTo(map);
        marker.on('dragend', () => { const p = marker.getLatLng(); place(p.lat, p.lng, false); });
      } else marker.setLatLng([lat, lng]);
      latInput.value = lat.toFixed(6); lngInput.value = lng.toFixed(6);
      if (pan) map.panTo([lat, lng]);
    };
    if (start) place(start.lat, start.lng, false);
    map.on('click', (e) => place(e.latlng.lat, e.latlng.lng, false));
    const fromInputs = () => { const c = read(); if (c) place(c.lat, c.lng, true); };
    latInput.addEventListener('change', fromInputs);
    lngInput.addEventListener('change', fromInputs);
    setTimeout(() => map.invalidateSize(), 80);
  } catch (e) {
    console.error('Peta gagal dimuat:', e);
    el.hidden = true;
  }
}
