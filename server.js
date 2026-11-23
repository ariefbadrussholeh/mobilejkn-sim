/* Backend Simulasi Mobile JKN
   - Menyajikan index.html, /audio, /assets
   - Leaderboard solo: PostgreSQL (jika DATABASE_URL diset) atau memori (hilang saat restart)
   - Multiplayer ala Kahoot: ruangan di memori (lihat rooms.js)
   Setup:  npm install   (hanya butuh paket "pg")
   Jalan:  DATABASE_URL=postgres://user:pass@localhost:5432/mobilejkn node server.js
   Tanpa DATABASE_URL tetap jalan (cocok untuk uji multiplayer lokal). Data dummy TIDAK pernah disimpan. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createRooms } = require('./rooms');
let Pool = null; try { Pool = require('pg').Pool; } catch (e) { /* pg opsional */ }

const rooms = createRooms();
setInterval(() => rooms.gc(), 10 * 60 * 1000).unref();

/* ---------- leaderboard ---------- */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS leaderboard (
  id               SERIAL PRIMARY KEY,
  nama             VARCHAR(18) NOT NULL,
  total_skor       INTEGER NOT NULL CHECK (total_skor >= 0),
  sisa_waktu_total INTEGER NOT NULL CHECK (sisa_waktu_total >= 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_leaderboard_rank ON leaderboard (total_skor DESC, sisa_waktu_total DESC);`;
let pool = null, dbOk = false;
const mem = []; let memId = 1;

async function initDb() {
  if (!Pool || !process.env.DATABASE_URL) { console.warn('[db] DATABASE_URL tidak diset: leaderboard memakai memori (hilang saat restart).'); return; }
  try { pool = new Pool({ connectionString: process.env.DATABASE_URL }); await pool.query(SCHEMA); dbOk = true; console.log('[db] PostgreSQL terhubung.'); }
  catch (e) { console.warn('[db] gagal terhubung, memakai memori:', e.message); pool = null; }
}
async function getLB() {
  if (dbOk) {
    const { rows } = await pool.query(`SELECT id::text AS id, nama, total_skor AS "totalSkor", sisa_waktu_total AS "sisaWaktuTotal"
      FROM leaderboard ORDER BY total_skor DESC, sisa_waktu_total DESC, id ASC LIMIT 50`);
    return rows;
  }
  return mem.slice().sort((a, b) => b.totalSkor - a.totalSkor || b.sisaWaktuTotal - a.sisaWaktuTotal || Number(a.id) - Number(b.id)).slice(0, 50);
}
async function addScore(b) {
  const nama = String(b.nama || '').trim().slice(0, 18) || 'Peserta';
  const skor = Number(b.totalSkor), sisa = Number(b.sisaWaktuTotal);
  if (!Number.isInteger(skor) || !Number.isInteger(sisa) || skor < 0 || sisa < 0 || skor > 100000 || sisa > 10000) return { code: 400, err: 'invalid_payload' };
  if (dbOk) {
    const { rows } = await pool.query('INSERT INTO leaderboard (nama, total_skor, sisa_waktu_total) VALUES ($1,$2,$3) RETURNING id::text AS id', [nama, skor, sisa]);
    return { code: 201, id: rows[0].id };
  }
  const id = String(memId++); mem.push({ id, nama, totalSkor: skor, sisaWaktuTotal: sisa });
  return { code: 201, id };
}

/* ---------- util HTTP ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8' };

function send(res, code, obj, extra) {
  const body = JSON.stringify(obj);
  res.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, extra));
  res.end(body);
}
const reply = (res, r) => (r && r.err) ? send(res, r.code || 400, { error: r.err }) : send(res, 200, r);
function readJson(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', c => { s += c; if (s.length > 10000) { reject(new Error('too_large')); req.destroy(); } });
    req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
function serveFile(req, res, rel) {
  const f = path.normalize(path.join(__dirname, rel));
  if (f !== path.join(__dirname, 'index.html') && !f.startsWith(path.join(__dirname, 'audio') + path.sep) && !f.startsWith(path.join(__dirname, 'assets') + path.sep)) { res.writeHead(404); return res.end('Not found'); }
  fs.stat(f, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('Not found'); }
    const type = MIME[path.extname(f).toLowerCase()] || 'application/octet-stream';
    const cache = f.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600';
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (range && (range[1] || range[2])) { // dukung Range (Safari/iOS butuh untuk audio)
      const a = range[1] ? parseInt(range[1], 10) : st.size - parseInt(range[2], 10);
      let b = range[1] && range[2] ? parseInt(range[2], 10) : st.size - 1;
      if (a >= st.size || a > b) { res.writeHead(416, { 'Content-Range': 'bytes */' + st.size }); return res.end(); }
      b = Math.min(b, st.size - 1);
      res.writeHead(206, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${a}-${b}/${st.size}`, 'Content-Length': b - a + 1, 'Cache-Control': cache });
      return fs.createReadStream(f, { start: a, end: b }).pipe(res);
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes', 'Cache-Control': cache });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(f).pipe(res);
  });
}

/* ---------- router ---------- */
const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://localhost'), p = u.pathname;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    if (p === '/api/health') return send(res, 200, { ok: true, db: dbOk });
    if (p === '/api/leaderboard' && req.method === 'GET') return send(res, 200, await getLB());
    if (p === '/api/scores' && req.method === 'POST') {
      const r = await addScore(await readJson(req));
      return r.err ? send(res, r.code, { error: r.err }) : send(res, r.code, { id: r.id });
    }
    if (p === '/api/rooms' && req.method === 'POST') return send(res, 201, rooms.create());
    const m = /^\/api\/rooms\/(\d{6})\/(join|state|advance|answer|leave)$/.exec(p);
    if (m) {
      const pin = m[1], act = m[2];
      if (act === 'state' && req.method === 'GET') return reply(res, rooms.view(pin, u.searchParams.get('pid') || '', u.searchParams.get('key') || ''));
      if (req.method === 'POST') {
        const b = await readJson(req);
        if (act === 'join') return reply(res, rooms.join(pin, b.name));
        if (act === 'advance') return reply(res, rooms.advance(pin, b.key));
        if (act === 'answer') return reply(res, rooms.answer(pin, b.pid, b));
        if (act === 'leave') return reply(res, rooms.leave(pin, b.pid, b.key));
      }
      return send(res, 405, { error: 'method_not_allowed' });
    }
    if (p.startsWith('/api/')) return send(res, 404, { error: 'not_found' });
    if (p === '/' || p === '/index.html') return serveFile(req, res, 'index.html');
    if (p.startsWith('/audio/') || p.startsWith('/assets/')) return serveFile(req, res, decodeURIComponent(p.slice(1)));
    res.writeHead(404); res.end('Not found');
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, { error: 'server_error' });
  }
});

initDb().then(() => {
  const port = process.env.PORT || 3000, host = process.env.HOST || '127.0.0.1';
  server.listen(port, host, () => console.log('Mobile JKN siap di http://' + host + ':' + port));
});
