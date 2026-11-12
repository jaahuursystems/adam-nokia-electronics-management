const V='ane-shell-v7-production';
const FILES=['./','index.html','manifest.webmanifest','css/app.css','js/config.js','js/core.js','js/docs.js','js/pages1.js','js/pages2.js','js/pages3.js','assets/logo/AdamNokia_Primary_FullColor.svg','assets/logo/AdamNokia_Secondary_Horizontal_FullColor.svg','assets/icons/favicon.svg','assets/icons/AdamNokia_icon_192x192.png','assets/icons/AdamNokia_icon_512x512.png','assets/icons/apple-touch-icon.png','assets/fonts/Poppins-Regular.ttf','assets/fonts/Poppins-Medium.ttf','assets/fonts/Poppins-Bold.ttf'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V&&x.startsWith('ane-shell-')).map(x=>caches.delete(x)))).then(()=>self.clients.claim()));});
/* App code (html/js/css/config) is fetched from the network first so a new release is used immediately; the cache is only the offline fallback.
   Fonts, logos and icons never change, so they come from the cache first. */
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return; const u=new URL(e.request.url); if(u.origin!==self.location.origin)return;
  const stat=/\/assets\//.test(u.pathname);
  if(stat){e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(r=>r||fetch(e.request).then(x=>{if(x.ok)caches.open(V).then(c=>c.put(e.request,x.clone()));return x;})));return;}
  e.respondWith(new Promise(res=>{
    let done=false; const fallback=()=>caches.match(e.request,{ignoreSearch:true}).then(r=>r||caches.match('index.html'));
    const t=setTimeout(()=>{if(!done)fallback().then(r=>{if(r&&!done){done=true;res(r);}});},3500);
    fetch(e.request,{cache:'no-cache'}).then(x=>{if(done)return;done=true;clearTimeout(t);if(x.ok)caches.open(V).then(c=>c.put(e.request,x.clone()));res(x);}).catch(()=>{if(done)return;clearTimeout(t);fallback().then(r=>{done=true;res(r||new Response('Offline',{status:503}));});});
  }));
});
