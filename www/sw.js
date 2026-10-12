/* Service worker: o app abre offline depois da primeira visita. */
const CACHE = 'cesta-certa-v15';
const SHELL = ['./', './index.html', './style.css', './version.js', './std.js', './flyer.js', './core.js', './db.js', './parser.js', './imgproc.js', './native.js', './qr.js', './importers.js', './app.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  const cdn = /(fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|tessdata)/.test(url.host + url.pathname);
  if (!sameOrigin && !cdn) return;
  // arquivos do app: rede primeiro (pega atualização), cache se estiver offline. CDN: cache primeiro.
  if (sameOrigin) {
    e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return r; }).catch(() => caches.match(req).then((m) => m || caches.match('./index.html'))));
  } else {
    e.respondWith(caches.match(req).then((m) => m || fetch(req).then((r) => { if (r.ok || r.type === 'opaque') { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return r; })));
  }
});
