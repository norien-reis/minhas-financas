/* Service worker: guarda os arquivos da ferramenta para abrir offline.
   Não guarda nem envia dados financeiros (eles ficam no localStorage/IndexedDB). */
const CACHE = 'financas-v1';
const FILES = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/calc.js', './js/util.js', './js/store.js', './js/ocr.js', './js/demo.js', './js/forms.js', './js/app.js',
  './js/views-home.js', './js/views-entries.js', './js/views-cards.js', './js/views-debts.js', './js/views-more.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'
];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Rede primeiro (pega atualizações), cache como reserva offline. Só arquivos deste site.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
  );
});
