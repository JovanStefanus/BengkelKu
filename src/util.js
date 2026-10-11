class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (m) => new HttpError(400, m);
const notFound = (m = 'Data tidak ditemukan') => new HttpError(404, m);

// Validator: mengembalikan nilai bersih atau null.
function str(v, { min = 1, max = 200 } = {}) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length >= min && t.length <= max ? t : null;
}
function int(v, min = 0, max = 1e9) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}
function num(v, min = -1e9, max = 1e9) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}
function need(v, message) {
  if (v === null || v === undefined) throw bad(message);
  return v;
}

const round1 = (n) => Math.round(n * 10) / 10;

// Jarak dua titik koordinat di permukaan bumi (km).
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

module.exports = { HttpError, bad, notFound, str, int, num, need, round1, haversine };
