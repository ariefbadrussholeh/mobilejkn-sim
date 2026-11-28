// Stress test: naik bertahap 30 -> 300 pengguna sampai server mulai melambat/gagal. Berhenti otomatis bila error > 5%.
// Jalankan:  k6 run -e BASE_URL=https://domain-anda stress.js
// Tiap iterasi: (tiap 5 iterasi) buka halaman, buat ruangan, 1 pemain gabung, polling 4x, tutup ruangan, buka papan peringkat.
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = (__ENV.BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const JSONH = { headers: { 'Content-Type': 'application/json' } };

export const options = {
  scenarios: {
    stress: { executor: 'ramping-vus', startVUs: 0, gracefulRampDown: '15s', stages: [
      { duration: '30s', target: 30 }, { duration: '30s', target: 60 }, { duration: '30s', target: 100 },
      { duration: '30s', target: 150 }, { duration: '30s', target: 200 }, { duration: '30s', target: 300 }, { duration: '20s', target: 0 }] },
  },
  thresholds: {
    http_req_failed: [{ threshold: 'rate<0.05', abortOnFail: true, delayAbortEval: '30s' }],
    'http_req_duration{name:state}': ['p(95)<1000'],
    'http_req_duration{name:index}': ['p(95)<4000'],
  },
};

export default function () {
  if (__ITER % 5 === 0) {
    const r = http.get(`${BASE}/`, { tags: { name: 'index' } });
    check(r, { 'index 200': x => x.status === 200 });
  }
  const rm = http.post(`${BASE}/api/rooms`, '{}', { ...JSONH, tags: { name: 'room' } });
  if (!check(rm, { 'buat ruangan 201': x => x.status === 201 })) { sleep(1); return; }
  const pin = rm.json('pin'), key = rm.json('hostKey');
  const j = http.post(`${BASE}/api/rooms/${pin}/join`, JSON.stringify({ name: 'Stress' + __VU }), { ...JSONH, tags: { name: 'join' } });
  check(j, { 'join 200': x => x.status === 200 });
  const pid = j.status === 200 ? j.json('pid') : '';
  for (let i = 0; i < 4; i++) {
    const s = http.get(`${BASE}/api/rooms/${pin}/state?pid=${pid}`, { tags: { name: 'state' } });
    check(s, { 'state 200': x => x.status === 200 });
    sleep(1);
  }
  http.post(`${BASE}/api/rooms/${pin}/leave`, JSON.stringify({ key }), { ...JSONH, tags: { name: 'room' } }); // bersihkan ruangan
  const lb = http.get(`${BASE}/api/leaderboard`, { tags: { name: 'api' } });
  check(lb, { 'leaderboard 200': x => x.status === 200 });
}
