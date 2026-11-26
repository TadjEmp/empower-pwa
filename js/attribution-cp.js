// ═══════════════════════════════════════════════════════════════════════
//  attribution-cp.js — Attribution automatique d'un lead par code postal
//  Règle portée par la base (fonction attribuer_lead_par_cp, table
//  secteurs_cp, paramétrable en Administration). Chaque décision est
//  journalisée (attributions_leads_log) et notifiée.
// ═══════════════════════════════════════════════════════════════════════
window.AttributionCP = {
  PIN_ADMIN: 1000,

  // Retourne { resultat, pin, regle } ; en cas d'erreur réseau : NON_COUVERT (le lead va dans la file ADMIN).
  async decider(cp) {
    try {
      const sb = typeof SheetsAPI !== 'undefined' ? SheetsAPI._sb : null;
      if (!sb) throw new Error('hors ligne');
      const { data, error } = await sb.rpc('attribuer_lead_par_cp', { p_cp: String(cp || '') });
      if (error) throw error;
      const r = Array.isArray(data) ? data[0] : data;
      if (!r) throw new Error('réponse vide');
      return { resultat: r.resultat, pin: r.pin_cds != null ? Number(r.pin_cds) : null, regle: r.regle || '' };
    } catch (e) {
      return { resultat: 'NON_COUVERT', pin: null, regle: 'attribution indisponible : ' + (e.message || e) };
    }
  },

  _libelle: {
    ATTRIBUE:      'attribué automatiquement',
    MULTI_SECTEUR: 'secteur partagé, à confirmer',
    NON_COUVERT:   'secteur non couvert',
    CP_INVALIDE:   'code postal invalide',
  },

  async journaliser(idProspect, cp, d) {
    try {
      const sb = SheetsAPI._sb;
      await sb.from('attributions_leads_log').insert({
        id_prospect: idProspect, cp_saisi: String(cp || ''), resultat: d.resultat,
        pin_cds: d.pin, regle: d.regle, acteur_pin: Session && Session.pin ? Number(Session.pin) : null,
      });
    } catch { /* journal non bloquant */ }
  },

  _notifier(pin, type, message, idProspect) {
    if (!pin) return;
    if (window.Session && Session.estExterne && Session.estExterne()) return;   // leads externes : alertes émises par la base (déclencheur leads_alerte_externe)
    SheetsAPI.ecrire('EMPOWER_MDB', 'NOTIFS', {
      ID_Notif: genId('NOTIF'), PIN_Destinataire: Number(pin), Type_Notif: type,
      Message: message, ID_Cible: idProspect, Statut_Lu: false, Date_Envoi: new Date().toISOString(),
    }).catch(() => {});
  },

  // Applique la décision : notifie le commercial et l'ADMIN. Retourne { pinAuto, message } pour le toast.
  async appliquer(lead, decision) {
    const d = decision || await this.decider(lead.Code_Postal);
    await this.journaliser(lead.ID_Prospect, lead.Code_Postal, d);
    const nom = lead.Nom_Compte + (lead.Ville ? ', ' + lead.Ville : '');
    const ctx = `${nom} (CP ${lead.Code_Postal || 'n.c.'})`;
    if (d.resultat === 'ATTRIBUE' && d.pin) {
      this._notifier(d.pin, 'LEAD_ASSIGNE', `Lead attribué par secteur : ${ctx}. Premier contact sous 48 h.`, lead.ID_Prospect);
      if (d.pin !== this.PIN_ADMIN) this._notifier(this.PIN_ADMIN, 'LEAD_ATTRIBUE_AUTO', `Lead ${ctx} attribué à ${window.resolveCDS ? resolveCDS(d.pin) : d.pin} (${d.regle}).`, lead.ID_Prospect);
      return { pinAuto: d.pin, d };
    }
    const sug = d.pin ? ` Suggestion : ${window.resolveCDS ? resolveCDS(d.pin) : d.pin}.` : '';
    this._notifier(this.PIN_ADMIN, 'LEAD_A_ATTRIBUER', `Lead à attribuer (${this._libelle[d.resultat]}) : ${ctx}.${sug}`, lead.ID_Prospect);
    return { pinAuto: null, d };
  },
};
