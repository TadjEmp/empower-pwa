// helpers.js v2 — BUG-02 resolveCDS · BUG-05 getStatutCompte

// parseAmount est défini dans utils.js (version robuste FR/EN) — ne pas re-déclarer ici.

// ── BUG-02 — Résolution PIN → prénom CDS ──────────────────────────────────
// Registre peuplé dynamiquement depuis 🎯_OBJECTIFS_PRIMES au chargement.
// Fallback hardcodé pour les PINs numériques (1000/4001…) et les codes legacy.
window._CDS_REGISTRY = {};

function resolveCDS(pin) {
  if (!pin && pin !== 0) return '—';
  const key = String(pin).trim();
  if (!key || key === '0') return '—';
  if (window._CDS_REGISTRY[key]) return window._CDS_REGISTRY[key];
  if (window._CDS_REGISTRY[String(Number(key))]) return window._CDS_REGISTRY[String(Number(key))];
  const FALLBACK = {
    '1000': 'Tadjidine', '4001': 'Lyes', '4002': 'Mehdi', '4003': 'Johanne',
    't001': 'Tadjidine', 'j002': 'Johanne', 'm003': 'Mehdi', 'l004': 'Lyes',
    't.soefou': 'Tadjidine',
  };
  return FALLBACK[key] || FALLBACK[key.toLowerCase()] || `[${key}]`;
}

// Peuple le registre depuis les objectifs (appelé au login/init)
function initCDSRegistry(objectifs) {
  (objectifs || []).forEach(o => {
    if (o.PIN_CDS && o.Nom_CDS) {
      window._CDS_REGISTRY[String(o.PIN_CDS)] = o.Nom_CDS;
    }
  });
}

// ── BUG-05 — Statut compte calculé dynamiquement ─────────────────────────
function getStatutCompte(c) {
  if (parseAmount(c.CA_Q1FY27 || 0) > 0)  return 'actif';
  if (parseAmount(c.CA_FY26   || 0) > 0)  return 'a_reactiver';
  return 'silencieux';
}

function badgeStatutCompte(c) {
  const s = getStatutCompte(c);
  const map = {
    actif:       { lbl: '🟢 Actif',       cls: 'badge-actif' },
    a_reactiver: { lbl: '🟡 À réactiver', cls: 'badge-reactiver' },
    silencieux:  { lbl: '🔴 Silencieux',  cls: 'badge-silencieux' },
  };
  const { lbl, cls } = map[s];
  return `<span class="badge-statut-compte ${cls}">${lbl}</span>`;
}

// ── Montant sain pour affichage — affiche N/A si aberrant ─────────────────
function afficherCA(val, maxExpected = 500000) {
  const n = parseAmount(val);
  if (n > maxExpected) {
    console.warn('[MONTANT ABERRANT]', val, '→', n);
    return '<span title="Valeur incohérente — vérifier la source" style="color:var(--c-text-2)">N/A</span>';
  }
  return formatEuro(n);
}
