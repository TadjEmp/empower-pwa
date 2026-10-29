// ═══════════════════════════════════════
//  ca-canal.js : CA par canal de commande (Tous / Empower / Grossiste)
//  Le CA total reste la référence (objectifs, primes). La part Empower est stockée à côté (CA_EMP_*) ;
//  le grossiste = total - Empower. Le choix est mémorisé et s'applique à toutes les vues : api.js
//  remplace les colonnes CA des comptes (et le CA réalisé des objectifs) par la valeur du canal choisi.
// ═══════════════════════════════════════
window.CACanal = (function () {
  const KEY = 'esi_ca_canal';
  const VALEURS = ['TOUS', 'EMPOWER', 'GROSSISTE'];
  const LIBELLES = { TOUS: 'Tous canaux', EMPOWER: 'Empower', GROSSISTE: 'Grossiste' };
  const PERIODES = ['FY25', 'FY26', 'Q1FY27', 'Q2FY27', 'Q3FY27', 'Q4FY27'];

  function lire() {
    try { const v = localStorage.getItem(KEY); return VALEURS.includes(v) ? v : 'TOUS'; } catch { return 'TOUS'; }
  }
  function actif() { return lire() !== 'TOUS'; }

  const num = v => { const n = typeof window.parseCA === 'function' ? window.parseCA(v) : Number(v); return Number.isFinite(n) ? n : 0; };

  // Valeur de CA d'un compte pour une période, selon le canal choisi.
  function valeur(compte, periode, canal = lire()) {
    const total = num(compte['CA_' + periode]);
    if (canal === 'TOUS') return total;
    const emp = num(compte['CA_EMP_' + periode]);
    return canal === 'EMPOWER' ? emp : Math.max(total - emp, 0);
  }

  // Copie du compte dont les colonnes CA sont celles du canal choisi (le total d'origine reste dans _CA_TOTAL_*).
  function projeter(compte, canal = lire()) {
    if (canal === 'TOUS') return compte;
    const out = { ...compte, _caCanal: canal };
    for (const p of PERIODES) {
      const k = 'CA_' + p;
      if (k in compte) { out['_CA_TOTAL_' + p] = compte[k]; out[k] = Math.round(valeur(compte, p, canal) * 100) / 100; }
    }
    return out;
  }

  function libelleCourant() { return LIBELLES[lire()]; }
  function majLibelles() {
    document.querySelectorAll('[data-caCanal-libelle]').forEach(e => { e.textContent = libelleCourant(); });
    let pastille = document.getElementById('ca-canal-pastille');
    if (!actif()) { if (pastille) pastille.remove(); return; }
    if (!pastille) {
      pastille = document.createElement('div');
      pastille.id = 'ca-canal-pastille';
      pastille.setAttribute('role', 'status');
      pastille.style.cssText = 'position:fixed;top:10px;right:12px;z-index:900;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:600;background:var(--c-primary);color:var(--on-primary,#fff);box-shadow:0 1px 4px rgba(0,0,0,.2);cursor:pointer';
      pastille.title = 'Revenir à tous les canaux';
      pastille.onclick = () => choisir('TOUS');
      document.body.appendChild(pastille);
    }
    pastille.textContent = 'CA : ' + libelleCourant();
  }

  function choisir(canal) {
    if (!VALEURS.includes(canal)) return;
    try { localStorage.setItem(KEY, canal); } catch {}
    majLibelles();
    if (typeof Toast !== 'undefined') Toast.afficher('CA affiché : ' + libelleCourant(), 'info', 1800);
    // Recharge la vue courante avec les nouveaux chiffres (les données en cache sont conservées)
    if (window.Router && Router._resoudre) Router._resoudre();
  }
  function suivant() { choisir(VALEURS[(VALEURS.indexOf(lire()) + 1) % VALEURS.length]); }

  document.addEventListener('DOMContentLoaded', majLibelles);
  return { lire, actif, valeur, projeter, choisir, suivant, libelleCourant, majLibelles, LIBELLES, VALEURS, PERIODES };
})();
