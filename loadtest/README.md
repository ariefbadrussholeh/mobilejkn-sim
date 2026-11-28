# Load & stress test dengan k6

Tujuan: memastikan server (VPS) kuat dipakai ±30 orang bersamaan. Ada 3 skrip:

| Skrip | Mensimulasikan | Kapan dipakai |
|---|---|---|
| `solo.js` | 30 orang membuka game + papan peringkat (mode solo) selama ±90 dtk | Uji beban normal |
| `multiplayer.js` | 1 host + 30 pemain dalam satu ruangan, 5 soal penuh, polling 1 dtk/pemain seperti klien asli | **Uji utama untuk acara 30 orang** |
| `stress.js` | Naik bertahap 30 → 300 pengguna (tiap pengguna bikin ruangan sendiri) | Cari batas server. Berhenti otomatis bila error > 5% |

## 1. Pasang k6 (di komputer/VPS LAIN, bukan server game)
- Ubuntu:
  ```
  sudo gpg -k
  sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
  echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
  sudo apt-get update && sudo apt-get install k6
  ```
- Windows: `winget install k6 --source winget`
- Docker: `docker run --rm -i -e BASE_URL=https://... grafana/k6 run - < multiplayer.js`

Jalankan dari mesin lain supaya k6 tidak berebut CPU/bandwidth dengan server yang diuji, dan supaya jaringan yang terukur sungguhan.

## 2. Jalankan (urutan disarankan)
```
export BASE_URL=https://mobilejkn.ariefbadrussholeh.my.id
k6 run -e BASE_URL=$BASE_URL -e VUS=1  solo.js            # smoke test: pastikan skrip jalan
k6 run -e BASE_URL=$BASE_URL solo.js                      # beban normal 30 orang
k6 run -e BASE_URL=$BASE_URL multiplayer.js               # 1 host + 30 pemain, ±4 menit
k6 run -e BASE_URL=$BASE_URL -e PLAYERS=30 -e DROP=0.05 multiplayer.js   # 5% pemain tidak menjawab (ronde menunggu ~51 dtk)
k6 run -e BASE_URL=$BASE_URL stress.js                    # cari batas, ±3,5 menit
```
Opsi tambahan `solo.js`: `-e AUDIO=s1_b1,s1_b2` (ikut mengunduh file audio), `-e WRITE_SCORES=1` (mengirim skor uji dengan nama `k6-loadtest`; default tidak menulis ke database).
Uji ke domain produksi sebaiknya di luar jam pakai. Jika memakai Cloudflare/WAF, tes beban bisa terkena rate limit.

## 3. Membaca hasil
Di akhir k6 menampilkan ringkasan; baris ber-tanda ✓ lulus, ✗ gagal:
- `http_req_failed` harus < 1% (stress: < 5%).
- `http_req_duration{name:state}` p(95) < 300 ms (polling ruangan). Ini angka terpenting di multiplayer.
- `http_req_duration{name:index}` p(95) < 2 dtk (unduh halaman, tergantung bandwidth).
- `checks` > 99%. Di multiplayer ada check "semua pemain masuk lobi", "pemain mencapai peringkat akhir", dan "pemain melihat 5 hasil soal".
- `data_received`: total unduhan. Bagi dengan durasi untuk memperkirakan bandwidth yang terpakai.
Stress test: catat jumlah VU saat p(95) mulai melewati batas atau error mulai muncul. Itulah kapasitas aman (kurangi ±30%).

## 4. Pantau server saat tes (di VPS)
`htop` (CPU/RAM), `pm2 monit` atau `journalctl -u mobilejkn -f`, `ss -s` (jumlah koneksi), `free -m`, `sudo tail -f /var/log/nginx/error.log`.

## 5. Titik rawan yang perlu diperhatikan
1. **Bandwidth**, bukan CPU, biasanya yang pertama jebol. 30 orang membuka bersamaan = 30 x (ukuran index.html + audio). Hitung: ukuran halaman terkompresi (lihat `data_received` di `solo.js`) + total MB audio, dikali 30, dibagi kecepatan upload VPS.
2. Kompres halaman di nginx (`gzip on;` dengan `text/html application/javascript application/json`). Layani audio langsung dari nginx dan beri cache:
   ```
   location /audio/  { alias /var/www/mobilejkn/audio/;  expires 7d; add_header Cache-Control "public"; }
   location /assets/ { alias /var/www/mobilejkn/assets/; expires 7d; }
   ```
   Kecilkan MP3 (mono, 64-96 kbps) untuk narasi.
3. **Jangan pakai pm2 cluster / lebih dari satu proses Node.** Ruangan multiplayer disimpan di memori satu proses; dengan cluster, pemain bisa terpisah ke proses berbeda dan ruangan "hilang". Satu proses cukup untuk puluhan pemain.
4. Jika error `EMFILE`/koneksi ditolak saat stress: naikkan `ulimit -n` (limit file terbuka) dan `worker_connections` di nginx.
5. Library 3D dan font dimuat dari CDN oleh perangkat pemain, bukan dari server Anda.

## 6. Bersihkan data uji
- Skor solo (hanya jika `WRITE_SCORES=1`): `sudo -u postgres psql mobilejkn -c "DELETE FROM leaderboard WHERE nama='k6-loadtest';"`
- Ruangan multiplayer uji hilang otomatis (stress menutup ruangannya sendiri; ruangan `multiplayer.js` dibersihkan otomatis setelah beberapa jam atau saat server restart).
