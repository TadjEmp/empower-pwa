/* ============================================================
  PHONEOS SHEETS CONNECTOR v1.0
  Repo : TadjEmp/empower-pwa
  Sheet: 16wtW_0hV3zFAYPTZfwyJ1_5dFPJsuNgLDrcqt-OG-4A
  
  SETUP :
  1. Déployer backend/Code.gs dans Google Apps Script
  2. Remplacer APPS_SCRIPT_URL par l'URL de déploiement
  3. Ajouter <script src="js/phoneos-sheets.js"></script>
     dans chaque vue HTML PhoneOS
============================================================ */

const APPS_SCRIPT_URL = 'COLLER_ICI_URL_APPS_SCRIPT_APRES_DEPLOIEMENT';
const SHEET_ID = '16wtW_0hV3zFAYPTZfwyJ1_5dFPJsuNgLDrcqt-OG-4A';

/* ============================================================
  CORE API
============================================================ */
const SheetsAPI = {

  /* ---- LECTURE ---- */
  async getLeads({ fy = 'FY27', commercial = null } = {}) {
    let url = `${APPS_SCRIPT_URL}?action=getLeads&fy=${fy}`;
    if (commercial) url += `&commercial=${encodeURIComponent(commercial)}`;
    const res = await fetch(url);
    return await res.json();
  },

  async getLead(codeClient, fy = 'FY27') {
    const url = `${APPS_SCRIPT_URL}?action=getLead&fy=${fy}&codeClient=${encodeURIComponent(codeClient)}`;
    const res = await fetch(url);
    return await res.json();
  },

  async getKPIs() {
    const res = await fetch(`${APPS_SCRIPT_URL}?action=getKPIs`);
    return await res.json();
  },

  async getCommercials() {
    const res = await fetch(`${APPS_SCRIPT_URL}?action=getCommercials`);
    return await res.json();
  },

  async getHeaders(fy = 'FY27') {
    const res = await fetch(`${APPS_SCRIPT_URL}?action=getHeaders&fy=${fy}`);
    return await res.json();
  },

  /* ---- ÉCRITURE ---- */
  async _post(payload) {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return await res.json();
  },

  async updateLead(fy, codeClient, fields) {
    return this._post({ action: 'updateLead', fy, codeClient, fields });
  },

  async addLead(fy, lead) {
    return this._post({ action: 'addLead', fy, lead });
  },

  async logCall(fy, codeClient, callData) {
    return this._post({ action: 'logCall', fy, codeClient, callData });
  },

  async declareCA(fy, codeClient, periode, montant) {
    return this._post({ action: 'declareCA', fy, codeClient, periode, montant });
  },
};

/* ============================================================
  UI COMPONENTS — SÉLECTEUR COMMERCIAL
============================================================ */
async function renderCommercialSelector(containerId, onChange) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `
    <div class="mono-label mb-1">Commercial</div>
    <div class="animate-pulse h-8 bg-[#F0ECE4] rounded-lg w-40"></div>`;

  try {
    const data = await SheetsAPI.getCommercials();
    const list = data.commercials || [];
    container.innerHTML = `
      <div class="mono-label mb-1">Commercial</div>
      <select id="commercial-select"
        class="bg-[#F5F0E8] border-0 rounded-lg px-3 py-2 text-[13px] font-semibold
               text-[#1a1a2e] outline-none focus:ring-1 focus:ring-[#A884FF]/40 cursor-pointer">
        <option value="">Tous</option>
        ${list.map(c => `<option value="${c}">${c}</option>`).join('')}
      </select>`;
    document.getElementById('commercial-select')
      .addEventListener('change', e => onChange && onChange(e.target.value));
  } catch(err) {
    container.innerHTML = `<div class="mono-label text-[#ba1a1a]">⚠ Sheets non connecté</div>`;
  }
}

/* ============================================================
  UI COMPONENTS — MODAL DÉCLARER CA
============================================================ */
function openDeclareCaModal(codeClient, raisonSociale, fy = 'FY27') {
  const existing = document.getElementById('declare-ca-modal');
  if (existing) existing.remove();

  const PERIODES = ['Q1','Q2','Q3','Q4','Total'];
  const modal = document.createElement('div');
  modal.id = 'declare-ca-modal';
  modal.className = 'fixed inset-0 z-[9999] flex items-center justify-center';
  modal.style.background = 'rgba(26,26,46,0.45)';
  modal.innerHTML = `
    <div class="bg-[#FAF8F4] rounded-2xl p-6 w-[380px] shadow-2xl">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-[16px] font-bold text-[#1a1a2e] flex items-center gap-2">
          <span class="material-symbols-outlined text-[#2D9E6B]">euro</span>
          Déclarer CA Réalisé
        </h3>
        <button onclick="document.getElementById('declare-ca-modal').remove()"
          class="text-[#9AABB8] hover:text-[#1a1a2e] transition">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
      <p class="text-[13px] text-[#9AABB8] font-mono mb-4">${raisonSociale} · ${fy}</p>

      <div class="space-y-3">
        <div>
          <p class="mono-label mb-1">Période</p>
          <div class="grid grid-cols-5 gap-2">
            ${PERIODES.map((q, i) => `
              <button class="periode-btn px-2 py-1.5 text-xs font-bold rounded-lg border transition
                ${i === 0 ? 'bg-[#343F48] text-[#E5E1D3] border-[#343F48]' : 'border-[rgba(26,26,46,0.12)] text-[#9AABB8] hover:bg-[#F0ECE4]'}"
                data-periode="${q}" onclick="_selectPeriode(this)">${q}</button>
            `).join('')}
          </div>
        </div>
        <div>
          <p class="mono-label mb-1">Montant (€ HT)</p>
          <input type="number" id="ca-montant" placeholder="ex: 12500"
            class="w-full bg-[#F5F0E8] border-0 rounded-lg px-3 py-2 text-[20px] font-bold
                   font-mono text-[#1a1a2e] outline-none focus:ring-2 focus:ring-[#2D9E6B]/40"/>
        </div>
      </div>

      <div class="flex gap-3 mt-5">
        <button onclick="document.getElementById('declare-ca-modal').remove()"
          class="flex-1 py-2.5 rounded-lg border border-[rgba(26,26,46,0.12)] text-[13px]
                 font-semibold text-[#9AABB8] hover:bg-[#F0ECE4] transition">Annuler</button>
        <button id="btn-submit-ca"
          onclick="_submitDeclareCA('${codeClient}','${fy}')"
          class="flex-1 py-2.5 rounded-lg bg-[#2D9E6B] text-white text-[13px] font-bold
                 hover:opacity-90 active:scale-95 transition shadow-sm
                 flex items-center justify-center gap-2">
          <span class="material-symbols-outlined text-sm">save</span> Valider & Sync Sheet
        </button>
      </div>
      <div id="ca-sync-status" class="hidden mt-3 text-center text-[11px] font-mono text-[#2D9E6B]"></div>
    </div>`;
  document.body.appendChild(modal);
}

function _selectPeriode(btn) {
  document.querySelectorAll('.periode-btn').forEach(b => {
    b.style.background = ''; b.style.color = '#9AABB8';
    b.style.borderColor = 'rgba(26,26,46,0.12)';
  });
  btn.style.background = '#343F48';
  btn.style.color = '#E5E1D3';
  btn.style.borderColor = '#343F48';
}

async function _submitDeclareCA(codeClient, fy) {
  const periode = document.querySelector('.periode-btn[style*="343F48"]')?.dataset.periode || 'Q1';
  const montant = parseFloat(document.getElementById('ca-montant').value);
  if (!montant || montant <= 0) { alert('Saisir un montant valide'); return; }

  const btn    = document.getElementById('btn-submit-ca');
  const status = document.getElementById('ca-sync-status');
  btn.innerHTML = '<span class="material-symbols-outlined text-sm">sync</span> Sync…';
  btn.disabled  = true;

  const res = await SheetsAPI.declareCA(fy, codeClient, periode, montant);
  if (res.success) {
    status.textContent = `✓ CA ${periode} de ${montant.toLocaleString('fr-FR')}€ synchronisé dans le Sheet`;
    status.style.color = '#2D9E6B';
    status.classList.remove('hidden');
    btn.innerHTML = '<span class="material-symbols-outlined text-sm">check_circle</span> Validé !';
    setTimeout(() => document.getElementById('declare-ca-modal')?.remove(), 2000);
  } else {
    status.textContent = `✗ Erreur : ${res.error}`;
    status.style.color = '#ba1a1a';
    status.classList.remove('hidden');
    btn.innerHTML = 'Réessayer';
    btn.disabled  = false;
  }
}

/* ============================================================
  UI COMPONENTS — MODAL AJOUT LEAD
============================================================ */
function openAddLeadModal(fy = 'FY27') {
  const existing = document.getElementById('add-lead-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'add-lead-modal';
  modal.className = 'fixed inset-0 z-[9999] flex items-center justify-center';
  modal.style.background = 'rgba(26,26,46,0.45)';
  modal.innerHTML = `
    <div class="bg-[#FAF8F4] rounded-2xl p-6 w-[500px] shadow-2xl">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-[16px] font-bold text-[#1a1a2e] flex items-center gap-2">
          <span class="material-symbols-outlined text-[#FF6D68]">person_add</span>
          Nouveau Lead → ${fy}
        </h3>
        <button onclick="document.getElementById('add-lead-modal').remove()"
          class="text-[#9AABB8] hover:text-[#1a1a2e] transition">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <p class="mono-label mb-1">Raison Sociale *</p>
          <input id="nl-raison" type="text" placeholder="ex: Micromania Lyon"
            class="w-full bg-[#F5F0E8] rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-1 focus:ring-[#FF6D68]/40"/>
        </div>
        <div>
          <p class="mono-label mb-1">Code Client</p>
          <input id="nl-code" type="text" placeholder="ex: CLI-00142"
            class="w-full bg-[#F5F0E8] rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-1 focus:ring-[#FF6D68]/40"/>
        </div>
        <div>
          <p class="mono-label mb-1">Commercial *</p>
          <input id="nl-commercial" type="text" placeholder="ex: JOHANNE"
            class="w-full bg-[#F5F0E8] rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-1 focus:ring-[#FF6D68]/40"/>
        </div>
        <div>
          <p class="mono-label mb-1">Distributeur</p>
          <select id="nl-distrib"
            class="w-full bg-[#F5F0E8] rounded-lg px-3 py-2 text-[13px] outline-none">
            <option>INGRAM</option>
            <option>TECH DATA</option>
            <option>ARROW</option>
            <option>DIRECT</option>
            <option>Autre</option>
          </select>
        </div>
        <div>
          <p class="mono-label mb-1">Téléphone</p>
          <input id="nl-tel" type="tel" placeholder="+33 4 XX XX XX XX"
            class="w-full bg-[#F5F0E8] rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-1 focus:ring-[#FF6D68]/40"/>
        </div>
        <div>
          <p class="mono-label mb-1">Email</p>
          <input id="nl-email" type="email" placeholder="contact@enseigne.fr"
            class="w-full bg-[#F5F0E8] rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-1 focus:ring-[#FF6D68]/40"/>
        </div>
        <div class="col-span-2">
          <p class="mono-label mb-1">Notes initiales</p>
          <textarea id="nl-notes" rows="2" placeholder="Contexte, source du lead..."
            class="w-full bg-[#F5F0E8] rounded-lg px-3 py-2 text-[13px] resize-none outline-none focus:ring-1 focus:ring-[#FF6D68]/40"></textarea>
        </div>
      </div>

      <div class="flex gap-3 mt-5">
        <button onclick="document.getElementById('add-lead-modal').remove()"
          class="flex-1 py-2.5 rounded-lg border border-[rgba(26,26,46,0.12)] text-[13px]
                 font-semibold text-[#9AABB8] hover:bg-[#F0ECE4] transition">Annuler</button>
        <button id="btn-submit-lead" onclick="_submitAddLead('${fy}')"
          class="flex-1 py-2.5 rounded-lg bg-[#FF6D68] text-white text-[13px] font-bold
                 hover:opacity-90 active:scale-95 transition shadow-sm
                 flex items-center justify-center gap-2">
          <span class="material-symbols-outlined text-sm">add_circle</span> Ajouter dans le Sheet
        </button>
      </div>
      <div id="add-lead-status" class="hidden mt-3 text-center text-[11px] font-mono"></div>
    </div>`;
  document.body.appendChild(modal);
}

async function _submitAddLead(fy) {
  const raison     = document.getElementById('nl-raison').value.trim();
  const commercial = document.getElementById('nl-commercial').value.trim();
  if (!raison || !commercial) { alert('Raison Sociale et Commercial sont obligatoires'); return; }

  const lead = {
    'Raison Sociale': raison,
    'Code Client':    document.getElementById('nl-code').value.trim(),
    'Commercial':     commercial,
    'Distributeur':   document.getElementById('nl-distrib').value,
    'Téléphone':      document.getElementById('nl-tel').value.trim(),
    'Email':          document.getElementById('nl-email').value.trim(),
    'Notes':          document.getElementById('nl-notes').value.trim(),
    'Statut Empower': 'NOUVEAU',
    'Score Empower':  0,
    'Dernier Appel':  '',
    'Date Rappel':    '',
  };

  const btn    = document.getElementById('btn-submit-lead');
  const status = document.getElementById('add-lead-status');
  btn.innerHTML = '<span class="material-symbols-outlined text-sm">sync</span> Sync…';
  btn.disabled  = true;

  const res = await SheetsAPI.addLead(fy, lead);
  if (res.success) {
    status.textContent = `✓ ${raison} ajouté dans le Sheet ${fy}`;
    status.style.color = '#2D9E6B';
    status.classList.remove('hidden');
    setTimeout(() => document.getElementById('add-lead-modal')?.remove(), 1800);
  } else {
    status.textContent = `✗ Erreur : ${res.error}`;
    status.style.color = '#ba1a1a';
    status.classList.remove('hidden');
    btn.innerHTML = 'Réessayer';
    btn.disabled  = false;
  }
}

/* ============================================================
  PATCH VUE PHONING — appeler dans saveCall()
  Usage : await syncCallToSheet('CODE_CLIENT', 'FY27');
============================================================ */
async function syncCallToSheet(codeClient, fy = 'FY27') {
  const callData = {
    date:        new Date().toLocaleDateString('fr-FR'),
    statut:      document.querySelector('.status-pill.selected')?.dataset.status || '',
    score:       document.getElementById('scoreValue')?.textContent?.split('/')[0]?.trim() || '0',
    notes:       document.getElementById('callNotes')?.value || '',
    dateRappel:  document.getElementById('callDate')?.value || '',
    duree:       document.getElementById('timer')?.textContent || '00:00',
  };

  const res = await SheetsAPI.logCall(fy, codeClient, callData);

  const toast = document.getElementById('save-toast');
  if (toast) {
    toast.textContent = res.success
      ? '✓ Compte-rendu enregistré & synchronisé dans Google Sheets'
      : `✗ Erreur Sheets : ${res.error}`;
    toast.style.color = res.success ? '#2D9E6B' : '#ba1a1a';
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3500);
  }
  return res;
}

/* ============================================================
  PATCH DASHBOARD — charger les KPIs au démarrage
  Usage : initDashboardKPIs();
============================================================ */
async function initDashboardKPIs() {
  try {
    const kpis = await SheetsAPI.getKPIs();
    const targets = {
      'kpi-ca-fy27':      kpis.FY27?.ca,
      'kpi-ca-fy26':      kpis.FY26?.ca,
      'kpi-actifs-fy27':  kpis.FY27?.actifs,
      'kpi-inactifs-fy27':kpis.FY27?.inactifs,
      'kpi-total-leads':  kpis.FY27?.total,
    };
    Object.entries(targets).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el && val !== undefined) {
        el.textContent = typeof val === 'number' && val > 999
          ? val.toLocaleString('fr-FR') + ' €'
          : val;
      }
    });
  } catch(err) {
    console.warn('[PhoneOS Sheets] KPIs non chargés :', err);
  }
}
