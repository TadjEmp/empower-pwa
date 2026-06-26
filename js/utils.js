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

function normaliserNom(str = '') {
  return (str || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim().replace(/\s+/g, ' ');
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

function getISOWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return `S${String(Math.ceil((((d - yearStart) / 86400000) + 1) / 7)).padStart(2, '0')}`;
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

function NavBar(actif) {
  // Tous les items de navigation — mobileOnly:false = visible dans sidebar desktop uniquement
  const tousItems = [
    // ── 4 onglets permanents (mobile bottom nav + desktop sidebar) ──
    { id: 'home',        hash: '#/dashboard',          mobileNav: true,
      icone: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>', lbl: 'Home' },
    { id: 'tracker',     hash: '#/empower-tracker',    mobileNav: true,
      icone: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/></svg>', lbl: 'Tracker' },
    { id: 'comptes',     hash: '#/comptes',            mobileNav: true,
      icone: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v8h4"/><path d="M18 9h2a2 2 0 0 1 2 2v11h-4"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>', lbl: 'Comptes' },
    { id: 'reporting',   hash: '#/manager',            mobileNav: true,
      icone: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="4" height="12" x="2" y="6" rx="1"/><rect width="4" height="16" x="9" y="2" rx="1"/><rect width="4" height="8" x="16" y="10" rx="1"/></svg>', lbl: 'Reporting' },
    // ── Modules supplémentaires — sidebar desktop uniquement ──
    { id: 'visites',     hash: '#/visites',            mobileNav: false,
      icone: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>', lbl: 'Mon Planning' },
    { id: 'phoning',     hash: '#/phoning',            mobileNav: false,
      icone: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 9a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>', lbl: 'Phoning' },
    { id: 'photos',      hash: '#/photos',             mobileNav: false,
      icone: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>', lbl: 'Mes Photos' },
    { id: 'historiques', hash: '#/comptes-historiques', mobileNav: false,
      icone: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>', lbl: 'Historique CA' },
    { id: 'objectifs',   hash: '#/objectifs',          mobileNav: false,
      icone: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>', lbl: 'Mes Objectifs' },
    { id: 'primes',      hash: '#/primes',             mobileNav: false,
      icone: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg>', lbl: 'Mes Primes' },
    { id: 'admin',       hash: '#/admin',              mobileNav: false,
      icone: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>', lbl: 'Administration' },
  ];

  const role = (typeof Session !== 'undefined') ? Session.role : null;
  let autorises = [];
  if (role && typeof window.Permissions !== 'undefined') {
    autorises = window.Permissions.onglets(role);
  }

  const items = role
    ? tousItems.filter(i => autorises.indexOf(i.id) !== -1)
    : [];

  const nomUser = (typeof Session !== 'undefined') ? (Session.nom || '') : '';
  const initiale = nomUser ? nomUser.charAt(0).toUpperCase() : '?';

  return `
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
    <nav class="nav-principale">
      <div class="nav-logo">
        ${NORTON_SVG}
        <div class="nav-logo-textes">
          <span class="nav-logo-norton">norton<sup>™</sup></span>
          <span class="nav-logo-esi">EMPOWER SALES INTELLIGENCE</span>
        </div>
      </div>
      ${items.map(i => `
        <a class="nav-item${i.mobileNav ? '' : ' nav-sidebar-only'}${actif === i.id ? ' actif' : ''}" href="${i.hash}">
          <span class="nav-icone">${i.icone}</span><span class="nav-lbl">${i.lbl}</span>
        </a>`).join('')}
      <div class="nav-sidebar-footer">
        <div class="nav-sidebar-user">
          <div class="nav-sidebar-avatar">${initiale}</div>
          <div class="nav-sidebar-user-info">
            <div class="nav-sidebar-nom">${nomUser}</div>
            <div class="nav-sidebar-role">${role || ''}</div>
          </div>
        </div>
        <button class="nav-item nav-sidebar-action" onclick="DrawerMenu._synchro()">
          <span class="nav-icone"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg></span>
          <span class="nav-lbl">Synchroniser</span>
        </button>
        <button class="nav-item nav-sidebar-action nav-sidebar-danger" onclick="DrawerMenu._deconnecter()">
          <span class="nav-icone"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></span>
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
    { id: 'phoning',     hash: '#/phoning',              ico: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 9a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>', lbl: 'Phoning',          roles: ['ADMIN','CDS'] },
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

// Badge statut pipeline avec classe CSS v5.0
function statusBadge(statut, label) {
  const s = (statut || '').toLowerCase().replace(/_/g, '_');
  return `<span class="status-badge status-${s}">${label || statut || '—'}</span>`;
}

// ── v5.0 — KPI Card façon DASHBOARD_W09 (barre d'accent + chiffre font-black) ──
// opts: { label, value, unit?, accent?('primary'|'coral'|'indigo'|'teal'|'amber'|'danger'), pills?[{txt,bg,color}] }
function kpiCard(opts = {}) {
  const { label = '', value = '0', unit = '', accent = 'primary', pills = [] } = opts;
  const pillsHtml = (pills || []).map(p =>
    `<span class="kpi-pill" style="background:${p.bg || 'rgba(0,80,255,.10)'};color:${p.color || 'var(--c-primary)'}">${p.txt}</span>`
  ).join('');
  return `<div class="kpi-card">
    <div class="kpi-accent acc-${accent}"></div>
    <p class="kpi-label">${label}</p>
    <div style="display:flex;align-items:baseline">
      <span class="kpi-value">${value}</span>${unit ? `<span class="kpi-unit">${unit}</span>` : ''}
    </div>
    ${pillsHtml ? `<div class="kpi-pills">${pillsHtml}</div>` : ''}
  </div>`;
}
