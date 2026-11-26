// Tests simulés : Kit commercial (visibilité, envoi tracé, téléversement) et archivage des mandats.
global.window = global; global.document = { getElementById: () => null, querySelector: () => null };
let ok = 0, ko = 0; const t = (n, c) => { if (c) ok++; else { ko++; console.log('KO', n); } };
global.genId = p => p + '-1'; global.dateISOLocale = () => '2026-11-04';
const toasts = []; global.Toast = { afficher: (m, ty) => toasts.push([m, ty]) };
const inserts = [], updates = [], actions = [], removed = [], uploads = [];
function sbMock(over) {
  return { from: tbl => ({
      insert: async row => { inserts.push([tbl, row]); return { error: over && over.insertError || null }; },
      update: row => ({ eq: async (c, v) => { updates.push([tbl, row, c, v]); return { error: null }; } }),
      select: () => ({ order: async () => ({ data: [], error: null }) }) }),
    storage: { from: () => ({ createSignedUrl: async (p, s) => ({ data: { signedUrl: 'https://x/sig/' + p + '?t=' + s }, error: null }),
      upload: async (p, f) => { uploads.push([p, f.name]); return { error: null }; }, remove: async l => { removed.push(...l); return {}; } }) } };
}
global.SheetsAPI = { _sb: sbMock(), ecrire: async (a, b, row) => { actions.push(row); }, mettreAJour: async () => {}, lire: async () => [] };
const sess = role => { global.Session = { role, pin: 4001, nom: 'Lyes Daoud', estConnecte: () => true, estManager: () => role === 'ADMIN', estChannel: () => role === 'CHANNEL_MANAGER', voitTout: () => role === 'ADMIN' || role === 'CHANNEL_MANAGER' }; };
global.localStorage = { _m: {}, setItem(k, v) { this._m[k] = v; }, getItem(k) { return this._m[k] || null; }, removeItem(k) { delete this._m[k]; } };
global.open = () => ({}); Object.defineProperty(global, 'navigator', { value: { clipboard: { writeText: async v => { global.__copie = v; } } }, configurable: true });
require('./js/mandats.js'); require('./js/vue-kit.js');
const K = VueKit, M = Mandats;
const docs = [
  { id: 'a', titre: 'Flyer <b>X</b>', groupe: 'G', categorie: 'flyer', format: 'A4', interne: false, paliers: ['EVEIL'], valide_au: null, fichier_path: 'a/1.pdf', fichier_nom: 'a.pdf', taille: 2048 },
  { id: 'b', titre: 'Fiche interne', groupe: 'G', categorie: 'interne', format: 'A4', interne: true, paliers: [], valide_au: null, fichier_path: 'b/1.pdf' },
  { id: 'c', titre: 'Cotation échue', groupe: 'G', categorie: 'cotation', format: 'A4', interne: false, paliers: [], valide_au: '2026-09-30', fichier_path: 'c/1.pdf' },
  { id: 'd', titre: 'Sans fichier', groupe: 'G', categorie: 'deck', interne: false, paliers: [], valide_au: null, fichier_path: null },
];
K.state.docs = docs; K.state.chargement = false;
// rôles
sess('CDS'); let h = K._listeHtml();
t('titre échappé', h.includes('Flyer &lt;b&gt;X&lt;/b&gt;') && !h.includes('<b>X</b>'));
t('envoyer diffusable', h.includes("VueKit.envoyer('a')"));
t('pas envoyer interne', !h.includes("VueKit.envoyer('b')"));
t('pas envoyer échu', !h.includes("VueKit.envoyer('c')") && h.includes('Échu le 30/09/2026'));
t('sans fichier', h.includes('Fichier bientôt disponible') && !h.includes("VueKit.ouvrir('d')"));
t('CDS sans admin', !h.includes('Ajouter le fichier') && !h.includes('Remplacer'));
sess('ADMIN'); h = K._listeHtml(); t('ADMIN ajoute', h.includes('Ajouter le fichier') && h.includes('Remplacer') && h.includes('Valide jusqu'));
sess('EXTERNE'); h = K._listeHtml(); t('EXTERNE consulte', h.includes("VueKit.ouvrir('a')") && !h.includes('VueKit.envoyer') && !h.includes('Remplacer'));
// filtres
K.state.cat = 'starter'; t('filtre starter = non internes DORMANT/EVEIL', K._filtre().length === 1 && K._filtre()[0].id === 'a'); K.state.cat = 'flyer'; t('filtre cat', K._filtre().length === 1); K.state.cat = 'tous'; K.state.q = 'cotation'; t('filtre q', K._filtre().length === 1); K.state.q = '';
// palier conseillé
sess('CDS'); K.state.comptes = [{ ID_Compte: 'C1', Nom_Compte: 'Dupont', Ville: 'Lyon' }]; K.state.compteCible = 'C1';
global.Paliers = { palier: () => ({ cle: 'EVEIL' }), PALIERS: { EVEIL: { lib: 'Éveil' } } };
t('conseillé', K._listeHtml().includes('Conseillé pour ce palier'));
// envoi tracé
(async () => {
  await K.envoyer('b'); t('envoi interne refusé', !K.state.envoi);
  await K.envoyer('c'); t('envoi échu refusé', !K.state.envoi);
  await K.envoyer('a'); t('modale', !!K.state.envoi && K._modaleEnvoi().includes('Flyer &lt;b&gt;X'));
  K.setEnvoiCompte('C1'); await K.confirmerEnvoi();
  t('lien copié 7 j', String(global.__copie).includes('?t=' + 7 * 86400));
  t('action journal', actions.length === 1 && actions[0].Type_Action === 'Mailing' && actions[0].Resum_IA.includes('Documentation commerciale') && actions[0].Nom_Compte === 'Dupont');
  // téléversement
  sess('CDS'); await K.televerser('a', { files: [{ name: 'x.pdf', size: 10 }], value: '' }); t('CDS ne téléverse pas', uploads.length === 0);
  sess('ADMIN');
  await K.televerser('a', { files: [{ name: 'virus.exe', size: 10 }], value: 'x' }); t('ext refusée', uploads.length === 0);
  await K.televerser('a', { files: [{ name: 'gros.pdf', size: 60e6 }], value: 'x' }); t('taille refusée', uploads.length === 0);
  await K.televerser('a', { files: [{ name: 'ok.pdf', size: 1000 }], value: 'x' });
  t('upload ok', uploads.length === 1 && /^a\/\d+\.pdf$/.test(uploads[0][0]) && docs[0].fichier_nom === 'ok.pdf' && removed.includes('a/1.pdf'));
  await K.majValidite('a', 'pas-une-date'); t('validité invalide → null', docs[0].valide_au === null);
  await K.majValidite('a', '2027-01-31'); t('validité ok', docs[0].valide_au === '2027-01-31');
  // import en lot
  uploads.length = 0; sess('CDS'); await K.importerLot({ files: [{ name: 'a.pdf', size: 5 }], value: 'x' }); t('lot refusé CDS', uploads.length === 0);
  sess('ADMIN'); toasts.length = 0;
  await K.importerLot({ files: [{ name: 'A.PDF', size: 5 }, { name: 'inconnu.pdf', size: 5 }, { name: 'c.exe', size: 5 }, { name: 'd.pdf', size: 5 }], value: 'x' });
  t('lot : 2 importés, 2 refusés', uploads.length === 2 && /2 fichiers importés, 2 refusés/.test(toasts[0][0]) && toasts[0][1] === 'warning');
  t('lot : identifiant affiché admin', K._listeHtml().includes('<code>a</code>'));
  // mandats
  sess('EXTERNE'); let r = await M.archiver({ societe: 'X' }); t('EXTERNE refusé', !r.ok);
  sess('CDS'); r = await M.archiver({ societe: '  ' }); t('société requise', !r.ok);
  inserts.length = 0;
  r = await M.archiver({ societe: 'Dupont SARL', canal: 'zzz', offre: '9+9', compensation: 'bitcoin', montant_ht: -5, debut: 'x', fin: '2027-01-03', payload: 'nope', compte_id: 'C1' });
  const row = inserts[0] && inserts[0][1];
  t('archivé', r.ok && inserts[0][0] === 'mandats');
  t('valeurs normalisées', row.canal === 'empower' && row.offre === '1+1' && row.compensation === 'virement' && row.montant_ht === 0 && row.debut === null && row.fin === '2027-01-03' && typeof row.payload === 'object' && row.pin_cds === 4001);
  t('trace MANDAT', actions.some(a => a.Type_Action === 'MANDAT'));
  global.SheetsAPI._sb = sbMock({ insertError: { message: 'RLS' } }); r = await M.archiver({ societe: 'Y' }); t('erreur base relayée', !r.ok && r.message === 'RLS');
  // préremplissage
  global.SheetsAPI._sb = sbMock(); M.ouvrir({ ID_Compte: 'C1', Nom_Compte: 'Dupont', Adresse: '1 rue A', Code_Postal: '69001', Ville: 'Lyon', Contact_Nom: 'Marc' });
  const p = JSON.parse(localStorage.getItem('esi_mandat_prefill')); t('prefill', p.soc === 'Dupont' && p.adr === '1 rue A, 69001 Lyon' && p.rep === 'Marc' && p.compte_id === 'C1');
  sess('EXTERNE'); t('bloc fiche masqué EXTERNE', M.blocFiche({ ID_Compte: 'C1' }) === '');
  sess('CDS'); t('bloc fiche CDS', M.blocFiche({ ID_Compte: 'C<1' }).includes('Générer un mandat') && !M.blocFiche({ ID_Compte: 'C<1' }).includes('C<1'));
  console.log(ok + ' OK, ' + ko + ' KO'); process.exit(ko ? 1 : 0);
})();
