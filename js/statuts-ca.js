// ═══════════════════════════════════════
//  statuts-ca.js : statuts commerciaux « intelligents », calculés à l'affichage
//  À partir du CA Sell-In par trimestre (FY25, FY26 par trimestre, FY27 par trimestre), de la dernière commande
//  (trimestre et semaine) et du CA Empower. Licences de 12 mois : un compte qui a commandé au trimestre N de FY26
//  doit renouveler au trimestre N de FY27.
//  Statut principal = le premier critère rempli, dans l'ordre de la liste STATUTS. Les signaux (renouvellement,
//  Empower) s'y ajoutent. Seuils ajustables ci-dessous, sans migration.
// ═══════════════════════════════════════
window.StatutsCA = (function () {
  const SEUILS = {
    baissePct: 0.7,          // En baisse : CA du dernier trimestre clos inférieur à 70 % du précédent...
    baisseMini: 100,         // ...si le précédent faisait au moins 100 €
    semaineSurveillance: 8,  // Actif à surveiller : dernière commande en semaine 8 du trimestre, ou avant
    convertirEmpowerMini: 200, // À convertir Empower : au moins 200 € de CA FY27 chez les grossistes
  };

  // Ordre = priorité d'action du commercial (1 = le plus urgent)
  const STATUTS = {
    A_RELANCER:        { rang: 1, libelle: 'À relancer',        coul: 'danger',  action: 'Appeler : a arrêté de commander ce trimestre.' },
    EN_BAISSE:         { rang: 2, libelle: 'En baisse',         coul: 'warning', action: 'Faire un point commande : forte baisse par rapport au trimestre précédent.' },
    A_REACTIVER:       { rang: 3, libelle: 'À réactiver',       coul: 'warning', action: 'Réactiver : du CA l\'an dernier, aucune commande cette année.' },
    ACTIF_SURVEILLER:  { rang: 4, libelle: 'À surveiller',      coul: 'info',    action: 'Commande ancienne dans le trimestre : relancer avant qu\'il ne décroche.' },
    A_ACTIVER:         { rang: 5, libelle: 'À activer',         coul: 'info',    action: 'Jamais commandé : première commande à obtenir.' },
    ACTIF:             { rang: 6, libelle: 'Actif',             coul: 'success', action: 'Entretenir la relation.' },
    DORMANT:           { rang: 7, libelle: 'Dormant',           coul: 'muted',   action: 'Pas de CA depuis FY25 : priorité basse.' },
  };

  const num = v => { const n = typeof window.parseCA === 'function' ? window.parseCA(v) : Number(v); return Number.isFinite(n) ? n : 0; };
  const tot = (c, p) => num(c['_CA_TOTAL_' + p] ?? c['CA_' + p]);
  const emp = (c, p) => num(c['CA_EMP_' + p]);
  const eur = n => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
  const Q27 = ['Q1FY27', 'Q2FY27', 'Q3FY27', 'Q4FY27'];
  const Q26 = ['Q1FY26', 'Q2FY26', 'Q3FY26', 'Q4FY26'];

  // Dernier trimestre clos = le plus récent trimestre FY27 avec du CA dans l'ensemble des comptes.
  function contexte(comptes) {
    let dernier = 0;
    Q27.forEach((p, i) => { if ((comptes || []).some(c => tot(c, p) > 0)) dernier = i + 1; });
    if (!dernier) dernier = 1;
    const res = { dernier, courant: Math.min(dernier + 1, 4), codeDernier: Q27[dernier - 1], codeCourant: 'Q' + Math.min(dernier + 1, 4) };
    if ((comptes || []).length > 50) ctxGlobal = res;       // contexte de tout le portefeuille, réutilisé par la fiche compte
    return res;
  }

  // Contexte du portefeuille entier. La fiche compte d'un seul compte ne peut pas le déduire : on le charge une fois.
  let ctxGlobal = null, chargement = null;
  function contexteGlobal(apres) {
    if (ctxGlobal) return ctxGlobal;
    if (!chargement && window.SheetsAPI) {
      chargement = SheetsAPI.lire('EMPOWER_MDB', 'COMPTES').then(l => { contexte(l); if (typeof apres === 'function') apres(); }).catch(() => {});
    }
    return null;
  }

  function libelleDerniereCommande(c, ctx) {
    const q = /^(Q[1-4])FY(\d{2})$/.exec(c.SellIn_Dernier_Quarter || '');
    const s = Number(c.SellIn_Derniere_Semaine);
    if (q && s) return `${q[1]} FY${q[2]} · S${s}`;
    for (let i = 3; i >= 0; i--) if (tot(c, Q27[i]) > 0) return `${Q27[i].replace('FY', ' FY')}`;
    for (let i = 3; i >= 0; i--) if (tot(c, Q26[i]) > 0) return `${Q26[i].replace('FY', ' FY')}`;
    if (tot(c, 'FY25') > 0) return 'FY25';
    return null;
  }

  // Résultat : { code, libelle, coul, rang, action, signaux: [{code, libelle, coul}], derniere, resume }
  function calculer(c, ctx) {
    ctx = ctx || contexte([c]);
    const i = ctx.dernier - 1;
    const cur = tot(c, Q27[i]);
    const prev = i > 0 ? tot(c, Q27[i - 1]) : tot(c, 'Q4FY26');
    const f27 = Q27.reduce((s, p) => s + tot(c, p), 0);
    const f26 = tot(c, 'FY26'), f25 = tot(c, 'FY25');
    const derniereSemaine = c.SellIn_Dernier_Quarter === Q27[i] ? Number(c.SellIn_Derniere_Semaine) : NaN;

    let code;
    if (f25 + f26 + f27 <= 0) code = 'A_ACTIVER';
    else if (cur > 0 && prev >= SEUILS.baisseMini && cur < prev * SEUILS.baissePct) code = 'EN_BAISSE';
    else if (cur > 0 && derniereSemaine && derniereSemaine <= SEUILS.semaineSurveillance) code = 'ACTIF_SURVEILLER';
    else if (cur > 0) code = 'ACTIF';
    else if (f27 > 0) code = 'A_RELANCER';
    else if (f26 > 0) code = 'A_REACTIVER';
    else code = 'DORMANT';

    const signaux = [];
    // Renouvellement : licences de 12 mois -> même trimestre, un an plus tard
    const m = ctx.courant - 1;               // trimestre à venir (index 0-3)
    if (ctx.courant > ctx.dernier || ctx.dernier === 4) {
      const lastYear = tot(c, Q26[m]);
      if (lastYear > 0 && tot(c, Q27[m]) <= 0)
        signaux.push({ code: 'RENOUVELLEMENT', libelle: `Renouvellement ${ctx.codeCourant}`, coul: 'info', detail: `Commandé ${eur(lastYear)} au ${ctx.codeCourant} FY26` });
    }
    const estEmp = typeof window.estEmpower === 'function' ? window.estEmpower(c) : false;
    const empFy27 = Q27.reduce((s, p) => s + emp(c, p), 0);
    if (!estEmp && f27 >= SEUILS.convertirEmpowerMini && empFy27 <= 0)
      signaux.push({ code: 'CONVERTIR_EMPOWER', libelle: 'À convertir Empower', coul: 'info', detail: `${eur(f27)} FY27 chez les grossistes` });
    else if (estEmp && empFy27 <= 0)
      signaux.push({ code: 'ACTIVER_EMPOWER', libelle: 'À activer Empower', coul: 'info', detail: 'Compte Empower sans commande Empower' });
    else if (empFy27 > 0)
      signaux.push({ code: 'EMPOWER_ACTIF', libelle: 'Empower actif', coul: 'success', detail: `${eur(empFy27)} via Empower en FY27` });

    const st = STATUTS[code];
    const derniere = libelleDerniereCommande(c, ctx);
    const resume = prev > 0 || cur > 0 ? `${ctx.codeDernier.slice(0, 2)} ${eur(cur)} (précédent ${eur(prev)})` : '';
    return { code, libelle: st.libelle, coul: st.coul, rang: st.rang, action: st.action, signaux, derniere, resume };
  }

  const COULEURS = { danger: '#b3261e', warning: '#b45309', info: '#2563eb', success: '#1e7a46', muted: '#6b7280' };
  function pastille(r, avecDerniere = true) {
    if (!r) return '';
    const sig = r.signaux.filter(s => s.code !== 'EMPOWER_ACTIF').map(s => `<span class="pastille-statut pastille-${s.coul}" title="${s.detail || ''}">${s.libelle}</span>`).join('');
    return `<span class="statuts-ca"><span class="pastille-statut pastille-${r.coul}" title="${r.action}">${r.libelle}</span>${sig}` +
           `${avecDerniere && r.derniere ? `<span class="derniere-cmde" title="Dernière commande">${r.derniere}</span>` : ''}</span>`;
  }

  return { SEUILS, STATUTS, contexte, contexteGlobal, calculer, pastille, libelleDerniereCommande, COULEURS };
})();
