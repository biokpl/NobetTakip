"""Nöbet hatırlatıcı (Raspberry Pi, systemd timer ile 2 dakikada bir).

- Uygulama nöbet tarihlerini gizli bir ntfy kanalına (sync_topic) JSON olarak yollar.
- Bu betik o kanalı okur, tarihleri yerel dosyada saklar.
- Nöbetten önceki gün saat 18:30'da telefona uygulamanın kendi bildirimini (web push) yollar.
- Nöbet günü hafta içiyse 17:00'de, hafta sonuysa 08:30'da hatırlatmayı telefondan siler.
- Telefon aboneliği yoksa (eski kurulum) ntfy kanalına (notify_topic) yollar.
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
TEST = BASE / 'test.json'   # son yapılan deneme bildirimi
VAPID_KEY = str(BASE / 'vapid_private.pem')
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


class AbonelikBitti(Exception):
    pass


def push(sub, obj):
    """Uygulamanın kendi bildirimi (web push)."""
    from pywebpush import webpush, WebPushException
    try:
        webpush(subscription_info=sub, data=json.dumps(obj, ensure_ascii=False), vapid_private_key=VAPID_KEY,
                vapid_claims={'sub': CFG.get('vapid_sub', 'https://biokpl.github.io')},
                ttl=12 * 3600, headers={'Urgency': 'high'}, timeout=20)
    except WebPushException as e:
        code = getattr(e.response, 'status_code', None)
        if code in (404, 410):
            raise AbonelikBitti() from e
        raise


def reminder_text(d, items, start):
    gun = f"{d.day} {AYLAR[d.month - 1]} {GUNLER[d.weekday()]}"
    liste = [x.strip() for x in str(items or 'Şarj aleti').replace('\n', ',').split(',') if x.strip()]
    return f"Yarın ({gun}) saat {start.strftime('%H:%M')}'da 24 saatlik nöbetin başlıyor.\nYanına al: " + ', '.join(liste)


def publish(d, data, start):
    """Hatırlatmayı yolla; hangi yoldan gittiğini döndür."""
    title = 'Yarın nöbetin var'
    body = reminder_text(d, data.get('items'), start)
    tag = f"nobet-{d.isoformat()}"
    if data.get('push'):
        push(data['push'], {'type': 'remind', 'tag': tag, 'title': title, 'body': body, 'url': CFG.get('app_url', './')})
        return 'push'
    if CFG.get('notify_topic'):
        msg = {'topic': CFG['notify_topic'], 'title': title, 'message': body, 'priority': 4, 'tags': ['bell'], 'sequence_id': tag}
        if CFG.get('app_url'):
            msg['click'] = CFG['app_url']
        requests.post(f"{NTFY}/", json=msg, timeout=20).raise_for_status()
        return 'ntfy'
    raise RuntimeError('bildirim yolu yok (telefon aboneliği bekleniyor)')


def delete(dstr, via, data):
    tag = f"nobet-{dstr}"
    if via == 'ntfy':
        requests.delete(f"{NTFY}/{CFG['notify_topic']}/{tag}", timeout=20).raise_for_status()
    elif data.get('push'):
        push(data['push'], {'type': 'clear', 'tag': tag})


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

    # Deneme bildirimi: uygulamada düğmeye basıldıysa bir kez yolla
    test = load(TEST, {})
    if data.get('test', 0) > test.get('done', 0) and data.get('push'):
        try:
            push(data['push'], {'type': 'test', 'tag': 'nobet-test', 'title': 'Nöbet Takip',
                                'body': 'Deneme: nöbet hatırlatmaları bu şekilde gelecek.', 'url': CFG.get('app_url', './')})
            print('deneme bildirimi gönderildi')
        except Exception as e:
            print('deneme gönderilemedi:', e, file=sys.stderr)
        save(TEST, {'done': data['test']})

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
                    via = publish(d, data, start)
                    sent[dstr] = {'sent': now.isoformat(timespec='seconds'), 'via': via}
                    dirty = True
                    print('hatırlatma gönderildi:', dstr, via)
                except AbonelikBitti:
                    print('telefon aboneliği geçersiz; uygulamada bildirim iznini yenile', file=sys.stderr)
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
                delete(dstr, rec.get('via', 'ntfy'), data)
                rec['deleted'] = now.isoformat(timespec='seconds')
                dirty = True
                print('hatırlatma silindi:', dstr)
            except AbonelikBitti:
                rec['deleted'] = now.isoformat(timespec='seconds')
                dirty = True
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
