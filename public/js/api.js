// Pembungkus fetch: cookie sesi dikirim otomatis (httpOnly), semua request berformat JSON.
export async function api(path, { method = 'GET', body } = {}) {
  const init = { method, credentials: 'same-origin', headers: {} };
  if (method !== 'GET') {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body ?? {});
  }
  const res = await fetch('/api' + path, init);
  let data = null;
  try { data = await res.json(); } catch { /* body kosong */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || 'Terjadi kesalahan');
    err.status = res.status;
    throw err;
  }
  return data;
}
export const post = (path, body) => api(path, { method: 'POST', body });
export const put = (path, body) => api(path, { method: 'PUT', body });
export const del = (path) => api(path, { method: 'DELETE' });
