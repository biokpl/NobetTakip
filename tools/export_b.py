"""Seçilen ikon (B: beyaz önlük) — tüm boyutları üretir. Çalıştırma: python export_b.py (tools klasöründe)"""
import os
import numpy as np
from PIL import Image, ImageDraw
from icons2 import S, rgba, lin, mask_img, shape_mask, apply_mask, drop_shadow, gloss, sparkle
from icons3 import icon_coat, night_bg, bezier, poly_mask, shield_pts, dna, moon, GOLD1, GOLD2

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons')


def coat_scene(z):
    """Önlük sahnesi, merkez etrafında z oranında küçültülmüş (maskable güvenli alan için)."""
    m = shape_mask(True)
    img = night_bg(m, gpos=(0.72, 0.18), gstr=0.35)
    c = S / 2
    P = lambda x, y: (c + (x - c) * z, c + (y - c) * z)
    L = lambda v: v * z
    neck_y, neck_w, sh_y = S * 0.42, S * 0.17, S * 0.56
    # önlük gövdesi: kenarlardan taşacak kadar geniş
    pts = [P(-S * 0.9, S * 1.9), P(-S * 0.9, sh_y + S * 0.62)]
    pts += [P(*q) for q in bezier((-S * 0.9, sh_y + S * 0.62), (S * 0.04, sh_y - S * 0.10), (c - neck_w * 0.9, neck_y))[1:]]
    pts += [P(c + neck_w * 0.9, neck_y)]
    pts += [P(*q) for q in bezier((c + neck_w * 0.9, neck_y), (S * 0.96, sh_y - S * 0.10), (S * 1.9, sh_y + S * 0.62))[1:]]
    pts += [P(S * 1.9, S * 1.9)]
    coat = apply_mask(rgba(lin((255, 255, 255), (210, 218, 238), 90), np.ones((S, S))), poly_mask(pts))
    img.alpha_composite(drop_shadow(coat, S * 0.03, -S * 0.006, (0, 0, 20), 0.55))
    img.alpha_composite(coat)
    v_bot = S * 0.90
    vee = [P(c - neck_w * 0.9, neck_y), P(c + neck_w * 0.9, neck_y), P(c, v_bot), P(c, S * 1.2)]
    img.alpha_composite(apply_mask(rgba(lin((32, 50, 118), (12, 18, 52), 90), np.ones((S, S))), poly_mask(vee[:3])))
    y0, y1 = P(0, neck_y + S * 0.05)[1], P(0, v_bot - S * 0.09)[1]
    dna(img, c, y0, y1, L(S * 0.045), L(S * 0.016), turns=1.25)
    for sgn in (-1, 1):
        lap = [P(c + sgn * neck_w * 0.9, neck_y), P(c + sgn * S * 0.235, S * 0.585), P(c + sgn * S * 0.150, S * 0.640),
               P(c + sgn * S * 0.012, v_bot - S * 0.01), P(c + sgn * neck_w * 0.30, neck_y + S * 0.10)]
        lp = apply_mask(rgba(lin((246, 248, 255), (200, 208, 230), 90 + sgn * 30), np.ones((S, S))), poly_mask(lap))
        img.alpha_composite(drop_shadow(lp, S * 0.008, S * 0.006, (40, 50, 90), 0.35))
        img.alpha_composite(lp)
        ImageDraw.Draw(img).line(lap + [lap[0]], fill=(176, 186, 214, 255), width=int(L(S * 0.004)), joint='curve')
    d = ImageDraw.Draw(img)
    px0, py0 = P(c - S * 0.36, S * 0.70)
    pw, ph = L(S * 0.15), L(S * 0.13)
    pen = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    pd = ImageDraw.Draw(pen)
    pd.rounded_rectangle([px0 + pw * 0.62, py0 - ph * 0.42, px0 + pw * 0.62 + L(S * 0.022), py0 + ph * 0.3], radius=L(S * 0.011), fill=(40, 110, 230, 255))
    pd.rectangle([px0 + pw * 0.62 + L(S * 0.004), py0 - ph * 0.30, px0 + pw * 0.62 + L(S * 0.009), py0 + ph * 0.05], fill=(220, 230, 255, 255))
    img.alpha_composite(pen)
    d.rounded_rectangle([px0, py0, px0 + pw, py0 + ph], radius=L(S * 0.012), fill=(236, 240, 250, 255), outline=(176, 186, 214, 255), width=int(L(S * 0.004)))
    bw, bh = L(S * 0.115), L(S * 0.135)
    bcx, btop = P(c + S * 0.30, S * 0.67)
    b = apply_mask(rgba(lin(GOLD1, GOLD2, 100), np.ones((S, S))), poly_mask(shield_pts(bcx, btop, bw, bh)))
    img.alpha_composite(drop_shadow(b, S * 0.008, S * 0.006, (40, 30, 0), 0.5))
    img.alpha_composite(b)
    sp = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    sparkle(ImageDraw.Draw(sp), bcx, btop + bh * 0.48, bw * 0.28, (150, 100, 20, 255))
    img.alpha_composite(sp)
    mx, my = P(S * 0.72, S * 0.20)
    moon(img, mx, my, L(S * 0.08))
    img.alpha_composite(gloss(m, 0.05))
    return img


if __name__ == '__main__':
    rounded = icon_coat(False)
    for size in (192, 512):
        rounded.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, f'app-icon-{size}.png'))
    coat_scene(0.80).convert('RGB').resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, 'app-icon-maskable-512.png'))
    print('ok')
