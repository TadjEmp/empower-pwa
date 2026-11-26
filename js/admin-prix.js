// ═══════════════════════════════════════════════════════════════════════
//  admin-prix.js — Réglages › Prix et cotations (Administration)
//  · Prix d'achat HT par canal (Empower, Tech Data, Ingram) et PVP TTC conseillé, par produit.
//  · Cotations datées : remise en % ou prix cotés par produit, sur les canaux grossistes, pour une période.
//    Une cotation active (actif et début <= jour <= fin) baisse automatiquement les prix grossistes dans tous les
//    calculs de marge (Coach, générateurs de devis). Les prix Empower ne sont jamais touchés par une cotation.
//  Droits : lecture pour les profils de gestion, écriture ADMIN et CHANNEL_MANAGER (imposée aussi par la base).
//  Les modifications sont tracées dans le journal d'actions.
// ═══════════════════════════════════════════════════════════════════════
window.AdminPrix = (function () {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const eur = n => n == null ? 'n.c.' : Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const jj = d => { const s = String(d || '').slice(0, 10); return s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : ''; };
  const aujourdhui = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const CANAUX = { td: 'Tech Data', ingram: 'Ingram' };
  const S = { chargement: false, charge: false, message: '', cotations: [], produits: [], brouillon: { libelle: '', debut: '', fin: '', td: true, ingram: true, remise: '', prix: {} } };

  const peutEditer = () => (Session.estManager() || Session.estChannel());
  const rendre = () => { if (typeof VueAdmin !== 'undefined') VueAdmin.render(); };

  async function tracer(resume) {
    try {
      await SheetsAPI.ecrire('EMPOWER_MDB', 'ACTIONS', {
        ID_Action: genId('PRIX'), Date_Action: new Date().toISOString(), Type_Action: 'PRIX_CATALOGUE',
        Source: 'ESI_V21', PIN_CDS: Session.pin, Nom_Compte: resume, Statut_Avant: '', Statut_Apres: '',
        Resum_IA: '', GPS_Lat: '', GPS_Lng: '', Timestamp: new Date().toISOString(),
      });
    } catch { /* trace non bloquante */ }
  }

  async function charger() {
    if (S.chargement) return; S.chargement = true; S.message = '';
    try {
      const r = await window.Catalogue.charger(SheetsAPI._sb);
      S.produits = window.Catalogue.produits; S.cotations = window.Catalogue.cotations || [];
      if (r.source !== 'base') S.message = 'Prix de la base indisponibles : catalogue de février 2026 affiché en lecture seule.';
      S.charge = true;
    } catch (e) { S.message = 'Chargement impossible : ' + (e.message || e); }
    S.chargement = false; rendre();
  }

  const statut = c => { const t = aujourdhui(); if (c.actif === false) return ['Désactivée', 'off']; if (t < c.debut) return ['À venir', 'venir']; if (t > c.fin) return ['Terminée', 'off']; return ['En cours', 'on']; };
  const num = v => { const t = String(v == null ? '' : v).trim().replace(',', '.'); if (t === '') return null; const n = Number(t); return Number.isFinite(n) && n >= 0 ? n : NaN; };

  // Enregistre un prix (champ : pvp_ttc | pa_empower | pa_td | pa_ingram). Vide = non fourni.
  async function majPrix(id, champ, valeur) {
    if (!peutEditer()) return;
    const p = window.Catalogue.par(id); if (!p) return;
    const v = num(valeur);
    if (Number.isNaN(v)) { Toast.afficher('Montant invalide', 'erreur'); rendre(); return; }
    if (champ === 'pvp_ttc' && v === 0) { Toast.afficher('Le PVP doit être supérieur à 0', 'erreur'); rendre(); return; }
    const avant = p[champ];
    if ((avant == null ? null : Number(avant)) === v) return;
    const { error } = await SheetsAPI._sb.from('catalogue_produits').update({ [champ]: v, maj_par: Number(Session.pin), updated_at: new Date().toISOString() }).eq('produit_id', id);
    if (error) { Toast.afficher('Modification refusée : ' + error.message, 'erreur'); rendre(); return; }
    p[champ] = v;
    tracer(`${p.nom} ${p.appareils} · ${champ} : ${avant == null ? 'n.c.' : avant} → ${v == null ? 'n.c.' : v}`);
    Toast.afficher('Prix enregistré', 'succes'); rendre();
  }

  function brouillon(champ, v) { const b = S.brouillon; if (champ === 'td' || champ === 'ingram') b[champ] = !!v; else b[champ] = v; }
  function brouillonPrix(id, v) { if (String(v).trim() === '') delete S.brouillon.prix[id]; else S.brouillon.prix[id] = v; }

  async function ajouter() {
    if (!peutEditer()) return;
    const b = S.brouillon, canaux = ['td', 'ingram'].filter(k => b[k]);
    const remise = num(b.remise), prix = {};
    let bad = false; Object.entries(b.prix).forEach(([id, v]) => { const n = num(v); if (n == null) return; if (Number.isNaN(n) || n <= 0) bad = true; else prix[id] = n; });
    if (!b.libelle.trim()) return Toast.afficher('Donnez un nom à la cotation', 'erreur');
    if (!b.debut || !b.fin) return Toast.afficher('Renseignez la période (début et fin)', 'erreur');
    if (b.fin < b.debut) return Toast.afficher('La fin doit être après le début', 'erreur');
    if (!canaux.length) return Toast.afficher('Choisissez au moins un canal grossiste', 'erreur');
    if (bad || Number.isNaN(remise) || (remise != null && (remise <= 0 || remise > 90))) return Toast.afficher('Remise entre 1 et 90 %, prix cotés supérieurs à 0', 'erreur');
    if (remise == null && !Object.keys(prix).length) return Toast.afficher('Renseignez une remise en % ou au moins un prix coté', 'erreur');
    const { data, error } = await SheetsAPI._sb.from('catalogue_cotations').insert({ libelle: b.libelle.trim(), canaux, debut: b.debut, fin: b.fin, remise_pct: remise, prix, actif: true, maj_par: Number(Session.pin) }).select().single();
    if (error) { Toast.afficher('Ajout refusé : ' + error.message, 'erreur'); return; }
    S.brouillon = { libelle: '', debut: '', fin: '', td: true, ingram: true, remise: '', prix: {} };
    tracer(`Cotation « ${data.libelle} » du ${jj(data.debut)} au ${jj(data.fin)} (${canaux.join(', ')})`);
    Toast.afficher('Cotation enregistrée', 'succes'); await recharger();
  }

  async function basculer(id) {
    if (!peutEditer()) return; const c = S.cotations.find(x => x.id === id); if (!c) return;
    const actif = !(c.actif !== false);
    const { error } = await SheetsAPI._sb.from('catalogue_cotations').update({ actif, maj_par: Number(Session.pin), updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { Toast.afficher('Modification refusée : ' + error.message, 'erreur'); return; }
    tracer(`Cotation « ${c.libelle} » ${actif ? 'activée' : 'désactivée'}`); await recharger();
  }

  async function supprimer(id) {
    if (!peutEditer()) return; const c = S.cotations.find(x => x.id === id); if (!c) return;
    if (!window.confirm(`Supprimer la cotation « ${c.libelle} » ? Cette action est définitive.`)) return;
    const { error } = await SheetsAPI._sb.from('catalogue_cotations').delete().eq('id', id);
    if (error) { Toast.afficher('Suppression refusée : ' + error.message, 'erreur'); return; }
    tracer(`Cotation « ${c.libelle} » supprimée`); await recharger();
  }

  async function recharger() { S.chargement = false; await charger(); }

  function libCotation(c) {
    const pr = Object.keys(c.prix || {}).length;
    return [c.remise_pct ? `-${String(c.remise_pct).replace('.', ',')} %` : '', pr ? `${pr} prix coté${pr > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ');
  }

  function html() {
    if (!S.charge) { if (!S.chargement) charger(); return '<div class="bloc-fiche"><div class="bloc-titre">Prix et cotations</div><p style="font-size:13px">Chargement…</p></div>'; }
    const C = window.Catalogue, edit = peutEditer() && C.source() === 'base', actives = C.cotationsActives();
    const bandeau = actives.length
      ? `<div class="prix-bandeau on"><strong>Cotation en cours : ${esc(actives.map(c => c.libelle).join(', '))}</strong><span>Jusqu'au ${jj(actives.map(c => c.fin).sort()[0])}. Les prix grossistes des calculs de marge en tiennent compte.</span></div>`
      : `<div class="prix-bandeau"><strong>Aucune cotation en cours</strong><span>Les calculs utilisent les prix grossistes ci-dessous.</span></div>`;
    const champ = (p, k, v) => edit
      ? `<input class="q-input prix-in" inputmode="decimal" value="${v == null ? '' : String(v).replace('.', ',')}" placeholder="n.c." aria-label="${esc(k)} ${esc(p.nom)} ${p.appareils}" onchange="AdminPrix.majPrix('${esc(p.id)}','${k}',this.value)"/>`
      : `<span>${eur(v)}</span>`;
    const lignes = C.produits.map(p => {
      const ht = p.pvp_ttc != null ? C.pvpHT(p) : null;
      const mg = (pa) => (ht != null && pa != null) ? Math.round((ht - pa) / ht * 100) + ' %' : '';
      const eTD = C.paEffectif(p, 'pa_td'), eIN = C.paEffectif(p, 'pa_ingram');
      const cote = e => e.cotation ? `<small class="prix-cote">coté ${eur(e.pa)}</small>` : '';
      return `<tr><td><strong>${esc(p.nom.replace('Norton ', ''))}</strong><small>${p.appareils} appareil${p.appareils > 1 ? 's' : ''}</small></td>
        <td>${champ(p, 'pvp_ttc', p.pvp_ttc)}</td>
        <td>${champ(p, 'pa_empower', p.pa_empower)}<small>${mg(p.pa_empower)}</small></td>
        <td>${champ(p, 'pa_td', p.pa_td)}${cote(eTD)}<small>${mg(eTD.pa)}</small></td>
        <td>${champ(p, 'pa_ingram', p.pa_ingram)}${cote(eIN)}<small>${mg(eIN.pa)}</small></td></tr>`;
    }).join('');
    const tbl = `<div class="bloc-fiche"><div class="bloc-titre">Prix par canal · catalogue ${esc(C.version)}</div>
      <p class="prix-aide">Prix d'achat HT revendeur par canal et PVP TTC conseillé. Le PVP HT se déduit du PVP TTC divisé par 1,20, la marge est calculée par le code. Un champ vide signifie « non fourni » : le produit est alors exclu du calcul de ce canal, sans valeur inventée. Pourcentages : marge revendeur au PVP indiqué.</p>
      ${S.message ? `<p class="prix-aide" role="status">${esc(S.message)}</p>` : ''}
      ${edit ? '' : '<p class="prix-aide">Lecture seule.</p>'}
      <div class="prix-table-w"><table class="prix-table"><thead><tr><th>Produit</th><th>PVP TTC</th><th>Achat Empower</th><th>Achat Tech Data</th><th>Achat Ingram</th></tr></thead><tbody>${lignes}</tbody></table></div></div>`;
    const b = S.brouillon;
    const prixCotes = C.produits.filter(p => p.pa_td != null || p.pa_ingram != null).map(p => `<label class="prix-pc"><span>${esc(C.libelle(p))}</span><input class="q-input prix-in" inputmode="decimal" placeholder="${eur(p.pa_td != null ? p.pa_td : p.pa_ingram)}" value="${esc(b.prix[p.id] || '')}" oninput="AdminPrix.brouillonPrix('${esc(p.id)}',this.value)"/></label>`).join('');
    const form = edit ? `<div class="prix-form"><div class="prix-form-l">
        <label>Nom de la cotation<input class="q-input" placeholder="Ex. Rentrée 2026" value="${esc(b.libelle)}" oninput="AdminPrix.brouillon('libelle',this.value)"/></label>
        <div class="prix-2"><label>Début<input type="date" class="q-input" value="${esc(b.debut)}" onchange="AdminPrix.brouillon('debut',this.value)"/></label>
        <label>Fin (incluse)<input type="date" class="q-input" value="${esc(b.fin)}" onchange="AdminPrix.brouillon('fin',this.value)"/></label></div>
        <div class="prix-2"><fieldset class="prix-canaux"><legend>Canaux concernés</legend>
          <label><input type="checkbox" ${b.td ? 'checked' : ''} onchange="AdminPrix.brouillon('td',this.checked)"/> Tech Data</label>
          <label><input type="checkbox" ${b.ingram ? 'checked' : ''} onchange="AdminPrix.brouillon('ingram',this.checked)"/> Ingram</label></fieldset>
        <label>Remise sur le prix d'achat (%)<input class="q-input" inputmode="decimal" placeholder="Ex. 20" value="${esc(b.remise)}" oninput="AdminPrix.brouillon('remise',this.value)"/></label></div>
        <button class="btn-primaire prix-btn" onclick="AdminPrix.ajouter()">Enregistrer la cotation</button></div>
      <details class="prix-form-r"><summary>Prix cotés par produit (facultatif)</summary><p class="prix-aide">Un prix coté remplace la remise pour ce produit. À renseigner quand le grossiste communique des prix nets plutôt qu'un pourcentage.</p><div class="prix-pcs">${prixCotes}</div></details></div>` : '';
    const liste = S.cotations.length ? S.cotations.map(c => {
      const [lib, cls] = statut(c);
      return `<div class="prix-cot ${cls}"><div><strong>${esc(c.libelle)}</strong><small>Du ${jj(c.debut)} au ${jj(c.fin)} · ${esc((c.canaux || []).map(k => CANAUX[k] || k).join(' et '))} · ${esc(libCotation(c))}</small></div>
        <span class="prix-etat ${cls}">${lib}</span>
        ${edit ? `<div class="prix-act"><button class="btn-secondaire" onclick="AdminPrix.basculer('${esc(c.id)}')">${c.actif === false ? 'Activer' : 'Désactiver'}</button><button class="btn-lien" onclick="AdminPrix.supprimer('${esc(c.id)}')">Supprimer</button></div>` : ''}</div>`;
    }).join('') : '<p class="prix-aide">Aucune cotation enregistrée. Ajoutez celle d\'une opération (ex. rentrée) avec ses dates : elle s\'applique et s\'arrête toute seule.</p>';
    return `<style>
      .prix-bandeau{display:flex;flex-direction:column;gap:2px;padding:12px 14px;border-radius:12px;background:var(--cs-fond,#F1F3F4);margin-bottom:12px;font-size:13px}.prix-bandeau.on{background:rgba(255,109,104,.12)}.prix-bandeau span{color:var(--c-text-2)}
      .prix-aide{font-size:12px;color:var(--c-text-2);margin:0 0 12px;line-height:1.5}
      .prix-table-w{overflow-x:auto}.prix-table{width:100%;border-collapse:separate;border-spacing:0 4px;font-size:13px}.prix-table th{text-align:left;font-size:11px;color:var(--c-text-2);padding:4px 10px;text-transform:uppercase;letter-spacing:.05em}
      .prix-table td{padding:8px 10px;background:var(--cs-fond,#F7F8F9);vertical-align:top}.prix-table td:first-child{border-radius:10px 0 0 10px}.prix-table td:last-child{border-radius:0 10px 10px 0}
      .prix-table small{display:block;font-size:11px;color:var(--c-text-2);margin-top:2px}.prix-table .prix-cote{color:#FF6D68;font-weight:700}.prix-in{width:96px;padding:6px 8px;font-size:13px}
      .prix-form{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:16px;align-items:start;margin-bottom:14px}@media(max-width:820px){.prix-form{grid-template-columns:1fr}}
      .prix-form label{display:block;font-size:12px;color:var(--c-text-2);margin-bottom:10px}.prix-form label .q-input{margin-top:4px;width:100%}.prix-2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .prix-canaux{border:0;padding:0;margin:0 0 10px}.prix-canaux legend{font-size:12px;color:var(--c-text-2);padding:0;margin-bottom:6px}.prix-canaux label{display:flex;gap:8px;align-items:center;margin:0 0 6px;color:inherit;font-size:13px}
      .prix-btn{margin-top:4px}.prix-form-r{background:var(--cs-fond,#F1F3F4);border-radius:12px;padding:10px 14px}.prix-form-r summary{cursor:pointer;font-size:13px;font-weight:600}.prix-pcs{display:grid;gap:6px;max-height:300px;overflow:auto}
      .prix-pc{display:flex!important;justify-content:space-between;align-items:center;gap:8px;margin:0!important}.prix-pc .q-input{width:96px!important;margin:0!important}
      .prix-cot{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:12px 14px;border-radius:12px;background:var(--cs-fond,#F7F8F9);margin-bottom:8px}.prix-cot small{display:block;font-size:12px;color:var(--c-text-2);margin-top:2px}
      .prix-etat{font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px;background:#E4E8EB;color:#343F48}.prix-etat.on{background:#FF6D68;color:#fff}.prix-etat.venir{background:#343F48;color:#fff}.prix-act{display:flex;gap:8px;align-items:center}
    </style>
    ${bandeau}${tbl}
    <div class="bloc-fiche"><div class="bloc-titre">Cotations grossistes</div>
      <p class="prix-aide">Une cotation baisse le prix d'achat Tech Data et/ou Ingram pendant sa période, dans le Coach et les devis. Hors période, ou désactivée, elle n'a aucun effet. Empower n'est jamais concerné.</p>
      ${form}${liste}</div>`;
  }

  return { html, charger, majPrix, brouillon, brouillonPrix, ajouter, basculer, supprimer, state: S };
})();
