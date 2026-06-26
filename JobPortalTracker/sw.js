/* ApplyFlow service worker — offline app shell (network-first, cache fallback) */
const CACHE = 'applyflow-v1';
const ASSETS = [
  './', './index.html', './styles.css', './app.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-180.png'
];

self.addEventListener('install', e=>{
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).catch(()=>{}));
});

self.addEventListener('activate', e=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch', e=>{
  const req = e.request;
  if(req.method!=='GET') return;
  // network-first so updates always show online; cache is the offline fallback
  e.respondWith(
    fetch(req).then(res=>{
      const copy = res.clone();
      caches.open(CACHE).then(c=>c.put(req, copy)).catch(()=>{});
      return res;
    }).catch(()=> caches.match(req).then(r=> r || caches.match('./index.html')))
  );
});
