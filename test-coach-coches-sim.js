// Tests simulés : persistance serveur des coches du plan (vues_filtres, module coach-plan).
global.window = global; global.document = { getElementById: () => null };
let ok = 0, ko = 0; const t = (n, c) => { if (c) ok++; else { ko++; console.log('KO', n); } };
const mem = {}; global.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = v; } };
global.Session = { pin: 4001, voitTout: () => false, nom: 'Lyes Daoud' };
const ops = []; let lignes = [], echec = false;
const q = (op, tbl) => { const o = { op, tbl, f: {} }; const ch = { eq: (c, v) => { o.f[c] = v; return ch; }, limit: () => ch, select: () => ch, single: async () => { ops.push(o); return { data: { id: 'row-1' }, error: null }; },
  then: (res, rej) => { ops.push(o); if (echec) return Promise.reject(new Error('réseau')).then(res, rej); return Promise.resolve(op === 'select' ? { data: lignes, error: null } : { error: null }).then(res, rej); } }; return ch; };
global.SheetsAPI = { _sb: { from: tbl => ({ select: () => q('select', tbl), insert: row => { const c = q('insert', tbl); c.row = row; ops.push({ op: 'insert-row', tbl, row }); return c; }, update: row => { ops.push({ op: 'update-row', tbl, row }); return q('update', tbl); } }) } };
try { require('./js/vue-coach.js'); } catch (e) { console.log('chargement vue-coach impossible :', e.message); process.exit(2); }
const V = global.VueCoach || window.VueCoach; if (!V) { console.log('VueCoach introuvable'); process.exit(2); }
V._calculer = () => {}; V.render = () => {};
(async () => {
  lignes = [{ id: 'r9', nom: 'Q3-5', filtres_json: { 'cible-a': 1 } }, { id: 'r8', nom: 'Q3-4', filtres_json: [] }];
  mem['esi.coach.plan.4001.Q3-5'] = JSON.stringify({ vieux: 1 });
  await V._cochesCharger();
  t('le serveur fait foi', JSON.stringify(JSON.parse(mem['esi.coach.plan.4001.Q3-5'])) === '{"cible-a":1}');
  t('format inattendu = vide', mem['esi.coach.plan.4001.Q3-4'] === '{}');
  V.state.d = { tri: { quarter: 'Q3', semaine: 5 } }; ops.length = 0;
  V.basculer('relance48'); await new Promise(r => setTimeout(r, 5));
  t('cocher met à jour la ligne existante', ops.some(o => o.op === 'update-row' && o.row.filtres_json['relance48'] === 1 && o.row.filtres_json['cible-a'] === 1));
  V.basculer('relance48'); await new Promise(r => setTimeout(r, 5));
  t('décocher retire la clé côté serveur', ops.filter(o => o.op === 'update-row').pop().row.filtres_json['relance48'] === undefined);
  V.state.d = { tri: { quarter: 'Q3', semaine: 6 } }; ops.length = 0;
  V.basculer('paliers'); await new Promise(r => setTimeout(r, 5));
  const ins = ops.find(o => o.op === 'insert-row');
  t('nouvelle semaine = insertion module coach-plan, pin du commercial', ins && ins.row.module === 'coach-plan' && ins.row.nom === 'Q3-6' && ins.row.pin_cds === 4001 && ins.row.filtres_json.paliers === 1);
  t('id mémorisé ensuite', V._cocheIds['Q3-6'] === 'row-1');
  echec = true; mem['esi.coach.plan.4001.Q3-5'] = '{"garde":1}';
  await V._cochesCharger(); t('serveur injoignable : local intact', mem['esi.coach.plan.4001.Q3-5'] === '{"garde":1}');
  V.state.d = { tri: { quarter: 'Q3', semaine: 5 } }; V.basculer('x'); await new Promise(r => setTimeout(r, 5));
  t('sauvegarde en échec : coche locale conservée', JSON.parse(mem['esi.coach.plan.4001.Q3-5']).x === 1);
  global.SheetsAPI = {}; await V._cochesCharger(); await V._cochesSauver('Q3-5', {}); t('sans client Supabase : aucun plantage', true);
  console.log(ok + ' OK, ' + ko + ' KO'); process.exit(ko ? 1 : 0);
})();
