const { bad, str, int } = require('./util');

// Validasi data kendaraan baru (dipakai saat booking dan di menu Kendaraan Saya).
function readKendaraan(k = {}) {
  const jenis = ['Motor', 'Mobil'].includes(k.jenis) ? k.jenis : null;
  const merk = str(k.merk, { min: 2, max: 60 });
  const nopol = str(k.no_polisi, { min: 3, max: 12 });
  const tahun = k.tahun === undefined || k.tahun === null || k.tahun === '' ? null : int(k.tahun, 1980, new Date().getFullYear() + 1);
  if (!jenis || !merk || !nopol) throw bad('Data kendaraan belum lengkap (jenis, merk, no. polisi)');
  if (k.tahun && tahun === null) throw bad('Tahun kendaraan tidak valid');
  return { jenis, merk, no_polisi: nopol.toUpperCase(), tahun };
}
module.exports = { readKendaraan };
