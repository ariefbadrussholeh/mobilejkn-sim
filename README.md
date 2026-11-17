# Simulasi Mobile JKN 3D (v1.5)

## Jalankan cepat (tanpa server)
Buka `index.html` di browser. Mode dummy (localStorage) aktif otomatis. Audio dibaca dari folder `audio/`.

## Dengan PostgreSQL
    npm install
    DATABASE_URL=postgres://user:pass@localhost:5432/mobilejkn node server.js
Buka http://localhost:3000 . Badge di papan peringkat harus menulis "Sumber data: PostgreSQL".
Paksa mode dummy: `?mode=dummy`.

## Struktur
- index.html  : seluruh game (gambar sudah di-embed)
- server.js   : API leaderboard + menyajikan index.html dan /audio
- audio/      : taruh MP3 sesuai DAFTAR_AUDIO.txt
- assets/     : gambar asli (logo RSUD, maskot, logo Mobile JKN) untuk arsip

## Mengganti gambar
- Logo Mobile JKN (layar awal + header HP): cukup timpa `assets/logo-mobilejkn.png`, lalu hard refresh (Ctrl+F5). Embed di index.html hanya cadangan.
- Logo RSUD & maskot dipakai sebagai tekstur 3D: timpa file di `assets/`, lalu jalankan `python embed_assets.py` (butuh `pip install pillow`).
