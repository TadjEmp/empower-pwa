// ═══════════════════════════════════════
//  vue-campagne.js — Onglet « Campagne » (lot 9)
//  Centralise une campagne d'emailing fournisseur (ex. Norton + T'nB) : avancement par commercial,
//  Go/No Go par compte, version d'email, signalements, exclusions fournisseur, retours d'envoi.
//  Tables : campagnes, campagne_comptes, campagne_exclusions (MIGRATION_LOT9_CAMPAGNES.sql).
//  Droits (appliqués par la base, cette vue ne fait que les refléter) :
//    ADMIN / CHANNEL_MANAGER : tout voir, tout modifier (Go/No Go, motif, signalement, version d'email)
//    CDS (commercial)        : voit et met à jour ses comptes (Go/No Go, motif, signalement)
//    EXTERNE (fournisseur)   : lecture seule de toute la campagne
//  Onglet Propositions : ADMIN / CHANNEL_MANAGER / CDS valident ou rejettent les emails trouvés (enrichissement_propositions)
//  Lecture directe via SheetsAPI._sb : les valeurs ne passent pas par neutraliser(), tout est échappé ici (E).
// ═══════════════════════════════════════

window.VueCampagne = {

  state: null,

  VERSIONS: { norton_tnb: "Norton + T'nB", norton_seul: 'Norton seul', tnb_seul: "T'nB seul" },
  ENVOI: { a_envoyer: 'À envoyer', envoye: 'Envoyé', rebond: 'Rebond', desinscrit: 'Désinscrit', exclu: 'Non envoyé (No Go)' },
  PAGE: 60,

  E(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  _peutEcrire() { return ['ADMIN', 'CHANNEL_MANAGER', 'CDS'].includes(Session.role); },
  _peutVersion() { return Session.voitTout(); },
  _voitTousLesCommerciaux() { return Session.voitTout() || Session.estExterne(); },

  _etatInitial() {
    return {
      chargement: true, erreur: null,
      campagnes: [], campagneId: null, lignes: [], exclusions: [], utilisateurs: [], propositions: [], comptesProp: {}, comptesCamp: {}, ouverts: {}, filtreProp: 'proposee', traitement: null,
      onglet: 'synthese',                // synthese | comptes | exclusions | manquants | propositions
      filtreStatut: 'TOUS',              // TOUS | A_TRAITER | GO | NO_GO | SIGNALES
      filtreCds: 'TOUS', filtreVersion: 'TOUS', recherche: '', limite: this.PAGE,
    };
  },

  async init() {
    this.state = this._etatInitial();
    this.render();
    await this._charger();
  },

  async _charger() {
    const s = this.state;
    try {
      const sb = SheetsAPI._sb;
      const [camp, lig, exc, users] = await Promise.all([
        sb.from('campagnes').select('*').order('created_at', { ascending: false }),
        sb.from('campagne_comptes').select('*').order('nom_compte'),
        sb.from('campagne_exclusions').select('*').order('societe'),
        SheetsAPI.lireCDS(),
      ]);
      for (const r of [camp, lig, exc]) if (r.error) throw new Error(r.error.message);
      s.campagnes = camp.data || [];
      s.lignes = lig.data || [];
      s.exclusions = exc.data || [];
      s.utilisateurs = Array.isArray(users) ? users : [];
      await this._chargerComptesCampagne();
      await this._chargerPropositions();
      if (!s.campagneId || !s.campagnes.some(c => c.id === s.campagneId)) {
        const active = s.campagnes.find(c => c.statut !== 'cloturee') || s.campagnes[0];
        s.campagneId = active ? active.id : null;
      }
      s.chargement = false; s.erreur = null;
    } catch (e) {
      s.chargement = false; s.erreur = e.message || String(e);
    }
    this.render();
  },

  // ── Données dérivées ──
  _campagne() { const s = this.state; return s.campagnes.find(c => c.id === s.campagneId) || null; },
  _lignes() { const s = this.state; return s.lignes.filter(l => l.campagne_id === s.campagneId); },
  _exclusions() { const s = this.state; return s.exclusions.filter(x => x.campagne_id === s.campagneId); },
  _nomCds(pin) {
    if (pin == null) return 'Non attribué';
    const u = this.state.utilisateurs.find(x => Number(x.pin) === Number(pin));
    return u ? u.nom : 'PIN ' + pin;
  },
  _exclusIds() { return new Set(this._exclusions().map(x => x.compte_id).filter(Boolean)); },

  _stats(lignes) {
    const n = f => lignes.filter(f).length;
    const total = lignes.length, go = n(l => l.go_no_go === 'go'), noGo = n(l => l.go_no_go === 'no_go');
    return {
      total, go, noGo, aTraiter: total - go - noGo,
      signales: n(l => String(l.signalement || '').trim() !== ''),
      envoyes: n(l => l.statut_envoi === 'envoye'),
      negatifs: n(l => l.statut_envoi === 'rebond' || l.statut_envoi === 'desinscrit'),
      v: { norton_tnb: n(l => l.version_email === 'norton_tnb'), norton_seul: n(l => l.version_email === 'norton_seul'), tnb_seul: n(l => l.version_email === 'tnb_seul') },
      pct: total ? Math.round(((go + noGo) / total) * 100) : 0,
    };
  },

  // ── Actions ──
  setOnglet(o) { this.state.onglet = o; this.render(); },
  setCampagne(id) { this.state.campagneId = id; this.state.limite = this.PAGE; this.render(); },
  setFiltreStatut(v) { this.state.filtreStatut = v; this.state.limite = this.PAGE; this._majListe(); },
  setFiltreCds(v) { this.state.filtreCds = v; this.state.limite = this.PAGE; this._majListe(); },
  setFiltreVersion(v) { this.state.filtreVersion = v; this.state.limite = this.PAGE; this._majListe(); },
  setRecherche(v) { this.state.recherche = v; this.state.limite = this.PAGE; this._majListe(true); },
  plus() { this.state.limite += this.PAGE; this._majListe(); },
  voirComptes(filtreStatut, filtreCds) {
    const s = this.state; s.onglet = 'comptes'; s.filtreStatut = filtreStatut || 'TOUS'; s.filtreCds = filtreCds || 'TOUS'; s.limite = this.PAGE; this.render();
  },

  async _maj(id, champs) {
    const s = this.state, ligne = s.lignes.find(l => l.id === id);
    if (!ligne) return;
    const avant = {}; for (const k of Object.keys(champs)) avant[k] = ligne[k];
    Object.assign(ligne, champs);
    this._majListe();
    try {
      const { data, error } = await SheetsAPI._sb.from('campagne_comptes').update(champs).eq('id', id).select('*');
      if (error) throw new Error(error.message);
      if (!data || !data.length) throw new Error("Modification refusée (ce compte n'est pas dans votre périmètre)");
      Object.assign(ligne, data[0]);   // le serveur peut ajuster le statut d'envoi (No Go → non envoyé)
      this._majListe();
    } catch (e) {
      Object.assign(ligne, avant);
      this._majListe();
      Toast.afficher(e.message || 'Enregistrement impossible', 'erreur');
    }
  },

  setGo(id, valeur) {
    const l = this.state.lignes.find(x => x.id === id); if (!l || !this._peutEcrire()) return;
    const nouveau = l.go_no_go === valeur ? null : valeur;       // un second clic annule
    const champs = { go_no_go: nouveau };
    if (nouveau !== 'no_go') champs.motif_no_go = null;
    this._maj(id, champs);
  },
  setMotif(id, v) { if (this._peutEcrire()) this._maj(id, { motif_no_go: String(v || '').trim() || null }); },
  setSignalement(id, v) { if (this._peutEcrire()) this._maj(id, { signalement: String(v || '').trim() || null }); },
  setVersion(id, v) { if (this._peutVersion() && this.VERSIONS[v]) this._maj(id, { version_email: v }); },

  // ── Filtrage de la liste ──
  _filtrees() {
    const s = this.state, q = s.recherche.trim().toLowerCase();
    return this._lignes().filter(l => {
      if (s.filtreStatut === 'A_TRAITER' && l.go_no_go) return false;
      if (s.filtreStatut === 'GO' && l.go_no_go !== 'go') return false;
      if (s.filtreStatut === 'NO_GO' && l.go_no_go !== 'no_go') return false;
      if (s.filtreStatut === 'SIGNALES' && !String(l.signalement || '').trim()) return false;
      if (s.filtreCds === 'AUCUN' && l.pin_cds != null) return false;
      if (s.filtreCds !== 'TOUS' && s.filtreCds !== 'AUCUN' && String(l.pin_cds) !== s.filtreCds) return false;
      if (s.filtreVersion !== 'TOUS' && l.version_email !== s.filtreVersion) return false;
      if (q && !(String(l.nom_compte || '') + ' ' + String(l.ref_compte || '')).toLowerCase().includes(q)) return false;
      return true;
    });
  },

  // Patch ciblé de la zone liste (jamais un render() complet à la frappe : il détruirait le champ de saisie).
  _majListe(garderFocus) {
    const zone = document.getElementById('cmp-liste-zone');
    if (zone) zone.innerHTML = this._htmlListe();
    const bar = document.getElementById('cmp-filtres-zone');
    if (bar && !garderFocus) bar.innerHTML = this._htmlFiltres();
    const synth = document.getElementById('cmp-synthese-zone');
    if (synth) synth.innerHTML = this._htmlSynthese();
  },

  // ── Rendu ──
  _htmlEntete() {
    const s = this.state, c = this._campagne(), E = this.E.bind(this);
    if (!c) return '';
    let echeance = '';
    if (c.date_limite_retour) {
      const j = Math.ceil((new Date(c.date_limite_retour + 'T23:59:59') - new Date()) / 86400000);
      const txt = j > 1 ? `dans ${j} jours` : j === 1 ? 'demain' : j === 0 ? "aujourd'hui" : `dépassé de ${-j} j`;
      echeance = `<span class="cmp-pastille ${j < 0 ? 'cmp-rouge' : j <= 1 ? 'cmp-orange' : ''}">Retour des onglets : ${E(new Date(c.date_limite_retour + 'T12:00:00').toLocaleDateString('fr-FR'))} (${txt})</span>`;
    }
    const offres = (Array.isArray(c.offres_json) ? c.offres_json : []).map(o => `<li><b>${E(o.fournisseur)}</b> : ${E(o.offre)}${o.prix_ht ? ` — ${E(String(o.prix_ht).replace('.', ','))} € HT${o.remise_pct ? ` (-${E(o.remise_pct)} %)` : ''}` : ''}</li>`).join('');
    const choix = s.campagnes.length > 1
      ? `<select onchange="VueCampagne.setCampagne(this.value)" aria-label="Campagne">${s.campagnes.map(x => `<option value="${E(x.id)}" ${x.id === s.campagneId ? 'selected' : ''}>${E(x.nom)}</option>`).join('')}</select>` : '';
    return `
      <div class="cmp-carte">
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:space-between">
          <div><div class="cmp-titre">${E(c.nom)}</div><div class="cmp-sous">${E(c.description || '')}</div></div>
          ${choix}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
          <span class="cmp-pastille">Statut : ${E(c.statut)}</span>${echeance}
          ${Session.estExterne() ? '<span class="cmp-pastille">Lecture seule</span>' : ''}
        </div>
        ${offres ? `<ul class="cmp-offres">${offres}</ul>` : ''}
      </div>`;
  },

  _htmlSynthese() {
    const E = this.E.bind(this), lignes = this._lignes(), st = this._stats(lignes);
    const tuile = (v, l, cible, couleur) => `<button class="cmp-tuile ${couleur || ''}" ${cible ? `onclick="${cible}"` : 'disabled'}><span class="cmp-chiffre">${v}</span><span class="cmp-lbl">${l}</span></button>`;
    const pins = [...new Set(lignes.map(l => l.pin_cds == null ? null : String(l.pin_cds)))];
    const parCds = pins.map(p => ({ pin: p, nom: this._nomCds(p), ...this._stats(lignes.filter(l => (l.pin_cds == null ? null : String(l.pin_cds)) === p)) }))
      .sort((a, b) => a.aTraiter < b.aTraiter ? 1 : -1);
    const lignesCds = parCds.map(c => `
      <tr>
        <td><b>${E(c.nom)}</b></td>
        <td class="n">${c.total}</td><td class="n cmp-vert">${c.go}</td><td class="n cmp-rouge-t">${c.noGo}</td>
        <td class="n"><a href="#" onclick="VueCampagne.voirComptes('A_TRAITER','${c.pin == null ? 'AUCUN' : E(c.pin)}');return false">${c.aTraiter}</a></td>
        <td class="n">${c.signales || ''}</td>
        <td style="min-width:90px"><div class="cmp-barre"><i style="width:${c.pct}%"></i></div><span class="cmp-sous">${c.pct} %</span></td>
      </tr>`).join('');
    return `
      <div class="cmp-tuiles">
        ${tuile(st.total, 'Comptes', "VueCampagne.voirComptes('TOUS')")}
        ${tuile(st.go, 'Go', "VueCampagne.voirComptes('GO')", 'cmp-t-vert')}
        ${tuile(st.noGo, 'No Go', "VueCampagne.voirComptes('NO_GO')", 'cmp-t-rouge')}
        ${tuile(st.aTraiter, 'À traiter', "VueCampagne.voirComptes('A_TRAITER')", st.aTraiter ? 'cmp-t-orange' : '')}
        ${tuile(st.signales, 'Signalements', "VueCampagne.voirComptes('SIGNALES')", st.signales ? 'cmp-t-orange' : '')}
      </div>
      <div class="cmp-carte">
        <div class="cmp-titre" style="font-size:14px">Avancement : ${st.pct} % des comptes ont un retour</div>
        <div class="cmp-barre cmp-grande"><i style="width:${st.pct}%"></i></div>
        <div class="cmp-sous" style="margin-top:8px">Versions d'email : ${Object.entries(this.VERSIONS).map(([k, v]) => `<b>${E(v)}</b> ${st.v[k]}`).join(' · ')}</div>
        <div class="cmp-sous">Envois : ${st.envoyes} envoyés · ${st.negatifs} rebonds ou désinscriptions</div>
      </div>
      <div class="cmp-carte" style="overflow-x:auto">
        <div class="cmp-titre" style="font-size:14px;margin-bottom:6px">Retours par commercial</div>
        <table class="cmp-table"><thead><tr><th>Commercial</th><th class="n">Comptes</th><th class="n">Go</th><th class="n">No Go</th><th class="n">À traiter</th><th class="n">Signal.</th><th>Avancement</th></tr></thead>
        <tbody>${lignesCds || '<tr><td colspan="7" class="cmp-sous">Aucun compte dans cette campagne pour le moment.</td></tr>'}</tbody></table>
      </div>`;
  },

  _htmlFiltres() {
    const s = this.state, E = this.E.bind(this);
    const chip = (k, lbl) => `<button class="btn-filtre ${s.filtreStatut === k ? 'actif' : ''}" onclick="VueCampagne.setFiltreStatut('${k}')">${lbl}</button>`;
    const pins = [...new Set(this._lignes().map(l => l.pin_cds == null ? 'AUCUN' : String(l.pin_cds)))];
    const selCds = this._voitTousLesCommerciaux() ? `
      <select onchange="VueCampagne.setFiltreCds(this.value)" aria-label="Commercial">
        <option value="TOUS">Tous les commerciaux</option>
        ${pins.map(p => `<option value="${E(p)}" ${s.filtreCds === p ? 'selected' : ''}>${p === 'AUCUN' ? 'Non attribué' : E(this._nomCds(p))}</option>`).join('')}
      </select>` : '';
    const selVersion = `
      <select onchange="VueCampagne.setFiltreVersion(this.value)" aria-label="Version d'email">
        <option value="TOUS">Toutes les versions</option>
        ${Object.entries(this.VERSIONS).map(([k, v]) => `<option value="${k}" ${s.filtreVersion === k ? 'selected' : ''}>${E(v)}</option>`).join('')}
      </select>`;
    return `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        ${chip('TOUS', 'Tous')}${chip('A_TRAITER', 'À traiter')}${chip('GO', 'Go')}${chip('NO_GO', 'No Go')}${chip('SIGNALES', 'Signalés')}${selCds}${selVersion}
      </div>`;
  },

  _htmlLigne(l, exclus) {
    const E = this.E.bind(this), ecrit = this._peutEcrire(), ex = l.compte_id && exclus.has(l.compte_id);
    const go = l.go_no_go;
    const boutons = ecrit
      ? `<button class="cmp-b ${go === 'go' ? 'cmp-b-go' : ''}" onclick="VueCampagne.setGo('${E(l.id)}','go')" aria-pressed="${go === 'go'}">Go</button>
         <button class="cmp-b ${go === 'no_go' ? 'cmp-b-nogo' : ''}" onclick="VueCampagne.setGo('${E(l.id)}','no_go')" aria-pressed="${go === 'no_go'}">No Go</button>`
      : `<span class="cmp-pastille ${go === 'go' ? 'cmp-vert-p' : go === 'no_go' ? 'cmp-rouge' : ''}">${go === 'go' ? 'Go' : go === 'no_go' ? 'No Go' : 'À traiter'}</span>`;
    const versions = this._peutVersion()
      ? `<select onchange="VueCampagne.setVersion('${E(l.id)}',this.value)" aria-label="Version d'email">
          ${Object.entries(this.VERSIONS).filter(([k]) => !ex || k === 'norton_seul').map(([k, v]) => `<option value="${k}" ${l.version_email === k ? 'selected' : ''}>${E(v)}</option>`).join('')}
        </select>`
      : `<span class="cmp-pastille">${E(this.VERSIONS[l.version_email] || l.version_email)}</span>`;
    const motif = go === 'no_go'
      ? (ecrit ? `<input class="cmp-champ" value="${E(l.motif_no_go || '')}" placeholder="Motif du No Go" maxlength="200" onchange="VueCampagne.setMotif('${E(l.id)}',this.value)">`
               : (l.motif_no_go ? `<div class="cmp-sous">Motif : ${E(l.motif_no_go)}</div>` : '')) : '';
    const signal = ecrit
      ? `<input class="cmp-champ" value="${E(l.signalement || '')}" placeholder="Signaler une erreur (version d'email, société, doublon…)" maxlength="300" onchange="VueCampagne.setSignalement('${E(l.id)}',this.value)">`
      : (l.signalement ? `<div class="cmp-signal">⚑ ${E(l.signalement)}</div>` : '');
    return `
      <div class="cmp-ligne">
        <div class="cmp-l1">
          <div><span class="cmp-nom">${E(l.nom_compte)}</span> ${l.ref_compte ? `<span class="cmp-sous">${E(l.ref_compte)}</span>` : ''}
            ${ex ? `<span class="cmp-pastille cmp-orange" title="Société que le fournisseur ne souhaite pas voir contactée pour son offre">Exclu T'nB</span>` : ''}</div>
          <div class="cmp-sous">${E(this._nomCds(l.pin_cds))}</div>
        </div>
        <div class="cmp-l2">${boutons}${versions}<span class="cmp-pastille ${l.statut_envoi === 'rebond' || l.statut_envoi === 'desinscrit' ? 'cmp-rouge' : l.statut_envoi === 'envoye' ? 'cmp-vert-p' : ''}">${E(this.ENVOI[l.statut_envoi] || l.statut_envoi)}</span></div>
        ${motif}${signal}
      </div>`;
  },

  _htmlListe() {
    const s = this.state, liste = this._filtrees(), exclus = this._exclusIds();
    const vue = liste.slice(0, s.limite);
    if (!liste.length) return `<div class="cmp-vide">Aucun compte ne correspond à ces filtres.</div>`;
    return `<div class="cmp-sous" style="margin:8px 0">${liste.length} compte${liste.length > 1 ? 's' : ''}</div>
      ${vue.map(l => this._htmlLigne(l, exclus)).join('')}
      ${liste.length > vue.length ? `<button class="btn-secondaire" style="margin:10px auto;display:block;width:auto;padding:8px 16px" onclick="VueCampagne.plus()">Afficher plus (${liste.length - vue.length} restants)</button>` : ''}`;
  },

  _htmlComptes() {
    return `
      <div class="cmp-carte">
        <input class="cmp-champ" type="search" placeholder="Rechercher un compte ou une référence" value="${this.E(this.state.recherche)}" oninput="VueCampagne.setRecherche(this.value)" aria-label="Rechercher">
        <div id="cmp-filtres-zone" style="margin-top:8px">${this._htmlFiltres()}</div>
      </div>
      <div id="cmp-liste-zone">${this._htmlListe()}</div>`;
  },

  _htmlExclusions() {
    const E = this.E.bind(this), ex = this._exclusions(), lignes = this._lignes();
    if (!ex.length) return `<div class="cmp-vide">Aucune exclusion enregistrée pour cette campagne.</div>`;
    const dansBase = ex.filter(x => x.compte_id).length;
    return `
      <div class="cmp-carte">
        <div class="cmp-sous">Sociétés que le fournisseur ne souhaite pas voir contactées pour son offre : elles ne reçoivent que la version « Norton seul ».
        ${ex.length} société${ex.length > 1 ? 's' : ''}, dont ${dansBase} présente${dansBase > 1 ? 's' : ''} dans la base ESI.</div>
      </div>
      <div class="cmp-carte" style="overflow-x:auto">
        <table class="cmp-table"><thead><tr><th>Société</th><th>Type</th><th>CP / Ville</th><th>Dans la base ESI</th><th>Commercial</th></tr></thead><tbody>
        ${ex.map(x => {
          const l = lignes.find(y => y.compte_id && y.compte_id === x.compte_id);
          return `<tr><td><b>${E(x.societe)}</b>${x.note ? `<div class="cmp-sous">${E(x.note)}</div>` : ''}</td><td>${E(x.type_societe || '')}</td>
            <td>${E([x.code_postal, x.ville].filter(Boolean).join(' '))}</td>
            <td>${x.compte_id ? '<span class="cmp-pastille cmp-vert-p">Oui</span>' : '<span class="cmp-sous">Non</span>'}</td>
            <td>${l ? E(this._nomCds(l.pin_cds)) : ''}</td></tr>`;
        }).join('')}
        </tbody></table>
      </div>`;
  },


  // ── Emails manquants : comptes de la campagne dont la fiche n'a pas d'email ──
  async _chargerComptesCampagne() {
    const s = this.state; s.comptesCamp = {};
    const ids = [...new Set(s.lignes.map(l => l.compte_id).filter(Boolean))];
    for (let i = 0; i < ids.length; i += 100) {
      const r = await SheetsAPI._sb.from('comptes').select('id,email,ville,code_postal,site_web,adresse,tel,contact_nom,contact_fonction,statut_compte,ca_fy26,canal').in('id', ids.slice(i, i + 100));
      if (r.error) throw new Error(r.error.message);
      for (const c of (r.data || [])) s.comptesCamp[c.id] = c;
    }
  },
  _sansEmail(l) { const c = this.state.comptesCamp[l.compte_id]; return !c || !String(c.email || '').trim(); },
  _manquants() { return this._lignes().filter(l => this._sansEmail(l)); },
  basculerManq(cle) { this.state.ouverts[cle] = !this.state.ouverts[cle]; this.render(); },

  _htmlManquants() {
    const s = this.state, E = this.E.bind(this), liste = this._manquants();
    if (!liste.length) return `<div class="cmp-vide">Tous les comptes de la campagne ont un email.</div>`;
    const groupes = {};
    for (const l of liste) { const k = l.pin_cds == null ? 'AUCUN' : String(l.pin_cds); (groupes[k] = groupes[k] || []).push(l); }
    const totaux = {}; for (const l of this._lignes()) { const k = l.pin_cds == null ? 'AUCUN' : String(l.pin_cds); totaux[k] = (totaux[k] || 0) + 1; }
    const cartes = Object.entries(groupes).sort((a, b) => b[1].length - a[1].length).map(([k, ls]) => {
      const ouvert = !!s.ouverts[k], nom = k === 'AUCUN' ? 'Non attribué' : this._nomCds(k);
      const detail = ouvert ? `<div style="margin-top:10px">${ls.slice().sort((a, b) => String(a.nom_compte).localeCompare(String(b.nom_compte))).map(l => {
        const c = s.comptesCamp[l.compte_id] || {};
        const site = /^https?:\/\//i.test(c.site_web || '') ? `<a href="${E(c.site_web)}" target="_blank" rel="noopener noreferrer">${E(c.site_web)}</a>` : '';
        const lieu = [c.code_postal, c.ville].filter(Boolean).join(' ');
        return `<div class="cmp-ligne" style="margin-bottom:6px"><div class="cmp-l1"><div><span class="cmp-nom">${E(l.nom_compte)}</span> ${l.ref_compte ? `<span class="cmp-sous">${E(l.ref_compte)}</span>` : ''}</div>
          <span class="cmp-pastille ${l.go_no_go === 'go' ? 'cmp-vert-p' : l.go_no_go === 'no_go' ? 'cmp-rouge' : ''}">${l.go_no_go === 'go' ? 'Go' : l.go_no_go === 'no_go' ? 'No Go' : 'À traiter'}</span></div>
          <div class="cmp-sous">${c.adresse ? E(c.adresse) + ', ' : ''}${lieu ? E(lieu) : 'Ville inconnue'}</div>
          <div class="cmp-sous">${c.tel ? 'Tél. ' + E(c.tel) : 'Pas de téléphone'}${c.contact_nom ? ' · Contact : ' + E(c.contact_nom) + (c.contact_fonction ? ' (' + E(c.contact_fonction) + ')' : '') : ''}</div>
          <div class="cmp-sous">${site ? site : 'Pas de site connu'} · ${E(c.canal || '')}${!Session.estExterne() && c.statut_compte ? ' · ' + E(c.statut_compte) : ''}${!Session.estExterne() && Number(c.ca_fy26) ? ' · CA FY26 ' + E(Math.round(Number(c.ca_fy26)).toLocaleString('fr-FR')) + ' €' : ''} · Version : ${E(this.VERSIONS[l.version_email] || l.version_email)}</div></div>`;
      }).join('')}</div>` : '';
      return `<div class="cmp-carte">
        <button class="cmp-tuile" style="width:100%;flex-direction:row;justify-content:space-between;align-items:center;padding:10px 12px" aria-expanded="${ouvert}" onclick="VueCampagne.basculerManq('${E(k)}')">
          <span style="text-align:left"><b>${E(nom)}</b><br><span class="cmp-lbl">${ls.length} compte${ls.length > 1 ? 's' : ''} sans email sur ${totaux[k] || ls.length}</span></span>
          <span class="cmp-chiffre">${ls.length}</span><span>${ouvert ? '▾' : '▸'}</span></button>${detail}</div>`;
    }).join('');
    return `<div class="cmp-carte"><div class="cmp-sous">${liste.length} compte${liste.length > 1 ? 's' : ''} dont l'email n'a pas été trouvé (recherche sur site officiel et annuaires). Ouvrez une carte pour voir le détail par commercial ; à compléter directement dans la fiche compte.</div></div>${cartes}`;
  },

  // ── Propositions d'enrichissement (validation) ──
  _peutValider() { return ['ADMIN', 'CHANNEL_MANAGER', 'CDS'].includes(Session.role); },
  CHAMPS: { email: 'Email', tel: 'Téléphone', site_web: 'Site web', contact_nom: 'Contact', contact_fonction: 'Fonction' },
  CONFIANCE: { haute: 'Confiance haute', moyenne: 'Confiance moyenne', faible: 'Confiance faible' },

  async _chargerPropositions() {
    const s = this.state; s.propositions = []; s.comptesProp = {};
    if (!this._peutValider()) return;
    try {
      const sb = SheetsAPI._sb;
      const p = await sb.from('enrichissement_propositions').select('*').order('created_at', { ascending: false });
      if (p.error) throw new Error(p.error.message);
      s.propositions = p.data || [];
      const ids = [...new Set(s.propositions.map(x => x.compte_id))];
      if (ids.length) {
        const c = await sb.from('comptes').select('id,id_compte_gas,nom_compte,email,site_web').in('id', ids);
        if (c.error) throw new Error(c.error.message);
        for (const r of (c.data || [])) s.comptesProp[r.id] = r;
      }
    } catch (e) { s.erreurProp = e.message || String(e); }
  },

  setFiltreProp(v) { this.state.filtreProp = v; this.render(); },

  async decider(id, decision) {
    const s = this.state, p = s.propositions.find(x => x.id === id);
    if (!p || !this._peutValider() || s.traitement) return;
    const compte = s.comptesProp[p.compte_id];
    s.traitement = id; this.render();
    try {
      const sb = SheetsAPI._sb, maintenant = new Date().toISOString();
      if (decision === 'appliquee') {
        if (p.champ !== 'email') throw new Error("Seul l'email peut être appliqué pour l'instant");
        if (!/^[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}$/i.test(p.valeur_proposee)) throw new Error('Adresse invalide : proposition à rejeter');
        if (compte && String(compte.email || '').trim()) throw new Error('Ce compte a déjà un email : proposition à rejeter');
        const r = await sb.from('comptes').update({ email: p.valeur_proposee }).eq('id', p.compte_id).select('id');
        if (r.error) throw new Error(r.error.message);
        if (!r.data || !r.data.length) throw new Error("Modification refusée (ce compte n'est pas dans votre périmètre)");
        // Cible de la campagne : réservé aux gestionnaires (garde base), un refus n'est pas bloquant
        if (Session.voitTout()) await sb.from('campagne_comptes').update({ email_cible: p.valeur_proposee }).eq('compte_id', p.compte_id);
        if (compte) compte.email = p.valeur_proposee;
      }
      const u = await sb.from('enrichissement_propositions').update({ statut: decision, valide_par_pin: Session.pin, date_decision: maintenant }).eq('id', id).select('*');
      if (u.error) throw new Error(u.error.message);
      if (!u.data || !u.data.length) throw new Error('Décision refusée');
      Object.assign(p, u.data[0]);
      Toast.afficher(decision === 'appliquee' ? 'Email appliqué à la fiche compte' : 'Proposition rejetée', 'succes');
    } catch (e) {
      Toast.afficher(e.message || 'Enregistrement impossible', 'erreur');
    }
    s.traitement = null; this.render();
  },

  _htmlPropositions() {
    const s = this.state, E = this.E.bind(this);
    if (s.erreurProp) return `<div class="erreur">Erreur : ${E(s.erreurProp)}</div>`;
    const tout = s.propositions;
    const nb = k => tout.filter(p => k === 'TOUTES' || p.statut === k).length;
    const chip = (k, lbl) => `<button class="btn-filtre ${s.filtreProp === k ? 'actif' : ''}" onclick="VueCampagne.setFiltreProp('${k}')">${lbl} (${nb(k)})</button>`;
    const liste = tout.filter(p => s.filtreProp === 'TOUTES' || p.statut === s.filtreProp);
    const carte = p => {
      const c = s.comptesProp[p.compte_id] || {}, ctl = p.controles_json || {};
      const url = /^https?:\/\//i.test(p.source_url || '') ? p.source_url : '';
      const occupe = s.traitement === p.id;
      const dejaEmail = String(c.email || '').trim() !== '';
      const actions = p.statut === 'proposee'
        ? `<div class="cmp-l2">
             <button class="cmp-b cmp-b-go" ${occupe || dejaEmail ? 'disabled' : ''} onclick="VueCampagne.decider('${E(p.id)}','appliquee')">Valider et appliquer</button>
             <button class="cmp-b" ${occupe ? 'disabled' : ''} onclick="VueCampagne.decider('${E(p.id)}','rejetee')">Rejeter</button>
             ${dejaEmail ? '<span class="cmp-pastille cmp-orange">La fiche a déjà un email</span>' : ''}
           </div>`
        : `<div class="cmp-l2"><span class="cmp-pastille ${p.statut === 'appliquee' ? 'cmp-vert-p' : 'cmp-rouge'}">${p.statut === 'appliquee' ? 'Appliquée' : 'Rejetée'}</span>${p.date_decision ? `<span class="cmp-sous">${E(new Date(p.date_decision).toLocaleDateString('fr-FR'))}</span>` : ''}</div>`;
      return `<div class="cmp-ligne">
        <div class="cmp-l1">
          <div><span class="cmp-nom">${E(c.nom_compte || 'Compte')}</span> <span class="cmp-sous">${E(c.id_compte_gas || '')}</span></div>
          <span class="cmp-pastille ${p.confiance === 'haute' ? 'cmp-vert-p' : p.confiance === 'faible' ? 'cmp-orange' : ''}">${E(this.CONFIANCE[p.confiance] || p.confiance)}</span>
        </div>
        <div style="margin-top:6px"><span class="cmp-sous">${E(this.CHAMPS[p.champ] || p.champ)} proposé :</span> <b>${E(p.valeur_proposee)}</b></div>
        ${ctl.note ? `<div class="cmp-sous">${E(ctl.note)}</div>` : ''}
        ${url ? `<div class="cmp-sous">Source : <a href="${E(url)}" target="_blank" rel="noopener noreferrer">${E(url)}</a></div>` : ''}
        ${actions}
      </div>`;
    };
    return `
      <div class="cmp-carte"><div class="cmp-sous">Adresses trouvées sur les sites officiels des comptes. Rien n'est écrit dans la fiche compte tant que vous ne validez pas. Vérifiez la source avant de valider.</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${chip('proposee', 'À valider')}${chip('appliquee', 'Appliquées')}${chip('rejetee', 'Rejetées')}${chip('TOUTES', 'Toutes')}</div></div>
      ${liste.length ? liste.map(carte).join('') : '<div class="cmp-vide">Aucune proposition dans cette liste.</div>'}`;
  },

  _css() {
    return `<style>
      .cmp-carte{background:var(--c-surface,#fff);border:1px solid var(--c-border,#e3e3e8);border-radius:12px;padding:12px 14px;margin-bottom:12px}
      .cmp-titre{font-weight:700;font-size:16px}.cmp-sous{font-size:12px;color:var(--c-text-2,#6b6b76)}
      .cmp-offres{margin:8px 0 0;padding-left:18px;font-size:13px}
      .cmp-pastille{display:inline-block;font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;background:var(--c-bg,#f1f1f4);color:var(--c-text-2,#555);white-space:nowrap}
      .cmp-orange{background:#fff1dc;color:#a65b00}.cmp-rouge{background:#fde4e4;color:#b42318}.cmp-vert-p{background:#e0f5e6;color:#17713a}
      .cmp-vert{color:#17713a;font-weight:700}.cmp-rouge-t{color:#b42318;font-weight:700}
      .cmp-tuiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;margin-bottom:12px}
      .cmp-tuile{display:flex;flex-direction:column;align-items:center;gap:2px;padding:12px 8px;border:1px solid var(--c-border,#e3e3e8);border-radius:12px;background:var(--c-surface,#fff);cursor:pointer;font:inherit}
      .cmp-tuile:disabled{cursor:default}.cmp-chiffre{font-size:24px;font-weight:700}.cmp-lbl{font-size:12px;color:var(--c-text-2,#6b6b76)}
      .cmp-t-vert .cmp-chiffre{color:#17713a}.cmp-t-rouge .cmp-chiffre{color:#b42318}.cmp-t-orange .cmp-chiffre{color:#a65b00}
      .cmp-barre{height:8px;background:var(--c-bg,#eceef2);border-radius:999px;overflow:hidden}.cmp-barre i{display:block;height:100%;background:#17713a;border-radius:999px}
      .cmp-grande{height:12px;margin-top:8px}
      .cmp-table{width:100%;border-collapse:collapse;font-size:13px}.cmp-table th,.cmp-table td{padding:7px 8px;border-bottom:1px solid var(--c-border,#eee);text-align:left;vertical-align:top}
      .cmp-table .n{text-align:right;white-space:nowrap}
      .cmp-ligne{background:var(--c-surface,#fff);border:1px solid var(--c-border,#e3e3e8);border-radius:12px;padding:10px 12px;margin-bottom:8px}
      .cmp-l1{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}.cmp-nom{font-weight:600}
      .cmp-l2{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:8px}
      .cmp-b{border:1px solid var(--c-border,#d0d0d8);background:var(--c-surface,#fff);border-radius:8px;padding:6px 14px;font:inherit;font-weight:600;cursor:pointer;min-height:36px}
      .cmp-b-go{background:#17713a;border-color:#17713a;color:#fff}.cmp-b-nogo{background:#b42318;border-color:#b42318;color:#fff}
      .cmp-champ{width:100%;box-sizing:border-box;margin-top:8px;border:1px solid var(--c-border,#d0d0d8);border-radius:8px;padding:7px 10px;font:inherit;font-size:13px}
      .cmp-signal{margin-top:8px;font-size:13px;color:#a65b00}.cmp-vide{padding:32px;text-align:center;color:var(--c-text-2,#6b6b76)}
      .cmp-onglets{display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap}
      select{max-width:100%}
    </style>`;
  },

  render() {
    const s = this.state; if (!s) return;
    const app = document.getElementById('app');
    let corps;
    if (s.chargement) corps = '<div class="cmp-vide">Chargement…</div>';
    else if (s.erreur) corps = `<div class="erreur">Erreur : ${this.E(s.erreur)}</div>`;
    else if (!this._campagne()) corps = '<div class="cmp-vide">Aucune campagne en cours.</div>';
    else {
      const onglet = (k, lbl) => `<button class="btn-filtre ${s.onglet === k ? 'actif' : ''}" onclick="VueCampagne.setOnglet('${k}')">${lbl}</button>`;
      corps = `
        ${this._htmlEntete()}
        <div class="cmp-onglets">${onglet('synthese', 'Synthèse')}${onglet('comptes', `Comptes (${this._lignes().length})`)}${onglet('exclusions', `Exclusions (${this._exclusions().length})`)}${onglet('manquants', `Emails manquants (${this._manquants().length})`)}${this._peutValider() ? onglet('propositions', `Propositions (${s.propositions.filter(p => p.statut === 'proposee').length})`) : ''}</div>
        ${s.onglet === 'synthese' ? `<div id="cmp-synthese-zone">${this._htmlSynthese()}</div>` : s.onglet === 'comptes' ? this._htmlComptes() : s.onglet === 'propositions' ? this._htmlPropositions() : s.onglet === 'manquants' ? this._htmlManquants() : this._htmlExclusions()}`;
    }
    app.innerHTML = `
      ${this._css()}
      <header class="header-vue">
        <button onclick="Router.retour()" class="btn-retour">←</button>
        <h1>Campagne</h1>
      </header>
      <div class="q-contenu avec-nav q-contenu-large">${corps}</div>
      ${NavBar('campagne')}`;
  },
};
