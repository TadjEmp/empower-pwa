// ═══════════════════════════════════════════════════════════════════════
//  pilotage-historique.js — Onglet « Historique » du Pilotage : audit des trimestres passés (FY25 à FY27)
//  Sources : table sellin (un revendeur × un trimestre : CA, part Empower, canal) et SELLIN_SEMAINES (unités, semaines, FY27).
//  « Commandes » = revendeurs ayant commandé sur la période : le Sell-In ne contient pas de commande unitaire.
//  Périmètre par profil : la lecture est filtrée côté base (RLS sellin_lecture_par_profil) : un CDS ne voit que ses comptes.
// ═══════════════════════════════════════════════════════════════════════
(function () {
  const FYS = ['FY25', 'FY26', 'FY27'], QS = ['Q1', 'Q2', 'Q3', 'Q4'];
  const num = v => { const n = parseFloat(String(v == null ? '' : v).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
  const eur = n => Math.round(n).toLocaleString('fr-FR') + ' €';
  const E = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  const H = {
    etat: { fy: 'FY27', q: 'TOUS', pin: '', canal: 'TOUS', compte: '', tout: false, rows: null, sem: null, enCours: null, erreur: null },

    charger(force) {
      const s = this.etat;
      if (s.enCours && !force) return s.enCours;
      s.erreur = null;
      s.enCours = Promise.all([
        SheetsAPI.lire('EMPOWER_MDB', 'SELLIN_TRIMESTRES', { nocache: true }),
        SheetsAPI.lire('EMPOWER_MDB', 'SELLIN_SEMAINES', { nocache: true }).catch(() => []),
      ]).then(([rows, sem]) => {
        s.rows = (rows || []).map(r => {
          const m = String(r.Quarter || r.quarter || '').toUpperCase().match(/^(Q[1-4])(FY\d\d)$/);
          return m ? { reseller: String(r.Reseller || r.reseller || '').trim(), n: norm(r.Reseller || r.reseller), q: m[1], fy: m[2], ca: num(r.CA_EUR != null ? r.CA_EUR : r.ca_eur), emp: num(r.CA_Empower != null ? r.CA_Empower : r.ca_empower), canal: String(r.Canal || r.canal || '').trim() } : null;
        }).filter(Boolean);
        s.sem = sem || [];
      }).catch(e => { s.erreur = (e && e.message) || 'Lecture impossible'; s.rows = []; })
        .then(() => { if (window.VuePilotage && VuePilotage.state && VuePilotage.state.onglet === 'historique') VuePilotage.render(); });
      return s.enCours;
    },

    // Comptes du périmètre, indexés par nom normalisé (commercial, fiche, canal).
    _index() {
      const idx = {};
      ((window.VuePilotage && VuePilotage._raw && VuePilotage._raw.comptes) || []).forEach(c => { const k = norm(c.Nom_Compte); if (k && !idx[k]) idx[k] = c; });
      return idx;
    },
    _com(c) { return c && c.PIN_CDS_Assigne ? (window.resolveCDS ? window.resolveCDS(c.PIN_CDS_Assigne) : String(c.PIN_CDS_Assigne)) : 'Non attribué'; },
    // Canal du COMPTE (et non celui de la ligne Sell-In, qui n'indique que le distributeur) : un compte Empower reste Empower même s'il achète aussi chez Ingram / TD Synnex.
    _canalCompte(c, empAny) { return c ? (window.estEmpower && window.estEmpower(c) ? 'Empower' : (empAny ? 'Empower' : 'Grossiste')) : (empAny ? 'Empower' : 'Grossiste'); },

    _versDetail() { setTimeout(() => { const e = document.getElementById('pilo-hist-detail'); if (e && e.scrollIntoView) e.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60); },
    set(k, v) { this.etat[k] = v; this.etat.tout = false; VuePilotage.render(); },
    choisir(fy, q) { Object.assign(this.etat, { fy, q, tout: false }); VuePilotage.render(); this._versDetail(); },
    reinit() { Object.assign(this.etat, { pin: '', canal: 'TOUS', compte: '', tout: false }); VuePilotage.render(); },
    toutAfficher() { this.etat.tout = true; VuePilotage.render(); },

    // Lignes Sell-In du périmètre : commercial, canal du compte et compte choisis (les trimestres/années s'appliquent ensuite).
    _filtrees() {
      const s = this.etat, idx = this._index(), empAny = {};
      (s.rows || []).forEach(r => { if (r.emp > 0) empAny[r.n] = true; });
      const cle = norm(s.compte);
      return (s.rows || []).filter(r => {
        const c = idx[r.n];
        if (s.pin && String((c || {}).PIN_CDS_Assigne || '') !== String(s.pin)) return false;
        if (s.canal !== 'TOUS' && this._canalCompte(c, empAny[r.n]) !== s.canal) return false;
        if (cle && !r.n.includes(cle)) return false;
        return true;
      });
    },

    // Détail par revendeur sur la période choisie.
    _detail() {
      const s = this.etat, idx = this._index(), m = {}, empAny = {};
      (s.rows || []).forEach(r => { if (r.emp > 0) empAny[r.n] = true; });
      this._filtrees().filter(r => (s.fy === 'TOUS' || r.fy === s.fy) && (s.q === 'TOUS' || r.q === s.q) && r.ca !== 0).forEach(r => {
        const x = m[r.n] = m[r.n] || { reseller: r.reseller, distrib: '', ca: 0, emp: 0, qs: new Set() };
        x.ca += r.ca; x.emp += r.emp; x.qs.add(r.q + r.fy);
        if (!x.distrib && r.canal && !/^EMPOWER$/i.test(r.canal)) x.distrib = r.canal;
      });
      return Object.keys(m).map(k => { const c = idx[k], x = m[k]; return { ...x, canal: this._canalCompte(c, empAny[k]), com: this._com(c), id: c ? (c.ID_Compte || c._uuid) : '', nbq: x.qs.size }; }).sort((a, b) => b.ca - a.ca);
    },

    exporter() {
      const s = this.etat, L = this._detail();
      const csv = ['Revendeur;Commercial;Canal du compte;Distributeur;CA total EUR;Via Empower EUR;Via grossiste EUR;Trimestres actifs']
        .concat(L.map(x => [x.reseller, x.com, x.canal, x.distrib, x.ca.toFixed(2), x.emp.toFixed(2), (x.ca - x.emp).toFixed(2), x.nbq].map(v => '"' + String(v).replace(/"/g, '""') + '"').join(';'))).join('\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
      a.download = `sellin-${s.fy}-${s.q}.csv`.toLowerCase(); document.body.appendChild(a); a.click(); a.remove();
    },

    html() {
      const s = this.etat;
      if (!s.enCours) this.charger();
      if (!s.rows) return '<p class="pilo-vide">Chargement de l’historique Sell-In…</p>';
      if (s.erreur) return `<p class="pilo-vide">Historique indisponible : ${E(s.erreur)}</p>`;
      if (!s.rows.length) return '<p class="pilo-vide">Aucune donnée Sell-In dans votre périmètre.</p>';
      const base = this._filtrees(), detail = this._detail();
      const voitTout = Session.voitTout && Session.voitTout();
      const pins = [...new Set(((VuePilotage._raw && VuePilotage._raw.comptes) || []).map(c => c.PIN_CDS_Assigne).filter(Boolean))];

      const listeComptes = [...new Set((s.rows || []).filter(r => r.ca !== 0).map(r => r.reseller))].sort((a, b) => a.localeCompare(b, 'fr')).slice(0, 600);
      // Récapitulatif des 12 trimestres (FY25 à FY27), même périmètre commercial.
      const agg = {};
      base.forEach(r => { const a = agg[r.q + r.fy] = agg[r.q + r.fy] || { ca: 0, emp: 0, n: new Set() }; a.ca += r.ca; a.emp += r.emp; if (r.ca > 0) a.n.add(r.n); });
      const semQ = {};
      (s.sem || []).forEach(r => { const q = String(r.Quarter || '').toUpperCase(), ca = num(r.CA_EUR); if (!q) return; const x = semQ[q] = semQ[q] || { u: 0, w: new Set() }; x.u += num(r.Unites); if (ca > 0) x.w.add(num(r.Semaine)); });
      const periodes = [];
      FYS.slice().reverse().forEach(fy => QS.forEach(q => { if (agg[q + fy]) periodes.push({ fy, q }); }));
      const lignesQ = periodes.map(({ fy, q }) => {
        const a = agg[q + fy], prec = agg[q + 'FY' + (parseInt(fy.slice(2), 10) - 1)], sm = semQ[q + fy];
        const d = prec && prec.ca > 0 ? Math.round((a.ca - prec.ca) / prec.ca * 100) : null;
        const actif = (s.fy === fy || s.fy === 'TOUS') && (s.q === q || s.q === 'TOUS');
        return `<tr class="${actif ? 'sel' : ''}" tabindex="0" role="button" onclick="PilotageHistorique.choisir('${fy}','${q}')" onkeydown="if(event.key==='Enter')PilotageHistorique.choisir('${fy}','${q}')">
          <td><strong>${q} ${fy}</strong></td><td class="n">${a.n.size}</td><td class="n">${eur(a.ca)}</td><td class="n">${eur(a.emp)}</td><td class="n">${eur(a.ca - a.emp)}</td>
          <td class="n">${sm ? Math.round(sm.u).toLocaleString('fr-FR') + ' · S' + sm.w.size : '·'}</td><td class="n">${d == null ? '·' : (d > 0 ? '+' : '') + d + ' %'}</td></tr>`;
      }).join('');

      const tot = detail.reduce((t, x) => t + x.ca, 0), emp = detail.reduce((t, x) => t + x.emp, 0);
      const vus = s.tout ? detail : detail.slice(0, 40);
      const lignesD = vus.map(x => `<tr>
        <td>${x.id ? `<a href="#/compte/${encodeURIComponent(x.id)}" onclick="Router.aller('#/compte/${encodeURIComponent(x.id)}');return false">${E(x.reseller)}</a>` : E(x.reseller)}</td>
        <td>${E(x.com)}</td><td><b>${E(x.canal)}</b>${x.distrib && x.canal === 'Empower' && x.ca - x.emp > 0 ? `<br><small title="Une partie des achats passe par le distributeur">+ ${E(x.distrib)}</small>` : x.distrib && x.canal === 'Grossiste' ? `<br><small>${E(x.distrib)}</small>` : ''}</td><td class="n">${eur(x.ca)}</td><td class="n">${eur(x.emp)}</td><td class="n">${eur(x.ca - x.emp)}</td><td class="n">${x.nbq}</td></tr>`).join('');
      const sel = (cle, vals, v, lib) => `<select aria-label="${lib}" onchange="PilotageHistorique.set('${cle}',this.value)">${vals.map(([k, l]) => `<option value="${k}" ${String(v) === String(k) ? 'selected' : ''}>${E(l)}</option>`).join('')}</select>`;
      const periode = (s.fy === 'TOUS' ? 'Toutes années' : s.fy) + (s.q === 'TOUS' ? '' : ' · ' + s.q);

      return `<style>
        .pilo-hist-f{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px;align-items:center}.pilo-hist-f select{min-height:40px;border-radius:999px;padding:0 14px;border:1px solid var(--border-medium,#ccd);background:var(--bg-surface,#fff);font:inherit;font-size:14px}
        .pilo-hist table{width:100%;border-collapse:collapse;font-size:13px}.pilo-hist th{text-align:left;font-size:12px;color:var(--text-muted,#5b6670);font-weight:600;padding:8px 6px;border-bottom:1px solid var(--border-medium,#ccd);white-space:nowrap}
        .pilo-hist td{padding:9px 6px;border-bottom:1px solid var(--border-light,rgba(52,63,72,.1))}.pilo-hist .n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.pilo-hist th.n{text-align:right}
        .pilo-hist tr[role=button]{cursor:pointer}.pilo-hist tr.sel td{background:rgba(52,63,72,.08)}.pilo-hist-sc{overflow-x:auto}.pilo-hist a{color:inherit;text-decoration:underline}
        .pilo-hist-k{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:0 0 14px}.pilo-hist-k div{background:var(--bg-surface,#fff);border:1px solid var(--border-medium,#ccd);border-radius:var(--radius-lg,16px);padding:12px 14px}.pilo-hist-k small{display:block;font-size:12px;color:var(--text-muted,#5b6670)}.pilo-hist-k strong{font-size:22px}
      </style>
      <div class="pilo-hist">
        <div class="pilo-hist-f" role="group" aria-label="Filtres de l’historique">
          ${sel('fy', [['TOUS', 'Toutes années'], ...FYS.slice().reverse().map(f => [f, f])], s.fy, 'Année fiscale')}
          ${sel('q', [['TOUS', 'Tous trimestres'], ...QS.map(q => [q, q])], s.q, 'Trimestre')}
          ${voitTout ? sel('pin', [['', 'Vue consolidée'], ...pins.map(p => [p, window.resolveCDS ? window.resolveCDS(p) : p])], s.pin, 'Commercial') : ''}
          ${sel('canal', [['TOUS', 'Tous canaux'], ['Empower', 'Compte Empower'], ['Grossiste', 'Compte grossiste']], s.canal, 'Canal du compte')}
          <input type="search" list="pilo-hist-cptes" placeholder="Rechercher un compte…" aria-label="Compte" value="${E(s.compte)}" onchange="PilotageHistorique.set('compte',this.value)" style="min-height:40px;border-radius:999px;padding:0 14px;border:1px solid var(--border-medium,#ccd);background:var(--bg-surface,#fff);font:inherit;font-size:14px;min-width:200px"/>
          <datalist id="pilo-hist-cptes">${listeComptes.map(n => `<option value="${E(n)}"></option>`).join('')}</datalist>
          ${(s.pin || s.canal !== 'TOUS' || s.compte) ? '<button class="btn-filtre" onclick="PilotageHistorique.reinit()">Réinitialiser</button>' : ''}
          <button class="btn-filtre" onclick="PilotageHistorique.exporter()" ${detail.length ? '' : 'disabled'}>Exporter en CSV</button>
        </div>
        <div class="pilo-hist-k">
          <div><small>Sell-In · ${E(periode)}</small><strong>${eur(tot)}</strong></div>
          <div><small>dont via Empower</small><strong>${eur(emp)}</strong></div>
          <div><small>dont via grossiste</small><strong>${eur(tot - emp)}</strong></div>
          <div><small>Revendeurs ayant commandé</small><strong>${detail.length}</strong></div>
        </div>
        <section class="pilo-panneau" style="margin-bottom:14px"><div class="pilo-panneau-t"><div><span class="pilo-eyebrow">Audit · trimestres</span><h3>Montants par trimestre</h3></div></div>
          <div class="pilo-hist-sc"><table><thead><tr><th>Trimestre</th><th class="n">Revendeurs</th><th class="n">CA</th><th class="n">Via Empower</th><th class="n">Via grossiste</th><th class="n">Unités · semaines</th><th class="n">vs N-1</th></tr></thead><tbody>${lignesQ}</tbody></table></div>
          <p class="pilo-note" style="margin-top:8px;font-size:12px">Un revendeur ayant commandé = un revendeur avec un montant sur le trimestre (le Sell-In ne détaille pas les commandes unitaires). « Via Empower » = achats passés par le portail Empower, « via grossiste » = achats chez Ingram / TD Synnex. Le canal d'un compte est celui de sa fiche : un compte Empower reste Empower même s'il achète aussi chez un grossiste. Unités et semaines : FY27 seulement. Cliquez une ligne pour afficher son détail.</p></section>
        <section class="pilo-panneau" id="pilo-hist-detail"><div class="pilo-panneau-t"><div><span class="pilo-eyebrow">Audit · ${E(periode)}</span><h3>Détail par revendeur</h3></div></div>
          ${detail.length ? `<div class="pilo-hist-sc"><table><thead><tr><th>Revendeur</th><th>Commercial</th><th>Canal du compte</th><th class="n">CA</th><th class="n">Via Empower</th><th class="n">Via grossiste</th><th class="n">Trim.</th></tr></thead><tbody>${lignesD}</tbody></table></div>
          ${!s.tout && detail.length > 40 ? `<button class="btn-filtre" style="margin-top:10px" onclick="PilotageHistorique.toutAfficher()">Afficher les ${detail.length} revendeurs</button>` : ''}` : '<p class="pilo-vide">Aucun montant sur cette période.</p>'}
        </section>
      </div>`;
    },
  };
  window.PilotageHistorique = H;
})();
