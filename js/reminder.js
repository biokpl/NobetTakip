// Nöbet hatırlatması: nöbet tarihlerini gizli bir ntfy kanalı üzerinden Pi'ye iletir.
// Pi önceki gün 18:30'da bildirim yollar, nöbet günü gelince (hafta içi 17:00, hafta sonu 08:30) siler.
import { store } from './store.js';

const NTFY = 'https://ntfy.sh/';
const META = 'nobetTakip.sync';
const RESEND_MS = 6 * 3600e3; // ntfy mesajları 12 saat saklar; arada bir tazele

let timer = null;

function readMeta() {
  try { return JSON.parse(localStorage.getItem(META) || '{}'); } catch { return {}; }
}
function writeMeta(m) {
  try { localStorage.setItem(META, JSON.stringify(m)); } catch { /* depolama kapalı */ }
}

function isoDaysAgo(n) {
  const t = new Date(); t.setDate(t.getDate() - n);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

export function reminderConfigured() {
  return !!store.get().settings.syncTopic;
}

export function payloadOf(st) {
  const s = st.settings;
  const cut = isoDaysAgo(2);
  return {
    v: 1,
    enabled: s.remindEnabled !== false,
    items: s.remindItems || 'Şarj aleti',
    remind: '18:30',
    start: s.startTime || '08:30',
    shifts: st.shifts.map((x) => x.date).filter((d) => d >= cut).sort(),
  };
}

export async function syncNow(force = false) {
  const st = store.get();
  const topic = st.settings.syncTopic;
  if (!topic) return { ok: false, reason: 'kurulum' };
  const p = payloadOf(st);
  const sig = JSON.stringify(p);
  const meta = readMeta();
  if (!force && meta.sig === sig && Date.now() - (meta.at || 0) < RESEND_MS) return { ok: true, cached: true };
  try {
    const r = await fetch(NTFY, { method: 'POST', body: JSON.stringify({ topic, message: JSON.stringify({ ...p, ts: Date.now() }) }) });
    if (!r.ok) throw new Error(String(r.status));
    writeMeta({ sig, at: Date.now() });
    return { ok: true };
  } catch {
    writeMeta({ ...meta, pending: true });
    return { ok: false, reason: 'ag' };
  }
}

export function scheduleSync() {
  clearTimeout(timer);
  timer = setTimeout(() => syncNow(false), 1500);
}

export function lastSyncAt() {
  return readMeta().at || 0;
}

export async function sendTest() {
  const s = store.get().settings;
  if (!s.notifyTopic) return false;
  try {
    const r = await fetch(NTFY, {
      method: 'POST',
      body: JSON.stringify({ topic: s.notifyTopic, title: 'Nöbet Takip', message: 'Deneme: nöbet hatırlatmaları bu kanaldan gelecek.', tags: ['white_check_mark'] }),
    });
    return r.ok;
  } catch { return false; }
}

// Kurulum bağlantısı: .../#kurulum=<eşitleme kanalı>~<bildirim kanalı>
export function applySetupFromHash() {
  const m = location.hash.match(/^#kurulum=([\w-]+)~([\w-]+)$/);
  if (!m) return false;
  store.setSetting('syncTopic', m[1]);
  store.setSetting('notifyTopic', m[2]);
  history.replaceState(null, '', location.pathname + '#ayarlar');
  return true;
}
