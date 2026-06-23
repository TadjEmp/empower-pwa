// ═══════════════════════════════════════
//  vue-photos.js — Galerie photos visites
//  Source : 🗺️_VISITES (champ Photo_URL, séparateur ' | ')
//  Groupées par date, téléchargeables
// ═══════════════════════════════════════

window.VuePhotos = {

  state: {
    visites:     [],
    chargement:  true,
    erreur:      null,
    filtreQ:     '',
    zoomIdx:     null,   // index dans _flat[]
  },

  _flat: [], // tableau plat { url, visite, idx } — mis à jour dans render()

  async init() {
    this.state.chargement = true;
    this.state.erreur     = null;
    this.state.zoomIdx    = null;
    this.render();
    try {
      const visites = await SheetsAPI.lire('EMPOWER_MDB', '🗺️_VISITES');
      this.state.visites = visites
        .filter(v => !String(v.deleted || '').toUpperCase().includes('TRUE'))
        .filter(v => Session.voitTout() || Number(v.PIN_CDS) === Session.pin)
        .filter(v => v.Photo_URL && String(v.Photo_URL).trim())
        .sort((a, b) =>
          (b.Date || b.Date_Planif || '').localeCompare(a.Date || a.Date_Planif || ''));
      this.state.chargement = false;
      this.render();
    } catch(e) {
      this.state.chargement = false;
      this.state.erreur = e.message;
      this.render();
    }
  },

  // ── Données filtrées + index plat pour zoom ──
  _buildFlat() {
    const q = normaliserNom(this.state.filtreQ || '');
    const flat = [];
    for (const v of this.state.visites) {
      if (q && !normaliserNom(v.Nom_Compte || '').includes(q)) continue;
      const urls = String(v.Photo_URL || '').split(' | ').map(u => u.trim()).filter(Boolean);
      for (const url of urls) {
        flat.push({ url, visite: v });
      }
    }
    this._flat = flat;
    return flat;
  },

  // Grouper par date ISO
  _grouper(flat) {
    const groupes = {};
    for (const item of flat) {
      const d = (item.visite.Date || item.visite.Date_Planif || '').slice(0, 10) || '—';
      if (!groupes[d]) groupes[d] = [];
      groupes[d].push(item);
    }
    return Object.keys(groupes)
      .sort((a, b) => b.localeCompare(a))
      .map(d => ({ date: d, items: groupes[d] }));
  },

  // ── Zoom ──
  ouvrirZoom(idx) {
    this.state.zoomIdx = idx;
    this.render();
  },

  fermerZoom() {
    this.state.zoomIdx = null;
    this.render();
  },

  zoomPrecedent() {
    if (this.state.zoomIdx > 0) { this.state.zoomIdx--; this.render(); }
  },

  zoomSuivant() {
    if (this.state.zoomIdx < this._flat.length - 1) { this.state.zoomIdx++; this.render(); }
  },

  // ── Téléchargement ──
  // Synchrone : <a click> évite le blocage popup iOS après await.
  // Pour URLs cross-origin (Supabase storage), le navigateur ouvre dans un nouvel onglet
  // où l'utilisateur peut sauvegarder nativement.
  telecharger(idx) {
    const item = this._flat[idx];
    if (!item) return;
    const url = item.url;
    const nom  = (item.visite.Nom_Compte || 'visite').replace(/[^a-zA-Z0-9]/g, '_');
    const date = (item.visite.Date || '').slice(0, 10).replace(/-/g, '');
    const a = document.createElement('a');
    a.href     = url;
    a.download = `photo_${nom}_${date}.jpg`;
    a.target   = '_blank';
    a.rel      = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  },

  // ── Render ──
  render() {
    const app = document.getElementById('app');

    // ── Vue Zoom plein écran ──
    if (this.state.zoomIdx !== null) {
      const item = this._flat[this.state.zoomIdx];
      if (!item) { this.state.zoomIdx = null; this.render(); return; }
      const { url, visite } = item;
      const dateStr = (visite.Date || visite.Date_Planif || '').slice(0, 10);
      const hasNext = this.state.zoomIdx < this._flat.length - 1;
      const hasPrev = this.state.zoomIdx > 0;
      app.innerHTML = `
        <div class="photo-zoom-layer">
          <div class="photo-zoom-bar">
            <button class="photo-zoom-btn" onclick="VuePhotos.fermerZoom()">✕ Fermer</button>
            <button class="photo-zoom-btn" onclick="VuePhotos.telecharger(${this.state.zoomIdx})">⬇ Enregistrer</button>
          </div>
          <div style="padding:0 14px 6px;flex-shrink:0">
            <div style="color:#fff;font-size:14px;font-weight:700">${visite.Nom_Compte || '—'}</div>
            <div style="color:rgba(255,255,255,.6);font-size:12px">${dateStr}</div>
          </div>
          <div class="photo-zoom-img-wrap">
            <img src="${url}" alt="${visite.Nom_Compte || 'photo'}"
                 onerror="this.alt='Image non disponible';this.style.opacity='.4'"/>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;padding-bottom:calc(14px + var(--safe-bottom, 0px));flex-shrink:0">
            <button class="photo-zoom-btn" onclick="VuePhotos.zoomPrecedent()"
                    ${hasPrev ? '' : 'disabled style="opacity:.3"'}>‹ Préc.</button>
            <span style="color:rgba(255,255,255,.5);font-size:12px">${this.state.zoomIdx + 1} / ${this._flat.length}</span>
            <button class="photo-zoom-btn" onclick="VuePhotos.zoomSuivant()"
                    ${hasNext ? '' : 'disabled style="opacity:.3"'}>Suiv. ›</button>
          </div>
        </div>`;
      return;
    }

    // ── Vue liste ──
    if (this.state.chargement) {
      app.innerHTML = `
        ${NavBar('photos')}
        <header class="header-vue">
          <button onclick="Router.aller('#/dashboard')" class="btn-retour">←</button>
          <h1>Mes Photos</h1>
        </header>
        <div class="spinner-centre">Chargement des photos…</div>`;
      return;
    }
    if (this.state.erreur) {
      app.innerHTML = `
        ${NavBar('photos')}
        <header class="header-vue">
          <button onclick="Router.aller('#/dashboard')" class="btn-retour">←</button>
          <h1>Mes Photos</h1>
        </header>
        <div class="erreur">Erreur : ${this.state.erreur}<br><br>
          <button class="btn-secondaire" onclick="VuePhotos.init()">Réessayer</button></div>`;
      return;
    }

    const flat = this._buildFlat();
    const groupes = this._grouper(flat);

    app.innerHTML = `
      ${NavBar('photos')}
      <header class="header-vue">
        <button onclick="Router.aller('#/dashboard')" class="btn-retour">←</button>
        <h1>Mes Photos</h1>
        <span class="badge-compteur">${flat.length}</span>
      </header>

      <div style="padding:10px 12px 0 12px">
        <input type="search" placeholder="🔍 Filtrer par compte…"
               value="${this.state.filtreQ}"
               style="width:100%;box-sizing:border-box;padding:11px 14px;border:1.5px solid var(--c-border);border-radius:var(--radius);font-size:14px;background:var(--c-surface);color:var(--c-text)"
               oninput="VuePhotos.state.filtreQ=this.value;VuePhotos.render()"/>
      </div>

      <div class="avec-nav" style="padding:12px">
        ${flat.length === 0
          ? `<div style="text-align:center;padding:48px 20px;color:var(--c-text-2)">
               <div style="font-size:40px;margin-bottom:12px">📷</div>
               <div style="font-size:15px;font-weight:700;margin-bottom:6px">Aucune photo</div>
               <div style="font-size:13px">Les photos prises lors des visites terrain apparaissent ici.</div>
             </div>`
          : groupes.map(groupe => {
              const dateISO = groupe.date;
              const dateLbl = dateISO !== '—'
                ? new Date(dateISO + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
                : '—';
              // offset global dans _flat pour cet index
              const offsetGloupe = flat.indexOf(groupe.items[0]);
              return `
              <div class="photo-group-header">${dateLbl} · ${groupe.items.length} photo${groupe.items.length > 1 ? 's' : ''}</div>
              <div class="photos-grid" style="margin-bottom:20px">
                ${groupe.items.map((item, localIdx) => {
                  const globalIdx = offsetGloupe + localIdx;
                  const safeName  = (item.visite.Nom_Compte || '').replace(/'/g, '\\x27');
                  return `
                  <div class="photo-tile" onclick="VuePhotos.ouvrirZoom(${globalIdx})">
                    <img src="${item.url}" alt="${safeName}" loading="lazy"
                         onerror="this.style.display='none';this.parentElement.style.background='var(--c-surface-alt)'"/>
                    <div class="photo-tile-caption">
                      <div class="photo-tile-nom">${item.visite.Nom_Compte || '—'}</div>
                    </div>
                    <button class="photo-tile-dl"
                            onclick="event.stopPropagation();VuePhotos.telecharger(${globalIdx})"
                            title="Télécharger">⬇</button>
                  </div>`;
                }).join('')}
              </div>`;
            }).join('')}
      </div>`;
  },
};
