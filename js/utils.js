// ═══════════════════════════════════════
//  utils.js — Fonctions utilitaires globales
//  EMPOWER v2.1 — Marvesting FY27
// ═══════════════════════════════════════

function genId(prefix = 'ID') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

// Date locale au format YYYY-MM-DD (≠ toISOString qui renvoie l'UTC).
// Indispensable pour comparer avec les <input type="date"> (toujours locaux) :
// sinon, entre minuit et l'offset UTC, "aujourd'hui" bascule d'un jour.
function dateISOLocale(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Bloc Phoning (07/2026) — un appel "planifié" (Statut_Appel='planifié') n'a
// pas encore eu lieu : ne doit jamais être compté comme un appel "effectué"
// dans les KPI (cards Accueil, camemberts, activité équipe). Centralisé pour
// que tous les compteurs "appels" de l'app appliquent la même règle.
function estAppelRealise(a) {
  return String(a?.Statut_Appel || '').toLowerCase() !== 'planifié';
}

function normaliserNom(str = '') {
  return (str || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim().replace(/\s+/g, ' ');
}

// Condensé lecture-seule d'une visite déjà réalisée — utilisé pour pré-remplir
// la note d'une action de suivi (nouvelle visite OU appel planifié depuis
// VueVisites.planifierSuiviVisite/planifierSuiviAppel) sans jamais modifier
// la ligne d'origine. Mutualisé entre vue-visites.js et vue-phoning.js pour
// ne pas dupliquer cette logique dans les deux modules.
function condenserVisite(v) {
  if (!v) return '';
  const dateStr = v.Date ? new Date(v.Date).toLocaleDateString('fr-FR') : '—';
  const parts = [`↳ Suite de la visite du ${dateStr}`];
  if (v.Resultat_Visite) parts.push(`Résultat : ${v.Resultat_Visite}`);
  let freins = '';
  if (v.Freins_JSON) {
    try {
      const f = typeof v.Freins_JSON === 'string' ? JSON.parse(v.Freins_JSON) : v.Freins_JSON;
      if (Array.isArray(f) && f.length) freins = f.join(', ');
      else if (f && typeof f === 'object') freins = Object.values(f).filter(Boolean).join(', ');
    } catch { freins = String(v.Freins_JSON); }
  }
  if (freins) parts.push(`Frein(s) : ${freins}`);
  if (v.Concurrent_Actuel) parts.push(`Concurrent : ${v.Concurrent_Actuel}`);
  if (v.Prochaine_Action_Texte) parts.push(`Prochaine action prévue : ${v.Prochaine_Action_Texte}`);
  if (v.Note_Privee) parts.push(`Note : ${v.Note_Privee}`);
  return parts.join('\n');
}

// ── Normalisation montants (Section 24 — anti-aberrants) ──
function parseAmount(val) {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return isFinite(val) ? val : 0;
  const str = String(val).trim();
  let cleaned;
  if (str.includes(',') && str.includes('.')) {
    const liComma = str.lastIndexOf(','), liDot = str.lastIndexOf('.');
    // FR "1.234,56" → virgule plus à droite = décimale
    cleaned = liComma > liDot
      ? str.replace(/\./g, '').replace(',', '.')
      : str.replace(/,/g, '');
  } else {
    cleaned = str.replace(/\s/g, '').replace(',', '.');
  }
  cleaned = cleaned.replace(/[^0-9.\-]/g, '');
  const result = parseFloat(cleaned);
  return isFinite(result) ? result : 0;
}

// Formate un montant pour affichage FR avec symbole €
function formatEUR(val) {
  const n = parseAmount(val);
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}

// Formate un montant sans symbole (tableaux)
function formatCA(val) {
  const n = parseAmount(val);
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n);
}

// Alerte console si montant aberrant — retourne 0 dans ce cas
function assertAmountSane(val, label, maxExpected) {
  const n = parseAmount(val);
  if (n > (maxExpected || 500000)) {
    console.warn('[MONTANT ABERRANT]', label, '=', n, '| raw:', val);
    return 0;
  }
  return n;
}

// Alias rétro-compat — utilise désormais parseAmount() en interne
function formatEuro(val) {
  return formatEUR(val);
}

function dateRelative(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  const now = new Date();
  const diff = Math.round((d - now) / 86400000);
  if (diff === 0) return "aujourd'hui";
  if (diff === 1) return 'demain';
  if (diff === -1) return 'hier';
  if (diff > 0) return `dans ${diff}j`;
  return `il y a ${Math.abs(diff)}j`;
}

function estDepassee(isoStr) {
  if (!isoStr) return false;
  return new Date(isoStr) < new Date();
}

// ── estEmpower(compte) — source unique du statut EMPOWER d'un compte ──
// Tolérant aux variantes de casse du mapping GAS-compat (Has_EMPOWER / HAS_EMPOWER / has_empower)
// pour ne pas reproduire le bug de lecture trouvé dans vue-fiche-compte.js / vue-visites.js / vue-phoning.js.
function estEmpower(compte) {
  const v = compte && (compte.Has_EMPOWER ?? compte.HAS_EMPOWER ?? compte.has_empower);
  return String(v || '').trim().toLowerCase() === 'oui';
}
window.estEmpower = estEmpower;

function slugify(str = '') {
  return str.toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-');
}

function debounce(fn, ms = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function safeJSON(str, fallback = null) {
  try { return JSON.parse(str); } catch { return fallback; }
}

// ── Norton mark SVG (currentColor — s'adapte au contexte) ──
const NORTON_SVG = `<svg class="norton-mark" viewBox="0 0 112 112" xmlns="http://www.w3.org/2000/svg" fill="none" aria-hidden="true"><path d="M 96 33 A 46 46 0 1 1 79 16" stroke="currentColor" stroke-width="10.5" stroke-linecap="round"/><polyline points="28,59 46,77 82,35" stroke="currentColor" stroke-width="10.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// Barre de navigation principale (bottom nav mobile / sidebar desktop)
// V2.1 — 7 modules métier
// ── Export CSV — séparateur ; UTF-8 BOM pour Excel FR ──
function generateCSV(data, filename) {
  if (!data || !data.length) {
    if (typeof Toast !== 'undefined') Toast.afficher('Aucune donnée à exporter', 'warning');
    return;
  }
  const bom     = '﻿';
  const headers = Object.keys(data[0]);
  const lines   = [headers.join(';')];
  data.forEach(row => {
    lines.push(headers.map(h => {
      const v = String(row[h] ?? '').replace(/"/g, '""');
      return (v.includes(';') || v.includes('\n') || v.includes('"')) ? `"${v}"` : v;
    }).join(';'));
  });
  const blob = new Blob([bom + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  if (typeof Toast !== 'undefined') Toast.afficher(`📥 Export : ${filename}`, 'succes');
}

// ── SidebarToggle — collapse/expand du volet desktop ──
const SidebarToggle = (function () {
  const KEY = 'empower_sidebar';

  function _apply(collapsed) {
    document.body.classList.toggle('sidebar-collapsed', collapsed);
  }

  return {
    init() {
      const saved = localStorage.getItem(KEY);
      _apply(saved === 'collapsed');
    },
    toggle() {
      const next = !document.body.classList.contains('sidebar-collapsed');
      _apply(next);
      localStorage.setItem(KEY, next ? 'collapsed' : 'expanded');
    },
    collapse()  { _apply(true);  localStorage.setItem(KEY, 'collapsed'); },
    expand()    { _apply(false); localStorage.setItem(KEY, 'expanded'); },
    isCollapsed() { return document.body.classList.contains('sidebar-collapsed'); },
  };
})();

// ── updateNavBadge — met à jour un badge dans la sidebar sans re-render ──
function updateNavBadge(itemId, count) {
  const el = document.querySelector(`.nav-item[data-id="${itemId}"] .nav-badge`);
  if (!el) return;
  el.textContent = count > 99 ? '99+' : String(count);
  el.classList.toggle('visible', count > 0);
}

function NavBar(actif) {
  // ── Catalogue complet des items de navigation ──
  const TOUS = [
    // CRM (mobile bottom nav + desktop sidebar)
    { id: 'home',        hash: '#/dashboard',           mobileNav: true,  lbl: 'Accueil',
      icone: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>' },
    { id: 'tracker',     hash: '#/empower-tracker',     mobileNav: true,  lbl: 'Tracker',
      icone: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/></svg>' },
    { id: 'comptes',     hash: '#/comptes',             mobileNav: true,  lbl: 'Comptes',
      icone: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v8h4"/><path d="M18 9h2a2 2 0 0 1 2 2v11h-4"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>' },
    { id: 'reporting',   hash: '#/manager',             mobileNav: true,  lbl: 'Reporting',
      icone: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="4" height="12" x="2" y="6" rx="1"/><rect width="4" height="16" x="9" y="2" rx="1"/><rect width="4" height="8" x="16" y="10" rx="1"/></svg>' },
    // Bloc 2 §1 — Reporting personnel CDS (tabId distinct de 'reporting' car
    // route différente : #/reporting-cds → VueDashboardCDS, pas #/manager).
    { id: 'reporting_cds', hash: '#/reporting-cds',     mobileNav: true,  lbl: 'Reporting',
      icone: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="4" height="12" x="2" y="6" rx="1"/><rect width="4" height="16" x="9" y="2" rx="1"/><rect width="4" height="8" x="16" y="10" rx="1"/></svg>' },
    // Activité (sidebar desktop uniquement)
    { id: 'visites',     hash: '#/visites',             mobileNav: false, lbl: 'Mon Planning',
      icone: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="14" x2="8" y2="14"/><line x1="12" y1="14" x2="12" y2="14"/><line x1="8" y1="18" x2="8" y2="18"/><line x1="12" y1="18" x2="12" y2="18"/></svg>' },
    { id: 'phoning',     hash: '#/phoning',             mobileNav: false, lbl: 'Phoning',
      icone: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 9a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>' },
    { id: 'photos',      hash: '#/photos',              mobileNav: false, lbl: 'Mes Photos',
      icone: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>' },
    // Section 9 cahier des charges — vue consolidée Channel (lecture seule FDV)
    // 'phoning_fdv' retiré (Bloc 3 §4) — intégré dans l'onglet Journal de #/phoning.
    { id: 'visites_fdv', hash: '#/visites-fdv',         mobileNav: false, lbl: 'Visites FDV',
      icone: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' },
    // Données (sidebar desktop uniquement)
    { id: 'historiques', hash: '#/comptes-historiques', mobileNav: false, lbl: 'Historique CA',
      icone: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>' },
    { id: 'objectifs',   hash: '#/objectifs',           mobileNav: false, lbl: 'Mes Objectifs',
      icone: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>' },
    { id: 'primes',      hash: '#/primes',              mobileNav: false, lbl: 'Mes Primes',
      icone: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg>' },
    // Admin
    { id: 'admin',       hash: '#/admin',               mobileNav: false, lbl: 'Administration',
      icone: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>' },
  ];

  // Sections groupées (desktop sidebar uniquement — labels + séparateurs)
  // 'historiques' retiré (audit UX desktop § "simplification nav") : atteignable
  // désormais via l'onglet "Historique CA" dans Comptes (vue-comptes.js /
  // vue-comptes-historiques.js) plutôt qu'une entrée de nav de premier niveau —
  // la route #/comptes-historiques reste valide et protégée par Permissions.
  const SECTIONS = [
    { lbl: null,        ids: ['home', 'tracker', 'comptes', 'reporting', 'reporting_cds'] },
    { lbl: 'Activité',  ids: ['visites', 'phoning', 'visites_fdv', 'photos'] },
    { lbl: 'Données',   ids: ['objectifs', 'primes'] },
    { lbl: 'Admin',     ids: ['admin'] },
  ];

  const role = (typeof Session !== 'undefined') ? Session.role : null;
  const autorises = (role && typeof window.Permissions !== 'undefined')
    ? window.Permissions.onglets(role) : [];
  const itemMap = Object.fromEntries(TOUS.map(i => [i.id, i]));

  const nomUser  = (typeof Session !== 'undefined') ? (Session.nom || '') : '';
  const initiale = nomUser ? nomUser.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) : '?';

  // ── Rendu d'un item nav ──
  // mobileNav:true  → pas de nav-sidebar-only → visible mobile bottom nav + sidebar desktop
  // mobileNav:false → nav-sidebar-only → caché mobile, visible uniquement sidebar desktop
  function _itemHtml(i) {
    const cls = [
      'nav-item',
      i.mobileNav ? '' : 'nav-sidebar-only',
      actif === i.id ? 'actif' : '',
    ].filter(Boolean).join(' ');
    return `<a class="${cls}" href="${i.hash}" data-id="${i.id}" data-lbl="${i.lbl}">
      <span class="nav-icone">${i.icone}</span>
      <span class="nav-lbl">${i.lbl}</span>
      <span class="nav-badge" id="nav-badge-${i.id}"></span>
    </a>`;
  }

  // ── Section groupée (desktop : label + colonne / mobile : display:contents transparent) ──
  function _sectionHtml(sec) {
    const visibles = sec.ids
      .map(id => itemMap[id])
      .filter(i => i && autorises.indexOf(i.id) !== -1);
    if (!visibles.length) return '';
    return `<div class="nav-section">
      ${sec.lbl ? `<span class="nav-section-lbl">${sec.lbl}</span>` : ''}
      ${visibles.map(i => _itemHtml(i)).join('')}
    </div>`;
  }

  // ── Toutes les sections (mobile + desktop) ──
  const sidebarSections = role ? SECTIONS.map(_sectionHtml).join('') : '';

  // SVG icônes footer
  const ICO_SYNC = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>';
  const ICO_OUT  = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>';
  const ICO_CHEV = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';

  return `
    <!-- Barre mobile top -->
    <div class="app-brand-bar">
      <div class="app-brand-logo">
        ${NORTON_SVG}
        <span class="brand-norton-txt">norton</span><sup class="brand-tm">™</sup>
      </div>
      <span class="app-brand-sep">|</span>
      <span class="app-brand-esi">EMPOWER SALES INTELLIGENCE</span>
      <button class="brand-hamburger" onclick="DrawerMenu.ouvrir()" aria-label="Menu">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
          <line x1="2" y1="5.5" x2="20" y2="5.5"/>
          <line x1="2" y1="11" x2="20" y2="11"/>
          <line x1="2" y1="16.5" x2="20" y2="16.5"/>
        </svg>
      </button>
    </div>

    <!-- Sidebar desktop -->
    <nav class="nav-principale" role="navigation" aria-label="Navigation principale">
      <!-- Logo + toggle -->
      <div class="nav-logo">
        ${NORTON_SVG}
        <div class="nav-logo-textes">
          <span class="nav-logo-norton">norton<sup>™</sup></span>
          <span class="nav-logo-esi">EMPOWER SALES INTELLIGENCE</span>
        </div>
        <button class="nav-toggle-btn" onclick="SidebarToggle.toggle()" title="Réduire / Développer le menu" aria-label="Toggle sidebar">
          ${ICO_CHEV}
        </button>
      </div>

      <!-- Sections : transparent (display:contents) sur mobile → bottom nav ; colonnes groupées sur desktop -->
      ${sidebarSections}

      <!-- Footer : utilisateur + actions -->
      <div class="nav-sidebar-footer">
        <div class="nav-sidebar-user" title="${nomUser} · ${role || ''}">
          <div class="nav-sidebar-avatar">${initiale}</div>
          <div class="nav-sidebar-user-info">
            <div class="nav-sidebar-nom">${nomUser}</div>
            <div class="nav-sidebar-role">${role || ''}</div>
          </div>
        </div>
        <button class="nav-item nav-sidebar-action" data-lbl="Synchroniser" onclick="DrawerMenu._synchro()">
          <span class="nav-icone">${ICO_SYNC}</span>
          <span class="nav-lbl">Synchroniser</span>
        </button>
        <button class="nav-item nav-sidebar-action nav-sidebar-danger" data-lbl="Déconnexion" onclick="DrawerMenu._deconnecter()">
          <span class="nav-icone">${ICO_OUT}</span>
          <span class="nav-lbl">Déconnexion</span>
        </button>
      </div>
    </nav>`;
}

// ═══════════════════════════════════════
//  DrawerMenu — Volet latéral gauche (non fixe, slide-in)
//  Rendu dans #drawer-root (hors #app) pour survivre aux navigations.
// ═══════════════════════════════════════
const DrawerMenu = (function () {

  // Items de navigation secondaire du drawer
  const ITEMS = [
    { id: 'visites',     hash: '#/visites',              ico: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>', lbl: 'Mon Planning',   roles: ['ADMIN','CDS'] },
    { id: 'phoning',     hash: '#/phoning',              ico: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 9a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>', lbl: 'Phoning',          roles: ['ADMIN','CDS','CHANNEL_MANAGER'] },
    { id: 'visites_fdv', hash: '#/visites-fdv',          ico: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>', lbl: 'Visites FDV',       roles: ['CHANNEL_MANAGER'] },
    { id: 'photos',      hash: '#/photos',               ico: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>', lbl: 'Mes Photos',        roles: ['ADMIN','CDS','CHANNEL_MANAGER'] },
    { id: 'historiques', hash: '#/comptes-historiques',  ico: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>', lbl: 'Historique CA',   roles: ['ADMIN','CDS','CHANNEL_MANAGER'] },
    { id: 'objectifs',   hash: '#/objectifs',            ico: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>', lbl: 'Mes Objectifs',    roles: ['ADMIN','CDS'] },
    { id: 'primes',      hash: '#/primes',               ico: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg>', lbl: 'Mes Primes',        roles: ['ADMIN','CDS'] },
    { id: 'admin',       hash: '#/admin',                ico: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>', lbl: 'Administration', roles: ['ADMIN'] },
  ];

  function _roleLabel(role) {
    return { ADMIN: 'Admin', CDS: 'Commercial', CHANNEL_MANAGER: 'Manager', EXTERNE: 'Invité' }[role] || role || '';
  }

  function _html() {
    const role    = (typeof Session !== 'undefined') ? Session.role : null;
    const nom     = (typeof Session !== 'undefined') ? (Session.nom || '') : '';
    const initiale = nom ? nom.charAt(0).toUpperCase() : '?';
    const items   = ITEMS.filter(i => !role || i.roles.includes(role));

    return `
    <div id="drawer-overlay" class="drawer-overlay" onclick="DrawerMenu.fermer()"></div>
    <div id="drawer-panneau" class="drawer-panneau" role="dialog" aria-modal="true" aria-label="Menu navigation">
      <div class="drawer-header">
        <div class="drawer-header-avatar">${initiale}</div>
        <div class="drawer-header-info">
          <div class="drawer-header-nom">${nom || 'EMPOWER'}</div>
          <div class="drawer-header-role">${_roleLabel(role)}</div>
        </div>
        <button class="drawer-close" onclick="DrawerMenu.fermer()" aria-label="Fermer"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>

      <nav class="drawer-nav">
        <div class="drawer-section-lbl">Navigation</div>
        ${items.map(i => `
          <a class="drawer-item" href="${i.hash}" onclick="DrawerMenu.fermer()">
            <div class="drawer-item-ico">${i.ico}</div>
            ${i.lbl}
          </a>`).join('')}

        <div class="drawer-sep"></div>
        <div class="drawer-footer">
          <button class="drawer-item" onclick="DrawerMenu._synchro()">
            <div class="drawer-item-ico"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg></div>
            Synchroniser
          </button>
          <button class="drawer-item drawer-item-danger" onclick="DrawerMenu._deconnecter()">
            <div class="drawer-item-ico"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></div>
            Déconnexion
          </button>
        </div>
      </nav>
    </div>`;
  }

  function _getRoot() {
    let root = document.getElementById('drawer-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'drawer-root';
      document.body.appendChild(root);
    }
    return root;
  }

  function renderToRoot() {
    _getRoot().innerHTML = _html();
  }

  function ouvrir() {
    // Le drawer est un menu mobile — le hamburger qui l'ouvre est déjà masqué
    // ≥900px (.app-brand-bar), cette garde est une sécurité supplémentaire.
    if (window.innerWidth >= 900) return;
    // Lazy-render si la session vient de démarrer ou si le DOM a été vidé
    const ov = document.getElementById('drawer-overlay');
    const pn = document.getElementById('drawer-panneau');
    if (!ov || !pn) renderToRoot();
    const overlay = document.getElementById('drawer-overlay');
    const panneau = document.getElementById('drawer-panneau');
    if (overlay) overlay.classList.add('ouvert');
    if (panneau) { panneau.classList.add('ouvert'); panneau.focus(); }
    document.body.style.overflow = 'hidden';
  }

  function fermer() {
    const overlay = document.getElementById('drawer-overlay');
    const panneau = document.getElementById('drawer-panneau');
    if (overlay) overlay.classList.remove('ouvert');
    if (panneau) panneau.classList.remove('ouvert');
    document.body.style.overflow = '';
  }

  function _synchro() {
    fermer();
    if (typeof SheetsAPI !== 'undefined' && typeof SheetsAPI.viderCache === 'function') {
      SheetsAPI.viderCache()
        .then(() => {
          if (typeof Toast !== 'undefined') Toast.afficher('✅ Cache vidé — rechargement…', 'succes', 2000);
          setTimeout(() => location.reload(), 1800);
        })
        .catch(() => location.reload());
    } else {
      location.reload();
    }
  }

  function _deconnecter() {
    fermer();
    if (typeof Session !== 'undefined' && Session.deconnecter) Session.deconnecter();
    if (typeof Router !== 'undefined') Router.aller('#/login');
  }

  return { renderToRoot, ouvrir, fermer, _synchro, _deconnecter };
})();

// ═══════════════════════════════════════
//  Topbar — Barre de titre desktop persistante (refonte UX desktop, Bloc 1 — Shell)
//  Miroir passif du titre de la vue courante (#app .header-vue h1), masquée
//  automatiquement si la vue gère déjà son propre header desktop
//  (ex. dash-page-header sur l'Accueil CDS) pour éviter un double header.
//  Rendue dans #topbar-root (hors #app) pour survivre aux re-render de vue.
// ═══════════════════════════════════════
const Topbar = (function () {
  let _observer = null;

  // Section de nav pour chaque route — mêmes regroupements que NavBar.SECTIONS,
  // dupliqués ici (volontairement) pour ne pas coupler Topbar au rendu de NavBar.
  const SECTIONS_PAR_HASH = [
    { base: '#/visites-fdv',         section: 'Activité' },
    { base: '#/visites',             section: 'Activité' },
    { base: '#/phoning',             section: 'Activité' },
    { base: '#/photos',              section: 'Activité' },
    { base: '#/comptes-historiques', section: 'Données' },
    { base: '#/objectifs',           section: 'Données' },
    { base: '#/primes',              section: 'Données' },
    { base: '#/admin',               section: 'Admin' },
    { base: '#/compte',              section: 'Comptes' },
    { base: '#/questionnaire',       section: 'Comptes' },
  ];

  function _getRoot() {
    let root = document.getElementById('topbar-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'topbar-root';
      document.body.insertBefore(root, document.body.firstChild);
    }
    return root;
  }

  // null → la vue courante a déjà son propre header desktop, ne rien afficher
  function _sourceTitre() {
    if (document.querySelector('#app .dash-page-header')) return null;
    const h1 = document.querySelector('#app .header-vue h1');
    return h1 ? h1.textContent.trim() : 'EMPOWER Sales Intelligence';
  }

  // Retrouve la section de nav (Activité / Données / Admin / Comptes) de la route
  // courante pour construire "Section › Titre" — null si route de premier niveau.
  function _sourceSection() {
    const hash = window.location.hash || '';
    const hit = SECTIONS_PAR_HASH.find(s => hash === s.base || hash.startsWith(s.base + '/'));
    return hit ? hit.section : null;
  }

  // Sous-onglet interne actif (ex. Admin → Journal), exposé par la vue via un
  // marqueur `.js-tab-label` dans son .header-vue — complète le fil d'Ariane
  // sur les pages qui ont leur propre navigation par tabs (cf. utils.js#Topbar).
  function _sourceSousOnglet() {
    const el = document.querySelector('#app .header-vue .js-tab-label');
    const txt = el ? el.textContent.trim() : '';
    return txt || null;
  }

  function _render() {
    const root  = _getRoot();
    const titre = _sourceTitre();

    if (titre === null) {
      root.classList.add('topbar-hidden');
      return;
    }
    root.classList.remove('topbar-hidden');

    // Fil d'Ariane à 2 ou 3 niveaux : Section › Titre [› Sous-onglet actif].
    // Le sous-onglet (ex. Admin → Journal) vient d'un marqueur optionnel posé
    // par la vue (.js-tab-label) — cf. vue-admin.js.
    const section    = _sourceSection();
    const sousOnglet = _sourceSousOnglet();
    const sep = `<span class="topbar-crumb-sep"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></span>`;
    const segments = [];
    if (section) segments.push(`<span class="topbar-crumb-section">${section}</span>`);
    segments.push(`<span class="${sousOnglet ? 'topbar-crumb-section' : 'topbar-titre'}">${titre}</span>`);
    if (sousOnglet) segments.push(`<span class="topbar-titre">${sousOnglet}</span>`);
    const crumbHtml = segments.join(sep);

    if (!root.firstElementChild) {
      root.innerHTML = `<div class="topbar-desktop"><span class="topbar-crumb"></span></div>`;
    }
    const crumb = root.querySelector('.topbar-crumb');
    if (crumb && crumb.innerHTML !== crumbHtml) crumb.innerHTML = crumbHtml;
  }

  function init() {
    _render();
    if (_observer) return; // garde anti double-init (boot ne s'exécute qu'une fois normalement)
    const cible = document.getElementById('app');
    if (!cible) return;
    _observer = new MutationObserver(debounce(_render, 30));
    _observer.observe(cible, { childList: true, subtree: true });
  }

  return { init, _render };
})();
window.Topbar = Topbar;

// ═══════════════════════════════════════
//  Bloc 9 #1 — resolveCDS(pinOuLibelle) → prénom EN MAJUSCULES ou '—'
//  Gère pin numérique, libellé "TADJ", nom complet, alias texte.
// ═══════════════════════════════════════
(function () {
  const PIN_VERS_PRENOM = {
    1000: 'TADJIDINE',
    4001: 'LYES',
    4002: 'MEHDI',
    4003: 'JOHANNE',
    5000: 'ALEXANDRA',
    5001: 'SABINE',
    5002: 'SOPHIE',
  };

  // alias texte (normalisés en MAJUSCULES, sans accents) → prénom canonique
  const ALIAS = {
    'TADJ':              'TADJIDINE',
    'TADJIDINE':         'TADJIDINE',
    'TADJIDINE SOEFOU':  'TADJIDINE',
    'SOEFOU':            'TADJIDINE',
    'LYES':              'LYES',
    'DAOUD':             'LYES',
    'LYES DAOUD':        'LYES',
    'MEHDI':             'MEHDI',
    'HOCINE':            'MEHDI',
    'MEHDI HOCINE':      'MEHDI',
    'JOHANNE':           'JOHANNE',
    'LHERMITTE':         'JOHANNE',
    'JOHANNE LHERMITTE': 'JOHANNE',
    'ALEXANDRA':         'ALEXANDRA',
    'ALGUAZIL':          'ALEXANDRA',
    'ALEXANDRA ALGUAZIL':'ALEXANDRA',
    'SABINE':            'SABINE',
    'LOUISON':           'SABINE',
    'SABINE LOUISON':    'SABINE',
    'SOPHIE':            'SOPHIE',
    'BONO':              'SOPHIE',
    'SOPHIE BONO':       'SOPHIE',
  };

  function resolveCDS(pinOuLibelle) {
    if (pinOuLibelle === null || pinOuLibelle === undefined) return '—';

    // 1) PIN numérique direct (number ou string purement numérique)
    const asNum = Number(pinOuLibelle);
    if (typeof pinOuLibelle === 'number' || /^\s*\d+\s*$/.test(String(pinOuLibelle))) {
      if (PIN_VERS_PRENOM[asNum]) return PIN_VERS_PRENOM[asNum];
    }

    // 2) Libellé texte
    const brut = String(pinOuLibelle).trim();
    if (!brut) return '—';

    const norm = brut
      .toUpperCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (ALIAS[norm]) return ALIAS[norm];

    // 3) Recherche par mot-clé (un prénom ou nom contenu dans le libellé)
    for (const cle in ALIAS) {
      if (cle.indexOf(' ') === -1 && norm.indexOf(cle) !== -1) {
        return ALIAS[cle];
      }
    }

    return '—';
  }

  window.resolveCDS = resolveCDS;
  // Exposer la version utils.js pour que helpers.js puisse y accéder (chaînage)
  window._resolveCDSBase = resolveCDS;
})();

// ═══════════════════════════════════════
//  Bloc 9 #2 — parseCA(v) / fmtCA(v)
//  Montants robustes. Valeurs corrompues (dates "11/4/1903", NaN) → null / '—'.
// ═══════════════════════════════════════
(function () {

  function parseCA(v) {
    if (v === null || v === undefined || v === '') return null;

    if (typeof v === 'number') return isFinite(v) ? v : null;

    let str = String(v).trim();
    if (!str) return null;

    // Rejet des valeurs ressemblant à une date (dd/mm/yyyy, yyyy-mm-dd, etc.)
    // — fréquentes corruptions du tracker ("11/4/1903").
    if (/[\/]/.test(str) && /\d/.test(str)) {
      // une chaîne avec des '/' entre chiffres est traitée comme date corrompue
      if (/^\d{1,4}[\/]\d{1,2}[\/]\d{1,4}$/.test(str)) return null;
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) return null;

    // Nettoyage FR/EN
    let cleaned;
    if (str.includes(',') && str.includes('.')) {
      const liComma = str.lastIndexOf(','), liDot = str.lastIndexOf('.');
      cleaned = liComma > liDot
        ? str.replace(/\./g, '').replace(',', '.')
        : str.replace(/,/g, '');
    } else {
      cleaned = str.replace(/\s/g, '').replace(',', '.');
    }
    cleaned = cleaned.replace(/[^0-9.\-]/g, '');
    if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;

    const n = parseFloat(cleaned);
    return isFinite(n) ? n : null;
  }

  function fmtCA(v) {
    const n = parseCA(v);
    if (n === null || !isFinite(n)) return '—';
    return new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(n);
  }

  window.parseCA = parseCA;
  window.fmtCA   = fmtCA;
})();

// ── v5.0 M5 — Skeleton Loaders ──────────────────────────
// Génère un bloc skeleton shimmer à injecter pendant les chargements API.
// Utilise les classes CSS .skeleton-box définies dans base.css v5.0.
function skeletonKanban() {
  return `<div style="display:flex;gap:12px;overflow-x:auto;padding:8px 0">
    ${[1,2,3,4].map(() => `
      <div style="min-width:200px;flex-shrink:0">
        <div class="skeleton-box" style="height:28px;margin-bottom:10px"></div>
        ${[1,2,3].map(() => `<div class="skeleton-box" style="height:80px;margin-bottom:8px"></div>`).join('')}
      </div>`).join('')}
  </div>`;
}

function skeletonListe(lignes = 6) {
  return `<div style="display:flex;flex-direction:column;gap:10px;padding:8px 0">
    ${Array.from({length: lignes}, () =>
      `<div class="skeleton-box" style="height:64px;border-radius:8px"></div>`
    ).join('')}
  </div>`;
}

function skeletonKPI(cols = 4) {
  return `<div class="kpi-grid-layout" style="margin-bottom:20px">
    ${Array.from({length: cols}, () =>
      `<div class="skeleton-box" style="height:90px;border-radius:10px"></div>`
    ).join('')}
  </div>`;
}

// ── svgDonut(segments, opts) — camembert SVG générique, réutilisable ──
// segments: [{label, value, color, onclick?}] — value en compte brut, % calculé ici.
// opts: {size?, epaisseur?, centreLabel?, centreValeur?}
// Chaque secteur cliquable si `onclick` est fourni (attribut JS string, ex. "Foo.bar('x')").
function svgDonut(segments, opts = {}) {
  const size = opts.size || 120;
  const ep   = opts.epaisseur || 18;
  const r    = (size - ep) / 2;
  const cx = size / 2, cy = size / 2;
  const total = (segments || []).reduce((s, x) => s + (Number(x.value) || 0), 0);

  if (!total) {
    return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--c-border)" stroke-width="${ep}"/>
      <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" font-size="11" fill="var(--c-text-2)">—</text>
    </svg>`;
  }

  let angleDebut = -90;
  const arcs = segments.filter(s => s.value > 0).map(s => {
    const part = s.value / total;
    const angleFin = angleDebut + part * 360;
    const grandArc = (angleFin - angleDebut) > 180 ? 1 : 0;
    const toRad = a => (a - 90) * Math.PI / 180;
    // Point de départ/fin sur le cercle moyen (rayon r), tracé en arc épais via stroke.
    const x1 = cx + r * Math.cos(toRad(angleDebut + 90)), y1 = cy + r * Math.sin(toRad(angleDebut + 90));
    const x2 = cx + r * Math.cos(toRad(angleFin + 90)),   y2 = cy + r * Math.sin(toRad(angleFin + 90));
    const pct = Math.round(part * 100);
    const clic = s.onclick ? ` style="cursor:pointer" onclick="${s.onclick}"` : '';
    const html = `<path d="M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${grandArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}"
      fill="none" stroke="${s.color}" stroke-width="${ep}"${clic}><title>${s.label} · ${pct}% (${s.value})</title></path>`;
    angleDebut = angleFin;
    return html;
  }).join('');

  const centreLabel  = opts.centreLabel  || '';
  const centreValeur = opts.centreValeur ?? total;

  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    ${arcs}
    <text x="${cx}" y="${cy - (centreLabel ? 6 : 0)}" text-anchor="middle" dominant-baseline="middle" font-size="18" font-weight="700" fill="var(--c-title)">${centreValeur}</text>
    ${centreLabel ? `<text x="${cx}" y="${cy + 12}" text-anchor="middle" font-size="9" fill="var(--c-text-2)">${centreLabel}</text>` : ''}
  </svg>`;
}

// Légende HTML associée à un svgDonut — même tableau `segments`, avec %.
function legendeDonut(segments) {
  const total = (segments || []).reduce((s, x) => s + (Number(x.value) || 0), 0);
  return `<div class="donut-legende">
    ${(segments || []).map(s => {
      const pct = total > 0 ? Math.round(s.value / total * 100) : 0;
      const clic = s.onclick ? ` style="cursor:pointer" onclick="${s.onclick}"` : '';
      return `<div class="donut-legende-item"${clic}>
        <span class="donut-legende-puce" style="background:${s.color}"></span>
        <span class="donut-legende-lbl">${s.label}</span>
        <span class="donut-legende-val">${s.value} <span style="opacity:.6">(${pct}%)</span></span>
      </div>`;
    }).join('')}
  </div>`;
}

// Badge statut pipeline avec classe CSS v5.0
function statusBadge(statut, label) {
  const s = (statut || '').toLowerCase().replace(/_/g, '_');
  return `<span class="status-badge status-${s}">${label || statut || '—'}</span>`;
}

// ── v5.0 — KPI Card façon DASHBOARD_W09 (barre d'accent + chiffre font-black) ──
// opts: { label, value, unit?, accent?('primary'|'coral'|'indigo'|'teal'|'amber'|'danger'), pills?[{txt,bg,color}], onclick? }
// onclick (string de JS, ex. "Router.aller('#/comptes')") rend la carte cliquable — drill-down desktop (refonte UX Bloc 2).
function kpiCard(opts = {}) {
  const { label = '', value = '0', unit = '', accent = 'primary', pills = [], onclick = '' } = opts;
  const pillsHtml = (pills || []).map(p =>
    `<span class="kpi-pill" style="background:${p.bg || 'rgba(0,80,255,.10)'};color:${p.color || 'var(--c-primary)'}">${p.txt}</span>`
  ).join('');
  const clicAttrs = onclick ? ` style="cursor:pointer" onclick="${onclick}"` : '';
  return `<div class="kpi-card"${clicAttrs}>
    <div class="kpi-accent acc-${accent}"></div>
    <p class="kpi-label">${label}</p>
    <div style="display:flex;align-items:baseline">
      <span class="kpi-value">${value}</span>${unit ? `<span class="kpi-unit">${unit}</span>` : ''}
    </div>
    ${pillsHtml ? `<div class="kpi-pills">${pillsHtml}</div>` : ''}
  </div>`;
}
