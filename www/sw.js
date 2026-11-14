/* Pulse — service worker: o site abre sem internet depois da primeira visita.
   Arquivos do próprio site: rede primeiro (sempre a versão nova) e, sem internet, o que ficou no cache.
   Google (login, Drive) nunca passa pelo cache. Mude CACHE para limpar tudo. */
const CACHE = 'pulse-v3';
/* Tudo que o app precisa para abrir sem internet já na primeira visita (ao mudar a lista, suba o número do CACHE) */
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'css/sim.css',
  'js/app.js',
  'js/auth.js',
  'js/bank.js',
  'js/charts.js',
  'js/config.js',
  'js/db.js',
  'js/dedupe.js',
  'js/editor.js',
  'js/extras.js',
  'js/home.js',
  'js/lists.js',
  'js/marker.js',
  'js/notes.js',
  'js/perf.js',
  'js/seed.js',
  'js/settings.js',
  'js/shell.js',
  'js/sim.js',
  'js/solve.js',
  'js/util.js',
  'fonts/literata-italic.woff2',
  'fonts/literata.woff2',
  'fonts/manrope.woff2',
  'img/icon-192.png',
  'img/icon.png'
];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request;
  const u = new URL(r.url);
  // dados da conta nunca vão para o cache (são do servidor, sempre atuais e de uma pessoa só)
  if (r.method !== 'GET' || u.origin !== location.origin || /^\/(api|sanctum|login|logout)(\/|$)/.test(u.pathname)) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(r, { ignoreSearch: true });
    return fetch(r).then(res => { if (res.ok) c.put(r, res.clone()); return res; }).catch(() => hit || (r.mode === 'navigate' ? c.match('index.html') : Response.error()));
  }));
});
