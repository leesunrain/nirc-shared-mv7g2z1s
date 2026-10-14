// PWA app-shell updater; never deletes localStorage or IndexedDB.
const CACHE='want-marathon-shell-v1.4';
const SHELL=['/','/index.html','/app.js?v=1.3','/manifest.webmanifest','/icon.svg'];
self.addEventListener('install', event=>{
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)));
});
self.addEventListener('activate', event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k.startsWith('want-marathon-')&&k!==CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event=>{
  const req=event.request;
  if(req.method!=='GET'||new URL(req.url).origin!==self.location.origin)return;
  if(req.mode==='navigate'||req.destination==='script'||req.destination==='style'){
    event.respondWith(fetch(req,{cache:'no-store'}).catch(()=>caches.match(req).then(r=>r||caches.match('/index.html'))));
  }else{
    event.respondWith(fetch(req).catch(()=>caches.match(req)));
  }
});
