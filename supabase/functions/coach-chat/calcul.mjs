// Calcul de marge côté serveur : même logique que js/catalogue.js (test de parité : test-coach-chat-sim.js).
// Les prix viennent des tables catalogue_produits et catalogue_cotations ; jamais de prix inventé.
const arr2 = n => Math.round(n * 100) / 100;

export function creerCatalogue({ produits, cotations, tva = 0.2, remise_volume = { seuil: 10, taux: 0.2 }, aujourdhui }) {
  const jour = () => aujourdhui || new Date().toISOString().slice(0, 10);
  const par = id => produits.find(p => p.id === id) || null;
  const pvpHT = p => p.pvp_ttc / (1 + tva);

  function cotationsActives(date, canal) {
    const d = (date || jour()).slice(0, 10);
    return cotations.filter(c => c.actif !== false && c.debut <= d && d <= c.fin && (!canal || (c.canaux || []).includes(canal)));
  }
  function paEffectif(p, canal, date) {
    const base = p[canal] == null ? null : Number(p[canal]);
    if (canal === 'pa_empower') return { pa: base, base, cotation: null };
    const c = canal.slice(3); let best = base, cot = null;
    cotationsActives(date, c).forEach(k => {
      const ex = k.prix && k.prix[p.id] != null ? Number(k.prix[p.id]) : null;
      const v = Number.isFinite(ex) && ex != null ? ex : (base != null && k.remise_pct ? base * (1 - Number(k.remise_pct) / 100) : null);
      if (v != null && (best == null || v < best)) { best = v; cot = k; }
    });
    return { pa: best, base, cotation: cot };
  }
  function calculer(lignes, canal, opts) {
    const o = opts || {};
    let ca = 0, cout = 0, licences = 0; const manquants = [], detail = [], cotes = new Set();
    (lignes || []).forEach(([id, q]) => {
      const qt = Math.max(0, Math.floor(Number(q) || 0)); const p = par(id);
      if (!p || !qt) return;
      const e = o.sansCotation ? { pa: p[canal] == null ? null : Number(p[canal]), cotation: null } : paEffectif(p, canal, o.date);
      let pa = e.pa;
      if (pa == null || p.pvp_ttc == null) { manquants.push(p.nom + ' ' + p.appareils); return; }
      const off = o.offre && o.offre.type ? o.offre : null;
      if (off && off.type === 'remise' && Number(off.taux) > 0) pa = pa * (1 - Math.min(0.9, Number(off.taux)));
      else if (!off && o.volume && qt >= remise_volume.seuil) pa = pa * (1 - remise_volume.taux);
      const offertes = off && off.type === 'xy' && Number(off.achetees) > 0 && Number(off.offertes) > 0 ? Math.floor(qt / Math.floor(off.achetees)) * Math.floor(off.offertes) : 0;
      const ht = pvpHT(p);
      if (e.cotation) cotes.add(e.cotation.libelle);
      ca += (qt + offertes) * ht; cout += qt * pa; licences += qt + offertes;
      detail.push({ id, nom: p.nom, appareils: p.appareils, qte: qt, offertes, qte_vendue: qt + offertes, pvp_ttc: Number(p.pvp_ttc), pvp_ht: arr2(ht), pa: arr2(pa), marge_unit: arr2(ht - pa), marge: arr2((qt + offertes) * ht - qt * pa), cotation: e.cotation ? e.cotation.libelle : null });
    });
    return { ca: arr2(ca), cout: arr2(cout), marge: arr2(ca - cout), pct: ca > 0 ? Math.round((ca - cout) / ca * 1000) / 10 : 0, licences, manquants, detail, cotations: [...cotes] };
  }
  function comparer(lignes, opts) {
    const o = opts || {}, cg = o.grossiste || 'pa_td';
    const communs = (lignes || []).filter(([id]) => { const p = par(id); return p && p.pa_empower != null && paEffectif(p, cg, o.date).pa != null; });
    const emp = calculer(communs, 'pa_empower', o);
    const gro = calculer(emp.detail.map(d => [d.id, d.qte_vendue]), cg, Object.assign({}, o, { offre: null, volume: false }));
    const exclus = (lignes || []).filter(([id, q]) => q > 0 && !communs.some(([i]) => i === id)).map(([id]) => { const p = par(id); return p ? p.nom + ' ' + p.appareils : id; });
    return { empower: emp, grossiste: gro, gain: arr2(emp.marge - gro.marge), exclus, cotations: gro.cotations };
  }
  return { par, pvpHT, paEffectif, cotationsActives, calculer, comparer, produits, cotations, tva, remise_volume };
}
