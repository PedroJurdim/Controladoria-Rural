// Service worker: deixa o painel instalável e abrir sem internet (com os últimos dados baixados).
const CACHE = 'painel-v3';
const BASE = ['./', 'index.html', 'bi.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png',
  'img/logo-principal.svg', 'img/logo-secundaria.svg', 'img/grafismo.svg'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
const FONTES = ['fonts.googleapis.com', 'fonts.gstatic.com'];
self.addEventListener('fetch', (e) => {
  const req = e.request; const url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (FONTES.includes(url.hostname)) {   // fontes: usa o que já está guardado e atualiza em segundo plano
    e.respondWith(caches.open(CACHE).then((c) => c.match(req).then((hit) => {
      const rede = fetch(req).then((res) => { c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || rede;
    })));
    return;
  }
  if (url.origin !== location.origin) return;
  // rede primeiro (sempre a versão mais nova); sem rede, usa o que está guardado
  e.respondWith(fetch(req).then((res) => {
    if (res && res.ok) { const copia = res.clone(); caches.open(CACHE).then((c) => c.put(req, copia)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))));
});
