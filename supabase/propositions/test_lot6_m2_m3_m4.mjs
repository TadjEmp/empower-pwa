import fs from 'fs';
const src = fs.readFileSync('js/api.js','utf8');
const U = src.match(/SUPABASE_URL\s*=\s*'([^']+)'/)[1], ANON = src.match(/SUPABASE_ANON\s*=\s*'([^']+)'/)[1];
const roles = JSON.parse(fs.readFileSync('test_roles.json','utf8')), ext = JSON.parse(fs.readFileSync('test_externe.json','utf8'));
const fn = async (name, body) => { const t=Date.now(); const r = await fetch(`${U}/functions/v1/${name}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${ANON}`},body:JSON.stringify(body)}); let j; try{j=await r.json()}catch{j=null}; return {s:r.status,j,ms:Date.now()-t}; };
const login = async (e,p) => (await fn('auth-login',{email:e,motdepasse:p}));
const out = {};
// M3
const a = await login('test-admin@esi-test.invalid', roles.admin); out['M3 login valide'] = a.s; const tAdmin = a.j.token;
const tExt = (await login('test-externe@esi-test.invalid', ext.pw)).j.token, tCds = (await login('test-cds@esi-test.invalid', roles.cds)).j.token;
const bad = await login('test-admin@esi-test.invalid','mauvais-mdp-xxxxxxx'); out['M3 mauvais mdp'] = [bad.s, bad.j.erreur, bad.ms+'ms'];
const inc = await login('inconnu-zz@esi-test.invalid','mauvais-mdp-xxxxxxx'); out['M3 email inconnu (même réponse/durée)'] = [inc.s, inc.j.erreur, inc.ms+'ms'];
const a2 = await login('test-admin@esi-test.invalid', roles.admin); out['M3 admin se connecte encore après un échec'] = a2.s;
// M2
out['M2 externe → gemini (403)'] = (await fn('ai-proxy',{action:'gemini',prompt:'x',token:tExt})).s;
out['M2 externe → groqLLM (403)'] = (await fn('ai-proxy',{action:'groqLLM',messages:[],token:tExt})).s;
out['M2 cds prompt énorme (413)'] = (await fn('ai-proxy',{action:'gemini',prompt:'x'.repeat(13000),token:tCds})).s;
out['M2 sans session (401)'] = (await fn('ai-proxy',{action:'gemini',prompt:'x'})).s;
// M4
const rows = [['QUARTER','RESELLER','CHANNEL','CA_EUR'],['Q1FY27','ZZ TEST REVENDEUR','REVENDEUR','10']];
const dry = await fn('sync-sellin',{rows,dry_run:true,token:tAdmin}); out['M4 plan dry_run'] = [dry.s, dry.j.purge && {sellin:dry.j.purge.sellin, agregats:dry.j.purge.agregats}];
if (dry.j.purge && (dry.j.purge.agregats>5 || dry.j.purge.sellin>25)) { const r = await fn('sync-sellin',{rows,token:tAdmin}); out['M4 import sans confirmation (409, rien écrit)'] = [r.s, r.j.purge_a_confirmer]; } else out['M4'] = 'purge non importante, test réel sauté';
console.log(JSON.stringify(out,null,1));
