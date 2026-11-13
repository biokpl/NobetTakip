"""Nöbet Takip — ikon seçenekleri v2 (numpy ile yüksek çözünürlük, sonra küçültme)."""
import math
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

S = 2048
F_BOLD = r'C:\Windows\Fonts\segoeuib.ttf'
YY, XX = np.mgrid[0:S, 0:S].astype(np.float32)


def rgba(arr_rgb, alpha):
    a = np.clip(alpha, 0, 1)[..., None]
    out = np.concatenate([np.clip(arr_rgb, 0, 255), a * 255], axis=2).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


def lin(c1, c2, angle):
    a = math.radians(angle)
    p = XX * math.cos(a) + YY * math.sin(a)
    t = (p - p.min()) / (p.max() - p.min())
    c1, c2 = np.array(c1, np.float32), np.array(c2, np.float32)
    return c1 + (c2 - c1) * t[..., None]


def radial_alpha(cx, cy, r, strength):
    d = np.sqrt((XX - cx) ** 2 + (YY - cy) ** 2) / r
    return strength * np.clip(1 - d, 0, 1) ** 1.6


def solid(c):
    return np.broadcast_to(np.array(c, np.float32), (S, S, 3)).copy()


def mask_img(draw_fn):
    m = Image.new('L', (S, S), 0)
    draw_fn(ImageDraw.Draw(m))
    return m


def shape_mask(maskable):
    if maskable:
        return Image.new('L', (S, S), 255)
    return mask_img(lambda d: d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.225), fill=255))


def apply_mask(img, m):
    out = Image.new('RGBA', img.size, (0, 0, 0, 0))
    out.paste(img, (0, 0), m)
    return out


def drop_shadow(layer, blur, dy, color=(10, 8, 40), alpha=0.45):
    a = np.asarray(layer.split()[3], np.float32) / 255 * alpha
    sh = rgba(solid(color), a).filter(ImageFilter.GaussianBlur(blur))
    out = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    out.alpha_composite(sh, (0, int(dy)))
    return out


def gloss(base_mask, strength=0.16):
    """Üst yarıya yumuşak ışık"""
    t = np.clip(1 - YY / (S * 0.55), 0, 1) ** 1.8
    g = rgba(solid((255, 255, 255)), t * strength)
    return apply_mask(g, base_mask)


def crescent_mask(cx, cy, r, cut=0.80, ox=0.40, oy=-0.30):
    d1 = np.sqrt((XX - cx) ** 2 + (YY - cy) ** 2)
    d2 = np.sqrt((XX - (cx + ox * r)) ** 2 + (YY - (cy + oy * r)) ** 2)
    aa = 2.0
    m1 = np.clip((r - d1) / aa + 0.5, 0, 1)
    m2 = np.clip((d2 - r * cut) / aa + 0.5, 0, 1)
    return m1 * m2


def sparkle(d, cx, cy, s, fill):
    k = 0.22
    pts = [(cx, cy - s), (cx + s * k, cy - s * k), (cx + s, cy), (cx + s * k, cy + s * k),
           (cx, cy + s), (cx - s * k, cy + s * k), (cx - s, cy), (cx - s * k, cy - s * k)]
    d.polygon(pts, fill=fill)


# ---------- 1) Cam ızgara: takvimde öne çıkan nöbet günü ----------
def icon_grid(maskable=False):
    m = shape_mask(maskable)
    bg = lin((118, 92, 255), (28, 190, 236), 125)
    hi = radial_alpha(S * 0.18, S * 0.05, S * 0.85, 0.45)
    bg = bg * (1 - hi[..., None]) + 255 * hi[..., None]
    dk = radial_alpha(S * 0.95, S * 1.0, S * 0.9, 0.35)
    bg = bg * (1 - dk[..., None]) + np.array([20, 16, 70]) * dk[..., None]
    img = apply_mask(rgba(bg, np.ones((S, S))), m)

    G = S * (0.50 if maskable else 0.60)
    g = G * 0.075
    t = (G - 2 * g) / 3
    r = t * 0.27
    x0 = (S - G) / 2
    y0 = (S - G) / 2
    star = (1, 2)  # vurgulu kare: orta satır, sağ sütun
    glass = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glass)
    for row in range(3):
        for col in range(3):
            if (row, col) == star:
                continue
            bx, by = x0 + col * (t + g), y0 + row * (t + g)
            alpha = 70 if (row, col) in ((0, 0), (2, 1)) else 46
            gd.rounded_rectangle([bx, by, bx + t, by + t], radius=r, fill=(255, 255, 255, alpha),
                                 outline=(255, 255, 255, 90), width=int(S * 0.004))
    img.alpha_composite(glass)

    # vurgulu kare
    bx, by = x0 + star[1] * (t + g), y0 + star[0] * (t + g)
    tile = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(tile).rounded_rectangle([bx, by, bx + t, by + t], radius=r, fill=(255, 255, 255, 255))
    img.alpha_composite(drop_shadow(tile, S * 0.03, S * 0.018, (30, 20, 110), 0.55))
    img.alpha_composite(tile)
    # karenin içinde degrade hilal
    cr = t * 0.27
    cm = crescent_mask(bx + t * 0.47, by + t * 0.52, cr)
    moon = rgba(lin((108, 84, 255), (24, 170, 230), 135), cm)
    img.alpha_composite(moon)
    sp = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    sparkle(ImageDraw.Draw(sp), bx + t * 0.70, by + t * 0.30, t * 0.09, (40, 160, 235, 255))
    img.alpha_composite(sp)
    img.alpha_composite(gloss(m, 0.10))
    return img


# ---------- 2) Gece–gündüz halkası: 24 saat ----------
def icon_ring(maskable=False):
    m = shape_mask(maskable)
    bg = lin((30, 32, 78), (8, 10, 30), 115)
    glow = radial_alpha(S / 2, S * 0.47, S * 0.55, 0.55)
    bg = bg * (1 - glow[..., None]) + np.array([90, 70, 220]) * glow[..., None]
    img = apply_mask(rgba(bg, np.ones((S, S))), m)

    sc = 0.82 if maskable else 1.0
    cx, cy = S / 2, S / 2
    R, T = S * 0.315 * sc, S * 0.085 * sc
    dx, dy = XX - cx, YY - cy
    dist = np.sqrt(dx ** 2 + dy ** 2)
    ang = (np.degrees(np.arctan2(dy, dx))) % 360
    ring = np.clip((T / 2 - np.abs(dist - R)) / 2 + 0.5, 0, 1)
    gap = 7
    day = (ang >= 180 + gap) & (ang <= 360 - gap)
    night = (ang >= gap) & (ang <= 180 - gap)
    td = np.clip((ang - 180) / 180, 0, 1)[..., None]
    tn = np.clip(ang / 180, 0, 1)[..., None]
    c_day = np.array([255, 196, 84]) + (np.array([255, 110, 110]) - np.array([255, 196, 84])) * td
    c_night = np.array([45, 212, 240]) + (np.array([124, 96, 255]) - np.array([45, 212, 240])) * tn
    col = np.where(day[..., None], c_day, c_night)
    a = ring * (day | night)
    arcs = rgba(col, a)
    # yuvarlak uçlar
    cd = ImageDraw.Draw(arcs)
    caps = [(180 + gap, (255, 196, 84)), (360 - gap, (255, 110, 110)), (gap, (45, 212, 240)), (180 - gap, (124, 96, 255))]
    for angd, c in caps:
        aa = math.radians(angd)
        px, py = cx + R * math.cos(aa), cy + R * math.sin(aa)
        cd.ellipse([px - T / 2, py - T / 2, px + T / 2, py + T / 2], fill=c + (255,))
    img.alpha_composite(arcs.filter(ImageFilter.GaussianBlur(S * 0.03)))
    img.alpha_composite(arcs)

    # 24 saat çentiği
    tk = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    td_ = ImageDraw.Draw(tk)
    for i in range(24):
        aa = math.radians(i * 15 - 90)
        major = i % 6 == 0
        r1 = R - T * 0.95
        r2 = r1 - (T * 0.42 if major else T * 0.22)
        td_.line([(cx + r1 * math.cos(aa), cy + r1 * math.sin(aa)), (cx + r2 * math.cos(aa), cy + r2 * math.sin(aa))],
                 fill=(255, 255, 255, 170 if major else 80), width=int(S * (0.011 if major else 0.007)))
    img.alpha_composite(tk)

    # hilal + yıldız
    mr = S * 0.135 * sc
    cm = crescent_mask(cx - mr * 0.08, cy + mr * 0.04, mr, cut=0.80, ox=0.42, oy=-0.32)
    moon = rgba(lin((255, 255, 255), (196, 200, 255), 135), cm)
    img.alpha_composite(moon.filter(ImageFilter.GaussianBlur(S * 0.025)))
    img.alpha_composite(moon)
    sp = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    sparkle(ImageDraw.Draw(sp), cx + mr * 0.55, cy - mr * 0.50, mr * 0.26, (255, 255, 255, 255))
    img.alpha_composite(sp)
    img.alpha_composite(gloss(m, 0.07))
    return img


# ---------- 3) Premium takvim kartı ----------
def icon_card(maskable=False):
    m = shape_mask(maskable)
    bg = lin((36, 30, 96), (10, 12, 36), 130)
    glow = radial_alpha(S * 0.5, S * 0.30, S * 0.65, 0.5)
    bg = bg * (1 - glow[..., None]) + np.array([110, 90, 255]) * glow[..., None]
    img = apply_mask(rgba(bg, np.ones((S, S))), m)

    sc = 0.82 if maskable else 1.0
    w = S * 0.58 * sc
    h = w * 0.96
    x0, y0 = (S - w) / 2, (S - h) / 2 + S * 0.025
    r = w * 0.15
    cm = mask_img(lambda d: d.rounded_rectangle([x0, y0, x0 + w, y0 + h], radius=r, fill=255))
    card = apply_mask(rgba(lin((255, 255, 255), (232, 234, 255), 90), np.ones((S, S))), cm)
    band_h = h * 0.27
    bm = mask_img(lambda d: (d.rounded_rectangle([x0, y0, x0 + w, y0 + h], radius=r, fill=255), d.rectangle([x0, y0 + band_h, x0 + w, y0 + h], fill=0)))
    band = apply_mask(rgba(lin((124, 98, 255), (36, 196, 240), 0), np.ones((S, S))), bm)
    card.alpha_composite(band)
    img.alpha_composite(drop_shadow(card, S * 0.04, S * 0.03, (0, 0, 20), 0.6))
    img.alpha_composite(card)
    # halkalar
    rg = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    rd = ImageDraw.Draw(rg)
    for fx in (0.30, 0.70):
        cxr = x0 + w * fx
        rw = w * 0.055
        rd.rounded_rectangle([cxr - rw / 2, y0 - h * 0.075, cxr + rw / 2, y0 + h * 0.085], radius=rw / 2, fill=(246, 247, 255, 255))
    img.alpha_composite(drop_shadow(rg, S * 0.01, S * 0.006, (20, 10, 80), 0.5))
    img.alpha_composite(rg)
    # gün noktaları 4x3, biri vurgulu
    dots = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    dd = ImageDraw.Draw(dots)
    gx0, gx1 = x0 + w * 0.20, x0 + w * 0.80
    gy0, gy1 = y0 + band_h + h * 0.17, y0 + h * 0.84
    cols, rows = 4, 3
    dr = w * 0.052
    hl = (2, 1)
    centers = {}
    for j in range(rows):
        for i in range(cols):
            px = gx0 + (gx1 - gx0) * i / (cols - 1)
            py = gy0 + (gy1 - gy0) * j / (rows - 1)
            centers[(i, j)] = (px, py)
            if (i, j) != hl:
                dd.ellipse([px - dr, py - dr, px + dr, py + dr], fill=(206, 210, 236, 255))
    img.alpha_composite(dots)
    px, py = centers[hl]
    R2 = dr * 2.25
    hm = mask_img(lambda d: d.ellipse([px - R2, py - R2, px + R2, py + R2], fill=255))
    hd = apply_mask(rgba(lin((118, 92, 255), (28, 186, 236), 135), np.ones((S, S))), hm)
    img.alpha_composite(drop_shadow(hd, S * 0.018, S * 0.01, (60, 40, 200), 0.6))
    img.alpha_composite(hd)
    ck = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    kd = ImageDraw.Draw(ck)
    lw = int(R2 * 0.24)
    p1, p2, p3 = (px - R2 * 0.40, py + R2 * 0.02), (px - R2 * 0.10, py + R2 * 0.32), (px + R2 * 0.42, py - R2 * 0.28)
    kd.line([p1, p2, p3], fill=(255, 255, 255, 255), width=lw, joint='curve')
    for p in (p1, p2, p3):
        kd.ellipse([p[0] - lw / 2, p[1] - lw / 2, p[0] + lw / 2, p[1] + lw / 2], fill=(255, 255, 255, 255))
    img.alpha_composite(ck)
    img.alpha_composite(gloss(m, 0.06))
    return img


ICONS = {'1': icon_grid, '2': icon_ring, '3': icon_card}


def render(key, size, maskable=False):
    return ICONS[key](maskable).resize((size, size), Image.LANCZOS)


if __name__ == '__main__':
    out = sys.argv[1]
    big = 360
    sheet = Image.new('RGBA', (3 * big + 4 * 50, big + 260), (238, 241, 248, 255))
    d = ImageDraw.Draw(sheet)
    f = ImageFont.truetype(F_BOLD, 36)
    for idx, k in enumerate('123'):
        x = 50 + idx * (big + 50)
        sheet.alpha_composite(render(k, big), (x, 30))
        # telefonda gerçek boyut önizlemesi
        sm = render(k, 96)
        sheet.alpha_composite(sm, (x + big // 2 - 48, big + 60))
        l, t, r_, b = d.textbbox((0, 0), k, font=f)
        d.text((x + big / 2 - (r_ - l) / 2, big + 175), k, font=f, fill=(20, 26, 46))
    sheet.save(out)
    print('ok')
