const CACHE = 'site-capture-v218';
const SHELL = [
  './',
  './index.html',
  './logo.png',
  './manifest.json',
  './privacy-policy.html',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

/* Web version only - the installed app unregisters this worker and serves its own files.

   Install: fetch the shell straight from the server (cache:'reload'). The host lets browsers
   keep a copy for 10 minutes, and a new version must never save the OLD page under its name -
   that is what kept an iPad on the previous version after an update. */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Opening the app (a navigation): the network first, so a connected device always gets the
   newest page, and the saved copy when there is no signal - or when the signal is so weak the
   page has not arrived in 4 seconds, so a basement never means a blank screen. */
function openPage(req) {
  // the freshest saved page is always ./index.html (every online open refreshes it)
  const saved = () => isApp
    ? caches.match('./index.html').then(hit => hit || caches.match(req))
    : caches.match(req).then(hit => hit || caches.match('./index.html'));
  // only the app itself is saved as the offline page - never the privacy policy or any other page
  const isApp = /\/(index\.html)?$/.test(new URL(req.url).pathname);
  const net = fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then(resp => {
    if (resp && resp.ok && isApp) {
      const copy = resp.clone();
      caches.open(CACHE).then(c => c.put('./index.html', copy));
    }
    return resp;
  });
  const slow = new Promise(r => setTimeout(r, 4000)).then(saved).then(hit => hit || net);
  return Promise.race([net.catch(saved), slow]);
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  if (e.request.mode === 'navigate') { e.respondWith(openPage(e.request)); return; }
  // everything else (icons, logo, manifest): saved copy first, network to fill gaps
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(resp => {
      const copy = resp.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return resp;
    }).catch(() => caches.match('./index.html')))
  );
});
