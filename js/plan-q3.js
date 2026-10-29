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

    // Les groupes viennent des statuts commerciaux (js/statuts-ca.js), du plus urgent au moins urgent
    const ctx = window.StatutsCA ? StatutsCA.contexte(comptes) : null;
    const calcules = ctx ? comptes.map(c => ({ c, r: StatutsCA.calculer(c, ctx) })) : [];
    const detailTrim = ({ c }) => `${ctx.codeDernier.slice(0, 2)} ${eur(tot(c, ctx.codeDernier))}`;
    const de = (code) => calcules.filter(x => x.r.code === code);
    const sig = (code) => calcules.filter(x => x.r.signaux.some(s => s.code === code));

    ajoute(1, 'Comptes qui ont arrêté de commander',
      'Appeler cette semaine, comprendre le blocage, relancer une commande avant la mi-trimestre.',
      'Ils commandaient plus tôt cette année et n\'ont rien commandé au dernier trimestre.',
      de('A_RELANCER').sort((a, b) => fy27(b.c) - fy27(a.c)).map(x => ligne(x.c, `FY27 ${eur(fy27(x.c))}, dernière commande ${x.r.derniere || 'n.c.'}`)));
    ajoute(1, 'Comptes en forte baisse',
      'Faire un point commande : stock, concurrence, besoin de formation ou d\'offre.',
      'Le CA du dernier trimestre est inférieur de plus de 30 % à celui d\'avant.',
      de('EN_BAISSE').sort((a, b) => fy27(b.c) - fy27(a.c)).map(x => ligne(x.c, x.r.resume)));
    if (ctx) ajoute(2, `Renouvellements à prévoir au ${ctx.codeCourant}`,
      'Licences de 12 mois : proposer le renouvellement avant l\'échéance.',
      `Ces comptes ont commandé au ${ctx.codeCourant} de l\'an dernier et n\'ont pas encore recommandé.`,
      sig('RENOUVELLEMENT').sort((a, b) => tot(b.c, 'Q' + ctx.courant + 'FY26') - tot(a.c, 'Q' + ctx.courant + 'FY26'))
        .map(x => ligne(x.c, x.r.signaux.find(s => s.code === 'RENOUVELLEMENT').detail)));
    ajoute(2, 'Comptes actifs en FY26 sans commande en FY27',
      'Réactiver : appel puis visite, avec une offre de reprise.',
      'Du CA l\'an dernier, aucune commande cette année.',
      de('A_REACTIVER').sort((a, b) => tot(b.c, 'FY26') - tot(a.c, 'FY26')).map(x => ligne(x.c, `FY26 ${eur(tot(x.c, 'FY26'))}, FY27 ${eur(0)}`)));
    ajoute(2, 'Proposer Empower aux comptes qui commandent chez les grossistes',
      'Présenter le programme Empower à ces comptes et leur faire basculer une partie des commandes.',
      'CA FY27 chez les grossistes d\'au moins 200 €, sans commande Empower.',
      sig('CONVERTIR_EMPOWER').sort((a, b) => fy27(b.c) - fy27(a.c)).map(x => ligne(x.c, x.r.signaux.find(s => s.code === 'CONVERTIR_EMPOWER').detail)));
    ajoute(3, 'Activer les comptes Empower sans commande Empower',
      'Relancer l\'onboarding : accès, formation, première commande.',
      'Compte Empower, mais aucune commande par ce canal en FY27.',
      sig('ACTIVER_EMPOWER').sort((a, b) => fy27(b.c) - fy27(a.c)).map(x => ligne(x.c, fy27(x.c) > 0 ? `FY27 ${eur(fy27(x.c))} chez les grossistes` : 'aucune commande FY27')));
    ajoute(3, 'Comptes à activer (jamais commandé)',
      'Obtenir une première commande : appel de découverte, offre de lancement.',
      'Aucune commande depuis FY25.',
      de('A_ACTIVER').map(x => ligne(x.c, 'aucune commande')));

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
