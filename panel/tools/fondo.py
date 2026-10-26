"""The panel's background: an out-of-focus warm room with soft lights, in a light and a dark version.

Drawn here, without any photo (decision of 26/10/2026): a wall, two wooden shelves, a window of light, a dark cabinet,
a desk and a few lamps, all blurred, so the glass of the cards has something to blur. Run it again to change it:

    python3 tools/fondo.py src/assets

It needs Pillow and writes fondo-claro.webp and fondo-oscuro.webp (2400 x 1500).
"""
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter

# Drawn at half size and blurred, then enlarged: the blur hides the enlargement.
W, H = 1200, 750
OUT_W, OUT_H = 2400, 1500


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def vertical(stops):
    """A vertical gradient through (position, colour) stops."""
    img = Image.new('RGB', (1, H))
    for y in range(H):
        t = y / (H - 1)
        for (p0, c0), (p1, c1) in zip(stops, stops[1:]):
            if p0 <= t <= p1:
                img.putpixel((0, y), lerp(c0, c1, (t - p0) / (p1 - p0)))
                break
    return img.resize((W, H))


def glow(base, center, radius, colour, strength, blur):
    """A soft round light: a filled circle, blurred, laid over the picture."""
    mask = Image.new('L', (W, H), 0)
    cx, cy = center
    ImageDraw.Draw(mask).ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=round(255 * strength))
    return Image.composite(Image.new('RGB', (W, H), colour), base, mask.filter(ImageFilter.GaussianBlur(blur)))


def shape(base, box, colour, strength, blur, radius=0):
    """A blurred rectangle: a shelf, a window, a piece of furniture."""
    mask = Image.new('L', (W, H), 0)
    ImageDraw.Draw(mask).rounded_rectangle(box, radius=radius, fill=round(255 * strength))
    return Image.composite(Image.new('RGB', (W, H), colour), base, mask.filter(ImageFilter.GaussianBlur(blur)))


def room(p):
    img = vertical(p['wall'])
    # Daylight from a window on the left, and a warm lamp on the right.
    img = glow(img, (170, 150), 330, p['daylight'], p['daylight_k'], 120)
    img = glow(img, (1080, 420), 260, p['lamp'], p['lamp_k'], 110)
    # Wooden shelves along the top: two cubbies with a long shelf under them.
    for x0, x1 in ((90, 400), (780, 1110)):
        img = shape(img, (x0, -30, x1, 118), p['wood'], 0.92, 12, 10)
        img = shape(img, (x0 + 26, 4, x1 - 26, 92), p['wood_back'], 0.85, 10, 6)
    img = shape(img, (-40, 132, W + 40, 150), p['wood'], 0.8, 10)
    # Lamps out of focus: a few soft discs of light.
    for cx, cy, r in ((560, 70, 34), (640, 92, 22), (1150, 300, 40)):
        img = glow(img, (cx, cy), r, p['bokeh'], p['bokeh_k'], 10)
    # A tall window of light on the left, a dark cabinet in the middle and the desk below.
    img = shape(img, (40, 230, 300, 620), p['window'], p['window_k'], 34, 30)
    img = shape(img, (400, 250, 900, 520), p['cabinet'], p['cabinet_k'], 46, 24)
    img = shape(img, (-60, 600, W + 60, H + 60), p['desk'], 0.85, 26)
    # A plant at the bottom left and a cool reflection on the right, both faint.
    img = glow(img, (250, 640), 120, p['plant'], p['plant_k'], 50)
    img = glow(img, (960, 680), 170, p['cool'], p['cool_k'], 80)
    img = img.filter(ImageFilter.GaussianBlur(9)).resize((OUT_W, OUT_H), Image.LANCZOS)
    # A little grain, so the gradients do not band.
    noise = Image.effect_noise((OUT_W, OUT_H), 22).convert('RGB')
    return Image.blend(img, ImageChops.overlay(img, noise), 0.06)


LIGHT = dict(
    wall=[(0, (238, 230, 220)), (0.55, (221, 206, 190)), (1, (190, 158, 126))],
    daylight=(255, 250, 240), daylight_k=0.85,
    lamp=(236, 176, 112), lamp_k=0.5,
    wood=(122, 86, 58), wood_back=(92, 64, 44),
    bokeh=(255, 236, 200), bokeh_k=0.6,
    window=(250, 246, 238), window_k=0.75,
    cabinet=(86, 72, 62), cabinet_k=0.5,
    desk=(170, 132, 98),
    plant=(112, 128, 84), plant_k=0.4,
    cool=(150, 172, 214), cool_k=0.35,
)
DARK = dict(
    wall=[(0, (40, 36, 40)), (0.55, (33, 29, 32)), (1, (52, 38, 28))],
    daylight=(92, 104, 136), daylight_k=0.55,
    lamp=(196, 128, 64), lamp_k=0.55,
    wood=(70, 50, 36), wood_back=(44, 32, 24),
    bokeh=(230, 170, 96), bokeh_k=0.5,
    window=(70, 84, 116), window_k=0.55,
    cabinet=(16, 15, 18), cabinet_k=0.7,
    desk=(74, 52, 36),
    plant=(52, 66, 44), plant_k=0.5,
    cool=(44, 72, 128), cool_k=0.55,
)

if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else '.'
    for name, palette in (('claro', LIGHT), ('oscuro', DARK)):
        room(palette).save(f'{out}/fondo-{name}.webp', 'WEBP', quality=80, method=6)
        print(f'{out}/fondo-{name}.webp')
