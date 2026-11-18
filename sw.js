// Service worker: permite instalar Jarvis como app y abrirlo aunque la conexión sea mala.
// Cambiá VERSION cada vez que subas cambios para que los dispositivos se actualicen.
const VERSION = 'jarvis-v1';
const ARCHIVOS = [
  './', 'index.html', 'css/estilo.css', 'manifest.webmanifest',
  'js/app.js', 'js/datos.js', 'js/herramientas.js', 'js/cerebro.js', 'js/voz.js', 'js/google.js',
  'iconos/icono-192.png', 'iconos/icono-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Archivos propios: primero la red (para tener siempre lo último), si no hay red, la copia guardada.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => { const copia = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copia)); return r; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))),
  );
});

// Tocar una notificación abre (o enfoca) Jarvis.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((cs) => cs[0] ? cs[0].focus() : self.clients.openWindow('./')));
});
