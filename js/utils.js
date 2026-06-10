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
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-');
}

// Debounce pour les champs de recherche
function debounce(fn, ms = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// Parse sécurisé JSON
function safeJSON(str, fallback = null) {
  try { return JSON.parse(str); } catch { return fallback; }
}

// Barre de navigation principale (bottom nav mobile / sidebar desktop)
// Design : dashboard_norton_fy27 + web_dashboard_norton_fy27
function NavBar(actif) {
  const items = [
    { id: 'home',     hash: '#/dashboard', icone: '⌂',  lbl: 'Home' },
    { id: 'pipeline', hash: '#/pipeline',  icone: '▤',  lbl: 'Pipeline' },
    { id: 'comptes',  hash: '#/comptes',   icone: '🏢', lbl: 'Mes Comptes' },
    { id: 'phoning',  hash: '#/phoning',   icone: '📞', lbl: 'Phoning' },
    { id: 'primes',   hash: '#/primes',    icone: '🏆', lbl: 'Primes' },
  ];
  return `<nav class="nav-principale">
    <div class="nav-logo">🛡️ <span>ESI</span></div>
    ${items.map(i => `
      <a class="nav-item ${actif === i.id ? 'actif' : ''}" href="${i.hash}">
        <span class="nav-icone">${i.icone}</span><span class="nav-lbl">${i.lbl}</span>
      </a>`).join('')}
  </nav>`;
}
