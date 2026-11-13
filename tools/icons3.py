"""Nöbet Takip ikonları v3: kriminal laboratuvar gece nöbeti — DNA, polis rozeti, beyaz önlük, hilal."""
import math
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from icons2 import S, XX, YY, rgba, lin, radial_alpha, solid, mask_img, shape_mask, apply_mask, drop_shadow, gloss, crescent_mask, sparkle, F_BOLD

GOLD1, GOLD2 = (255, 222, 140), (214, 150, 48)


def night_bg(m, c1=(28, 34, 86), c2=(6, 9, 28), glow=(70, 90, 210), gpos=(0.5, 0.42), gstr=0.45):
    bg = lin(c1, c2, 115)
    g = radial_alpha(S * gpos[0], S * gpos[1], S * 0.6, gstr)
    bg = bg * (1 - g[..., None]) + np.array(glow) * g[..., None]
    img = apply_mask(rgba(bg, np.ones((S, S))), m)
    # yıldızlar
    st = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(st)
    rnd = np.random.default_rng(7)
    for _ in range(38):
        x, y = rnd.uniform(0.06, 0.94) * S, rnd.uniform(0.05, 0.55) * S
        r = rnd.uniform(0.002, 0.0055) * S
        a = int(rnd.uniform(70, 200))
        d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 255, a))
    img.alpha_composite(apply_mask(st, m))
    return img


def bezier(p0, p1, p2, n=40):
    return [((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t ** 2 * p2[0],
             (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t ** 2 * p2[1]) for t in np.linspace(0, 1, n)]


def shield_pts(cx, top, w, h):
    """Polis rozeti / kalkan şekli"""
    L, R = cx - w / 2, cx + w / 2
    dip = h * 0.05
    pts = []
    pts += bezier((L, top + h * 0.10), (cx - w * 0.25, top + h * 0.02), (cx, top - dip * 0.2))
    pts += bezier((cx, top - dip * 0.2), (cx + w * 0.25, top + h * 0.02), (R, top + h * 0.10))[1:]
    pts += [(R, top + h * 0.52)]
    pts += bezier((R, top + h * 0.52), (R - w * 0.02, top + h * 0.86), (cx, top + h))[1:]
    pts += bezier((cx, top + h), (L + w * 0.02, top + h * 0.86), (L, top + h * 0.52))[1:]
    return pts


def poly_mask(pts):
    return mask_img(lambda d: d.polygon(pts, fill=255))


def dna(img, cx, y0, y1, amp, width, c_front=(120, 236, 255), c_back=(110, 120, 230), rung=(200, 230, 255), turns=1.6, phase=0.0, glow=True):
    """Dikey DNA sarmalı; öndeki iplik parlak, arkadaki koyu."""
    n = 400
    ys = np.linspace(y0, y1, n)
    th = phase + 2 * math.pi * turns * (ys - y0) / (y1 - y0)
    xa = cx + amp * np.sin(th)
    xb = cx + amp * np.sin(th + math.pi)
    za = np.cos(th)  # >0 önde
    back = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    front = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    bd, fd = ImageDraw.Draw(back), ImageDraw.Draw(front)
    # basamaklar
    k = 11
    for i in np.linspace(0.04, 0.96, k):
        j = int(i * (n - 1))
        x1, x2, y = xa[j], xb[j], ys[j]
        if abs(x1 - x2) < width * 0.8:
            continue
        bd.line([(x1, y), (x2, y)], fill=rung + (200,), width=int(width * 0.42))
    for xs, z in ((xa, za), (xb, -za)):
        for i in range(n - 1):
            seg = [(xs[i], ys[i]), (xs[i + 1], ys[i + 1])]
            t = (z[i] + 1) / 2
            col = tuple(int(c_back[c] + (c_front[c] - c_back[c]) * t) for c in range(3))
            dr = fd if z[i] > 0 else bd
            dr.line(seg, fill=col + (255,), width=int(width))
            r = width / 2
            dr.ellipse([xs[i] - r, ys[i] - r, xs[i] + r, ys[i] + r], fill=col + (255,))
    img.alpha_composite(back)
    if glow:
        img.alpha_composite(front.filter(ImageFilter.GaussianBlur(S * 0.012)))
    img.alpha_composite(front)


def moon(img, cx, cy, r, c1=GOLD1, c2=(255, 184, 70), glow=True):
    cm = crescent_mask(cx, cy, r, cut=0.80, ox=0.42, oy=-0.30)
    mo = rgba(lin(c1, c2, 135), cm)
    if glow:
        img.alpha_composite(mo.filter(ImageFilter.GaussianBlur(S * 0.03)))
    img.alpha_composite(mo)


# ---------- A) Polis rozeti + DNA + hilal ----------
def icon_badge(maskable=False):
    m = shape_mask(maskable)
    img = night_bg(m)
    sc = 0.80 if maskable else 1.0
    cx = S / 2
    w, h = S * 0.56 * sc, S * 0.66 * sc
    top = S / 2 - h / 2 + S * 0.03
    outer = shield_pts(cx, top, w, h)
    gold = apply_mask(rgba(lin(GOLD1, GOLD2, 100), np.ones((S, S))), poly_mask(outer))
    img.alpha_composite(drop_shadow(gold, S * 0.035, S * 0.025, (0, 0, 10), 0.65))
    img.alpha_composite(gold)
    inset = w * 0.07
    inner = shield_pts(cx, top + inset * 0.9, w - 2 * inset, h - 2.1 * inset)
    navy = apply_mask(rgba(lin((34, 52, 120), (12, 20, 58), 100), np.ones((S, S))), poly_mask(inner))
    img.alpha_composite(navy)
    # iç ince altın çizgi
    ring = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    inner2 = shield_pts(cx, top + inset * 1.55, w - 3.3 * inset, h - 3.5 * inset)
    ImageDraw.Draw(ring).line(inner2 + [inner2[0]], fill=GOLD1 + (150,), width=int(S * 0.006), joint='curve')
    img.alpha_composite(ring)
    # DNA
    dna(img, cx, top + h * 0.31, top + h * 0.85, w * 0.17, S * 0.026 * sc)
    # hilal + yıldız rozetin üstünde
    moon(img, cx - w * 0.03, top + h * 0.175, S * 0.046 * sc)
    sp = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    sparkle(ImageDraw.Draw(sp), cx + w * 0.09, top + h * 0.145, S * 0.02 * sc, GOLD1 + (255,))
    img.alpha_composite(sp)
    img.alpha_composite(gloss(m, 0.06))
    return img


# ---------- B) Beyaz önlük + DNA + rozet + gece ----------
def icon_coat(maskable=False):
    m = shape_mask(maskable)
    img = night_bg(m, gpos=(0.72, 0.18), gstr=0.35)
    sc = 0.84 if maskable else 1.0
    cx = S / 2
    neck_y = S * 0.42
    neck_w = S * 0.17
    sh_y = S * 0.56  # omuz hizası
    coat_pts = [(-S * 0.05, S * 1.05), (-S * 0.05, sh_y + S * 0.10)]
    coat_pts += bezier((-S * 0.05, sh_y + S * 0.10), (S * 0.10, sh_y - S * 0.05), (cx - neck_w * 0.9, neck_y))[1:]
    coat_pts += [(cx + neck_w * 0.9, neck_y)]
    coat_pts += bezier((cx + neck_w * 0.9, neck_y), (S * 0.90, sh_y - S * 0.05), (S * 1.05, sh_y + S * 0.10))[1:]
    coat_pts += [(S * 1.05, S * 1.05)]
    coat = apply_mask(rgba(lin((255, 255, 255), (210, 218, 238), 90), np.ones((S, S))), poly_mask(coat_pts))
    img.alpha_composite(drop_shadow(coat, S * 0.03, -S * 0.006, (0, 0, 20), 0.55))
    img.alpha_composite(coat)
    # yaka içi: lacivert gömlek + DNA
    v_bot = S * 0.90
    vee = [(cx - neck_w * 0.9, neck_y), (cx + neck_w * 0.9, neck_y), (cx, v_bot)]
    img.alpha_composite(apply_mask(rgba(lin((32, 50, 118), (12, 18, 52), 90), np.ones((S, S))), poly_mask(vee)))
    dna(img, cx, neck_y + S * 0.05, v_bot - S * 0.09, S * 0.045, S * 0.016, turns=1.25)
    # klapalar (yaka katları) — hafif gölgeli
    for sgn in (-1, 1):
        lap = [(cx + sgn * neck_w * 0.9, neck_y), (cx + sgn * S * 0.235, S * 0.585), (cx + sgn * S * 0.150, S * 0.640), (cx + sgn * S * 0.012, v_bot - S * 0.01), (cx + sgn * neck_w * 0.30, neck_y + S * 0.10)]
        lm = poly_mask(lap)
        lp = apply_mask(rgba(lin((246, 248, 255), (200, 208, 230), 90 + sgn * 30), np.ones((S, S))), lm)
        img.alpha_composite(drop_shadow(lp, S * 0.008, S * 0.006, (40, 50, 90), 0.35))
        img.alpha_composite(lp)
        ImageDraw.Draw(img).line(lap + [lap[0]], fill=(176, 186, 214, 255), width=int(S * 0.004), joint='curve')
    # sol göğüs cebi + kalem
    d = ImageDraw.Draw(img)
    px0, py0, pw, ph = cx - S * 0.36, S * 0.70, S * 0.15, S * 0.13
    pen = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    pd = ImageDraw.Draw(pen)
    pd.rounded_rectangle([px0 + pw * 0.62, py0 - ph * 0.42, px0 + pw * 0.62 + S * 0.022, py0 + ph * 0.3], radius=S * 0.011, fill=(40, 110, 230, 255))
    pd.rectangle([px0 + pw * 0.62 + S * 0.004, py0 - ph * 0.30, px0 + pw * 0.62 + S * 0.009, py0 + ph * 0.05], fill=(220, 230, 255, 255))
    img.alpha_composite(pen)
    d.rounded_rectangle([px0, py0, px0 + pw, py0 + ph], radius=S * 0.012, fill=(236, 240, 250, 255), outline=(176, 186, 214, 255), width=int(S * 0.004))
    # sağ göğüste polis rozeti
    bw, bh = S * 0.115, S * 0.135
    bcx, btop = cx + S * 0.30, S * 0.67
    b = apply_mask(rgba(lin(GOLD1, GOLD2, 100), np.ones((S, S))), poly_mask(shield_pts(bcx, btop, bw, bh)))
    img.alpha_composite(drop_shadow(b, S * 0.008, S * 0.006, (40, 30, 0), 0.5))
    img.alpha_composite(b)
    sp = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    sparkle(ImageDraw.Draw(sp), bcx, btop + bh * 0.48, bw * 0.28, (150, 100, 20, 255))
    img.alpha_composite(sp)
    # gökte hilal
    moon(img, S * 0.72, S * 0.20, S * 0.08)
    img.alpha_composite(gloss(m, 0.05))
    return apply_mask(img, m)


# ---------- C) Beyaz rozet (önlük beyazı) + lacivert DNA + altın hilal ----------
def icon_white_badge(maskable=False):
    m = shape_mask(maskable)
    img = night_bg(m, c1=(22, 40, 100), c2=(6, 12, 36), glow=(40, 120, 220), gstr=0.4)
    sc = 0.80 if maskable else 1.0
    cx = S / 2
    w, h = S * 0.54 * sc, S * 0.64 * sc
    top = S / 2 - h / 2 + S * 0.03
    outer = shield_pts(cx, top, w, h)
    rim = apply_mask(rgba(lin(GOLD1, GOLD2, 100), np.ones((S, S))), poly_mask(outer))
    img.alpha_composite(drop_shadow(rim, S * 0.035, S * 0.025, (0, 0, 10), 0.6))
    img.alpha_composite(rim)
    inset = w * 0.055
    inner = shield_pts(cx, top + inset * 0.9, w - 2 * inset, h - 2.1 * inset)
    white = apply_mask(rgba(lin((255, 255, 255), (222, 230, 246), 100), np.ones((S, S))), poly_mask(inner))
    img.alpha_composite(white)
    dna(img, cx, top + h * 0.31, top + h * 0.85, w * 0.17, S * 0.026 * sc,
        c_front=(30, 90, 220), c_back=(150, 170, 220), rung=(120, 150, 210), glow=False)
    moon(img, cx - w * 0.02, top + h * 0.17, S * 0.05 * sc, c1=(255, 200, 90), c2=(230, 140, 30), glow=False)
    sp = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    sparkle(ImageDraw.Draw(sp), cx + w * 0.10, top + h * 0.135, S * 0.02 * sc, (230, 150, 40, 255))
    img.alpha_composite(sp)
    img.alpha_composite(gloss(m, 0.05))
    return img


ICONS = {'A': icon_badge, 'B': icon_coat, 'C': icon_white_badge}


def render(key, size, maskable=False):
    return ICONS[key](maskable).resize((size, size), Image.LANCZOS)


if __name__ == '__main__':
    out = sys.argv[1]
    big = 360
    sheet = Image.new('RGBA', (3 * big + 4 * 50, big + 260), (238, 241, 248, 255))
    d = ImageDraw.Draw(sheet)
    f = ImageFont.truetype(F_BOLD, 36)
    for idx, k in enumerate('ABC'):
        x = 50 + idx * (big + 50)
        sheet.alpha_composite(render(k, big), (x, 30))
        sheet.alpha_composite(render(k, 96), (x + big // 2 - 48, big + 60))
        l, t, r_, b = d.textbbox((0, 0), k, font=f)
        d.text((x + big / 2 - (r_ - l) / 2, big + 175), k, font=f, fill=(20, 26, 46))
    sheet.save(out)
    print('ok')
