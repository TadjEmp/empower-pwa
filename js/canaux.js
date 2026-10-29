// ═══════════════════════════════════════
//  canaux.js : canaux de vente (liste fermée) et filtre canal global
//  Le canal choisi s'applique à toutes les vues : api.js ne renvoie que les comptes et les leads de ce canal.
//  La base normalise déjà les valeurs (déclencheur esi_normaliser_canal) ; normaliser() protège les données
//  encore en cache ou saisies hors ligne avant la prochaine synchronisation.
// ═══════════════════════════════════════
window.Canaux = (function () {
  const KEY = 'esi_canal_vente';
  const LISTE = ['Revendeur IT', 'Grande Surface', 'Retail', 'Grossiste', 'Empower', 'Autre'];
  const A_QUALIFIER = 'À qualifier';

  function normaliser(brut) {
    const v = String(brut || '').trim().toUpperCase();
    if (!v || v === 'INCONNU' || /^MAIL/.test(v) || /^RDV/.test(v)) return '';
    if (['REVENDEUR', 'IT', 'IT REVENDEUR', 'REVENDEUR IT'].includes(v)) return 'Revendeur IT';
    if (/^INGRAM|SYNNEX|^GROSSISTE|^DISTRIBUTEUR/.test(v)) return 'Grossiste';
    if (/^EMPOWER/.test(v)) return 'Empower';
    if (/^GRANDE SURFACE|^GSS|^GSA/.test(v)) return 'Grande Surface';
    if (/^RETAIL/.test(v)) return 'Retail';
    return 'Autre';
  }

  function lire() {
    try { const v = localStorage.getItem(KEY); return v && (v === A_QUALIFIER || LISTE.includes(v)) ? v : 'TOUS'; } catch { return 'TOUS'; }
  }
  function actif() { return lire() !== 'TOUS'; }
  function garde(ligne, canal = lire()) {
    if (canal === 'TOUS') return true;
    const c = normaliser(ligne.CANAL);
    return canal === A_QUALIFIER ? c === '' : c === canal;
  }

  function optionsHTML(courant = lire()) {
    return ['TOUS', ...LISTE, A_QUALIFIER].map(v =>
      `<option value="${v}" ${v === courant ? 'selected' : ''}>${v === 'TOUS' ? 'Tous les canaux' : v}</option>`).join('');
  }

  function majPastille() {
    let p = document.getElementById('canal-pastille');
    if (!actif()) { if (p) p.remove(); return; }
    if (!p) {
      p = document.createElement('div');
      p.id = 'canal-pastille';
      p.setAttribute('role', 'status');
      p.style.cssText = 'position:fixed;top:10px;right:12px;z-index:900;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:600;background:var(--c-accent,#2563eb);color:var(--on-primary,#fff);box-shadow:0 1px 4px rgba(0,0,0,.2);cursor:pointer';
      p.title = 'Revenir à tous les canaux';
      p.onclick = () => choisir('TOUS');
      document.body.appendChild(p);
    }
    // à côté de la pastille de CA si elle est affichée
    p.style.top = document.getElementById('ca-canal-pastille') ? '40px' : '10px';
    p.textContent = 'Canal : ' + lire();
  }

  function choisir(canal) {
    if (canal !== 'TOUS' && canal !== A_QUALIFIER && !LISTE.includes(canal)) return;
    try { localStorage.setItem(KEY, canal); } catch {}
    document.querySelectorAll('select[data-canal-select]').forEach(s => { s.value = canal; });
    majPastille();
    if (window.Router && Router._resoudre) Router._resoudre();
  }

  document.addEventListener('DOMContentLoaded', majPastille);
  return { LISTE, A_QUALIFIER, normaliser, lire, actif, garde, optionsHTML, choisir, majPastille };
})();
