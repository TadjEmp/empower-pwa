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
  return (str || '').toUpperCase().trim().replace(/\s+/g, ' ');
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
  const items = [
    { id: 'home',        hash: '#/dashboard',           icone: '⌂',  lbl: 'Home' },
    { id: 'tracker',     hash: '#/empower-tracker',     icone: '▤',  lbl: 'Tracker' },
    { id: 'historiques', hash: '#/comptes-historiques', icone: '🏢', lbl: 'Comptes' },
    { id: 'phoning',     hash: '#/phoning',             icone: '📞', lbl: 'Phoning' },
    { id: 'visites',     hash: '#/visites',             icone: '📅', lbl: 'Visites' },
    { id: 'objectifs',   hash: '#/objectifs',           icone: '🎯', lbl: 'Objectifs' },
    { id: 'primes',      hash: '#/primes',              icone: '🏆', lbl: 'Primes' },
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
