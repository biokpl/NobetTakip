// Çevrimdışı ve anında açılış: dosyalar telefondaki önbellekten gelir.
// Yeni sürüm yayınlanınca (CACHE adı değişir) arka planda indirilir, sayfa bir kez yenilenir.
const CACHE = 'nobet-v10';
const ASSETS = [
  './', './index.html', './manifest.json', './css/app.css', './vendor/echarts.min.js',
  './js/app.js', './js/store.js', './js/holidays.js', './js/analysis.js', './js/ui.js', './js/charts.js',
  './js/views/panel.js', './js/views/calendar.js', './js/views/analysis.js', './js/views/settings.js',
  './fonts/manrope-latin.woff2', './fonts/manrope-latin-ext.woff2',
  './icons/app-icon-192.png', './icons/app-icon-512.png', './icons/app-icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  // HTTP önbelleğini atlayarak taze kopyaları indir
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Önce önbellek: ağ beklenmez. Önbellekte yoksa ağdan alınıp kaydedilir.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('./index.html').then((r) => r || fetch(req)));
    return;
  }
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }))
  );
});
