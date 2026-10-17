# BengkelKu - Node.js 22 + Express + SQLite (better-sqlite3)
# Debian "bookworm" (bukan Alpine) dipakai agar binary siap pakai better-sqlite3 (glibc) cocok.
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/data/bengkelku.db

WORKDIR /app

# Manifest disalin lebih dulu supaya cache layer npm install tidak batal saat kode berubah.
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY --chown=node:node . .

# Folder data SQLite dibuat dan dimiliki user "node" agar volume bisa ditulis.
RUN mkdir -p /data && chown node:node /data

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
