/* Backend opsional Simulasi Mobile JKN (Express + PostgreSQL)
   Setup:  npm init -y && npm i express pg
   Jalankan: DATABASE_URL=postgres://user:pass@localhost:5432/mobilejkn node server.js
   Data dummy TIDAK pernah dimasukkan ke database; dummy hanya tampilan di mode lokal (browser).
   Buka http://localhost:3000  -> index.html disajikan dari folder yang sama. */
const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/mobilejkn' });
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.set({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' });
  req.method === 'OPTIONS' ? res.sendStatus(204) : next();
});

const SCHEMA = `
CREATE TABLE IF NOT EXISTS leaderboard (
  id               SERIAL PRIMARY KEY,
  nama             VARCHAR(18) NOT NULL,
  total_skor       INTEGER NOT NULL CHECK (total_skor >= 0),
  sisa_waktu_total INTEGER NOT NULL CHECK (sisa_waktu_total >= 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_leaderboard_rank ON leaderboard (total_skor DESC, sisa_waktu_total DESC);`;

app.use('/audio', express.static(path.join(__dirname, 'audio'), { maxAge: '7d' }));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.get('/api/health', async (req, res) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true }); }
  catch (e) { res.status(503).json({ ok: false }); }
});

app.get('/api/leaderboard', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id::text AS id, nama, total_skor AS "totalSkor", sisa_waktu_total AS "sisaWaktuTotal"
       FROM leaderboard ORDER BY total_skor DESC, sisa_waktu_total DESC, id ASC LIMIT 50`);
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'db_error' }); }
});

app.post('/api/scores', async (req, res) => {
  const nama = String(req.body.nama || '').trim().slice(0, 18) || 'Peserta';
  const skor = Number(req.body.totalSkor), sisa = Number(req.body.sisaWaktuTotal);
  if (!Number.isInteger(skor) || !Number.isInteger(sisa) || skor < 0 || sisa < 0 || skor > 100000 || sisa > 10000)
    return res.status(400).json({ error: 'invalid_payload' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO leaderboard (nama, total_skor, sisa_waktu_total) VALUES ($1,$2,$3) RETURNING id::text AS id', [nama, skor, sisa]);
    res.status(201).json(rows[0]);
  } catch (e) { console.error(e); res.status(500).json({ error: 'db_error' }); }
});

(async () => {
  await pool.query(SCHEMA);
  const port = process.env.PORT || 3000;
  const host = process.env.HOST || '127.0.0.1';
  app.listen(port, host, () => console.log('Mobile JKN siap di http://' + host + ':' + port));
})().catch(e => { console.error('Gagal start:', e); process.exit(1); });
