// Osareh's service worker: the site opens without a connection, and books saved for offline read and play from here.
// Three caches: the app itself (replaced on every release), what the reader has looked at lately (pages, covers),
// and the books the reader chose to keep (never evicted by us; removed only from the book page).
const VERSION='inkling-v1';
const SHELL='inkling-shell-'+VERSION,RECENT='inkling-recent',SAVED='inkling-saved';
// Public reads only. Accounts, editing and everything an owner sees stay network-only.
const PUBLIC=/^\/api\/(library(\/(?!mine$)[^/]+(\/(related|reception|narration\/[a-z]{2,3}))?)?|home|config)$/;
const MEDIA=/^\/api\/library\/[^/]+\/(cover|art|figure\/[^/]+|share\.jpg)$|^\/(art|fonts)\//;
const AUDIO=/^\/api\/library\/[^/]+\/audio\/[a-z]{2,3}\/[^/]+$/;

self.addEventListener('install',e=>{
 // the page and the scripts and styles it names, so the next visit opens even without a connection
 e.waitUntil(caches.open(SHELL).then(async c=>{
  const r=await shellIndex();if(!r)return;
  const html=await r.clone().text();await c.put('/',r);
  const assets=[...new Set([...html.matchAll(/(?:src|href)="(\/(?:assets\/[^"]+|favicon\.svg|manifest\.webmanifest))"/g)].map(m=>m[1]))];
  await c.addAll(assets);
 }).catch(()=>{}).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
 e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('inkling-shell-')&&k!==SHELL).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});

// The index uses relative asset paths ("./assets/…"); made absolute it also works as the page for /b/<slug> addresses.
async function shellIndex(){
 const r=await fetch('/',{cache:'no-cache'});if(!r.ok)return null;
 const html=(await r.text()).replace(/(src|href)="\.\//g,'$1="/');
 return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8'}});
}

self.addEventListener('fetch',e=>{
 const req=e.request;if(req.method!=='GET')return;
 const url=new URL(req.url);if(url.origin!==location.origin)return;
 const path=url.pathname;
 if(req.mode==='navigate'){e.respondWith(page(req));return;}
 if(AUDIO.test(path)){e.respondWith(audio(req));return;}
 if(path.startsWith('/assets/')){e.respondWith(cacheFirst(req,SHELL));return;}
 if(MEDIA.test(path)){e.respondWith(staleWhileRevalidate(req));return;}
 if(PUBLIC.test(path)){e.respondWith(networkFirst(req));return;}
});

async function anyCache(req){return(await caches.match(req,{ignoreVary:true}))||null;}
async function page(req){
 try{
  const r=await fetch(req);
  if(r.ok&&new URL(req.url).pathname==='/'){const c=await caches.open(SHELL);shellIndex().then(x=>x&&c.put('/',x)).catch(()=>{});}
  return r;
 }catch{
  return(await caches.match(req,{ignoreSearch:true}))||(await caches.match('/'))||new Response('<!doctype html><meta charset="utf-8"><title>Offline</title><p style="font:18px system-ui;padding:40px">You are offline. Open Osareh once with a connection to read it offline.</p>',{status:503,headers:{'Content-Type':'text/html; charset=utf-8'}});
 }
}
async function cacheFirst(req,name){
 const hit=await caches.match(req);if(hit)return hit;
 const r=await fetch(req);if(r.ok){const c=await caches.open(name);c.put(req,r.clone());}return r;
}
async function staleWhileRevalidate(req){
 const hit=await anyCache(req);
 const fresh=fetch(req).then(async r=>{if(r.ok){const c=await caches.open(RECENT);await c.put(req,r.clone());await refreshSaved(req,r.clone());}return r;}).catch(()=>null);
 if(hit){fresh.catch(()=>{});return hit;}
 return(await fresh)||new Response('',{status:504});
}
async function networkFirst(req){
 try{
  const r=await fetch(req);
  if(r.ok){const c=await caches.open(RECENT);await c.put(req,r.clone());await refreshSaved(req,r.clone());}
  return r;
 }catch{
  return(await anyCache(req))||new Response(JSON.stringify({detail:'You are offline, and this page was not saved on this device.'}),{status:503,headers:{'Content-Type':'application/json'}});
 }
}
// A saved book stays current: whenever the network answers for something saved, the saved copy is replaced.
async function refreshSaved(req,r){const c=await caches.open(SAVED);if(await c.match(req))await c.put(req,r);}

// Audio: saved tracks play from the device, with byte ranges so the player can seek; everything else streams as usual.
async function audio(req){
 const hit=await caches.match(req,{cacheName:SAVED,ignoreSearch:false})||await caches.match(req,{cacheName:SAVED,ignoreSearch:true});
 if(!hit)return fetch(req);
 const range=req.headers.get('range');
 if(!range)return hit;
 const blob=await hit.blob(),size=blob.size;
 const m=/bytes=(\d*)-(\d*)/.exec(range);
 let start=m&&m[1]?+m[1]:0,end=m&&m[2]?+m[2]:size-1;
 if(m&&!m[1]&&m[2]){start=Math.max(0,size-+m[2]);end=size-1;}
 if(start>=size)return new Response('',{status:416,headers:{'Content-Range':'bytes */'+size}});
 end=Math.min(end,size-1);
 return new Response(blob.slice(start,end+1),{status:206,headers:{'Content-Type':hit.headers.get('Content-Type')||'audio/mpeg','Content-Length':String(end-start+1),'Content-Range':`bytes ${start}-${end}/${size}`,'Accept-Ranges':'bytes'}});
}
