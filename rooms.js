'use strict';
/* Logika ruangan multiplayer ala Kahoot (tanpa dependensi, disimpan di memori server).
   Alur fase:  lobby -> scene -> answer -> result -> ranking -> (scene soal berikutnya ... ) -> final -> lobby
   Host mengatur: lobby->scene (mulai), scene->answer (mulai jawab), result->ranking, ranking->soal berikutnya.
   answer->result otomatis saat semua pemain aktif sudah menjawab / waktu habis (host juga boleh memaksa). */
const crypto = require('crypto');

const ANSWER_SEC = 45;       // sama dengan TL di index.html
const GRACE_MS = 6000;       // toleransi animasi HP + jaringan
const ACTIVE_MS = 15000;     // pemain dianggap terputus bila tidak polling selama ini

function createRooms(opts = {}) {
  const now = opts.now || Date.now;
  const total = opts.total || 5;
  const rooms = new Map();
  const rid = () => crypto.randomBytes(8).toString('hex');
  const clean = s => String(s || '').trim().replace(/\s+/g, ' ').slice(0, 18);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function newPin() {
    let p; do { p = String(100000 + Math.floor(Math.random() * 900000)); } while (rooms.has(p));
    return p;
  }
  const get = pin => rooms.get(String(pin || ''));

  function create() {
    const r = { pin: newPin(), key: rid(), phase: 'lobby', round: 0, seq: 0, at: now(), deadline: 0, created: now(), touched: now(), players: new Map() };
    rooms.set(r.pin, r);
    return { pin: r.pin, hostKey: r.key };
  }

  function join(pin, name) {
    const r = get(pin);
    if (!r) return { code: 404, err: 'Ruangan tidak ditemukan' };
    if (r.phase !== 'lobby') return { code: 409, err: 'Game sudah dimulai' };
    if (r.players.size >= 100) return { code: 409, err: 'Ruangan penuh' };
    let n = clean(name);
    if (n.length < 2) return { code: 400, err: 'Nama minimal 2 karakter' };
    const used = new Set([...r.players.values()].map(p => p.name.toLowerCase()));
    const base = n; let i = 2;
    while (used.has(n.toLowerCase())) n = base + ' ' + (i++);
    const pl = { id: rid(), name: n, score: 0, sisa: 0, ans: {}, seen: now(), joined: now() };
    r.players.set(pl.id, pl); r.touched = now();
    return { pid: pl.id, name: n };
  }

  const active = r => [...r.players.values()].filter(p => now() - p.seen < ACTIVE_MS);

  function closeRound(r) {
    for (const p of r.players.values()) if (!p.ans[r.round]) p.ans[r.round] = { ok: false, sisa: 0, pts: 0, missed: true };
    r.phase = 'result'; r.seq++; r.at = now();
  }

  function tick(r) {
    if (r.phase !== 'answer') return;
    const act = active(r);
    const all = act.length > 0 && act.every(p => p.ans[r.round]);
    if (all || now() > r.deadline) closeRound(r);
  }

  function resetScores(r) { for (const p of r.players.values()) { p.score = 0; p.sisa = 0; p.ans = {}; } r.round = 0; }

  function advance(pin, key) {
    const r = get(pin);
    if (!r) return { code: 404, err: 'Ruangan tidak ditemukan' };
    if (key !== r.key) return { code: 403, err: 'Bukan host' };
    tick(r); r.touched = now();
    switch (r.phase) {
      case 'lobby':
        if (r.players.size < 1) return { code: 409, err: 'Belum ada pemain' };
        resetScores(r); r.phase = 'scene'; break;
      case 'scene': r.phase = 'answer'; r.deadline = now() + ANSWER_SEC * 1000 + GRACE_MS; break;
      case 'answer': closeRound(r); return { ok: true };
      case 'result': r.phase = 'ranking'; break;
      case 'ranking':
        if (r.round + 1 < total) { r.round++; r.phase = 'scene'; } else r.phase = 'final';
        break;
      case 'final': resetScores(r); r.phase = 'lobby'; break;
    }
    r.seq++; r.at = now();
    return { ok: true, phase: r.phase };
  }

  function answer(pin, pid, body) {
    const r = get(pin);
    if (!r) return { code: 404, err: 'Ruangan tidak ditemukan' };
    const p = r.players.get(pid);
    if (!p) return { code: 403, err: 'Pemain tidak dikenal' };
    tick(r);
    if (r.phase !== 'answer') return { code: 409, err: 'Soal sudah ditutup' };
    if (p.ans[r.round]) return { ok: true, dup: true };
    const sisa = clamp(Math.floor(Number(body && body.sisa) || 0), 0, ANSWER_SEC);
    const ok = !!(body && body.ok);
    const pts = ok ? sisa * 100 + 500 : 0;
    p.ans[r.round] = { ok, sisa: ok ? sisa : 0, pts };
    p.score += pts; p.sisa += ok ? sisa : 0; p.seen = now();
    tick(r);
    return { ok: true, pts };
  }

  function view(pin, pid, key) {
    const r = get(pin);
    if (!r) return { code: 404, err: 'Ruangan tidak ditemukan' };
    const isHost = key && key === r.key;
    const me = pid ? r.players.get(pid) : null;
    if (pid && !me && !isHost) return { code: 403, err: 'Pemain tidak dikenal' };
    if (me) me.seen = now();
    tick(r); r.touched = now();
    const list = [...r.players.values()].sort((a, b) => b.score - a.score || b.sisa - a.sisa || a.joined - b.joined);
    const players = list.map(p => ({ id: p.id, name: p.name, score: p.score, sisa: p.sisa, answered: !!p.ans[r.round] }));
    const cur = list.map(p => p.ans[r.round]).filter(Boolean);
    const out = {
      now: now(), phase: r.phase, round: r.round, total, seq: r.seq, deadline: r.deadline,
      count: list.length, answered: players.filter(p => p.answered).length,
      correct: cur.filter(a => a.ok).length,
      avgSisa: cur.filter(a => a.ok).length ? Math.round(cur.filter(a => a.ok).reduce((s, a) => s + a.sisa, 0) / cur.filter(a => a.ok).length) : 0,
      players
    };
    if (me) out.you = { id: me.id, name: me.name, score: me.score, rank: list.indexOf(me) + 1, ans: me.ans[r.round] || null };
    return out;
  }

  function leave(pin, pid, key) {
    const r = get(pin);
    if (!r) return { ok: true };
    if (key && key === r.key) { rooms.delete(r.pin); return { ok: true, closed: true }; }
    if (pid && r.phase === 'lobby') r.players.delete(pid);
    return { ok: true };
  }

  function gc() {
    for (const [pin, r] of rooms) if (now() - r.touched > 3 * 3600 * 1000 || now() - r.created > 10 * 3600 * 1000) rooms.delete(pin);
  }

  return { create, join, advance, answer, view, leave, gc, _rooms: rooms };
}

module.exports = { createRooms, ANSWER_SEC, GRACE_MS };
