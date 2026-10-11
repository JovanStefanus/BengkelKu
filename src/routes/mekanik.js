const router = require('express').Router();
const db = require('../db');
const { requireRole } = require('../auth');

router.use(requireRole('mekanik'));

// Daftar sparepart di bengkel tempat mekanik bekerja (untuk dicatat saat servis).
router.get('/sparepart', (req, res) => {
  res.json({
    items: db.prepare('SELECT id, nama, kategori, stok, harga_jual FROM sparepart WHERE id_bengkel = ? AND aktif = 1 AND stok > 0 ORDER BY nama')
      .all(req.mekanik.id_bengkel),
  });
});

module.exports = router;
