// Pembatas percobaan login sederhana (in-memory) per IP + email.
module.exports = function createLimiter({ windowMs = 15 * 60 * 1000, max = 10 } = {}) {
  const hits = new Map();
  const keyOf = (req) => `${req.ip}|${String(req.body?.email || '').toLowerCase()}`;
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }, 60 * 1000).unref();

  const middleware = (req, res, next) => {
    const key = keyOf(req), now = Date.now();
    let h = hits.get(key);
    if (!h || h.reset < now) { h = { count: 0, reset: now + windowMs }; hits.set(key, h); }
    if (++h.count > max) {
      return res.status(429).json({ error: 'Terlalu banyak percobaan login. Coba lagi dalam beberapa menit.' });
    }
    next();
  };
  middleware.clear = (req) => hits.delete(keyOf(req));
  return middleware;
};
