// ═══════════════════════════════════════
//  test-fiches-froides-sim.js — Lot 1 : fiches magasin à froid
//  Exécution : node test-fiches-froides-sim.js
// ═══════════════════════════════════════
'use strict';
global.window = global;
let ok = 0, ko = 0;
const t = async (nom, fn) => { try { await fn(); ok++; console.log('  ✅', nom); } catch (e) { ko++; console.log('  ❌', nom, '→', e.message); } };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m || ''} attendu ${JSON.stringify(b)}, reçu ${JSON.stringify(a)}`); };

// ── helpers de l'app (copie fidèle de utils.js) ──
global.normaliserNom = (str = '') => (str || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim().replace(/\s+/g, ' ');
let _n = 0; global.genId = (p = 'ID') => `${p}_${++_n}`;
global.dateISOLocale = () => '2026-10-01';

// ── SheetsAPI en mémoire ──
let fiches = [], visitesMaj = [];
global.SheetsAPI = {
  lire: async () => JSON.parse(JSON.stringify(fiches)),
  ecrire: async (_f, _o, row) => { fiches.push({ ...row }); return { ok: true }; },
  mettreAJour: async (_f, onglet, id, champs) => {
    if (onglet === '🗺️_VISITES') { visitesMaj.push({ id, champs }); return { ok: true }; }
    const f = fiches.find(x => x.ID_Fiche === id); if (!f) throw new Error('fiche introuvable ' + id);
    Object.assign(f, champs); return { ok: true };
  },
};
const setSession = (pin, nom, voitTout = false) => { global.Session = { pin, nom, voitTout: () => voitTout }; };
const reset = () => { fiches = []; visitesMaj = []; };

require('./js/fiches-froides.js');
const FF = window.FichesFroides;

(async () => {
  console.log('\nFichesFroides');
  setSession(1001, 'Johanne');

  await t('trouver : accents/casse ignorés, ville facultative', async () => {
    const liste = [{ ID_Fiche: 'A', Nom_Magasin: 'Micro Plus Informatique', Ville: 'Chalon-sur-Saône' }];
    eq(FF.trouver(liste, 'MICRO PLUS  INFORMATIQUE', '').length, 1);
    eq(FF.trouver(liste, 'micro plus informatique', 'chalon-sur-saone').length, 1);
    eq(FF.trouver(liste, 'micro plus informatique', 'Lyon').length, 0, 'ville différente');
    eq(FF.trouver(liste, '', '').length, 0, 'nom vide');
  });

  await t('assurerPourVisite : crée une fiche A_QUALIFIER pour un nouveau magasin', async () => {
    reset();
    const r = await FF.assurerPourVisite({ nom: 'Boutique Zen', ville: 'Dijon', dateVisite: '2026-10-02' });
    eq(r.creee, true); eq(fiches.length, 1);
    eq(fiches[0].Statut, 'A_QUALIFIER'); eq(fiches[0].PIN_CDS, 1001); eq(fiches[0].Nom_Norm, 'BOUTIQUE ZEN');
    eq(fiches[0].Doublon_A_Revoir, false);
  });

  await t('assurerPourVisite : réutilise la fiche du même CDS (pas de doublon)', async () => {
    reset();
    await FF.assurerPourVisite({ nom: 'Boutique Zen', ville: 'Dijon' });
    const r = await FF.assurerPourVisite({ nom: 'BOUTIQUE ZEN', ville: 'dijon' });
    eq(r.creee, false); eq(fiches.length, 1);
  });

  await t('assurerPourVisite : homonyme d\'un autre CDS → fiche propre + doublon signalé', async () => {
    reset();
    setSession(1002, 'Lyes'); await FF.assurerPourVisite({ nom: 'Boutique Zen', ville: 'Dijon' });
    setSession(1001, 'Johanne');
    const r = await FF.assurerPourVisite({ nom: 'Boutique Zen', ville: 'Dijon' });
    eq(r.creee, true); eq(r.autreCDS, true); eq(fiches.length, 2); eq(fiches[1].Doublon_A_Revoir, true);
  });

  await t('assurerPourVisite : un manager réutilise la fiche existante', async () => {
    reset();
    setSession(1002, 'Lyes'); await FF.assurerPourVisite({ nom: 'Boutique Zen', ville: 'Dijon' });
    setSession(5000, 'Alexandra', true);
    const r = await FF.assurerPourVisite({ nom: 'Boutique Zen', ville: 'Dijon' });
    eq(r.creee, false); eq(fiches.length, 1);
    setSession(1001, 'Johanne');
  });

  await t('visibles : un CDS ne voit que ses fiches, un manager tout', async () => {
    const l = [{ PIN_CDS: 1001 }, { PIN_CDS: 1002 }];
    eq(FF.visibles(l).length, 1);
    setSession(5000, 'A', true); eq(FF.visibles(l).length, 2); setSession(1001, 'Johanne');
  });

  await t('apresPlanification : A_REVOIR + relance, complète sans écraser', async () => {
    reset();
    await FF.assurerPourVisite({ nom: 'Boutique Zen', ville: 'Dijon', tel: '0102030405' });
    await FF.apresPlanification({ nom: 'Boutique Zen', ville: 'Dijon', tel: '9999', email: 'a@b.fr', dateRelance: '2026-10-09', prochaineAction: 'Présenter Empower' });
    eq(fiches[0].Statut, 'A_REVOIR'); eq(fiches[0].Date_Relance, '2026-10-09');
    eq(fiches[0].Tel, '0102030405', 'tel existant conservé'); eq(fiches[0].Email, 'a@b.fr', 'email vide complété');
  });

  await t('apresPlanification : ne touche pas une fiche déjà convertie', async () => {
    reset();
    const r = await FF.assurerPourVisite({ nom: 'Boutique Zen', ville: 'Dijon' });
    await FF.marquerConverti(r.idFiche, { idCompte: 'CPT_1' });
    await FF.apresPlanification({ nom: 'Boutique Zen', ville: 'Dijon', dateRelance: '2026-10-09' });
    eq(fiches[0].Statut, 'CONVERTI_COMPTE'); eq(fiches[0].ID_Compte_Lie, 'CPT_1');
  });

  await t('apresVisite : compteur, résultat, relance → A_REVOIR', async () => {
    reset();
    const r = await FF.assurerPourVisite({ nom: 'Boutique Zen', ville: 'Dijon' });
    await FF.apresVisite({ ID_Visite: 'V1', Date: '2026-10-03', Nom_Compte: 'Boutique Zen', Resultat_Visite: 'Intéressé',
      Prochaine_Action_Texte: 'Rappeler', Prochaine_Action_Date: '2026-10-10', Interlocuteur_Nom: 'M. Durand' }, r.idFiche);
    const f = fiches[0];
    eq(f.Nb_Visites, 1); eq(f.Statut, 'A_REVOIR'); eq(f.Date_Relance, '2026-10-10');
    eq(f.Resultat_Derniere, 'Intéressé'); eq(f.Contact_Nom, 'M. Durand'); eq(f.Date_Derniere_Visite, '2026-10-03');
    eq(visitesMaj.length, 0, 'visite déjà liée, pas de re-liaison');
  });

  await t('apresVisite : sans relance → A_QUALIFIER ; sans fiche → création + liaison visite', async () => {
    reset();
    const id = await FF.apresVisite({ ID_Visite: 'V9', Date: '2026-10-03', Nom_Compte: 'Nouveau Magasin', Ville: 'Beaune', Resultat_Visite: 'Froid' }, '');
    eq(fiches.length, 1); eq(fiches[0].Statut, 'A_QUALIFIER'); eq(fiches[0].Nb_Visites, 1);
    eq(visitesMaj.length, 1); eq(visitesMaj[0].champs.ID_Fiche_Froide, id);
  });

  await t('apresVisite : une fiche convertie garde son statut', async () => {
    reset();
    const r = await FF.assurerPourVisite({ nom: 'Boutique Zen' });
    await FF.marquerConverti(r.idFiche, { idLead: 'PROS_1' });
    await FF.apresVisite({ ID_Visite: 'V2', Date: '2026-10-04', Nom_Compte: 'Boutique Zen', Prochaine_Action_Date: '2026-10-20' }, r.idFiche);
    eq(fiches[0].Statut, 'CONVERTI_PROSPECT'); eq(fiches[0].ID_Lead_Lie, 'PROS_1'); eq(fiches[0].Nb_Visites, 1);
  });

  await t('prefill : une fiche préremplit la nouvelle visite (pas de ressaisie)', async () => {
    const p = FF.prefill({ ID_Fiche: 'F1', Nom_Magasin: 'Boutique Zen', Ville: 'Dijon', Tel: '01', Resultat_Derniere: 'Intéressé', Prochaine_Action: 'Démo' });
    eq(p.horsBase, true); eq(p.idFicheFroide, 'F1'); eq(p.nomLibre, 'Boutique Zen'); eq(p.villeLibre, 'Dijon');
    eq(p.commentairePrep, 'Dernier résultat : Intéressé — Démo');
  });

  await t('revisitables : exclut les converties, tri alphabétique', async () => {
    const l = [{ PIN_CDS: 1001, Nom_Magasin: 'Zèbre', Statut: 'A_REVOIR' }, { PIN_CDS: 1001, Nom_Magasin: 'Alpha', Statut: 'HISTORIQUE' }, { PIN_CDS: 1001, Nom_Magasin: 'Beta', Statut: 'CONVERTI_COMPTE' }];
    eq(FF.revisitables(l).map(x => x.Nom_Magasin), ['Alpha', 'Zèbre']);
  });

  await t('esc : échappe le HTML des noms de magasin', async () => {
    eq(FF.esc('<img src=x onerror="a">&\''), '&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;');
  });

  await t('migrerLocalStorage : noms locaux → fiches, sans doublon, une seule fois', async () => {
    reset();
    const store = { esi_prospects_froid: JSON.stringify(['Magasin A', 'MAGASIN B']) };
    global.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
    await FF.assurerPourVisite({ nom: 'magasin b', ville: 'Dijon' });   // déjà en base
    eq(await FF.migrerLocalStorage(), 1); eq(fiches.length, 2);
    eq(await FF.migrerLocalStorage(), 0, 'déjà migré'); eq(fiches.length, 2);
  });

  console.log(`\n${ko ? '🔴' : '🟢'} ${ok} ✅ passés | ${ko} ❌ échoués\n`);
  process.exit(ko ? 1 : 0);
})();
