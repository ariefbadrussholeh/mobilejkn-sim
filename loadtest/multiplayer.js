// Simulasi 1 host + 30 pemain satu ruangan penuh (5 soal), meniru polling klien asli (1 request/detik/pemain).
// Jalankan:  k6 run -e BASE_URL=https://domain-anda multiplayer.js
// Opsi env:  PLAYERS=30  DROP=0.05 (peluang pemain tidak menjawab; ronde jadi menunggu batas waktu ~51 dtk)
import http from 'k6/http';
import exec from 'k6/execution';
import { check, sleep } from 'k6';

const BASE = (__ENV.BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const PLAYERS = Number(__ENV.PLAYERS || 30);
const DROP = Number(__ENV.DROP || 0);
const ROUNDS = 5; // sama dengan jumlah skenario di game
const MAX_MS = 9 * 60 * 1000;
const JSONH = { headers: { 'Content-Type': 'application/json' } };

export const options = {
  scenarios: {
    host: { executor: 'per-vu-iterations', exec: 'host', vus: 1, iterations: 1, maxDuration: '10m' },
    players: { executor: 'per-vu-iterations', exec: 'player', vus: PLAYERS, iterations: 1, maxDuration: '10m' },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{name:state}': ['p(95)<300'],
    'http_req_duration{name:answer}': ['p(95)<500'],
    'http_req_duration{name:advance}': ['p(95)<500'],
    checks: ['rate>0.99'],
  },
};

export function setup() {
  const r = http.post(`${BASE}/api/rooms`, '{}', JSONH);
  if (r.status !== 201) throw new Error('gagal membuat ruangan: HTTP ' + r.status);
  return { pin: r.json('pin'), key: r.json('hostKey') };
}

function waitFor(fn, maxSec) {
  for (let i = 0; i < maxSec; i++) { if (fn()) return true; sleep(1); }
  return false;
}

export function host(d) {
  const adv = () => {
    const r = http.post(`${BASE}/api/rooms/${d.pin}/advance`, JSON.stringify({ key: d.key }), { ...JSONH, tags: { name: 'advance' } });
    check(r, { 'advance 200': x => x.status === 200 });
  };
  const get = () => {
    const r = http.get(`${BASE}/api/rooms/${d.pin}/state?key=${d.key}`, { tags: { name: 'state' } });
    return r.status === 200 ? r.json() : {};
  };
  check(waitFor(() => (get().count || 0) >= PLAYERS, 60), { 'semua pemain masuk lobi': v => v === true });
  adv();                                   // lobi -> scene soal 1
  for (let i = 0; i < ROUNDS; i++) {
    sleep(6);                              // scene diputar
    adv();                                 // mulai jawab
    waitFor(() => get().phase === 'result', 75);
    sleep(3); adv();                       // hasil -> peringkat
    sleep(3); adv();                       // peringkat -> soal berikutnya / final
  }
  check(get(), { 'host melihat fase final': x => x.phase === 'final' });
  sleep(5);
}

export function player(d) {
  const id = exec.vu.idInTest;
  sleep(Math.random() * 3);
  const j = http.post(`${BASE}/api/rooms/${d.pin}/join`, JSON.stringify({ name: 'Bot' + id }), { ...JSONH, tags: { name: 'join' } });
  if (!check(j, { 'join 200': r => r.status === 200 })) return;
  const pid = j.json('pid');
  const t0 = Date.now();
  let answeredRound = -1, answerAt = 0, reachedFinal = false, results = 0, lastSeq = -1;
  while (Date.now() - t0 < MAX_MS) {
    const r = http.get(`${BASE}/api/rooms/${d.pin}/state?pid=${pid}`, { tags: { name: 'state' } });
    if (r.status === 200) {
      const s = r.json();
      if (s.seq !== lastSeq) { lastSeq = s.seq; if (s.phase === 'result') results++; }
      if (s.phase !== 'answer') answerAt = 0;
      if (s.phase === 'answer' && answeredRound !== s.round) {
        if (!answerAt) answerAt = Date.now() + (5 + Math.random() * 20) * 1000; // simulasi main simulasi HP 5-25 dtk
        if (Date.now() >= answerAt) {
          answeredRound = s.round; answerAt = 0;
          if (Math.random() >= DROP) {
            const ok = Math.random() < 0.8;
            const a = http.post(`${BASE}/api/rooms/${d.pin}/answer`, JSON.stringify({ pid, ok, sisa: ok ? Math.floor(5 + Math.random() * 35) : 0 }), { ...JSONH, tags: { name: 'answer' } });
            check(a, { 'answer 200': x => x.status === 200 });
          }
        }
      }
      if (s.phase === 'final') { reachedFinal = true; break; }
    }
    sleep(1);
  }
  check(reachedFinal, { 'pemain mencapai peringkat akhir': v => v === true });
  check(results, { 'pemain melihat 5 hasil soal': v => v === ROUNDS });
}
