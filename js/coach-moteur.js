// ═══════════════════════════════════════
//  coach-moteur.js — Moteur de l'Assistant commercial (Coach et Cockpit)
//  Fonctions pures, sans DOM : trajectoire du trimestre, ciblage des comptes, alertes, plan de la semaine.
//  Règle : tous les chiffres viennent des données de l'app et du catalogue ; aucun n'est produit par un modèle.
//  Chaque cible porte ses raisons et un niveau de confiance (comptes non localisés = confiance faible).
//  Axes du séminaire Impact (29/10/2026) : premier contact sous 48 h, paliers Dormant/Éveil/Actif/Ambassadeur,
//  activation Empower, complétude des fiches (carte et maillage régional).
// ═══════════════════════════════════════
(function (root) {
  const JOUR = 86400000;
  const SEMAINES = 13;
  const DEPART = { Q1: '2026-04-10', Q2: '2026-07-10', Q3: '2026-10-09', Q4: '2027-01-08' }; // = FiscalWeeks.QUARTER_START
  const num = v => { const n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(/\s/g, '').replace(',', '.').replace(/[^\d.\-]/g, '')); return Number.isFinite(n) ? n : 0; };
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const jourUTC = s => { const t = String(s || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(t) ? Date.parse(t + 'T00:00:00Z') : NaN; };
  const aujUTC = now => Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

  // ── Rythme du trimestre fiscal (même référentiel que FiscalWeeks) ──
  function trimestre(now, quarterForce) {
    const n = now || new Date(), t = aujUTC(n);
    let q = quarterForce || null;
    if (!q) for (const k of Object.keys(DEPART)) { const d = jourUTC(DEPART[k]); if (t >= d && t < d + SEMAINES * 7 * JOUR) q = k; }
    if (!q) return null;
    const d0 = jourUTC(DEPART[q]), total = SEMAINES * 7;
    const ecoule = Math.min(total, Math.max(0, Math.floor((t - d0) / JOUR) + 1));
    return { quarter: q, ecoule, total, pct: Math.round(ecoule / total * 100), semaine: Math.min(SEMAINES, Math.ceil(ecoule / 7)),
             semainesRestantes: Math.max(0.5, (total - ecoule) / 7), finISO: new Date(d0 + (total - 1) * JOUR).toISOString().slice(0, 10) };
  }

  // ── Trajectoire par commercial : réalisé / objectif du trimestre contre le rythme attendu ──
  // statut : 'rythme' (au rythme), 'surveiller' (jusqu'à 15 points de retard), 'decrochage' (au-delà), 'sans_objectif'.
  function trajectoire(objectifs, tri) {
    const q = tri.quarter;
    return (objectifs || []).map(o => {
      const obj = num(o[`${q}_Obj_Revise`]) || num(o[`${q}_Obj_Initial`]), ca = num(o[`${q}_CA_Realise`]);
      const pct = obj > 0 ? Math.round(ca / obj * 100) : null;
      let statut = 'sans_objectif';
      if (obj > 0) statut = pct >= tri.pct ? 'rythme' : pct >= tri.pct - 15 ? 'surveiller' : 'decrochage';
      const reste = Math.max(0, obj - ca);
      return { pin: Number(o.PIN_CDS), nom: o.Nom_CDS || ('PIN ' + o.PIN_CDS), ca, obj, pct, statut, reste,
               parSemaine: obj > 0 ? Math.ceil(reste / tri.semainesRestantes) : 0, retard: pct == null ? 0 : tri.pct - pct };
    });
  }
  function agreger(lignes, tri) {
    const obj = lignes.reduce((t, l) => t + l.obj, 0), ca = lignes.reduce((t, l) => t + l.ca, 0), reste = Math.max(0, obj - ca);
    const pct = obj > 0 ? Math.round(ca / obj * 100) : null;
    return { ca, obj, pct, reste, parSemaine: obj > 0 ? Math.ceil(reste / tri.semainesRestantes) : 0,
             statut: obj <= 0 ? 'sans_objectif' : pct >= tri.pct ? 'rythme' : pct >= tri.pct - 15 ? 'surveiller' : 'decrochage' };
  }

  // ── Ciblage : comptes Empower sans première commande ──
  // ctx : { now, estEmpower(c), active(c), dernierContact(c) → 'YYYY-MM-DD'|null, localise(c) → bool, pin }
  // Score = potentiel x 0,40 + momentum x 0,35 + facilité x 0,25. Les trois composantes restent visibles.
  function cibles(comptes, ctx, n) {
    const auj = aujUTC(ctx.now || new Date());
    return (comptes || []).filter(c => String(c.deleted || '').toUpperCase() !== 'TRUE')
      .filter(c => ctx.pin == null || Number(c.PIN_CDS_Assigne) === Number(ctx.pin))
      .filter(c => ctx.estEmpower(c) && !ctx.active(c)).map(c => {
        const hist = num(c.CA_FY26) + num(c.CA_FY25);
        const dc = ctx.dernierContact ? ctx.dernierContact(c) : null, t = jourUTC(dc);
        const age = Number.isFinite(t) ? Math.max(0, Math.round((auj - t) / JOUR)) : null;
        const loc = !!ctx.localise(c);
        const pot = Math.round(Math.min(95, 45 + hist / 80)), mom = age == null ? 20 : Math.max(15, 95 - age * 2), fac = loc ? 85 : 35;
        const raisons = ['Compte Empower sans première commande'];
        if (hist > 0) raisons.push('CA historique ' + Math.round(hist).toLocaleString('fr-FR') + ' €');
        raisons.push(age == null ? 'jamais contacté' : age === 0 ? 'contacté aujourd’hui' : 'dernier contact il y a ' + age + ' j');
        raisons.push(loc ? 'fiche localisée' : 'fiche à localiser');
        return { compte: c, id: c.ID_Compte || c._uuid, nom: c.Nom_Compte, ville: c.Ville, pin: Number(c.PIN_CDS_Assigne), pot, mom, fac,
                 score: Math.round(pot * 0.4 + mom * 0.35 + fac * 0.25), age, loc, confiance: loc ? 'haute' : 'faible', raisons };
      }).sort((a, b) => b.score - a.score || String(a.nom).localeCompare(String(b.nom))).slice(0, n || 5);
  }

  // ── Alertes (règles lisibles, séminaire) ──
  // ctx.leads : leads ouverts du périmètre ; ctx.palier(c) → {cle} ; ctx.caEmpower(c) ; ctx.contactOk(c) ; ctx.adresseOk(c)
  function alertes(d, ctx) {
    const auj = aujUTC(ctx.now || new Date()), A = [];
    const hors48 = (d.leads || []).filter(l => { const t = jourUTC(l.Date_prochaine_action); return Number.isFinite(t) && (auj - t) > 2 * JOUR; });
    if (hors48.length) A.push({ id: 'hors48', niveau: 'haute', n: hors48.length, titre: hors48.length + ' rappel' + (hors48.length > 1 ? 's' : '') + ' échu' + (hors48.length > 1 ? 's' : '') + ' depuis plus de 48 h', action: 'Relancer', to: '#/empower-tracker' });
    const sansCmd = (d.comptes || []).filter(c => ctx.estEmpower(c) && !ctx.active(c) && ctx.depuisOnboarding && ctx.depuisOnboarding(c) != null && ctx.depuisOnboarding(c) >= 14);
    if (sansCmd.length) A.push({ id: 'sans_cmd', niveau: 'moyenne', n: sansCmd.length, titre: sansCmd.length + ' compte' + (sansCmd.length > 1 ? 's' : '') + ' Empower sans première commande après 14 jours', action: 'Voir', to: '#/comptes' });
    // Démarrage : compte Empower non activé, onboardé depuis 2 à 13 jours (avant l'alerte des 14 jours) → remettre le starter pack du Kit.
    const demar = (d.comptes || []).filter(c => { if (!ctx.estEmpower(c) || ctx.active(c) || !ctx.depuisOnboarding) return false; const j = ctx.depuisOnboarding(c); return j != null && j >= 2 && j < 14; });
    if (demar.length) A.push({ id: 'demarrage', niveau: 'info', n: demar.length, titre: demar.length + ' compte' + (demar.length > 1 ? 's' : '') + ' en démarrage : starter pack à remettre', action: 'Kit', to: '#/kit' });
    const proches = (d.comptes || []).filter(c => ctx.estEmpower(c) && ctx.palier(c).cle === 'EVEIL' && (1000 - ctx.caEmpower(c)) <= 150);
    if (proches.length) A.push({ id: 'proches', niveau: 'info', n: proches.length, titre: proches.length + ' compte' + (proches.length > 1 ? 's' : '') + ' Éveil à moins de 150 € du palier Actif', action: 'Voir', to: '#/comptes' });
    // Devis émis depuis le Coach (journal, Type_Action 'Devis') restés sans suite après 7 jours : compte pas encore actif et aucune action plus récente.
    const devis = (d.devis || []).filter(x => { const t = jourUTC(x.date); if (!Number.isFinite(t) || (auj - t) < 7 * JOUR || (auj - t) > 60 * JOUR) return false;
      const c = (d.comptes || []).find(k => String(k.ID_Compte) === String(x.compte_id) || (x.nom && k.Nom_Compte === x.nom)); if (!c || ctx.active(c)) return false;
      const la = jourUTC(c.Date_Derniere_Action); return !(Number.isFinite(la) && la > t); });
    if (devis.length) A.push({ id: 'devis', niveau: 'moyenne', n: devis.length, titre: devis.length + ' devis sans suite depuis plus de 7 jours', action: 'Relancer', to: '#/comptes', noms: devis.map(x => x.nom).filter(Boolean).slice(0, 5) });
    // Business review trimestrielle : règle du séminaire pour le palier Ambassadeur (CA Empower ≥ 3 000 €).
    const amb = (d.comptes || []).filter(c => ctx.estEmpower(c) && ctx.palier(c).cle === 'AMBASSADEUR');
    if (amb.length) A.push({ id: 'ambassadeurs', niveau: 'info', n: amb.length, titre: amb.length + ' compte' + (amb.length > 1 ? 's' : '') + ' Ambassadeur : business review trimestrielle à planifier', action: 'Voir', to: '#/comptes' });
    const sansAdr = (d.comptes || []).filter(c => !ctx.adresseOk(c));
    if (sansAdr.length) A.push({ id: 'sans_adresse', niveau: 'info', n: sansAdr.length, titre: sansAdr.length + ' fiche' + (sansAdr.length > 1 ? 's' : '') + ' sans adresse : le ciblage et la carte restent aveugles', action: 'Compléter', to: '#/comptes' });
    return A;
  }

  // ── Diagnostic de coaching par commercial (une phrase, règle lisible) ──
  function diagnostic(t, c) {
    if (t.statut === 'sans_objectif') return 'Objectif du trimestre non renseigné : le renseigner pour activer le suivi.';
    if (c.ouverts > 0 && c.activite7 >= 5 && c.integres === 0) return 'Beaucoup d’activité, peu de commandes : travailler le closing, viser un engagement daté à chaque contact.';
    if (c.sansAdresse >= 8) return 'Secteur peu localisé : consacrer une demi-journée à compléter les adresses avant les tournées.';
    if (c.echus > 0) return c.echus + ' rappel' + (c.echus > 1 ? 's' : '') + ' échu' + (c.echus > 1 ? 's' : '') + ' : traiter avant d’ouvrir de nouveaux comptes.';
    return 'Concentrer la semaine sur 3 comptes Empower proches de leur première commande.';
  }

  // ── Plan de la semaine : 5 actions maximum, cochées automatiquement quand la donnée le prouve ──
  // ctx.faitCompte(c) → true si le compte a été contacté cette semaine ; ctx.adressesCompletees → nombre fiches complétées cette semaine.
  function planSemaine(cs, al, ctx) {
    const P = [];
    cs.slice(0, 2).forEach((x, i) => P.push({ id: 'cible-' + x.id, texte: (i === 0 ? 'Appeler ' : 'Visiter ') + x.nom, detail: x.ville || '', cible: x.id, fait: !!(ctx.faitCompte && ctx.faitCompte(x.compte)) }));
    const a48 = al.find(a => a.id === 'hors48'); if (a48) P.push({ id: 'relance48', texte: 'Traiter ' + a48.n + ' rappel' + (a48.n > 1 ? 's' : '') + ' échu' + (a48.n > 1 ? 's' : '') + ' depuis plus de 48 h', detail: 'Séminaire : un lead se rappelle sous 48 h', to: '#/empower-tracker', fait: false });
    const st = al.find(a => a.id === 'demarrage'); if (st) P.push({ id: 'starter', texte: 'Remettre le starter pack à ' + st.n + ' compte' + (st.n > 1 ? 's' : '') + ' en démarrage', detail: 'Documents du Kit conseillés pour le démarrage', to: '#/kit', fait: false });
    const pr = al.find(a => a.id === 'proches'); if (pr) P.push({ id: 'paliers', texte: 'Pousser ' + pr.n + ' compte' + (pr.n > 1 ? 's' : '') + ' Éveil vers le palier Actif', detail: 'Moins de 150 € du seuil de 1 000 €', to: '#/comptes', fait: false });
    const dv = al.find(a => a.id === 'devis'); if (dv) P.push({ id: 'devis', texte: 'Relancer ' + dv.n + ' devis sans suite', detail: (dv.noms || []).join(', ') || 'Devis émis il y a plus de 7 jours', to: '#/comptes', fait: false });
    const am = al.find(a => a.id === 'ambassadeurs'); if (am) P.push({ id: 'review', texte: 'Planifier la business review de ' + am.n + ' compte' + (am.n > 1 ? 's' : '') + ' Ambassadeur', detail: 'Rythme trimestriel (séminaire)', to: '#/comptes', fait: false });
    const ad = al.find(a => a.id === 'sans_adresse'); if (ad) { const obj = Math.min(3, ad.n); P.push({ id: 'adresses', texte: 'Compléter ' + obj + ' adresse' + (obj > 1 ? 's' : ''), detail: 'Chaque adresse place le compte sur la carte et fiabilise le ciblage', to: '#/comptes', fait: (ctx.adressesCompletees || 0) >= obj }); }
    return P.slice(0, 5);
  }

  const API = { trimestre, trajectoire, agreger, cibles, alertes, diagnostic, planSemaine, num, iso };
  root.CoachMoteur = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
