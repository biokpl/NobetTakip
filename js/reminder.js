// Nöbet hatırlatması: nöbet tarihleri ve bildirim aboneliği gizli bir kanal üzerinden Pi'ye iletilir.
// Pi önceki gün 18:30'da uygulamanın kendi bildirimini (web push) yollar,
// nöbet günü gelince (hafta içi 17:00, hafta sonu 08:30) aynı bildirimi telefondan siler.
import { store } from './store.js';

const NTFY = 'https://ntfy.sh/'; // yalnızca Pi'ye veri taşımak için; telefonda ntfy uygulaması gerekmez
const META = 'nobetTakip.sync';
const RESEND_MS = 6 * 3600e3; // taşıyıcı kanal mesajları 12 saat saklar; arada bir tazele
export const VAPID_PUBLIC = 'BMhHgoJXoOON-OCtU8yddX3dvny9Ui_WtiAeZujAUzy3SjWYHaYAP_85yrCVBbtcqC625jMHqxT_9xqdu2TEqxE';

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

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function pushReady() {
  return pushSupported() && Notification.permission === 'granted' && !!store.get().settings.pushSub;
}

export function payloadOf(st) {
  const s = st.settings;
  const cut = isoDaysAgo(2);
  return {
    v: 2,
    enabled: s.remindEnabled !== false,
    items: s.remindItems || 'Şarj aleti',
    remind: '18:30',
    start: s.startTime || '08:30',
    push: s.pushSub || null,
    test: s.pushTestAt || 0,
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

function b64ToBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

// Bildirim izni iste ve bu telefonu abone yap
export async function enablePush() {
  if (!pushSupported()) return { ok: false, reason: 'desteklenmiyor' };
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, reason: perm };
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID_PUBLIC) });
  store.setSetting('pushSub', sub.toJSON());
  return { ok: true };
}

// Açılışta abonelik değiştiyse (tarayıcı yenilemiş olabilir) güncelle
export async function refreshPush() {
  if (!pushSupported() || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    const cur = store.get().settings.pushSub;
    if (sub && (!cur || cur.endpoint !== sub.endpoint)) store.setSetting('pushSub', sub.toJSON());
  } catch { /* sessiz geç */ }
}

// Pi bir sonraki kontrolünde (en geç 2 dakika) deneme bildirimi yollar
export function requestTest() {
  store.setSetting('pushTestAt', Date.now());
}

// Kurulum bağlantısı: .../#kurulum=<eşitleme kanalı>  (eski biçim kanal~kanal da kabul)
export function applySetupFromHash() {
  const m = location.hash.match(/^#kurulum=([\w-]+)(?:~[\w-]+)?$/);
  if (!m) return false;
  store.setSetting('syncTopic', m[1]);
  history.replaceState(null, '', location.pathname + '#ayarlar');
  return true;
}
