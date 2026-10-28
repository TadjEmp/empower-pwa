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
  // Mise en page desktop : synthèse à gauche, tableau daté à droite (une colonne sur mobile).
  blocFiche(c, semaines) {
    const lib = this.libelle(c);
    const fmt = n => Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const lignes = (semaines || []).map(s => {
      const q = this._q(s.Quarter);
      return `<tr><td>${q ? q.q : 'n.c.'} · S${Number(s.Semaine)}</td><td class="num">${Number(s.Unites) || 0}</td>` +
             `<td class="num fort">${fmt(s.CA_EUR)} €</td></tr>`;
    }).join('');
    const tableau = lignes
      ? `<table class="sellin-table">
           <thead><tr><th>Semaine</th><th class="num">Unités</th><th class="num">CA net</th></tr></thead>
           <tbody>${lignes}</tbody>
         </table>`
      : '<p class="sellin-vide-txt">Aucune commande récente rapprochée.</p>';
    return `
      <section class="bloc-fiche sellin-bloc">
        <div class="bloc-titre">SELL IN</div>
        <div class="sellin-grille">
          <div class="sellin-synthese">
            <div class="sellin-etiquette">Dernière commande</div>
            <div class="sellin-valeur">${lib ? this.badge(c) : '<span class="badge-sellin badge-sellin-vide" title="Aucune commande SELL IN rapprochée pour ce compte">Aucun signal</span>'}</div>
            ${c.SellIn_Commercial ? `<div class="sellin-etiquette">Commercial SELL IN</div><div class="sellin-valeur"><strong>${this.esc(c.SellIn_Commercial)}</strong></div>` : ''}
            ${this._ecart(c)}
          </div>
          <div class="sellin-detail">${tableau}</div>
        </div>
      </section>`;
  },

  // Le commercial du fichier SELL IN est un SIGNAL : il n'écrase jamais l'attribution de l'app. Un écart est seulement signalé.
  _ecart(c) {
    const s = String(c.SellIn_Commercial || '').trim();
    if (!s || s === 'NON SUIVI' || !c.Nom_CDS) return '';
    if (normaliserNom(s) === normaliserNom(c.Nom_CDS)) return '';
    return `<div class="sellin-ecart">Écart d'attribution : le SELL IN indique <strong>${this.esc(s)}</strong>, l'app indique <strong>${this.esc(c.Nom_CDS)}</strong>.</div>`;
  },

  // 4 dernières semaines (plus récentes d'abord) d'un compte, depuis sellin_semaines.
  dernieres(semaines, compteUuid, n = 4) {
    return (semaines || [])
      .filter(s => String(s.Compte_ID) === String(compteUuid) && Number(s.CA_EUR) > 0)
      .sort((a, b) => this._ordre(b.Quarter) - this._ordre(a.Quarter) || Number(b.Semaine) - Number(a.Semaine))
      .slice(0, n);
  },
};
