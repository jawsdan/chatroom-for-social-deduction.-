// Lets the site be installed as an app. Always tries the network first so updates show up
// right away; the saved copy is only used if the connection drops while loading the page.
const CACHE = 'village-chat-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/socket.io')) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && !url.pathname.startsWith('/video/')) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
