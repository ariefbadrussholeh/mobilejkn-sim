// Beban normal: 30 pengguna membuka halaman + memakai API (mode solo).
// Jalankan:  k6 run -e BASE_URL=https://domain-anda solo.js
// Opsi env:  VUS=30  WRITE_SCORES=1 (kirim skor uji, nama 'k6-loadtest')  AUDIO=s1_b1,s1_b2 (unduh audio)
import http from 'k6/http';
import { check, sleep, group } from 'k6';

const BASE = (__ENV.BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const VUS = Number(__ENV.VUS || 30);
const WRITE = __ENV.WRITE_SCORES === '1';
const AUDIO = (__ENV.AUDIO || '').split(',').filter(Boolean);
const JSONH = { headers: { 'Content-Type': 'application/json' } };

export const options = {
  scenarios: {
    solo: { executor: 'ramping-vus', startVUs: 0, stages: [
      { duration: '20s', target: VUS }, { duration: '60s', target: VUS }, { duration: '10s', target: 0 }], gracefulRampDown: '10s' },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{name:index}': ['p(95)<2000'],
    'http_req_duration{name:api}': ['p(95)<500'],
    checks: ['rate>0.99'],
  },
};

export default function () {
  group('buka halaman', () => {
    const r = http.get(`${BASE}/`, { tags: { name: 'index' } });
    check(r, { 'index 200': x => x.status === 200, 'index berisi game': x => !!x.body && x.body.indexOf('Mobile JKN') >= 0 });
  });
  if (AUDIO.length) {
    group('unduh audio', () => {
      AUDIO.forEach(k => {
        const r = http.get(`${BASE}/audio/${k}.mp3`, { tags: { name: 'audio' }, responseType: 'none' });
        check(r, { 'audio 200': x => x.status === 200 });
      });
    });
  }
  sleep(1 + Math.random() * 2);
  group('papan peringkat', () => {
    const r = http.get(`${BASE}/api/leaderboard`, { tags: { name: 'api' } });
    check(r, { 'leaderboard 200': x => x.status === 200 });
  });
  if (WRITE) {
    group('simpan skor', () => {
      const sisa = Math.floor(Math.random() * 100);
      const r = http.post(`${BASE}/api/scores`, JSON.stringify({ nama: 'k6-loadtest', totalSkor: sisa * 100 + 2500, sisaWaktuTotal: sisa }), { ...JSONH, tags: { name: 'api' } });
      check(r, { 'skor 201': x => x.status === 201 });
    });
  }
  sleep(2 + Math.random() * 3);
}
