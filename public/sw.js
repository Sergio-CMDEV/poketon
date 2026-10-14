// Service worker: hace que Poketon se pueda instalar (en el móvil y como app de Android) y que abra sin conexión.
// La web se pide siempre primero a la red (así se ve la última versión en cuanto se publica) y se guarda una copia
// por si no hay conexión. Solo se guardan los archivos de la web y los datos públicos (catálogo y fichas);
// nada de la cuenta (equipos, amigos, mensajes) ni las fotos de perfil.
const CACHE = 'poketon-v1';
const BASICOS = ['./', 'index.html', 'css/styles.css', 'js/app.js', 'js/tema.js', 'icono.svg', 'manifest.webmanifest'];
const API_PUBLICA = /\/api\/(catalogo|pokemon|objeto|movimiento)\.php/;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASICOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(claves => Promise.all(claves.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const peticion = e.request;
  if (peticion.method !== 'GET') return;
  const url = new URL(peticion.url);
  if (url.origin !== location.origin) return;                                   // sprites de otras webs: como siempre
  if (url.pathname.includes('/api/') && !API_PUBLICA.test(url.pathname)) return; // cuenta, amigos, chat: nunca en caché
  if (url.pathname.startsWith('/fotos/')) return;
  e.respondWith(
    fetch(peticion)
      .then(res => {
        if (res.ok) { const copia = res.clone(); caches.open(CACHE).then(c => c.put(peticion, copia)); }
        return res;
      })
      .catch(() => caches.match(peticion).then(guardada => guardada
        || (peticion.mode === 'navigate' ? caches.match('index.html') : Response.error()))),
  );
});
