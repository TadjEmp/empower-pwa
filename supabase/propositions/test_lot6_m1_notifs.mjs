import fs from 'fs';
const src = fs.readFileSync('js/api.js','utf8');
const U = src.match(/SUPABASE_URL\s*=\s*'([^']+)'/)[1], ANON = src.match(/SUPABASE_ANON\s*=\s*'([^']+)'/)[1];
const roles = JSON.parse(fs.readFileSync('test_roles.json','utf8')), ext = JSON.parse(fs.readFileSync('test_externe.json','utf8'));
async function login(email, pw){ const j = await (await fetch(`${U}/functions/v1/auth-login`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${ANON}`},body:JSON.stringify({email,motdepasse:pw})})).json(); return j.token; }
const T = { admin: await login('test-admin@esi-test.invalid', roles.admin), cds: await login('test-cds@esi-test.invalid', roles.cds), externe: await login('test-externe@esi-test.invalid', ext.pw) };
const ins = async (who, type, msg='ZZ test m1') => { const r = await fetch(`${U}/rest/v1/notifs`,{method:'POST',headers:{apikey:ANON,Authorization:`Bearer ${ANON}`,'x-esi-token':T[who],'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({pin_destinataire:9991,type_notif:type,message:msg,statut_lu:false,pin_expediteur:1})}); const j = await r.json().catch(()=>null); return r.status+(j&&j[0]?` x`:''); };
const out = {
 'cds NOUVEAU_LEAD (attendu 201)': await ins('cds','NOUVEAU_LEAD'),
 'externe NOUVEAU_LEAD (201)': await ins('externe','NOUVEAU_LEAD'),
 'externe STATUT_ARCHIVE (403)': await ins('externe','STATUT_ARCHIVE'),
 'externe type inventé (403)': await ins('externe','ALERTE_ADMIN_FAUSSE'),
 'cds SUGGESTION_REPONSE (403)': await ins('cds','SUGGESTION_REPONSE'),
 'admin SUGGESTION_REPONSE (201)': await ins('admin','SUGGESTION_REPONSE'),
 'cds message 501 car. (403)': await ins('cds','NOUVEAU_LEAD','x'.repeat(501)),
 'sans jeton (401/403)': await (async()=>{const r=await fetch(`${U}/rest/v1/notifs`,{method:'POST',headers:{apikey:ANON,Authorization:`Bearer ${ANON}`,'Content-Type':'application/json'},body:JSON.stringify({pin_destinataire:1000,type_notif:'NOUVEAU_LEAD',message:'x'})});return r.status})(),
};
console.log(out);
// nettoyage via admin
const d = await fetch(`${U}/rest/v1/notifs?message=eq.ZZ%20test%20m1`,{method:'DELETE',headers:{apikey:ANON,Authorization:`Bearer ${ANON}`,'x-esi-token':T.admin,Prefer:'count=exact'}}); console.log('nettoyage', d.status, d.headers.get('content-range'));
