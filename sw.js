// Çevrimdışı ve anında açılış: dosyalar telefondaki önbellekten gelir.
// Yeni sürüm yayınlanınca (CACHE adı değişir) arka planda indirilir, sayfa bir kez yenilenir.
const CACHE = 'nobet-v12';
const ASSETS = [
  './', './index.html', './manifest.json', './css/app.css', './vendor/echarts.min.js',
  './js/app.js', './js/store.js', './js/holidays.js', './js/analysis.js', './js/ui.js', './js/charts.js', './js/reminder.js',
  './js/views/panel.js', './js/views/calendar.js', './js/views/analysis.js', './js/views/settings.js',
  './fonts/manrope-latin.woff2', './fonts/manrope-latin-ext.woff2',
  './icons/app-icon-192.png', './icons/app-icon-512.png', './icons/app-icon-maskable-512.png', './icons/badge-96.png',
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

// Pi'den gelen bildirim: hatırlatmayı göster ya da zamanı gelince sil
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'Nöbet Takip', body: e.data ? e.data.text() : '' }; }
  e.waitUntil((async () => {
    if (d.type === 'clear') {
      const list = await self.registration.getNotifications({ tag: d.tag });
      list.forEach((n) => n.close());
      return;
    }
    await self.registration.showNotification(d.title || 'Nöbet Takip', {
      body: d.body || '',
      tag: d.tag || 'nobet',
      icon: './icons/app-icon-192.png',
      badge: './icons/badge-96.png',
      data: { url: d.url || './' },
      renotify: true,
    });
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (all.length) return all[0].focus();
    return self.clients.openWindow(e.notification.data?.url || './');
  })());
});
