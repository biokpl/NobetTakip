import { store } from './store.js';
import { analyze } from './analysis.js';
import { hydrateIcons, icon, closeSheet } from './ui.js';
import { disposeAll } from './charts.js';
import { renderPanel } from './views/panel.js';
import { renderCalendar } from './views/calendar.js';
import { renderAnalysis } from './views/analysis.js';
import { renderSettings } from './views/settings.js';

const VIEWS = {
  panel: { title: 'Panel', render: renderPanel },
  takvim: { title: 'Takvim', render: renderCalendar },
  analiz: { title: 'Analiz', render: renderAnalysis },
  ayarlar: { title: 'Ayarlar', render: renderSettings },
};

const viewEl = document.getElementById('view');
let current = (location.hash.slice(1) in VIEWS) ? location.hash.slice(1) : 'panel';
let analysis = null;

hydrateIcons(document.getElementById('nav'));

export const app = {
  get analysis() { return analysis; },
  go(tab) { location.hash = tab; },
  refresh,
};

function applyTheme() {
  const t = store.get().settings.theme || 'dark';
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]').content = t === 'light' ? '#eef1f8' : '#070b16';
  document.getElementById('themeBtn').innerHTML = icon(t === 'light' ? 'moon' : 'sun');
}

function subtitle(a) {
  if (!a.n) return 'Nöbet Takip';
  return `${a.n} nöbet · ${a.shifts[0].slice(0, 4)}–${a.shifts[a.n - 1].slice(0, 4)}`;
}

function refresh({ keepScroll = true } = {}) {
  const y = window.scrollY;
  analysis = analyze(store.get());
  disposeAll();
  const v = VIEWS[current];
  document.getElementById('title').textContent = v.title;
  document.getElementById('subtitle').textContent = subtitle(analysis);
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === current));
  viewEl.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'view';
  viewEl.append(wrap);
  v.render(wrap, analysis, app);
  if (keepScroll) window.scrollTo(0, y);
}

document.getElementById('nav').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (b) { location.hash = b.dataset.tab; }
});
window.addEventListener('hashchange', () => {
  closeSheet();
  const t = location.hash.slice(1);
  if (t in VIEWS && t !== current) { current = t; refresh({ keepScroll: false }); window.scrollTo(0, 0); }
});
document.getElementById('themeBtn').addEventListener('click', () => {
  store.setSetting('theme', store.get().settings.theme === 'light' ? 'dark' : 'light');
});

let pending = false;
store.subscribe(() => {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => { pending = false; applyTheme(); refresh(); });
});

applyTheme();
refresh({ keepScroll: false });

// Gece yarısı / saat ilerledikçe geri sayımı tazele
setInterval(() => { if (current === 'panel') refresh(); }, 5 * 60 * 1000);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
