const router = require('express').Router();
const db = require('../db');
const { int } = require('../util');

// Tiap pengguna hanya bisa melihat dan menandai notifikasi miliknya.
router.get('/', (req, res) => {
  const items = db.prepare('SELECT id, judul, pesan, link, dibaca, created_at FROM notifikasi WHERE id_user = ? ORDER BY id DESC LIMIT 50').all(req.user.id);
  const unread = db.prepare('SELECT COUNT(*) AS n FROM notifikasi WHERE id_user = ? AND dibaca = 0').get(req.user.id).n;
  res.json({ items, unread });
});

router.get('/jumlah', (req, res) => {
  res.json({ unread: db.prepare('SELECT COUNT(*) AS n FROM notifikasi WHERE id_user = ? AND dibaca = 0').get(req.user.id).n });
});

router.post('/baca', (req, res) => {
  const id = int(req.body?.id, 1);
  if (id) db.prepare('UPDATE notifikasi SET dibaca = 1 WHERE id = ? AND id_user = ?').run(id, req.user.id);
  else db.prepare('UPDATE notifikasi SET dibaca = 1 WHERE id_user = ?').run(req.user.id);
  res.json({ ok: true });
});

module.exports = router;
