// ═══════════════════════════════════════
//  utils.js — Fonctions utilitaires globales
//  EMPOWER v4.1 — Marvesting FY27
// ═══════════════════════════════════════

function genId(prefix = 'ID') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function normaliserNom(str = '') {
  return (str || '').toUpperCase().trim().replace(/\s+/g, ' ');
}

function formatEuro(val) {
  return Number(val || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
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
function NavBar(actif) {
  const items = [
    { id: 'home',     hash: '#/dashboard', icone: '⌂',  lbl: 'Home' },
    { id: 'pipeline', hash: '#/pipeline',  icone: '▤',  lbl: 'Pipeline' },
    { id: 'comptes',  hash: '#/comptes',   icone: '🏢', lbl: 'Comptes' },
    { id: 'phoning',  hash: '#/phoning',   icone: '📞', lbl: 'Phoning' },
    { id: 'primes',   hash: '#/primes',    icone: '🏆', lbl: 'Primes' },
  ];
  return `
    <div class="app-brand-bar">
      <div class="app-brand-logo">
        ${NORTON_SVG}
        <span class="brand-norton-txt">norton</span><sup class="brand-tm">™</sup>
      </div>
      <span class="app-brand-sep">|</span>
      <span class="app-brand-esi">EMPOWER SALES INTELLIGENCE</span>
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
        <a class="nav-item ${actif === i.id ? 'actif' : ''}" href="${i.hash}">
          <span class="nav-icone">${i.icone}</span><span class="nav-lbl">${i.lbl}</span>
        </a>`).join('')}
    </nav>`;
}
