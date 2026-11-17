"""Menanam ulang gambar di assets/ ke dalam index.html (diperlukan untuk logo RSUD & maskot,
karena keduanya dipakai sebagai tekstur 3D yang tidak bisa dibaca langsung dari file://).
Pakai:  pip install pillow   lalu   python embed_assets.py
File yang dibaca: assets/logo-rsmn.png, assets/maskot.png, assets/logo-mobilejkn.png"""
import base64, io, json, re
from PIL import Image

FILES = {"rsmn": ("assets/logo-rsmn.png", 384), "mk": ("assets/maskot.png", 420), "jkn": ("assets/logo-mobilejkn.png", 320)}

def uri(path, maxside):
    im = Image.open(path).convert("RGBA")
    r = maxside / max(im.size)
    im = im.resize((max(1, int(im.width * r)), max(1, int(im.height * r))), Image.LANCZOS)
    b = io.BytesIO(); im.save(b, "WEBP", quality=88, method=6)
    return "data:image/webp;base64," + base64.b64encode(b.getvalue()).decode()

data = {k: uri(p, s) for k, (p, s) in FILES.items()}
html = open("index.html", encoding="utf-8").read()
new = "const IMG=" + json.dumps(data) + ";"
html, n = re.subn(r"const IMG=\{.*?\};", lambda m: new, html, count=1, flags=re.S)
assert n == 1, "const IMG tidak ditemukan"
open("index.html", "w", encoding="utf-8").write(html)
print("Selesai: gambar di index.html diperbarui.")
