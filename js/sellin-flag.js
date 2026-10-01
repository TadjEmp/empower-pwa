// ═══════════════════════════════════════
//  sellin-flag.js — Lot 2 (10/2026) : flag « dernière semaine de commande SELL IN ».
//  Affiche « Q2 · S12 » = dernière semaine (du trimestre) avec CA net > 0, calculée à
//  l'import (edge function sync-sellin-semaines) et stockée sur comptes.sellin_*.
//  Le flag SIGNALE seulement ; aucune règle de fraîcheur / couleur d'âge (décision métier).
// ═══════════════════════════════════════
window.SellInFlag = {
  _parNom: new Map(),

  _q(quarter) { const m = /^(Q[1-4])FY(\d{2})$/.exec(quarter || ''); return m ? { q: m[1], fy: '20' + m[2] } : null; },
  _ordre(quarter) { const m = /^Q([1-4])FY(\d{2})$/.exec(quarter || ''); return m ? Number(m[2]) * 10 + Number(m[1]) : 0; },
  esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },

  // « Q2 · S12 » ou null si le compte n'a aucun signal SELL IN.
  libelle(c) {
    const q = this._q(c && c.SellIn_Dernier_Quarter);
    const s = Number(c && c.SellIn_Derniere_Semaine);
    return q && s ? `${q.q} · S${s}` : null;
  },

  badge(c) {
    const lib = this.libelle(c);
    if (!lib) return '';
    const q = this._q(c.SellIn_Dernier_Quarter);
    const titre = `SELL IN : dernière commande en semaine ${Number(c.SellIn_Derniere_Semaine)} du ${q.q} FY${q.fy.slice(2)}`;
    return `<span class="badge-sellin" title="${this.esc(titre)}">${lib}</span>`;
  },

  // Tracker : les leads ne portent pas le flag, on le retrouve par nom normalisé sur les comptes.
  indexer(comptes) {
    this._parNom = new Map();
    for (const c of comptes || []) if (this.libelle(c)) this._parNom.set(normaliserNom(c.Nom_Compte || ''), c);
  },
  pourNom(nom) { return this._parNom.get(normaliserNom(nom || '')) || null; },
  badgePourNom(nom) { const c = this.pourNom(nom); return c ? this.badge(c) : ''; },

  // Fiche compte : flag + commercial SELL IN (signal) + 4 dernières semaines avec montants.
  blocFiche(c, semaines) {
    const lib = this.libelle(c);
    const lignes = (semaines || []).map(s => {
      const q = this._q(s.Quarter);
      return `<tr><td>${q ? q.q : '—'} · S${Number(s.Semaine)}</td><td style="text-align:right">${Number(s.Unites) || 0} u.</td>` +
             `<td style="text-align:right;font-weight:600">${Number(s.CA_EUR).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</td></tr>`;
    }).join('');
    return `
      <div class="bloc-fiche">
        <div class="bloc-titre">📦 SELL IN</div>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:13px">
          ${lib ? this.badge(c) : '<span class="badge-sellin badge-sellin-vide" title="Aucune commande SELL IN rapprochée pour ce compte">—</span>'}
          <span style="color:var(--c-text-2)">${lib ? 'Dernière commande SELL IN' : 'Aucun signal SELL IN'}</span>
          ${c.SellIn_Commercial ? `<span style="margin-left:auto;font-size:12px;color:var(--c-text-2)">Commercial SELL IN : <strong>${this.esc(c.SellIn_Commercial)}</strong></span>` : ''}
        </div>
        ${lignes ? `<table style="width:100%;font-size:12px;margin-top:8px;border-collapse:collapse"><tbody>${lignes}</tbody></table>` : ''}
      </div>`;
  },

  // 4 dernières semaines (plus récentes d'abord) d'un compte, depuis sellin_semaines.
  dernieres(semaines, compteUuid, n = 4) {
    return (semaines || [])
      .filter(s => String(s.Compte_ID) === String(compteUuid) && Number(s.CA_EUR) > 0)
      .sort((a, b) => this._ordre(b.Quarter) - this._ordre(a.Quarter) || Number(b.Semaine) - Number(a.Semaine))
      .slice(0, n);
  },
};
