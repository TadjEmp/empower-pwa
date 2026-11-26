// ═══════════════════════════════════════
//  vue-aide.js — Aide & Suggestions (accessible à tous les rôles connectés)
//  Chacun envoie une suggestion / un problème / une question et suit la réponse.
//  L'ADMIN voit tout, change le statut et répond. Table : suggestions (RLS : auteur ou ADMIN).
//  Notifications (NOTIFS) : ADMIN à l'envoi, auteur à la réponse.
// ═══════════════════════════════════════

window.VueAide = {
  PIN_ADMIN: 1000,
  CATEGORIES: { SUGGESTION: 'Suggestion', PROBLEME: 'Problème', QUESTION: 'Question' },
  STATUTS: { NOUVEAU: 'Nouveau', EN_COURS: 'En cours', TRAITE: 'Traité', REFUSE: 'Non retenu' },
  state: { chargement: true, erreur: null, liste: [], categorie: 'SUGGESTION', texte: '', envoi: false, filtre: '' },

  _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  _sb() { return typeof SheetsAPI !== 'undefined' ? SheetsAPI._sb : null; },

  async init() {
    this.state.chargement = true; this.state.erreur = null;
    this.render();
    try {
      const sb = this._sb();
      if (!sb) throw new Error('Connexion indisponible');
      const { data, error } = await sb.from('suggestions').select('*').order('created_at', { ascending: false }).limit(300);
      if (error) throw new Error(error.message);
      this.state.liste = data || [];
    } catch (e) { this.state.erreur = e.message; }
    this.state.chargement = false;
    this.render();
  },

  _notifier(pin, type, message) {
    if (!pin || typeof SheetsAPI === 'undefined') return;
    SheetsAPI.ecrire('EMPOWER_MDB', 'NOTIFS', {
      ID_Notif: genId('NOTIF'), PIN_Destinataire: Number(pin), Type_Notif: type,
      Message: message, ID_Cible: 'AIDE', Statut_Lu: false, Date_Envoi: new Date().toISOString(),
    }).catch(() => {});
  },

  async envoyer() {
    const s = this.state, texte = String(s.texte || '').trim();
    if (texte.length < 3) { Toast.afficher('Écris quelques mots avant d’envoyer', 'warning'); return; }
    if (texte.length > 2000) { Toast.afficher('2000 caractères maximum', 'warning'); return; }
    s.envoi = true; this.render();
    try {
      const { error } = await this._sb().from('suggestions').insert({
        pin_auteur: Session.pin, nom_auteur: Session.nom, role_auteur: Session.role,
        categorie: s.categorie, message: texte, page: (location.hash || '').slice(0, 80),
      });
      if (error) throw new Error(error.message);
      this._notifier(this.PIN_ADMIN, 'SUGGESTION_NOUVELLE', `${this.CATEGORIES[s.categorie]} de ${Session.nom} : ${texte.slice(0, 90)}${texte.length > 90 ? '…' : ''}`);
      s.texte = '';
      Toast.afficher('Merci, c’est envoyé', 'succes');
      s.envoi = false;
      await this.init();
    } catch (e) { s.envoi = false; Toast.afficher('Envoi impossible : ' + e.message, 'erreur'); this.render(); }
  },

  // ADMIN : statut + réponse (la réponse notifie l'auteur)
  async traiter(id) {
    const el = document.getElementById('aide-rep-' + id), st = document.getElementById('aide-st-' + id);
    const s = this.state.liste.find(x => x.id === id);
    if (!s || !el || !st) return;
    const reponse = el.value.trim() || null, statut = st.value;
    try {
      const { error } = await this._sb().from('suggestions').update({
        statut, reponse, traite_par: Session.pin, updated_at: new Date().toISOString(),
      }).eq('id', id);
      if (error) throw new Error(error.message);
      if (reponse && reponse !== s.reponse) this._notifier(s.pin_auteur, 'SUGGESTION_REPONSE', `Réponse à ta ${this.CATEGORIES[s.categorie].toLowerCase()} : ${reponse.slice(0, 100)}${reponse.length > 100 ? '…' : ''}`);
      Toast.afficher('Mis à jour', 'succes');
      await this.init();
    } catch (e) { Toast.afficher('' + e.message, 'erreur'); }
  },

  _carte(x, admin) {
    const e = this._esc, d = new Date(x.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
    const col = { NOUVEAU: '#FF6D68', EN_COURS: '#b7791f', TRAITE: '#1a9e5c', REFUSE: '#6b7780' }[x.statut] || '#6b7780';
    return `<div class="bloc-fiche" style="margin:0 0 10px">
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:12px">
        <strong>${e(this.CATEGORIES[x.categorie] || x.categorie)}</strong>
        <span style="padding:2px 8px;border-radius:10px;background:${col};color:#fff">${e(this.STATUTS[x.statut] || x.statut)}</span>
        ${admin ? `<span>${e(x.nom_auteur || '')} · ${e(x.role_auteur || '')}</span>` : ''}
        <span style="margin-left:auto;color:var(--c-text-2)">${d}</span>
      </div>
      <p style="margin:8px 0;white-space:pre-line;font-size:14px">${e(x.message)}</p>
      ${!admin && x.reponse ? `<div style="border-left:3px solid #FF6D68;padding:4px 10px;font-size:13px"><strong>Réponse</strong><br>${e(x.reponse).replace(/\n/g, '<br>')}</div>` : ''}
      ${admin ? `<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start;margin-top:6px">
          <select id="aide-st-${x.id}" style="padding:6px">${Object.entries(this.STATUTS).map(([k, v]) => `<option value="${k}" ${x.statut === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
          <textarea id="aide-rep-${x.id}" rows="2" placeholder="Réponse (l’auteur est notifié)" style="flex:1;min-width:200px;padding:6px">${e(x.reponse || '')}</textarea>
          <button class="btn-secondaire" style="width:auto;padding:8px 14px" onclick="VueAide.traiter(${x.id})">Enregistrer</button>
        </div>` : ''}
    </div>`;
  },

  render() {
    const app = document.getElementById('app'), s = this.state;
    if (!app) return;
    const admin = Session.estManager(), e = this._esc;
    const FAQ = [
      ['Un lead n’a pas de commercial', 'Le code postal décide du commercial. Si le secteur est partagé ou non couvert, l’administrateur est prévenu et attribue le lead.'],
      ['Je ne vois pas une section', 'Les sections dépendent de ton rôle. Demande à l’administrateur si une section te manque.'],
      ['Mot de passe oublié', 'Demande une réinitialisation à l’administrateur (12 caractères minimum).'],
    ];
    const liste = admin && s.filtre ? s.liste.filter(x => x.statut === s.filtre) : s.liste;
    const nbNouv = s.liste.filter(x => x.statut === 'NOUVEAU').length;
    app.innerHTML = `      <div class="header-vue"><button onclick="Router.retour()" class="btn-retour" aria-label="Retour">←</button><h1>Aide &amp; Suggestions</h1></div>
      <div style="padding:12px 16px 80px;max-width:820px">
        <div class="bloc-fiche">
          <div class="bloc-titre">Envoyer un message</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0">
            ${Object.entries(this.CATEGORIES).map(([k, v]) => `<button class="${s.categorie === k ? 'btn-primaire' : 'btn-secondaire'}" style="width:auto;padding:6px 12px" onclick="VueAide.state.categorie='${k}';VueAide.render()">${v}</button>`).join('')}
          </div>
          <textarea id="aide-texte" rows="4" maxlength="2000" placeholder="Décris ton idée, le problème rencontré ou ta question…" style="width:100%;padding:8px;box-sizing:border-box"
            oninput="VueAide.state.texte=this.value">${e(s.texte)}</textarea>
          <button class="btn-primaire" style="margin-top:8px;width:auto;padding:8px 18px" ${s.envoi ? 'disabled' : ''} onclick="VueAide.envoyer()">${s.envoi ? 'Envoi…' : 'Envoyer'}</button>
        </div>
        <div class="bloc-fiche">
          <div class="bloc-titre" style="display:flex;align-items:center;gap:8px">${admin ? `Messages reçus${nbNouv ? ` (${nbNouv} nouveau${nbNouv > 1 ? 'x' : ''})` : ''}` : 'Mes messages'}
            ${admin ? `<select style="margin-left:auto;padding:4px" onchange="VueAide.state.filtre=this.value;VueAide.render()"><option value="">Tous</option>${Object.entries(this.STATUTS).map(([k, v]) => `<option value="${k}" ${s.filtre === k ? 'selected' : ''}>${v}</option>`).join('')}</select>` : ''}
          </div>
          ${s.chargement ? '<p>Chargement…</p>' : s.erreur ? `<p>Erreur : ${e(s.erreur)}</p>`
            : liste.length ? liste.map(x => this._carte(x, admin)).join('') : '<div class="pas-de-donnees">Aucun message pour le moment.</div>'}
        </div>
        <div class="bloc-fiche">
          <div class="bloc-titre">Questions fréquentes</div>
          ${FAQ.map(([q, r]) => `<details style="margin:6px 0"><summary style="cursor:pointer;font-weight:600">${e(q)}</summary><p style="font-size:13px;margin:6px 0">${e(r)}</p></details>`).join('')}
        </div>
      </div>
      ${NavBar('aide')}`;
  },
};
