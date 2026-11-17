# Simulasi Mobile JKN 3D (v1.5)

## Jalankan cepat (tanpa server)
Buka `index.html` di browser. Mode dummy (localStorage) aktif otomatis. Audio dibaca dari folder `audio/`.

## Dengan PostgreSQL
    npm install
    DATABASE_URL=postgres://user:pass@localhost:5432/mobilejkn SEED=1 node server.js
Buka http://localhost:3000 . Badge di papan peringkat harus menulis "Sumber data: PostgreSQL".
Paksa mode dummy: `?mode=dummy`.

## Struktur
- index.html  : seluruh game (gambar sudah di-embed)
- server.js   : API leaderboard + menyajikan index.html dan /audio
- audio/      : taruh MP3 sesuai DAFTAR_AUDIO.txt
- assets/     : gambar asli (logo RSUD, maskot, logo Mobile JKN) untuk arsip
