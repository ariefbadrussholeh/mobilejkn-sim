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

## Flag & kontrol
- `CFG.eduAudio` (di bagian atas script index.html): false = audio edu_1..5 tidak diputar. Ubah ke true jika sudah ada.
- Musik latar: taruh `audio/bgm.mp3` untuk memakai lagu sendiri.
- Kontrol 3D: seret = putar, pinch / scroll = zoom. Diam 3 detik -> kembali ke jalur awal. Di mode HP, seret area di luar layar HP untuk memutar HP.
- Kualitas grafis: `CFG.quality` = 'auto' | 'high' | 'low' (atau tambahkan ?q=low di URL). High memakai bayangan asli (shadow map); mode auto otomatis turun ke low bila FPS rendah.
