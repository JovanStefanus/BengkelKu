const db = require('./db');

const insert = db.prepare('INSERT INTO notifikasi (id_user, judul, pesan, link) VALUES (?, ?, ?, ?)');

// Notifikasi in-app. Tidak pernah melempar error agar tidak menggagalkan aksi utama.
function notify(idUser, judul, pesan, link = null) {
  if (!idUser) return;
  try { insert.run(idUser, judul, pesan, link); } catch (e) { console.error('[notify]', e.message); }
}
const ownerOf = (idBengkel) => db.prepare('SELECT id_pemilik FROM bengkel WHERE id = ?').get(idBengkel)?.id_pemilik;
const mekanikUser = (idMekanik) => db.prepare('SELECT id_user FROM mekanik WHERE id = ?').get(idMekanik)?.id_user;
const admins = () => db.prepare("SELECT id FROM users WHERE role = 'admin'").all().map((r) => r.id);

module.exports = { notify, ownerOf, mekanikUser, admins };
