# Simulasi Mobile JKN 3D (v1.8)

## Jalankan
Solo tanpa server: buka `index.html` (mode dummy/localStorage). Multiplayer butuh server:

    npm install
    node server.js                      # tanpa DB: leaderboard di memori, multiplayer tetap jalan
    DATABASE_URL=postgres://user:pass@localhost:5432/mobilejkn node server.js   # leaderboard solo ke PostgreSQL

Buka http://localhost:3000 . Server hanya butuh paket `pg` (opsional). Express tidak dipakai lagi.

## Multiplayer ala Kahoot
1. Host: layar awal -> "Main Bareng" -> "Buat Ruangan (Host)". Muncul PIN 6 digit.
2. Pemain: "Main Bareng" -> isi PIN + nama -> Gabung.
3. Host menekan: Mulai Game -> (scene diputar di semua layar) Mulai Jawab -> (pemain mengisi simulasi HP; hasil otomatis saat semua selesai/waktu habis) Lihat Peringkat -> Soal Berikutnya ... -> Hasil Akhir -> Main Lagi.
Host juga menampilkan scene (cocok diproyeksikan). Skor dihitung server dari sisa waktu yang dilaporkan klien (tidak anti-cheat penuh).
Refresh halaman tidak mengeluarkan pemain: sesi tersimpan di sessionStorage.
Nginx: polling HTTP biasa, tidak perlu konfigurasi WebSocket.

## Struktur
- index.html : game (gambar sudah di-embed)
- server.js  : static + API (leaderboard + ruangan)
- rooms.js   : logika ruangan multiplayer
- audio/     : taruh MP3 sesuai DAFTAR_AUDIO.txt
- assets/    : gambar asli

## Flag & kontrol
- `CFG.eduAudio` (awal script index.html): false = audio edu_1..5 tidak diputar.
- `CFG.quality`: 'auto' | 'high' | 'low' (atau ?q=low di URL). Auto turun ke low bila FPS rendah.
- Musik latar: taruh `audio/bgm.mp3` untuk memakai lagu sendiri.
- Kontrol 3D: seret = putar, pinch / scroll = zoom. Diam 3 detik -> kembali ke jalur awal.

## Mengganti gambar
- Logo Mobile JKN: timpa `assets/logo-mobilejkn.png`, lalu hard refresh.
- Logo RSUD & maskot (tekstur 3D): timpa file di `assets/`, lalu `python embed_assets.py` (butuh `pip install pillow`).
