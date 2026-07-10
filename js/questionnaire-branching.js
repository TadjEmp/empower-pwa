// ═══════════════════════════════════════
//  questionnaire-branching.js — Branchement contextuel partagé pour les
//  questionnaires visites (vue-questionnaire.js) et phoning (vue-phoning.js).
//  Ne fusionne PAS les deux flux (tables et champs métier différents) —
//  mutualise seulement (a) la dérivation du type d'interaction et (b) le
//  mécanisme d'affichage conditionnel de groupes de champs selon ce type.
//  Cf. audit Bloc 4 : les deux flux avaient le même gap — le contexte
//  (objectif de visite / statut EMPOWER) était calculé mais jamais utilisé
//  pour adapter les questions réellement posées.
// ═══════════════════════════════════════

const QuestionnaireBranching = (function () {

  // Types canoniques partagés entre visites et phoning.
  const TYPES = {
    PROSPECTION_FROIDE: 'PROSPECTION_FROIDE',
    SUIVI_ACTIF:        'SUIVI_ACTIF',
    ONBOARDING_EMPOWER: 'ONBOARDING_EMPOWER',
    COMMANDE_EMPOWER:   'COMMANDE_EMPOWER',  // phoning uniquement : compte déjà EMPOWER, appel commande/upsell
  };

  // Dérive le type d'interaction pour une VISITE à partir des objectifs cochés
  // — remplace le calcul local dupliqué dans vue-questionnaire.js.
  function deriverTypeVisite(objectifsVisite) {
    const o = objectifsVisite || [];
    if (o.includes('🚀 Intégration EMPOWER'))        return TYPES.ONBOARDING_EMPOWER;
    if (o.includes('❄️ Prospection à froid'))         return TYPES.PROSPECTION_FROIDE;
    if (o.includes('🔄 Renouvellement partenariat'))  return TYPES.SUIVI_ACTIF;
    return TYPES.SUIVI_ACTIF;
  }

  // Dérive le type d'interaction pour un APPEL phoning à partir du statut du
  // compte — remplace le calcul local `dejaOnboarde` dupliqué dans vue-phoning.js.
  function deriverTypeAppel({ estCompteExistant, compte }) {
    if (estCompteExistant && window.estEmpower(compte)) return TYPES.COMMANDE_EMPOWER;
    if (estCompteExistant) return TYPES.SUIVI_ACTIF;
    return TYPES.PROSPECTION_FROIDE;
  }

  // Un groupe de champs n'est affiché que si le type courant figure dans sa
  // liste `pourTypes`. Usage :
  //   QuestionnaireBranching.visible(['SUIVI_ACTIF','ONBOARDING_EMPOWER'], typeCourant)
  function visible(pourTypes, typeCourant) {
    return (pourTypes || []).includes(typeCourant);
  }

  // Widget HTML "chips" de sélection multiple non-obligatoire — mutualise le
  // pattern déjà utilisé pour grossistes_json (visites), réutilisable pour les
  // sélections Norton 360 / Op commerciale (phoning). `onToggle` est le nom
  // global d'une fonction (champ, valeur) => void appelée au clic.
  function chipsMultiSelect({ champ, options, valeurs, onToggle }) {
    // Réutilise .q-chips/.q-chip (déjà stylé partout ailleurs dans l'app) plutôt
    // que d'introduire un nouveau système de classes CSS pour le même pattern.
    return `<div class="q-chips">
      ${(options || []).map(opt => {
        const actif = (valeurs || []).includes(opt);
        const optEch = String(opt).replace(/'/g, "\\'");
        return `<button type="button" class="q-chip ${actif ? 'active' : ''}"
                  onclick="${onToggle}('${champ}','${optEch}')">${opt}</button>`;
      }).join('')}
    </div>`;
  }

  return { TYPES, deriverTypeVisite, deriverTypeAppel, visible, chipsMultiSelect };
})();
window.QuestionnaireBranching = QuestionnaireBranching;
