"""Nöbet hatırlatıcı (Raspberry Pi, systemd timer ile 2 dakikada bir).

- Uygulama nöbet tarihlerini gizli bir ntfy kanalına (sync_topic) JSON olarak yollar.
- Bu betik o kanalı okur, tarihleri yerel dosyada saklar.
- Nöbetten önceki gün saat 18:30'da bildirim kanalına (notify_topic) hatırlatma yollar.
- Nöbet günü hafta içiyse 17:00'de, hafta sonuysa 08:30'da hatırlatmayı telefondan siler.
- Nöbet silinir ya da tarihi değişirse gönderilmiş hatırlatmayı da siler.
"""
import json
import sys
from datetime import date, datetime, time, timedelta
from pathlib import Path

import requests

BASE = Path(__file__).resolve().parent
CFG = json.loads((BASE / 'config.json').read_text(encoding='utf-8'))
DATA = BASE / 'data.json'   # uygulamadan gelen son veri
SENT = BASE / 'sent.json'   # gönderilen / silinen hatırlatmalar
NTFY = CFG.get('ntfy_url', 'https://ntfy.sh').rstrip('/')

AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
GUNLER = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']


def load(p, default):
    try:
        return json.loads(p.read_text(encoding='utf-8'))
    except Exception:
        return default


def save(p, obj):
    tmp = p.with_suffix('.tmp')
    tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=1), encoding='utf-8')
    tmp.replace(p)


def hm(s, default):
    try:
        h, m = map(int, str(s).split(':'))
        return time(h, m)
    except Exception:
        return default


def poll_sync(data):
    """Kanaldaki en yeni uygulama verisini al (ntfy.sh mesajları 12 saat saklar)."""
    since = data.get('_last_id') or '12h'
    r = requests.get(f"{NTFY}/{CFG['sync_topic']}/json", params={'poll': '1', 'since': since}, timeout=20)
    r.raise_for_status()
    r.encoding = 'utf-8'  # ntfy karakter setini başlıkta belirtmiyor; Türkçe harfler bozulmasın
    best = None
    last_id = data.get('_last_id')
    for line in r.text.splitlines():
        try:
            ev = json.loads(line)
        except ValueError:
            continue
        if ev.get('event') != 'message':
            continue
        last_id = ev.get('id', last_id)
        try:
            payload = json.loads(ev.get('message', ''))
        except ValueError:
            continue
        if isinstance(payload, dict) and isinstance(payload.get('shifts'), list):
            if best is None or payload.get('ts', 0) >= best.get('ts', 0):
                best = payload
    if best and best.get('ts', 0) >= data.get('ts', 0):
        best['_last_id'] = last_id
        return best, True
    if last_id != data.get('_last_id'):
        data['_last_id'] = last_id
        return data, True
    return data, False


def clear_at(d):
    """Nöbet günü: hafta içi 17:00, hafta sonu 08:30."""
    return datetime.combine(d, time(8, 30) if d.weekday() >= 5 else time(17, 0))


def publish(d, items, start):
    gun = f"{d.day} {AYLAR[d.month - 1]} {GUNLER[d.weekday()]}"
    liste = [x.strip() for x in str(items or 'Şarj aleti').replace('\n', ',').split(',') if x.strip()]
    msg = f"Yarın ({gun}) saat {start.strftime('%H:%M')}'da 24 saatlik nöbetin başlıyor.\n\nYanına al:\n" + '\n'.join(f"• {x}" for x in liste)
    body = {
        'topic': CFG['notify_topic'], 'title': 'Yarın nöbetin var', 'message': msg,
        'priority': 4, 'tags': ['bell'], 'sequence_id': f"nobet-{d.isoformat()}",
    }
    if CFG.get('app_url'):
        body['click'] = CFG['app_url']
    requests.post(f"{NTFY}/", json=body, timeout=20).raise_for_status()


def delete(dstr):
    requests.delete(f"{NTFY}/{CFG['notify_topic']}/nobet-{dstr}", timeout=20).raise_for_status()


def main():
    now = datetime.now()
    data = load(DATA, {})
    try:
        data, changed = poll_sync(data)
        if changed:
            save(DATA, data)
    except Exception as e:  # ağ yoksa eldeki veriyle devam
        print('eşitleme okunamadı:', e, file=sys.stderr)

    enabled = data.get('enabled', True)
    remind = hm(data.get('remind', '18:30'), time(18, 30))
    start = hm(data.get('start', '08:30'), time(8, 30))
    shifts = set(data.get('shifts', []))
    sent = load(SENT, {})
    dirty = False

    # Gönder: önceki gün 18:30 ile silinme saati arasında, henüz gönderilmediyse
    if enabled:
        for dstr in sorted(shifts):
            try:
                d = date.fromisoformat(dstr)
            except ValueError:
                continue
            at = datetime.combine(d - timedelta(days=1), remind)
            if at <= now < clear_at(d) and dstr not in sent:
                try:
                    publish(d, data.get('items'), start)
                    sent[dstr] = {'sent': now.isoformat(timespec='seconds')}
                    dirty = True
                    print('hatırlatma gönderildi:', dstr)
                except Exception as e:
                    print('gönderilemedi:', dstr, e, file=sys.stderr)

    # Sil: nöbet günü geldiyse, nöbet kaldırıldıysa ya da hatırlatma kapatıldıysa
    for dstr, rec in list(sent.items()):
        if rec.get('deleted'):
            continue
        try:
            d = date.fromisoformat(dstr)
        except ValueError:
            continue
        if now >= clear_at(d) or dstr not in shifts or not enabled:
            try:
                delete(dstr)
                rec['deleted'] = now.isoformat(timespec='seconds')
                dirty = True
                print('hatırlatma silindi:', dstr)
            except Exception as e:
                print('silinemedi:', dstr, e, file=sys.stderr)

    # 60 günden eski kayıtları temizle
    for dstr in list(sent):
        try:
            if date.fromisoformat(dstr) < now.date() - timedelta(days=60):
                del sent[dstr]
                dirty = True
        except ValueError:
            del sent[dstr]
            dirty = True
    if dirty:
        save(SENT, sent)


if __name__ == '__main__':
    main()
