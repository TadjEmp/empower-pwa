// ═══════════════════════════════════════
//  flags-canal.js — Refresh ESI : drapeaux Empower / Grossiste et Activé / Non activé
//  Couleur + pictogramme (jamais la couleur seule). Source unique : estEmpower() (utils.js) pour le canal ;
//  « Activé » = au moins une commande Empower en sell-in (CA_EMP_* > 0), « Non activé » = Empower sans commande.
// ═══════════════════════════════════════
window.FlagsCanal = (function () {
  const PERIODES = ['FY25', 'FY26', 'Q1FY27', 'Q2FY27', 'Q3FY27', 'Q4FY27'];
  const svg = d => `<svg class="flag-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICO = {
    emp: svg('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'),                       // éclair : compte Empower
    gro: svg('<rect x="2" y="7" width="12" height="9" rx="1"/><path d="M14 10h4l3 3v3h-7z"/><circle cx="6" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/>'), // camion : grossiste
    ok:  svg('<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>'),       // activé
    no:  svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),         // non activé : en attente
  };
  const estEmp = c => !!(window.estEmpower && estEmpower(c));
  const active = c => PERIODES.some(p => Number(c && c['CA_EMP_' + p]) > 0);
  function canal(c) {
    return estEmp(c)
      ? `<span class="flag flag-emp" title="Compte Empower">${ICO.emp}Empower</span>`
      : `<span class="flag flag-gro" title="Grossiste (hors Empower), potentiel onboarding">${ICO.gro}Grossiste</span>`;
  }
  function activation(c) {
    if (!estEmp(c)) return '';
    return active(c)
      ? `<span class="flag flag-act" title="1re commande Empower passée (sell-in)">${ICO.ok}Activé</span>`
      : `<span class="flag flag-noact" title="Aucune commande Empower en sell-in à ce jour">${ICO.no}Non activé</span>`;
  }
  const html = c => canal(c) + activation(c);
  return { html, canal, activation, active, ICO };
})();
