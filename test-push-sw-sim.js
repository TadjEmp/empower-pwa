// Simule les handlers push / notificationclick de sw.js
const fs=require('fs');const src=fs.readFileSync('sw.js','utf8');
const L={};let shown=null,opened=null,focused=null,closed=false;
const self={addEventListener:(t,f)=>L[t]=f,registration:{scope:'https://x.test/app/',showNotification:(t,o)=>{shown={t,o};return Promise.resolve()}},skipWaiting(){},clients:{claim(){},matchAll:async()=>CL,openWindow:async u=>{opened=u}}};
let CL=[];
new Function('self','caches','fetch','clients','URL',src)(self,{},()=>{},self.clients,URL);
let ok=0,ko=0;const t=(n,c)=>{c?ok++:ko++;console.log((c?'✓ ':'✗ ')+n)};
const ev=d=>({data:{json:()=>d,text:()=>JSON.stringify(d)},waitUntil:p=>p});
L.push(ev({title:'Rappel',body:'3 comptes',url:'#/a-contacter',tag:'rec'}));
t('push affiche titre',shown&&shown.t==='Rappel');t('tag+url',shown.o.tag==='rec'&&shown.o.data.url==='#/a-contacter');
shown=null;L.push({data:null,waitUntil:p=>p});t('push sans data → notif par défaut',!!shown);
const n={close(){closed=true},data:{url:'#/a-contacter'}};
L.notificationclick({notification:n,waitUntil:p=>p});await_=0;
setTimeout(()=>{t('clic sans fenêtre → openWindow',/app\/#\/a-contacter/.test(opened||''));
CL=[{url:'https://x.test/app/',focus:async()=>{focused=1},navigate:async()=>{}}];opened=null;
L.notificationclick({notification:n,waitUntil:p=>p});
setTimeout(()=>{t('clic avec fenêtre → focus',focused===1&&!opened);console.log(ok+'/'+(ok+ko));process.exit(ko?1:0)},50)},50);
