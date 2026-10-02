"""Tạo icon cho bản dev từ icon chính (public/icons) → public/icons-dev: nền cam thay nền xanh, cỡ ≥ 48 thêm dải "DEV".
Chạy lại khi đổi icon chính:  python3 scripts/make-dev-icons.py   (cần Pillow + font DejaVu Sans Bold)."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SRC, OUT = ROOT / 'public/icons', ROOT / 'public/icons-dev'
BG = (29, 78, 216)          # xanh của icon chính
DEV = (234, 88, 12)         # cam (orange-600)
BAND = (124, 45, 18)        # nâu cam đậm cho dải chữ
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

OUT.mkdir(exist_ok=True)
for size in (16, 32, 48, 128):
    im = Image.open(SRC / f'vala-{size}.png').convert('RGBA')
    px = im.load()
    for y in range(size):
        for x in range(size):
            r, g, b, a = px[x, y]
            w = max(0.0, min(1.0, (r - BG[0]) / (255 - BG[0])))      # 0 = nền, 1 = chữ V trắng (giữ khử răng cưa)
            px[x, y] = tuple(round(DEV[i] * (1 - w) + 255 * w) for i in range(3)) + (a,)
    if size >= 48:
        band_h = round(size * 0.3)
        layer = Image.new('RGBA', im.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        d.rectangle([0, size - band_h, size, size], fill=BAND + (255,))
        font = ImageFont.truetype(FONT, round(band_h * 0.72))
        d.text((size / 2, size - band_h / 2), 'DEV', font=font, fill=(255, 255, 255, 255), anchor='mm')
        # Giữ góc bo của icon gốc: dải chữ chỉ hiện trong phần icon không trong suốt.
        layer.putalpha(Image.composite(layer.getchannel('A'), Image.new('L', im.size, 0), im.getchannel('A')))
        im = Image.alpha_composite(im, layer)
    im.save(OUT / f'vala-{size}.png', optimize=True)
    print('đã tạo', OUT / f'vala-{size}.png')
