// ═══════════════════════════════════════
//  plan-q3.js : plan d'action du trimestre suivant, par commercial
//  Construit à partir de ses comptes (CA Sell-In par trimestre et par canal) et de ses leads.
//  Chaque priorité dit quoi faire, pourquoi, et liste les comptes concernés, du plus important au moins important.
//  Les CA utilisés sont toujours les totaux d'origine (le filtre de CA par canal n'altère pas le plan).
// ═══════════════════════════════════════
window.PlanQ3 = (function () {
  const num = v => { const n = typeof window.parseCA === 'function' ? window.parseCA(v) : Number(v); return Number.isFinite(n) ? n : 0; };
  const tot = (c, p) => num(c['_CA_TOTAL_' + p] ?? c['CA_' + p]);
  const emp = (c, p) => num(c['CA_EMP_' + p]);
  const fy27 = c => ['Q1FY27', 'Q2FY27', 'Q3FY27', 'Q4FY27'].reduce((s, p) => s + tot(c, p), 0);
  const empFy27 = c => ['Q1FY27', 'Q2FY27', 'Q3FY27', 'Q4FY27'].reduce((s, p) => s + emp(c, p), 0);
  const eur = n => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
  const echap = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const idDe = c => c.ID_Compte || c._uuid || '';

  const MAX = 8;

  function construire({ comptes, prospects, objectif }) {
    const groupes = [];
    const ajoute = (niveau, titre, action, pourquoi, lignes) => {
      if (lignes.length) groupes.push({ niveau, titre, action, pourquoi, total: lignes.length, lignes: lignes.slice(0, MAX) });
    };
    const ligne = (c, detail) => ({ id: idDe(c), nom: c.Nom_Compte, detail });

    // P1 : comptes qui commandaient au Q1 FY27 et ont arrêté au Q2
    ajoute(1, 'Comptes qui ont arrêté de commander au Q2',
      'Appeler cette semaine, comprendre le blocage, relancer une commande avant la mi-Q3.',
      'Commande au Q1 FY27 mais rien au Q2 : le risque de perte est le plus élevé.',
      comptes.filter(c => tot(c, 'Q1FY27') > 0 && tot(c, 'Q2FY27') <= 0)
        .sort((a, b) => tot(b, 'Q1FY27') - tot(a, 'Q1FY27'))
        .map(c => ligne(c, `Q1 ${eur(tot(c, 'Q1FY27'))} → Q2 ${eur(0)}`)));

    // P1 : comptes en forte baisse au Q2 par rapport au Q1
    ajoute(1, 'Comptes en forte baisse au Q2',
      'Faire un point commande : stock, concurrence, besoin de formation ou d\'offre.',
      'Le CA Q2 est inférieur de plus de 30 % au Q1.',
      comptes.filter(c => tot(c, 'Q1FY27') >= 100 && tot(c, 'Q2FY27') > 0 && tot(c, 'Q2FY27') < tot(c, 'Q1FY27') * 0.7)
        .sort((a, b) => (tot(b, 'Q1FY27') - tot(b, 'Q2FY27')) - (tot(a, 'Q1FY27') - tot(a, 'Q2FY27')))
        .map(c => ligne(c, `Q1 ${eur(tot(c, 'Q1FY27'))} → Q2 ${eur(tot(c, 'Q2FY27'))}`)));

    // P2 : comptes actifs en FY26, sans commande en FY27
    ajoute(2, 'Comptes actifs en FY26 sans commande en FY27',
      'Réactiver : appel puis visite, avec une offre de reprise.',
      'Du CA l\'an dernier, aucune commande cette année.',
      comptes.filter(c => tot(c, 'FY26') > 0 && fy27(c) <= 0)
        .sort((a, b) => tot(b, 'FY26') - tot(a, 'FY26'))
        .map(c => ligne(c, `FY26 ${eur(tot(c, 'FY26'))}, FY27 ${eur(0)}`)));

    // P2 : comptes qui commandent chez les grossistes et pas encore par Empower
    ajoute(2, 'Proposer Empower aux comptes qui commandent chez les grossistes',
      'Présenter le programme Empower à ces comptes et les faire basculer une partie de leurs commandes.',
      'CA FY27 chez les grossistes d\'au moins 200 €, sans commande Empower.',
      comptes.filter(c => fy27(c) >= 200 && empFy27(c) <= 0 && !(window.estEmpower && estEmpower(c)))
        .sort((a, b) => fy27(b) - fy27(a))
        .map(c => ligne(c, `FY27 ${eur(fy27(c))}, 100 % grossiste`)));

    // P2 : comptes déclarés Empower sans commande Empower
    ajoute(2, 'Activer les comptes Empower sans commande Empower',
      'Relancer l\'onboarding : accès, formation, première commande.',
      'Compte Empower, mais aucune commande par ce canal en FY27.',
      comptes.filter(c => window.estEmpower && estEmpower(c) && empFy27(c) <= 0)
        .sort((a, b) => fy27(b) - fy27(a))
        .map(c => ligne(c, fy27(c) > 0 ? `FY27 ${eur(fy27(c))} chez les grossistes` : 'aucune commande FY27')));

    // P1 : leads non rappelés
    const sansRappel = (prospects || []).filter(l => {
      const st = String(l.STATUT_EMPOWER || '').toUpperCase();
      if (!['SAISIE', 'ASSIGNE', 'A_TRAITER'].includes(st)) return false;
      const t0 = new Date(l.Date_Import || l.Timestamp || l.Date_Attribution || '').getTime();
      if (isNaN(t0)) return false;
      const j0 = new Date(t0); j0.setHours(0, 0, 0, 0);
      const dc = l.Date_Derniere_Action ? new Date(l.Date_Derniere_Action).getTime() : NaN;
      return (isNaN(dc) || dc < j0.getTime()) && (Date.now() - t0) / 3600000 >= 48;
    });
    ajoute(1, 'Leads à rappeler',
      'Rappeler sous 24 h ; au-delà de 48 h le lead refroidit.',
      'Lead saisi depuis plus de 48 h, sans aucun contact.',
      sansRappel.sort((a, b) => new Date(a.Date_Import || 0) - new Date(b.Date_Import || 0))
        .map(l => ({ id: '', lead: l.ID_Prospect, nom: l.Nom_Compte, detail: l.ORIGINE ? `fourni par ${String(l.ORIGINE).replace(/^(lead|import)_/i, '')}` : '' })));

    groupes.sort((a, b) => a.niveau - b.niveau);
    return { groupes, objectif: objectif || null };
  }

  function html(plan, libelleQ = 'Q3') {
    if (!plan || !plan.groupes.length) return '';
    const o = plan.objectif;
    const entete = o && o.obj > 0
      ? `<p class="plan-obj">Objectif ${libelleQ} : <strong>${eur(o.obj)}</strong> · CA ${o.qPrecedent} : <strong>${eur(o.caPrecedent)}</strong>${o.obj > o.caPrecedent ? ` · il faut gagner <strong>${eur(o.obj - o.caPrecedent)}</strong> par rapport au trimestre précédent` : ''}</p>` : '';
    return `
    <div class="bloc-fiche plan-q3">
      <div class="bloc-titre">Mon plan d'action ${libelleQ} <span class="badge-compteur">${plan.groupes.length} priorités</span></div>
      ${entete}
      ${plan.groupes.map((g, i) => `
        <details class="plan-groupe" ${i < 2 ? 'open' : ''}>
          <summary>
            <span class="plan-niv plan-niv-${g.niveau}">Priorité ${g.niveau}</span>
            <strong>${echap(g.titre)}</strong>
            <span class="badge-compteur">${g.total}</span>
          </summary>
          <p class="plan-action"><strong>À faire :</strong> ${echap(g.action)}</p>
          <p class="plan-pourquoi">${echap(g.pourquoi)}</p>
          <ul class="plan-liste">
            ${g.lignes.map(l => `<li><a href="#" onclick="event.preventDefault();${l.lead ? `Router.aller('#/empower-tracker')` : `Router.aller('#/compte/${echap(l.id)}')`}">${echap(l.nom)}</a>
              <span class="plan-detail">${echap(l.detail)}</span></li>`).join('')}
            ${g.total > g.lignes.length ? `<li class="plan-suite">et ${g.total - g.lignes.length} autres, voir la liste des comptes</li>` : ''}
          </ul>
        </details>`).join('')}
    </div>`;
  }

  return { construire, html, eur };
})();
