// ═══════════════════════════════════════════════════════════════════════
//  admin-equipe-secteurs.js — Lot 3
//  · EquipeContacts : cartes de visite des commerciaux et sourceurs
//  · AdminSecteurs  : table département / CP → commercial (paramétrable,
//    historisée dans le journal d'actions)
//  Règle d'ajout de coordonnées : toute nouvelle coordonnée se renseigne ici
//  (EquipeContacts.PERSONNES) ; une coordonnée absente reste « à renseigner »,
//  jamais déduite.
// ═══════════════════════════════════════════════════════════════════════
const _esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

window.EquipeContacts = {
  PERSONNES: [
    { pin: 1000, nom: 'Tadjidine Soefou',  ini: 'TS', role: 'Admin · manager commercial',      mail: 't.soefou@agence-impact.com',   tel: '0785463147' },
    { pin: 4001, nom: 'Lyes Daoud',        ini: 'LD', role: 'Commercial terrain (CDS)',        mail: 'lm.daoud@agence-impact.com',   tel: '0684509856' },
    { pin: 4002, nom: 'Mehdi Hocine',      ini: 'MH', role: 'Commercial terrain (CDS)',        mail: 'm.hocine@agence-impact.com',   tel: '0643220161' },
    { pin: 4003, nom: 'Johanne Lhermitte', ini: 'JL', role: 'Commercial terrain (CDS)',        mail: 'j.lhermitte@agence-impact.com', tel: '0647331304' },
    { pin: null, nom: 'Alexandra',         ini: 'AL', role: 'Channel manager · source les leads', mail: null, tel: null },
  ],
  parPin(pin) { return this.PERSONNES.find(p => p.pin != null && Number(p.pin) === Number(pin)) || null; },
  fmtTel: t => String(t).replace(/(\d{2})(?=\d)/g, '$1 ').trim(),

  carte(p, extra = '') {
    if (!p) return '';
    const tel = p.tel ? `<a href="tel:+33${p.tel.slice(1)}">${this.fmtTel(p.tel)}</a>` : '<span class="vc-nc">À renseigner</span>';
    const mail = p.mail ? `<a href="mailto:${_esc(p.mail)}">${_esc(p.mail)}</a>` : '<span class="vc-nc">À renseigner</span>';
    return `<div class="vc">
      <div class="vc-h"><span class="vc-av">${_esc(p.ini)}</span><div><strong>${_esc(p.nom)}</strong><small>${_esc(p.role)}</small></div></div>
      <dl class="vc-d"><dt>Mobile</dt><dd>${tel}</dd><dt>E-mail</dt><dd>${mail}</dd>${extra}</dl>
      ${(p.tel || p.mail) ? `<div class="vc-a">${p.tel ? `<a class="btn-secondaire" href="tel:+33${p.tel.slice(1)}">Appeler</a>` : ''}${p.mail ? `<a class="btn-secondaire" href="mailto:${_esc(p.mail)}">E-mail</a>` : ''}</div>` : ''}
    </div>`;
  },

  // Bloc compact pour la fiche compte : le commercial en charge
  carteDuCommercial(pin) {
    const p = this.parPin(pin);
    return p ? `<div class="bloc-fiche"><div class="bloc-titre">Commercial en charge</div>${this.carte(p)}</div>` : '';
  },

  html() {
    return `<div class="bloc-fiche"><div class="bloc-titre">Équipe et contacts</div>
      <div class="vc-grille">${this.PERSONNES.map(p => {
        const n = AdminSecteurs.nbDepartements(p.pin);
        return this.carte(p, n != null ? `<dt>Secteur</dt><dd>${n} département${n > 1 ? 's' : ''}</dd>` : '');
      }).join('')}</div>
      <p style="font-size:11px;color:var(--c-text-2);margin-top:10px">Les coordonnées manquantes restent « à renseigner » : aucune donnée n'est déduite.</p></div>`;
  },
};

window.AdminSecteurs = {
  state: { lignes: null, log: null, chargement: false, filtre: '', message: '' },

  peutEditer() { return Session.estManager() || Session.estChannel() || Session.estExterne(); },

  nbDepartements(pin) {
    if (pin == null || !this.state.lignes) return null;
    return this.state.lignes.filter(l => l.statut === 'ACTIF' && l.portee === 'DEPARTEMENT' && Number(l.pin_cds) === Number(pin)).length;
  },

  async charger() {
    if (this.state.chargement) return;
    this.state.chargement = true;
    try {
      const sb = SheetsAPI._sb;
      const [a, b] = await Promise.all([
        sb.from('secteurs_cp').select('*').order('code'),
        sb.from('attributions_leads_log').select('*').order('created_at', { ascending: false }).limit(30),
      ]);
      this.state.lignes = a.data || [];
      this.state.log = b.data || [];
    } catch (e) { this.state.message = 'Chargement impossible : ' + (e.message || e); this.state.lignes = this.state.lignes || []; }
    this.state.chargement = false;
    if (typeof VueAdmin !== 'undefined') VueAdmin.render();
  },

  async _tracer(resume) {
    try {
      await SheetsAPI.ecrire('EMPOWER_MDB', 'ACTIONS', {
        ID_Action: genId('SECT'), Date_Action: new Date().toISOString(), Type_Action: 'SECTEUR_CP',
        Source: 'ESI_V21', PIN_CDS: Session.pin, Nom_Compte: resume, Statut_Avant: '', Statut_Apres: '',
        Resum_IA: '', GPS_Lat: '', GPS_Lng: '', Timestamp: new Date().toISOString(),
      });
    } catch { /* trace non bloquante */ }
  },

  setFiltre(v) { this.state.filtre = v; VueAdmin.render(); },

  async changer(id, pin) {
    if (!this.peutEditer()) return;
    const l = this.state.lignes.find(x => x.id === id); if (!l) return;
    const nouveau = pin === '' ? null : Number(pin);
    const { error } = await SheetsAPI._sb.from('secteurs_cp')
      .update({ pin_cds: nouveau, maj_par: Number(Session.pin), updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { Toast.afficher('Modification refusée : ' + error.message, 'erreur'); return; }
    const avant = l.pin_cds;
    l.pin_cds = nouveau; l.maj_par = Number(Session.pin);
    this._tracer(`${l.portee} ${l.code} : ${avant ?? 'aucun'} → ${nouveau ?? 'aucun'}`);
    Toast.afficher(`Secteur ${l.code} mis à jour`, 'succes');
    VueAdmin.render();
  },

  async basculer(id) {
    if (!this.peutEditer()) return;
    const l = this.state.lignes.find(x => x.id === id); if (!l) return;
    const statut = l.statut === 'ACTIF' ? 'INACTIF' : 'ACTIF';
    const { error } = await SheetsAPI._sb.from('secteurs_cp').update({ statut, maj_par: Number(Session.pin), updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { Toast.afficher('Modification refusée : ' + error.message, 'erreur'); return; }
    l.statut = statut; this._tracer(`${l.portee} ${l.code} : ${statut}`); VueAdmin.render();
  },

  async ajouter() {
    if (!this.peutEditer()) return;
    const portee = document.getElementById('sec-portee').value;
    const code = document.getElementById('sec-code').value.trim().toUpperCase().replace(/\s/g, '');
    const pin = document.getElementById('sec-pin').value;
    const ok = portee === 'CP' ? /^([0-9]{5}|2[AB][0-9]{3})$/.test(code) : /^([0-9]{2}|2[AB]|97[0-9]|98[0-9])$/.test(code);
    if (!ok || !pin) { Toast.afficher(portee === 'CP' ? 'Code postal à 5 chiffres requis' : 'Département à 2 chiffres requis', 'erreur'); return; }
    const { data, error } = await SheetsAPI._sb.from('secteurs_cp')
      .insert({ portee, code, pin_cds: Number(pin), statut: 'ACTIF', maj_par: Number(Session.pin), note: 'Ajout manuel' }).select().single();
    if (error) { Toast.afficher(error.code === '23505' ? 'Ce secteur existe déjà' : 'Ajout refusé : ' + error.message, 'erreur'); return; }
    this.state.lignes.push(data); this.state.lignes.sort((a, b) => a.code.localeCompare(b.code));
    this._tracer(`${portee} ${code} ajouté → ${pin}`); Toast.afficher('Secteur ajouté', 'succes'); VueAdmin.render();
  },

  html() {
    const s = this.state;
    if (!s.lignes) { if (!s.chargement) this.charger(); return '<div class="bloc-fiche"><div class="bloc-titre">Secteurs</div><p style="font-size:13px">Chargement…</p></div>'; }
    const edit = this.peutEditer();
    const cds = EquipeContacts.PERSONNES.filter(p => p.pin != null);
    const opt = sel => `<option value="">Aucun</option>` + cds.map(p => `<option value="${p.pin}" ${Number(sel) === p.pin ? 'selected' : ''}>${_esc(p.nom)}</option>`).join('');
    const f = s.filtre.trim().toUpperCase();
    const lignes = s.lignes.filter(l => !f || l.code.startsWith(f));
    const RES = { ATTRIBUE: 'Attribué', MULTI_SECTEUR: 'Secteur partagé', NON_COUVERT: 'Non couvert', CP_INVALIDE: 'CP invalide' };
    return `<div class="bloc-fiche"><div class="bloc-titre">Secteurs : département ou code postal → commercial</div>
      <p style="font-size:12px;color:var(--c-text-2);margin:0 0 10px">Un lead sans commercial choisi est attribué selon ce tableau. Un code postal exact prime sur son département. Département partagé, non couvert ou code invalide : le lead reste à attribuer et l'ADMIN est notifié.</p>
      <input class="q-input" placeholder="Filtrer par code (ex. 74)" value="${_esc(s.filtre)}" oninput="AdminSecteurs.setFiltre(this.value)" style="margin-bottom:10px"/>
      ${edit ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        <select id="sec-portee" class="q-input" style="width:auto"><option value="DEPARTEMENT">Département</option><option value="CP">Code postal</option></select>
        <input id="sec-code" class="q-input" style="width:110px" placeholder="Code"/>
        <select id="sec-pin" class="q-input" style="width:auto">${opt('')}</select>
        <button class="btn-secondaire" style="width:auto" onclick="AdminSecteurs.ajouter()">Ajouter</button></div>` : '<p style="font-size:12px">Lecture seule.</p>'}
      <div style="max-height:420px;overflow:auto"><table class="tbl-secteurs"><thead><tr><th>Code</th><th>Portée</th><th>Commercial</th><th>Partagé</th><th>Statut</th></tr></thead><tbody>
      ${lignes.map(l => `<tr class="${l.statut !== 'ACTIF' ? 'sec-off' : ''}"><td><strong>${_esc(l.code)}</strong></td><td>${l.portee === 'CP' ? 'CP' : 'Dép.'}</td>
        <td>${edit ? `<select class="q-input" onchange="AdminSecteurs.changer(${l.id}, this.value)">${opt(l.pin_cds)}</select>` : _esc((EquipeContacts.parPin(l.pin_cds) || {}).nom || 'Aucun')}</td>
        <td>${l.partage ? 'Oui' : ''}</td>
        <td>${edit ? `<button class="btn-lien" onclick="AdminSecteurs.basculer(${l.id})">${l.statut === 'ACTIF' ? 'Actif' : 'Inactif'}</button>` : _esc(l.statut)}</td></tr>`).join('')}
      </tbody></table></div></div>
      ${EquipeContacts.PERSONNES.length ? '' : ''}
      <div class="bloc-fiche"><div class="bloc-titre">Dernières attributions automatiques</div>
      ${(s.log && s.log.length) ? `<table class="tbl-secteurs"><thead><tr><th>Date</th><th>CP</th><th>Résultat</th><th>Commercial</th><th>Règle</th></tr></thead><tbody>
        ${s.log.map(r => `<tr><td>${new Date(r.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td><td>${_esc(r.cp_saisi)}</td><td>${RES[r.resultat] || _esc(r.resultat)}</td><td>${_esc((EquipeContacts.parPin(r.pin_cds) || {}).nom || '')}</td><td>${_esc(r.regle)}</td></tr>`).join('')}</tbody></table>`
        : '<p style="font-size:12px;color:var(--c-text-2)">Aucune attribution enregistrée pour le moment.</p>'}</div>`;
  },
};
