// ═══════════════════════════════════════
//  filter-state.js — État de filtre partagé Quarter / Semaine fiscale / commercial
//  Persisté en localStorage, source unique consommée par Accueil, Reporting,
//  Objectifs, Primes, Phoning (cf. audit Bloc 4 — chaque vue réinventait son
//  propre filtre, ou n'en avait aucun, et aucune ne survivait à un changement
//  d'onglet faute de persistance).
// ═══════════════════════════════════════

const FilterState = (function () {
  const KEY = 'empower_filtres';

  // quarter : 'Q1'..'Q4' — même convention que paramMap.QuarterActif partout
  //           ailleurs dans l'app (pas de suffixe FY27).
  // semaine : code FiscalWeeks (ex. 'Q1-W13') ou null = pas de filtre semaine,
  //           vue trimestre entier.
  // pinCommercial : PIN ou null = vue par défaut du rôle (soi-même pour un CDS,
  //           consolidée pour Admin/Channel) — ne force pas un commercial précis.
  function _defaut() {
    return { quarter: 'Q1', semaine: null, pinCommercial: null };
  }

  function _lire() {
    try {
      const brut = localStorage.getItem(KEY);
      return brut ? { ..._defaut(), ...JSON.parse(brut) } : _defaut();
    } catch { return _defaut(); }
  }

  let state = _lire();

  function get() { return { ...state }; }

  function set(partiel) {
    state = { ...state, ...partiel };
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
  }

  // À appeler une fois le quarter actif connu (lecture ⚙️_PARAMS) si aucun
  // choix explicite n'a encore été persisté — ne doit jamais écraser un choix
  // manuel déjà fait par l'utilisateur.
  function ensureQuarterDefault(quarterActif) {
    if (!quarterActif) return;
    const brut = (() => { try { return localStorage.getItem(KEY); } catch { return null; } })();
    if (!brut) set({ quarter: quarterActif });
  }

  function reset() {
    state = _defaut();
    try { localStorage.removeItem(KEY); } catch {}
  }

  return { get, set, ensureQuarterDefault, reset };
})();
window.FilterState = FilterState;
