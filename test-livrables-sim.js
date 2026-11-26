// Tests du générateur de livrables PDF (sans DOM) : chiffres, offres, échappement, paysage.
global.window = global;
require('./js/catalogue.js'); require('./js/livrables-pdf.js');
let ok = 0, ko = 0; const t = (n, c) => { if (c) ok++; else { ko++; console.log('KO', n); } };
const lignes = [['n360-del5', 6], ['n360-std', 4], ['nsb-10', 3]];
const ids = Catalogue.listeProduits().map(p => p.id); t('ids', ids.length >= 10);
const L = window.LivrablesPDF;
const base = { type: 'proposition', lignes, client: { nom: '<b>X&Y</b>', contact: '"Z"' }, emetteur: { nom: 'Lyes Daoud', tel: '06 84 50 98 56', mail: 'a@b.fr' }, date: '2026-11-04', numero: 'PC-TEST' };
const r = L.calculer(base);
t('marge e', r.e.marge > 0 && r.e.licences === 13); t('gain', Math.abs(r.cmp.gain - (r.e.marge - r.g.marge)) < 0.011);
const h = L.html(base);
t('paysage', h.includes('@page{size:A4 landscape;margin:0}')); t('200mm', h.includes('width:297mm;height:210mm'));
t('échappé', h.includes('&lt;b&gt;X&amp;Y&lt;/b&gt;') && !h.includes('<b>X&Y</b>')); t('guillemets', h.includes('&quot;Z&quot;'));
t('logos', h.includes('norton-empower-reseller-dark.png') && h.includes('marvesting-group-cream.png'));
t('sans offre', !h.includes('class="ribbon"'));
t('visuel absent : pastille typographique, pas d\'image cassée', !h.includes('img/produits/n360-del5.png') && h.includes('class="pk no"'));
L.visuels.add('n360-del5');
t('visuel présent : image insérée', L.html(base).includes('img/produits/n360-del5.png'));
L.visuels.delete('n360-del5');
// offre xy : offertes revendables, coût sur achetées uniquement
const o = L.html({ ...base, type: 'bienvenue', offre: { type: 'xy', achetees: 10, offertes: 1 }, validite: '2026-12-15' });
t('ribbon xy', o.includes('10 licences achetées, 1 offerte') && o.includes('15 décembre 2026'));
const ro = L.calculer({ ...base, type: 'bienvenue', offre: { type: 'xy', achetees: 10, offertes: 1 } });
t('offre améliore la marge', ro.e.marge >= r.e.marge);
// proposition : l'offre est ignorée
t('proposition ignore offre', L.calculer({ ...base, offre: { type: 'xy', achetees: 1, offertes: 1 } }).e.marge === r.e.marge);
const rem = L.html({ ...base, type: 'exceptionnelle', offre: { type: 'remise', taux: 0.1 } });
t('remise libellé', rem.includes('10 % de remise sur votre prix d&#39;achat') || rem.includes("10 % de remise sur votre prix d'achat"));
t('libellé inconnu', L.offreLibelle({ type: 'zz' }) === '' && L.offreLibelle(null) === '');
// produit sans PA Empower : signalé, jamais inventé
const sans = Catalogue.listeProduits().find(p => p.pa_empower == null);
if (sans) { const hs = L.html({ ...base, lignes: [[sans.id, 2], ['n360-std', 1]] }); t('exclu signalé', hs.includes('Non chiffré')); }

// ── Offres supplémentaires, bundle, cotation (version C, personnalisables) ──
const S = L.calculerSupp({ type: 'supplementaire', params: { offertPvp: 34.99 }, date: '2026-11-05' });
t('A 55,6 % vs 33,3 %', S.A.av.pct === 55.6 && S.A.std.pct === 33.3);
t('B 43,8 % vs 27,4 % (Advanced 59,99)', S.B.av.pct === 43.8 && S.B.std.pct === 27.4);
const adv = S.C.find(r => r.p.id === 'n360-adv10'); t('volume Advanced 27,4 -> 42,0', adv.pct === 27.4 && adv.pctRem === 42 && adv.pvp === 59.99);
t('B sans PVP : non chiffré', !L.calculerSupp({ type: 'supplementaire' }).B.offertOk);
const hs = L.html({ type: 'supplementaire', params: { offertPvp: 34.99, seuil: 20, taux: 0.15 }, validite: '2026-12-31', client: { nom: 'Z' } });
t('supp personnalisée', hs.includes('-15 %') && hs.includes('minimum de 20 licences') && hs.includes('31 décembre 2026') && hs.includes('validation budget commercial'));
t('supp ne contient pas 104,99', !hs.includes('104,99'));
const bd = L.calculerBundle({ type: 'bundle', canal: 'pa_empower', operations: [{ achete: ['n360-del5', 1], offert: { id: 'util-wl10', nom: 'Utilities', pvp_ttc: 59.99, appareils: 10 } }] });
t('bundle marge = achat seul + offert', bd.ops[0].ok && bd.ops[0].av.marge > bd.ops[0].std.marge && bd.ops[0].av.cout === bd.ops[0].std.cout);
const bn = L.calculerBundle({ type: 'bundle', canal: 'pa_empower', operations: [{ achete: ['n360-del5', 1], offert: { id: 'vpn-plus5', nom: 'VPN' } }] });
t('bundle sans PVP : jamais inventé', !bn.ops[0].offertOk && bn.ops[0].av.marge === bn.ops[0].std.marge);
const hb = L.html({ type: 'bundle', canal: 'pa_empower', debut: '2026-09-01', validite: '2026-09-30', operations: [{ achete: ['nsb-10', 1], offert: { nom: '<i>VPN</i>', pvp_ttc: 69.99 } }] });
t('bundle échappé + dates', hb.includes('&lt;i&gt;VPN&lt;/i&gt;') && hb.includes('1er septembre 2026'));
const K = L.calculerCotation({ type: 'cotation', cotation: { libelle: 'B2S', canaux: ['td'], debut: '2026-08-17', fin: '2026-09-30', remise_pct: 50, prix: { 'n360-adv10': 21.76 } }, produits: ['n360-std', 'n360-adv10'] });
t('cotation remise et prix coté', K.grilles.length === 1 && K.grilles[0].lignes.find(l => l.p.id === 'n360-std').cote === 12.5 && K.grilles[0].lignes.find(l => l.p.id === 'n360-adv10').remise === 40 && K.remiseMax === 50);
t('cotation sans données : message', L.html({ type: 'cotation', date: '2020-01-01' }).includes('Aucune cotation renseignée'));
t('aucun tiret cadratin', !L.html({ type: 'cotation', cotation: { libelle: 'x', canaux: ['td'], remise_pct: 10 } }).includes('—'));
const ht = L.html({ type: 'cotation', titre: 'Rentrée <b>2026</b>', sousTitre: 'Pour <i>vous</i>', cotation: { libelle: 'x', canaux: ['td'], remise_pct: 10 } });
t('titre personnalisé échappé', ht.includes('<h1>Rentrée &lt;b&gt;2026&lt;/b&gt;</h1>') && ht.includes('Pour &lt;i&gt;vous&lt;/i&gt;'));
t('titre par défaut conservé', L.html({ type: 'bundle', operations: [] }).includes('<em>offert</em>'));
console.log(ok + ' OK, ' + ko + ' KO'); process.exit(ko ? 1 : 0);
