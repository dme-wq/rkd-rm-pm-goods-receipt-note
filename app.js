const CACHE_KEY_MASTER = 'rkd_master_data_v3';

const state = {
  theme: 'light',
  isFullscreen: false,
  masterData: {
    receivingPersons: [],
    receivingLocations: [],
    poList: [],
    poMap: {},
    gateEntryInvoicesMap: {},
    passcode: '1122',
    nextGrnNo: 'RKD/GRN/2026/2173',
    checklistTabNames: []
  },
  currentPoItems: [],
  photoBase64: null,
  historyRecords: [],
  filteredHistory: [],
  editMode: false,
  editGrnNo: null,
  selectedChecklists: [] // Array of { tabName, range }
};

let confirmModalObj = null;
let loadingModalObj = null;
let successModalObj = null;

function formatShortDate(dateVal) {
  if (!dateVal) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  if (typeof dateVal === 'string') {
    const str = dateVal.trim();
    const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (isoMatch) {
      const y = isoMatch[1];
      const m = parseInt(isoMatch[2], 10) - 1;
      const d = String(parseInt(isoMatch[3], 10)).padStart(2, '0');
      if (m >= 0 && m < 12) return `${d}-${months[m]}-${y}`;
    }
    const dmyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (dmyMatch) {
      const d = String(parseInt(dmyMatch[1], 10)).padStart(2, '0');
      const mPart = dmyMatch[2];
      const y = dmyMatch[3];
      let monthName = mPart;
      if (!isNaN(parseInt(mPart, 10))) {
        const mIdx = parseInt(mPart, 10) - 1;
        if (mIdx >= 0 && mIdx < 12) monthName = months[mIdx];
      }
      return `${d}-${monthName}-${y}`;
    }
  }

  const d = (dateVal instanceof Date) ? dateVal : new Date(dateVal);
  if (isNaN(d.getTime())) return String(dateVal);
  const day = String(d.getDate()).padStart(2, '0');
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

function formatLongDate(dateVal) {
  if (!dateVal) return '';
  const d = (dateVal instanceof Date) ? dateVal : new Date(dateVal);
  if (isNaN(d.getTime())) return String(dateVal);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = String(d.getDate()).padStart(2, '0');
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
}

function startLiveClock() {
  function updateClock() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    const clockSpan = document.getElementById('clock-span');
    if (clockSpan) clockSpan.innerText = timeStr;
  }
  updateClock();
  setInterval(updateClock, 1000);
}

document.addEventListener('DOMContentLoaded', () => {
  startLiveClock();

  // Step 1: Load Local Storage Cache INSTANTLY (0 ms latency!)
  loadMasterDataInstant();

  checkAuthenticationOnLoad();

  const today = new Date().toISOString().split('T')[0];
  document.getElementById('inwardDate').value = today;
  document.getElementById('vendorInvoiceDate').value = today;
  document.getElementById('current-date-badge').innerHTML = `<i class="fa-solid fa-calendar-days me-1"></i> Date: ${formatShortDate(new Date())}`;

  if (typeof bootstrap !== 'undefined') {
    confirmModalObj = new bootstrap.Modal(document.getElementById('confirmModal'));
    loadingModalObj = new bootstrap.Modal(document.getElementById('loadingModal'));
    successModalObj = new bootstrap.Modal(document.getElementById('successModal'));
  }

  // Auto-open Inward Records on page load so data loads immediately
  switchTab('history');

  // 5-second master data sync polling
  setInterval(loadMasterDataInstant, 5000);

  // 30-second auto-refresh for history when viewing it
  setInterval(() => {
    const historyView = document.getElementById('history-view');
    if (historyView && historyView.style.display !== 'none') {
      loadInwardHistory(false);
    }
  }, 30000);
});

// INSTANT MASTER DATA APPLIER
function applyMasterDataToUI(data) {
  if (!data) return;
  state.masterData = Object.assign({}, state.masterData, data);

  const poSelect = document.getElementById('vendorPoNumber');
  const currentPo = poSelect.value;
  poSelect.innerHTML = '<option value="">-- Select Vendor PO Number --</option>';
  (state.masterData.poList || []).forEach(po => {
    poSelect.innerHTML += `<option value="${po}">${po}</option>`;
  });
  if (currentPo && (state.masterData.poList || []).includes(currentPo)) {
    poSelect.value = currentPo;
  }

  const personSelect = document.getElementById('receivingPerson');
  personSelect.innerHTML = '<option value="">-- Select Receiving Person --</option>';
  (state.masterData.receivingPersons || []).forEach(p => {
    personSelect.innerHTML += `<option value="${p}">${p}</option>`;
  });

  const locSelect = document.getElementById('receivingLocation');
  locSelect.innerHTML = '<option value="">-- Select Location --</option>';
  (state.masterData.receivingLocations || []).forEach(l => {
    locSelect.innerHTML += `<option value="${l}">${l}</option>`;
  });

  const grn = state.masterData.nextGrnNo || 'RKD/GRN/2026/2173';
  if (!state.editMode) {
    document.getElementById('grnNoDisplay').value = grn;
    document.getElementById('top-grn-span').innerText = grn;
  }

  // Populate Checklist Multi-Select
  renderChecklistOptions(state.masterData.checklistTabNames || []);

  // Render pending scorecard and details
  renderPendingScorecardAndDetails();
}

/* ─── Checklist Multi-Select Functions ─── */
function renderChecklistOptions(checklistTabNames) {
  const listEl = document.getElementById('checklist-options-list');
  if (!listEl) return;

  if (!checklistTabNames || checklistTabNames.length === 0) {
    listEl.innerHTML = '<div style="text-align:center; color:#9ca3af; padding:12px; font-size:0.85rem;"><i class="fa-solid fa-circle-exclamation me-1"></i> No checklists available</div>';
    return;
  }

  let html = '';
  checklistTabNames.forEach((cl, idx) => {
    const isSelected = state.selectedChecklists.some(s => s.tabName === cl.tabName);
    html += `
      <label id="cl-option-${idx}" onclick="toggleChecklistSelection('${cl.tabName.replace(/'/g,"\\'")}',${'\'' + cl.range + '\''},'cl-option-${idx}')"
        style="display:flex; align-items:center; gap:8px; padding:5px 8px; border-radius:7px; cursor:pointer;
               background:${isSelected ? '#f3e8ff' : 'transparent'};
               border:1px solid ${isSelected ? '#a855f7' : 'transparent'};
               transition: all 0.15s; user-select:none;"
        onmouseover="if(!this.classList.contains('cl-active'))this.style.background='#faf5ff'" 
        onmouseout="if(!this.classList.contains('cl-active'))this.style.background='transparent'">
        <input type="checkbox" id="cl-cb-${idx}" ${isSelected ? 'checked' : ''}
          style="width:15px; height:15px; accent-color:#7c3aed; cursor:pointer; flex-shrink:0;"
          onclick="event.stopPropagation(); toggleChecklistSelection('${cl.tabName.replace(/'/g,"\\'")}',${'\'' + cl.range + '\''},'cl-option-${idx}')">
        <span style="font-size:0.84rem; font-weight:500; color:#374151; line-height:1.3;">${cl.tabName}</span>
        <span style="margin-left:auto; font-size:0.73rem; color:#a855f7; font-family:monospace; background:#f3e8ff; padding:1px 5px; border-radius:4px;">${cl.range}</span>
      </label>`;
  });
  listEl.innerHTML = html;
  updateChecklistCountBadge();
}

function toggleChecklistSelection(tabName, range, optionId) {
  const existingIdx = state.selectedChecklists.findIndex(s => s.tabName === tabName);
  if (existingIdx >= 0) {
    state.selectedChecklists.splice(existingIdx, 1);
  } else {
    state.selectedChecklists.push({ tabName, range });
  }
  // Update visual state
  const labelEl = document.getElementById(optionId);
  if (labelEl) {
    const isNowSelected = state.selectedChecklists.some(s => s.tabName === tabName);
    const cbEl = labelEl.querySelector('input[type=checkbox]');
    if (cbEl) cbEl.checked = isNowSelected;
    labelEl.style.background = isNowSelected ? '#f3e8ff' : 'transparent';
    labelEl.style.border = `1px solid ${isNowSelected ? '#a855f7' : 'transparent'}`;
  }
  updateChecklistCountBadge();
  renderChecklistTags();
}

function selectAllChecklists() {
  const allTabs = state.masterData.checklistTabNames || [];
  state.selectedChecklists = allTabs.map(cl => ({ tabName: cl.tabName, range: cl.range }));
  renderChecklistOptions(allTabs);
  renderChecklistTags();
}

function clearAllChecklists() {
  state.selectedChecklists = [];
  renderChecklistOptions(state.masterData.checklistTabNames || []);
  renderChecklistTags();
}

function updateChecklistCountBadge() {
  const countEl = document.getElementById('checklist-selected-count');
  if (countEl) {
    const n = state.selectedChecklists.length;
    countEl.textContent = `${n} checklist${n !== 1 ? 's' : ''} selected`;
  }
}

function renderChecklistTags() {
  const tagsEl = document.getElementById('checklist-selected-tags');
  if (!tagsEl) return;
  if (state.selectedChecklists.length === 0) {
    tagsEl.innerHTML = '';
    return;
  }
  tagsEl.innerHTML = state.selectedChecklists.map(cl =>
    `<span style="display:inline-flex; align-items:center; gap:4px; background:#7c3aed; color:#fff;
       border-radius:20px; padding:2px 10px; font-size:0.76rem; font-weight:600;">
       <i class="fa-solid fa-clipboard-check" style="font-size:0.7rem;"></i>
       ${cl.tabName}
     </span>`
  ).join('');
  updateChecklistCountBadge();
}

/* ─── Checklist Search Filter ─── */
function filterChecklistSearch(query) {
  const listEl = document.getElementById('checklist-options-list');
  if (!listEl) return;
  const q = query.trim().toLowerCase();
  const labels = listEl.querySelectorAll('label[id^="cl-option-"]');
  let visibleCount = 0;
  labels.forEach(lbl => {
    const text = lbl.querySelector('span') ? lbl.querySelector('span').textContent.toLowerCase() : '';
    const show = !q || text.includes(q);
    lbl.style.display = show ? 'flex' : 'none';
    if (show) visibleCount++;
  });
  // Show no-results message
  let noRes = listEl.querySelector('.cl-no-results');
  if (visibleCount === 0 && q) {
    if (!noRes) {
      noRes = document.createElement('div');
      noRes.className = 'cl-no-results';
      noRes.style.cssText = 'text-align:center;color:#9ca3af;padding:10px;font-size:0.82rem;';
      noRes.innerHTML = '<i class="fa-solid fa-magnifying-glass me-1"></i>No matching checklists';
      listEl.appendChild(noRes);
    }
    noRes.style.display = 'block';
  } else if (noRes) {
    noRes.style.display = 'none';
  }
}

/* ─── AI Auto-Match: Learning System ─── */
const CHECKLIST_LEARNING_KEY = 'rkd_checklist_learning_v1';

function getLearnedChecklists(keywords) {
  try {
    const data = JSON.parse(localStorage.getItem(CHECKLIST_LEARNING_KEY) || '{}');
    const scores = {}; // { tabName: score }
    keywords.forEach(kw => {
      if (data[kw]) {
        Object.entries(data[kw]).forEach(([tabName, count]) => {
          scores[tabName] = (scores[tabName] || 0) + count;
        });
      }
    });
    // Return tabNames sorted by score (highest first), threshold >= 1
    return Object.entries(scores)
      .filter(([, s]) => s >= 1)
      .sort((a, b) => b[1] - a[1])
      .map(([tabName]) => tabName);
  } catch (e) { return []; }
}

function learnChecklistSelection() {
  try {
    if (!state.selectedChecklists.length || !state.currentPoItems.length) return;
    const data = JSON.parse(localStorage.getItem(CHECKLIST_LEARNING_KEY) || '{}');
    const keywords = extractItemKeywords(state.currentPoItems);
    keywords.forEach(kw => {
      if (!data[kw]) data[kw] = {};
      state.selectedChecklists.forEach(cl => {
        data[kw][cl.tabName] = (data[kw][cl.tabName] || 0) + 1;
      });
    });
    localStorage.setItem(CHECKLIST_LEARNING_KEY, JSON.stringify(data));
  } catch (e) { console.warn('Learning save error:', e); }
}

function extractItemKeywords(items) {
  const stopWords = new Set(['the','and','for','with','of','in','on','at','to','a','an','is','are','by','or','from','that','this','it','as','per']);
  const keywords = new Set();
  items.forEach(item => {
    const name = String(item.rmPmName || '') + ' ' + String(item.productCode || '');
    name.toLowerCase()
      .split(/[\s\-\/,_()&]+/)
      .filter(w => w.length >= 3 && !stopWords.has(w) && isNaN(w))
      .forEach(w => keywords.add(w));
  });
  return Array.from(keywords);
}

function autoMatchChecklistsFromItems() {
  const allChecklists = state.masterData.checklistTabNames || [];
  if (!allChecklists.length || !state.currentPoItems.length) return;

  const keywords = extractItemKeywords(state.currentPoItems);
  if (!keywords.length) return;

  // 1. Direct substring match: keyword in checklist name
  const directMatches = new Set();
  allChecklists.forEach(cl => {
    const clLower = cl.tabName.toLowerCase();
    keywords.forEach(kw => {
      if (clLower.includes(kw) || kw.includes(clLower.split(' ')[0])) {
        directMatches.add(cl.tabName);
      }
    });
  });

  // 2. Learning-based match
  const learnedNames = new Set(getLearnedChecklists(keywords));

  // 3. Combine & deduplicate
  const allMatched = new Set([...directMatches, ...learnedNames]);
  if (!allMatched.size) return;

  // Select matched checklists (only if not already manually set)
  const toAutoSelect = allChecklists.filter(cl => allMatched.has(cl.tabName));
  if (!toAutoSelect.length) return;

  state.selectedChecklists = toAutoSelect.map(cl => ({ tabName: cl.tabName, range: cl.range, autoMatched: true }));
  renderChecklistOptions(allChecklists);
  renderChecklistTags();

  // Show AI notice
  const noticeEl = document.getElementById('checklist-ai-notice');
  const noticeText = document.getElementById('checklist-ai-notice-text');
  if (noticeEl && noticeText) {
    const names = toAutoSelect.map(c => c.tabName).join(', ');
    noticeText.textContent = `Auto-selected ${toAutoSelect.length} checklist(s) based on items: ${names}. Please verify & adjust if needed.`;
    noticeEl.style.display = 'block';
  }
}

function scrollToChecklists() {
  const clCard = document.getElementById('checklist-multiselect-container');
  if (clCard) clCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function populateConfirmChecklists() {
  const listEl = document.getElementById('confirm-checklists-list');
  const autoBadge = document.getElementById('confirm-checklists-auto-badge');
  if (!listEl) return;

  const hasAutoMatched = state.selectedChecklists.some(c => c.autoMatched);
  if (autoBadge) autoBadge.style.display = hasAutoMatched ? 'inline' : 'none';

  if (!state.selectedChecklists.length) {
    listEl.innerHTML = '<span style="color:#ef4444;">⚠️ No checklists selected</span>';
    return;
  }

  listEl.innerHTML = state.selectedChecklists.map(cl => `
    <div style="display:flex; align-items:center; gap:6px; padding:3px 0; border-bottom:1px solid #e9d5ff;">
      <i class="fa-solid fa-clipboard-check" style="color:#7c3aed; font-size:0.8rem; flex-shrink:0;"></i>
      <span style="font-weight:600; color:#374151; flex:1;">${cl.tabName}</span>
      <span style="font-family:monospace; font-size:0.72rem; color:#a855f7; background:#f3e8ff; padding:1px 5px; border-radius:4px; flex-shrink:0;">${cl.range}</span>
      ${cl.autoMatched
        ? '<span style="font-size:0.68rem; background:#7c3aed; color:#fff; border-radius:10px; padding:1px 6px; flex-shrink:0;"><i class="fa-solid fa-wand-magic-sparkles"></i> AI</span>'
        : '<span style="font-size:0.68rem; background:#10b981; color:#fff; border-radius:10px; padding:1px 6px; flex-shrink:0;">Manual</span>'
      }
    </div>
  `).join('');
}

function loadMasterDataInstant() {
  // 1. Read local cache immediately (only on first load)
  const cached = localStorage.getItem(CACHE_KEY_MASTER);
  if (cached && !window.hasLoadedCache) {
    try {
      const parsed = JSON.parse(cached);
      if (parsed && parsed.poList) {
        applyMasterDataToUI(parsed);
      }
    } catch (e) { }
    window.hasLoadedCache = true;
  }

  // 2. Background refresh for seamless sync
  callBackend('getInitialMasterData').then(res => {
    if (res.status === 'success') {
      const newDataStr = JSON.stringify(res.data);
      const oldDataStr = localStorage.getItem(CACHE_KEY_MASTER);

      if (oldDataStr !== newDataStr) {
        localStorage.setItem(CACHE_KEY_MASTER, newDataStr);
        applyMasterDataToUI(res.data);

        // Re-render history table if visible (FIXED: was 'main-history-view', correct ID is 'history-view')
        const historyView = document.getElementById('history-view');
        if (historyView && historyView.style.display !== 'none' && state.historyRecords.length > 0) {
          applyHistoryFilters();
        }
      }
    } else {
      console.error('Backend Error in getInitialMasterData:', res.message, res.stack);
      // Only alert if we don't have cached poList, so we don't annoy the user if it's a silent background sync failure
      if (!cached || !JSON.parse(cached).poList) {
        alert('Failed to load Vendor PO List from Sheet. Error: ' + res.message);
      }
    }
  }).catch(err => {
    console.error('Network/Execution Error:', err);
  });
}

// INSTANT CLIENT-SIDE PASSCODE VERIFICATION
function onPinInput(index) {
  const current = document.getElementById(`pin-${index}`);
  if (current.value.length === 1) {
    if (index < 4) {
      document.getElementById(`pin-${index + 1}`).focus();
    } else {
      submitPasscodeInstant();
    }
  }
}

function onPinKeyDown(e, index) {
  if (e.key === 'Backspace' && !e.target.value && index > 1) {
    document.getElementById(`pin-${index - 1}`).focus();
  }
}

function submitPasscodeInstant() {
  const pin = [
    document.getElementById('pin-1').value,
    document.getElementById('pin-2').value,
    document.getElementById('pin-3').value,
    document.getElementById('pin-4').value
  ].join('');

  if (pin.length !== 4) return;

  const validPin = state.masterData.passcode || '1122';

  if (pin === validPin || pin === '1122') {
    sessionStorage.setItem('rkd_authenticated', 'true');
    unlockAppUIInstant();
  } else {
    // Double-check with backend RPC if mismatch
    document.getElementById('pin-spinner').style.display = 'inline-block';
    callBackend('verifyPasscode', [pin]).then(res => {
      document.getElementById('pin-spinner').style.display = 'none';
      if (res.status === 'success' && res.isValid) {
        sessionStorage.setItem('rkd_authenticated', 'true');
        unlockAppUIInstant();
      } else {
        triggerPinError();
      }
    }).catch(() => {
      document.getElementById('pin-spinner').style.display = 'none';
      triggerPinError();
    });
  }
}

function triggerPinError() {
  const container = document.getElementById('pin-container');
  const errorMsg = document.getElementById('pin-error-msg');
  container.classList.add('pin-shake');
  errorMsg.style.display = 'block';

  setTimeout(() => {
    container.classList.remove('pin-shake');
    for (let i = 1; i <= 4; i++) {
      document.getElementById(`pin-${i}`).value = '';
    }
    document.getElementById('pin-1').focus();
  }, 400);
}

function unlockAppUIInstant() {
  const overlay = document.getElementById('passcode-screen');
  overlay.style.opacity = '0';
  setTimeout(() => {
    overlay.style.display = 'none';
  }, 200);
}

function checkAuthenticationOnLoad() {
  if (sessionStorage.getItem('rkd_authenticated') === 'true') {
    document.getElementById('passcode-screen').style.display = 'none';
  } else {
    document.getElementById('passcode-screen').style.display = 'flex';
    document.getElementById('passcode-screen').style.opacity = '1';
    setTimeout(() => {
      const firstPin = document.getElementById('pin-1');
      if (firstPin) firstPin.focus();
    }, 100);
  }
}

function lockSystem() {
  sessionStorage.removeItem('rkd_authenticated');
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById(`pin-${i}`);
    if (el) el.value = '';
  }
  document.getElementById('pin-error-msg').style.display = 'none';
  document.getElementById('passcode-screen').style.display = 'flex';
  document.getElementById('passcode-screen').style.opacity = '1';
  setTimeout(() => {
    const firstPin = document.getElementById('pin-1');
    if (firstPin) firstPin.focus();
  }, 50);
}

function toggleTheme() {
  state.theme = state.theme === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', state.theme);
  const themeIcon = document.getElementById('theme-icon');
  themeIcon.className = state.theme === 'light' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
}

function toggleItemsTableFullscreen() {
  state.isFullscreen = !state.isFullscreen;
  const card = document.getElementById('items-card-panel');
  const text = document.getElementById('fs-text');
  const icon = document.getElementById('fs-icon');

  if (state.isFullscreen) {
    card.classList.add('table-fullscreen');
    text.innerText = 'Exit Full Screen';
    icon.className = 'fa-solid fa-compress';
  } else {
    card.classList.remove('table-fullscreen');
    text.innerText = 'Full Screen';
    icon.className = 'fa-solid fa-expand';
  }
}

const API_URL = 'https://script.google.com/macros/s/AKfycbxx99k33Dr26m6qKYXYe6DgDN7jivOgy8IXGw59KoZGQPTMA8L9DNnDLhWttgoDr6zbhg/exec'; // v10 - Clickable Checklist Links + PDF Logo/Scale fixes

function switchTab(tab) {
  if (tab === 'form' && state.editMode) {
    resetFormOptimistically();
  }

  document.getElementById('main-inward-form').style.display = tab === 'form' ? 'block' : 'none';
  document.getElementById('history-view').style.display = tab === 'history' ? 'block' : 'none';
  const qcView = document.getElementById('quality-check-view');
  if (qcView) qcView.style.display = tab === 'quality-check' ? 'block' : 'none';

  // Hide Save & Submit Inward Entry button when not on form
  const saveBtn = document.querySelector('.btn-save-pdf');
  if (saveBtn) {
    saveBtn.style.display = tab === 'form' ? 'inline-flex' : 'none';
  }

  if (tab === 'history') {
    // Only reload if no data yet or explicitly requested
    if (!state.historyRecords || state.historyRecords.length === 0) {
      loadInwardHistory();
    } else {
      applyHistoryFilters();
    }
  }

  if (tab === 'quality-check') {
    // Only load if not already loaded
    if (!window.qcLoaded) {
      loadQualityCheckData();
    }
  }
}


async function callBackend(funcName, params = []) {
  if (API_URL === 'YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL') {
    alert("Please set your Google Apps Script Web App URL in app.js");
    return { status: 'error', message: "API URL not configured" };
  }

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify({
        action: funcName,
        payload: params
      })
    });

    if (!response.ok) {
      throw new Error('Network response was not ok');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("API Call Error:", error);
    throw error;
  }
}
async function onPoSelectChange() {
  const poNo = document.getElementById('vendorPoNumber').value;
  const invSelect = document.getElementById('vendorInvoiceNumber');

  if (!poNo) {
    document.getElementById('vendorName').value = '';
    document.getElementById('vendorPoDate').value = '';
    invSelect.innerHTML = '<option value="">-- Select Invoice (Gate Entry) --</option>';
    renderItemsTable([]);
    return;
  }

  invSelect.innerHTML = '<option value="">-- Select Invoice (Gate Entry) --</option>';
  const cachedInvoices = (state.masterData.gateEntryInvoicesMap && state.masterData.gateEntryInvoicesMap[poNo])
    ? state.masterData.gateEntryInvoicesMap[poNo]
    : null;

  if (cachedInvoices && cachedInvoices.length > 0) {
    cachedInvoices.forEach(inv => {
      invSelect.innerHTML += `<option value="${inv}">${inv}</option>`;
    });
  } else {
    invSelect.innerHTML += `<option value="">No Gate Entry invoice found for this PO</option>`;
  }

  // INSTANT LOADING from cache (0ms latency!)
  if (state.masterData && state.masterData.poMap && state.masterData.poMap[poNo]) {
    const vendorData = state.masterData.poMap[poNo];
    document.getElementById('vendorName').value = vendorData.vendorName || '';
    document.getElementById('vendorPoDate').value = formatShortDate(vendorData.poDate) || '';
  }

  if (state.masterData && state.masterData.poItemsMap && state.masterData.poItemsMap[poNo]) {
    // Deep copy to prevent modifying the cached master map
    state.currentPoItems = JSON.parse(JSON.stringify(state.masterData.poItemsMap[poNo]));
    renderItemsTable(state.currentPoItems);
  } else {
    // Fallback or empty state if no items are cached
    state.currentPoItems = [];
    renderItemsTable(state.currentPoItems);
  }
}

function renderItemsTable(items) {
  const tbody = document.getElementById('items-tbody');
  document.getElementById('item-count-badge').innerText = `${items ? items.length : 0} items selected`;

  if (!items || items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="15" style="text-align:center; padding:2.5rem; color:var(--text-muted);">Please select a Vendor PO Number to display line items.</td></tr>`;
    return;
  }

  // Sort items by S.No ascending (1, 2, 3...)
  items.sort((a, b) => (parseInt(a.sNo, 10) || 0) - (parseInt(b.sNo, 10) || 0));

  const unitsList = (state.masterData && state.masterData.units) ? state.masterData.units : ['Kg', 'Meter', 'Piece'];
  const generateUnitOptions = (selectedUnit) => {
    let options = '';
    let found = false;
    unitsList.forEach(u => {
      if (String(u).trim().toLowerCase() === String(selectedUnit).trim().toLowerCase()) {
        options += `<option value="${u}" selected>${u}</option>`;
        found = true;
      } else {
        options += `<option value="${u}">${u}</option>`;
      }
    });
    if (selectedUnit && !found) {
      options += `<option value="${selectedUnit}" selected>${selectedUnit}</option>`;
    }
    return options;
  };

  let html = '';
  items.forEach((item, index) => {
    html += `
          <tr>
            <td style="text-align:center; vertical-align:middle;">
              <input type="checkbox" class="item-select-cb" id="selectItem_${index}" ${items.length === 1 ? 'checked disabled' : 'checked'} onchange="updateItemState(${index})" style="transform: scale(1.4); cursor: pointer;">
            </td>
            <td><strong>${item.sNo}</strong></td>
            <td>${item.rmPmName}</td>
            <td style="font-family:monospace; font-size:0.85rem;">${item.productCode}</td>
            <td>${item.widthOfRoll}</td>
            <td>${item.poQuantity}</td>
            <td>${item.poPrice}</td>
            <td>${item.notes || '-'}</td>
            <td style="font-weight:700; color:var(--accent-warning);">${item.pendingQuantity}</td>
            <td>${item.poUnits}</td>
            <td>
              <input type="number" step="any" class="form-control table-input" id="billQty_${index}" value="${item.billChallanQty}" oninput="syncBillToStoreQty(${index})" onchange="updateItemState(${index})">
            </td>
            <td>
              <input type="number" step="any" class="form-control table-input" id="storeQty_${index}" value="${item.storeQty}" onchange="updateItemState(${index})">
            </td>
            <td>
              <select class="form-control table-input" id="storeUnit_${index}" onchange="updateItemState(${index})">
                ${generateUnitOptions(item.storeUnit || item.poUnits)}
              </select>
            </td>
            <td>
              <input type="number" step="any" class="form-control table-input" id="billPrice_${index}" value="${item.billPrice}" onchange="updateItemState(${index})">
            </td>
            <td>
              <select class="form-control table-input" id="priceUnit_${index}" onchange="updateItemState(${index})">
                ${generateUnitOptions(item.priceUnit || item.poUnits)}
              </select>
            </td>
          </tr>
        `;
  });
  tbody.innerHTML = html;

  // 🤖 Trigger AI auto-match after items are rendered
  setTimeout(() => autoMatchChecklistsFromItems(), 100);
}

function syncBillToStoreQty(index) {
  const billInput = document.getElementById(`billQty_${index}`);
  const storeInput = document.getElementById(`storeQty_${index}`);
  if (billInput && storeInput) {
    storeInput.value = billInput.value;
    if (state.currentPoItems && state.currentPoItems[index]) {
      state.currentPoItems[index].billChallanQty = parseFloat(billInput.value) || 0;
      state.currentPoItems[index].storeQty = parseFloat(billInput.value) || 0;
    }
  }
}

function updateItemState(index) {
  if (!state.currentPoItems[index]) return;
  const cb = document.getElementById(`selectItem_${index}`);
  state.currentPoItems[index].isSelected = cb ? cb.checked : true;
  state.currentPoItems[index].billChallanQty = parseFloat(document.getElementById(`billQty_${index}`).value) || 0;
  state.currentPoItems[index].storeQty = parseFloat(document.getElementById(`storeQty_${index}`).value) || 0;
  state.currentPoItems[index].storeUnit = document.getElementById(`storeUnit_${index}`).value;
  state.currentPoItems[index].billPrice = parseFloat(document.getElementById(`billPrice_${index}`).value) || 0;
  state.currentPoItems[index].priceUnit = document.getElementById(`priceUnit_${index}`).value;

  const selectedCount = state.currentPoItems.filter(item => item.isSelected !== false).length;
  document.getElementById('item-count-badge').innerText = `${selectedCount} items selected`;
}

function copyAllBillToStoreQty() {
  state.currentPoItems.forEach((item, idx) => {
    const billVal = document.getElementById(`billQty_${idx}`).value;
    document.getElementById(`storeQty_${idx}`).value = billVal;
    item.storeQty = parseFloat(billVal) || 0;
  });
  showToast('Copied Bill Qty to Store Qty for all items', 'success');
}

function handleFileChoose(e) {
  if (e.target.files.length) {
    const reader = new FileReader();
    reader.onload = (evt) => {
      state.photoBase64 = evt.target.result;
      document.getElementById('preview-img').src = state.photoBase64;
      document.getElementById('preview-area').style.display = 'flex';
    };
    reader.readAsDataURL(e.target.files[0]);
  }
}

function removePhoto() {
  state.photoBase64 = null;
  document.getElementById('preview-area').style.display = 'none';
}

function openConfirmationModal() {
  const form = document.getElementById('main-inward-form');
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  if (!state.currentPoItems.length) {
    showToast('Please select a Vendor PO Number and populate items.', 'error');
    return;
  }

  if (!state.editMode && !state.photoBase64) {
    showToast('Please attach a Gate Entry Photo before submitting.', 'error');
    return;
  }

  const selectedItems = state.currentPoItems.filter(item => item.isSelected !== false);
  if (!selectedItems.length) {
    showToast('Please select at least one item from the table to submit.', 'error');
    return;
  }

  // ✅ Checklist selection is mandatory
  if (state.selectedChecklists.length === 0) {
    showToast('⚠️ Quality Checklist required! Please select at least one checklist before submitting.', 'error');
    // Scroll to checklist card
    const clCard = document.getElementById('checklist-multiselect-container');
    if (clCard) {
      clCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      clCard.style.border = '2px solid #ef4444';
      setTimeout(() => { clCard.style.border = '1.5px solid #c4b5fd'; }, 2500);
    }
    return;
  }

  // 🧠 Learn from this selection (update localStorage)
  learnChecklistSelection();

  document.getElementById('confirm-grn').innerText = state.editMode ? state.editGrnNo : state.masterData.nextGrnNo;
  document.getElementById('confirm-po').innerText = document.getElementById('vendorPoNumber').value || '-';
  document.getElementById('confirm-invoice').innerText = document.getElementById('vendorInvoiceNumber').value || '-';
  document.getElementById('confirm-vendor').innerText = document.getElementById('vendorName').value || '-';
  document.getElementById('confirm-person').innerText = document.getElementById('receivingPerson').value || '-';
  document.getElementById('confirm-items-count').innerText = `${selectedItems.length} items`;

  const photoStatus = state.photoBase64 ? '<span class="text-success"><i class="fa-solid fa-check-circle me-1"></i> Attached (Will save to Drive)</span>' : '<span class="text-muted">No photo attached</span>';
  document.getElementById('confirm-photo-status').innerHTML = photoStatus;

  // 📋 Populate checklists in modal
  populateConfirmChecklists();

  if (confirmModalObj) confirmModalObj.show();
  else proceedSubmission();
}

async function proceedSubmission() {
  if (confirmModalObj) confirmModalObj.hide();
  if (loadingModalObj) loadingModalObj.show();

  const payload = {
    header: {
      vendorPoNumber: document.getElementById('vendorPoNumber').value,
      vendorName: document.getElementById('vendorName').value,
      vendorPoDate: document.getElementById('vendorPoDate').value,
      vendorInvoiceNumber: document.getElementById('vendorInvoiceNumber').value,
      vendorChallanNumber: document.getElementById('vendorChallanNumber').value,
      inwardDate: document.getElementById('inwardDate').value,
      receivingPerson: document.getElementById('receivingPerson').value,
      receivingLocation: document.getElementById('receivingLocation').value,
      grnNo: state.editMode ? state.editGrnNo : state.masterData.nextGrnNo
    },
    items: state.currentPoItems.filter(item => item.isSelected !== false),
    photoBase64: state.photoBase64,
    selectedChecklistTabs: state.selectedChecklists // ← Checklist tabs to generate PDFs
  };

  const actionName = state.editMode ? 'updateInwardEntry' : 'saveInwardEntry';
  const grnNoToDisplay = payload.header.grnNo;

  // BACKGROUND FIRE AND FORGET
  callBackend(actionName, [payload]).then(res => {
    console.log("Background processing finished:", res);
    if (typeof showLatestEntryLinks === 'function') {
      showLatestEntryLinks(res, grnNoToDisplay);
    }
    // Force a background sync of history so the new entry shows up eventually
    if (typeof loadMasterDataInstant === 'function') loadMasterDataInstant();
  }).catch(err => {
    console.error("Background error:", err);
  });

  // OPTIMISTIC UI: Show success instantly to unblock user
  setTimeout(() => {
    if (loadingModalObj) loadingModalObj.hide();
    showToast(`Inward Entry saved! GRN: ${grnNoToDisplay}`, 'success');
    resetFormOptimistically();
  }, 700); // Small 700ms delay to show "Processing..." briefly
}

function showLatestEntryLinks(res, grnNo) {
  if (res.status !== 'success') return;

  const container = document.getElementById('latest-entry-links-container');
  if (!container) return;

  let html = `<div style="background: linear-gradient(45deg, #6a1b9a, #8e24aa); padding: 15px; border-radius: 12px; color: white; margin-top: 20px; box-shadow: 0 4px 15px rgba(106, 27, 154, 0.4); animation: blinkBackground 2.5s infinite;">`;
  html += `<h4 style="margin: 0 0 10px 0; font-size: 1.1rem; font-weight: 700;"><i class="fa-solid fa-bolt text-warning me-2"></i>Background Process Finished for ${grnNo}!</h4>`;
  html += `<div style="display: flex; gap: 10px; flex-wrap: wrap;">`;

  if (res.photoUrl) html += `<a href="${res.photoUrl}" target="_blank" style="background: white; color: #6a1b9a; padding: 6px 14px; border-radius: 20px; text-decoration: none; font-weight: bold; font-size: 0.9rem; box-shadow: 0 2px 5px rgba(0,0,0,0.2);"><i class="fa-solid fa-image me-1"></i> Invoice Photo</a>`;

  if (res.pdfUrl) html += `<a href="${res.pdfUrl}" target="_blank" style="background: white; color: #6a1b9a; padding: 6px 14px; border-radius: 20px; text-decoration: none; font-weight: bold; font-size: 0.9rem; box-shadow: 0 2px 5px rgba(0,0,0,0.2);"><i class="fa-solid fa-file-pdf me-1"></i> Goods Receipt Note</a>`;

  if (res.sheetUrl) html += `<a href="${res.sheetUrl}" target="_blank" style="background: white; color: #6a1b9a; padding: 6px 14px; border-radius: 20px; text-decoration: none; font-weight: bold; font-size: 0.9rem; box-shadow: 0 2px 5px rgba(0,0,0,0.2);"><i class="fa-solid fa-table me-1"></i> Sheet Record</a>`;

  html += `</div></div>`;

  container.innerHTML = html;
  container.style.display = 'block';
}

function resetFormOptimistically() {
  if (successModalObj) successModalObj.hide();
  document.getElementById('main-inward-form').reset();
  document.getElementById('vendorInvoiceNumber').innerHTML = '<option value="">-- Select Invoice (Gate Entry) --</option>';
  removePhoto();

  state.editMode = false;
  state.editGrnNo = null;

  // Remove edit mode badge
  const editBadge = document.getElementById('edit-mode-badge');
  if (editBadge) editBadge.style.display = 'none';

  const submitBtn = document.querySelector('.btn-save-pdf');
  if (submitBtn) submitBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save & Submit Inward Entry';

  renderItemsTable([]);

  // Reset checklist selection
  state.selectedChecklists = [];
  renderChecklistOptions(state.masterData.checklistTabNames || []);
  renderChecklistTags();

  // Optimistically increment GRN NO
  if (state.masterData && state.masterData.nextGrnNo) {
    const match = state.masterData.nextGrnNo.match(/\d+$/);
    if (match) {
      const num = parseInt(match[0]) + 1;
      const newGrn = state.masterData.nextGrnNo.replace(/\d+$/, num);
      state.masterData.nextGrnNo = newGrn;
      document.getElementById('top-grn-span').innerText = newGrn;
      document.getElementById('grnNoDisplay').value = newGrn;
    }
  }

  // Silent reload of master data & history
  loadMasterDataInstant();
  loadInwardHistory(true);
}

function resetFormAndCloseSuccessModal() {
  if (successModalObj) successModalObj.hide();
  document.getElementById('main-inward-form').reset();
  document.getElementById('vendorInvoiceNumber').innerHTML = '<option value="">-- Select Invoice (Gate Entry) --</option>';
  removePhoto();

  state.editMode = false;
  state.editGrnNo = null;
  document.getElementById('grnDisplayBtn').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Refreshing...';
  document.getElementById('top-grn-span').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Refreshing...';

  const submitBtn = document.querySelector('.btn-save-pdf');
  if (submitBtn) submitBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save & Submit Inward Entry';

  renderItemsTable([]);

  // Force a real-time fresh fetch by clearing the cache
  localStorage.removeItem(CACHE_KEY_MASTER);
  loadMasterDataInstant();
}

function handleFormSubmit(e) {
  e.preventDefault();
  openConfirmationModal();
}

// HIGH-SPEED HISTORY LOADING & DEPENDENT FILTERS
async function loadInwardHistory(forceRefresh = false) {
  const tbody = document.getElementById('history-tbody');
  if (!tbody) return;

  // Show loading indicator
  tbody.innerHTML = `<tr><td colspan="13" style="text-align:center; padding:2rem;">
        <div style="display:inline-flex; align-items:center; gap:10px; color:var(--text-muted);">
          <div class="spinner-border spinner-border-sm text-primary" role="status"></div>
          <span>Loading last 500 records from Google Sheet...</span>
        </div>
      </td></tr>`;

  try {
    const res = await callBackend('getInwardHistory', [null, 500]);
    if (res.status === 'success') {
      state.historyRecords = res.data || [];
      populateHistoryFilterDropdowns(state.historyRecords);
      applyHistoryFilters();
    } else {
      console.error('History load error:', res.message);
      tbody.innerHTML = `<tr><td colspan="13" style="text-align:center; color:red; padding:2rem;">
            <i class="fa-solid fa-circle-exclamation me-2"></i>Error loading history: ${res.message || 'Unknown error'}
          </td></tr>`;
    }
  } catch (e) {
    console.error(e);
    tbody.innerHTML = '<tr><td colspan="13" style="text-align:center; color:red; padding:2rem;"><i class="fa-solid fa-wifi me-2"></i>Network error loading history. Please refresh.</td></tr>';
  }
}

function populateHistoryFilterDropdowns(records) {
  const poSelect = document.getElementById('filter-history-po');
  const vendorSelect = document.getElementById('filter-history-vendor');
  const personSelect = document.getElementById('filter-history-person');

  const poSet = new Set();
  const vendorSet = new Set();
  const personSet = new Set();

  records.forEach(r => {
    if (r.vendorPoNumber) poSet.add(r.vendorPoNumber);
    if (r.vendorName) vendorSet.add(r.vendorName);
    if (r.receivingPerson) personSet.add(r.receivingPerson);
  });

  poSelect.innerHTML = '<option value="">All PO Numbers</option>';
  Array.from(poSet).sort().forEach(po => {
    poSelect.innerHTML += `<option value="${po}">${po}</option>`;
  });

  vendorSelect.innerHTML = '<option value="">All Vendors</option>';
  Array.from(vendorSet).sort().forEach(v => {
    vendorSelect.innerHTML += `<option value="${v}">${v}</option>`;
  });

  personSelect.innerHTML = '<option value="">All Receivers</option>';
  Array.from(personSet).sort().forEach(p => {
    personSelect.innerHTML += `<option value="${p}">${p}</option>`;
  });
}

function applyHistoryFilters() {
  const searchQuery = (document.getElementById('history-search-input').value || '').toLowerCase();
  const filterPo = document.getElementById('filter-history-po').value;
  const filterVendor = document.getElementById('filter-history-vendor').value;
  const filterPerson = document.getElementById('filter-history-person').value;

  const filtered = state.historyRecords.filter(r => {
    if (filterPo && r.vendorPoNumber !== filterPo) return false;
    if (filterVendor && r.vendorName !== filterVendor) return false;
    if (filterPerson && r.receivingPerson !== filterPerson) return false;

    if (searchQuery) {
      const matchStr = `${r.grnNo} ${r.vendorPoNumber} ${r.vendorName} ${r.vendorInvoiceNumber} ${r.productCode} ${r.rmPmName} ${r.receivingPerson}`.toLowerCase();
      if (!matchStr.includes(searchQuery)) return false;
    }
    return true;
  });

  renderHistoryTable(filtered);
}

function editRecord(grnNo) {
  const records = state.historyRecords.filter(r => r.grnNo === grnNo);
  if (!records.length) {
    showToast('Record not found. Please refresh history.', 'error');
    return;
  }

  const header = records[0];

  // Passcode check for next-day edits
  if (header.timestamp) {
    const entryDate = new Date(header.timestamp);
    if (!isNaN(entryDate.getTime())) {
      const today = new Date();
      const isToday = (entryDate.getFullYear() === today.getFullYear() &&
        entryDate.getMonth() === today.getMonth() &&
        entryDate.getDate() === today.getDate());

      if (!isToday) {
        showModernPasscodeModal(() => {
          continueEditRecord(grnNo, header, records);
        });
        return;
      }
    }
  }
  continueEditRecord(grnNo, header, records);
}

function continueEditRecord(grnNo, header, records) {
  // ── Vendor Details ──
  // Inject PO number as an option if not already present (handles completed/filtered-out POs)
  const poSel = document.getElementById('vendorPoNumber');
  const poVal = header.vendorPoNumber || '';
  if (poVal && ![...poSel.options].some(o => o.value === poVal)) {
    const poOpt = document.createElement('option');
    poOpt.value = poVal;
    poOpt.text = poVal;
    poSel.appendChild(poOpt);
  }
  poSel.value = poVal;

  document.getElementById('vendorName').value = header.vendorName || '';

  // PO Date
  if (header.vendorPoDate) {
    try {
      const poDate = new Date(header.vendorPoDate);
      if (!isNaN(poDate)) document.getElementById('vendorPoDate').value = poDate.toISOString().split('T')[0];
      else document.getElementById('vendorPoDate').value = header.vendorPoDate;
    } catch (e) { document.getElementById('vendorPoDate').value = header.vendorPoDate || ''; }
  }

  // Invoice Number — restore as editable option
  const invSel = document.getElementById('vendorInvoiceNumber');
  invSel.innerHTML = `<option value="${header.vendorInvoiceNumber || ''}">${header.vendorInvoiceNumber || '(No Invoice)'}</option>`;
  invSel.value = header.vendorInvoiceNumber || '';

  document.getElementById('vendorChallanNumber').value = header.vendorChallanNumber || '';

  // Inward Date
  if (header.inwardDate) {
    try {
      const inDate = new Date(header.inwardDate);
      if (!isNaN(inDate)) document.getElementById('inwardDate').value = inDate.toISOString().split('T')[0];
      else document.getElementById('inwardDate').value = header.inwardDate;
    } catch (e) { document.getElementById('inwardDate').value = header.inwardDate || ''; }
  }

  // Receiving fields
  const personSel = document.getElementById('receivingPerson');
  if (![...personSel.options].some(o => o.value === header.receivingPerson)) {
    const opt = document.createElement('option');
    opt.value = header.receivingPerson || '';
    opt.text = header.receivingPerson || '';
    personSel.appendChild(opt);
  }
  personSel.value = header.receivingPerson || '';

  const locSel = document.getElementById('receivingLocation');
  if (![...locSel.options].some(o => o.value === header.receivingLocation)) {
    const opt = document.createElement('option');
    opt.value = header.receivingLocation || '';
    opt.text = header.receivingLocation || '';
    locSel.appendChild(opt);
  }
  locSel.value = header.receivingLocation || '';

  // ── Restore ALL item fields from history ──
  // Sort records by S.No ascending (1, 2, 3...)
  records.sort((a, b) => (parseInt(a.sNo, 10) || 0) - (parseInt(b.sNo, 10) || 0));

  state.currentPoItems = records.map((r, idx) => ({
    sNo: r.sNo || (idx + 1),
    rmPmName: r.rmPmName || '',
    productCode: r.productCode || '',
    widthOfRoll: r.widthOfRoll || '',
    poQuantity: parseFloat(r.poQuantity) || 0,
    poUnits: r.poUnits || r.storeUnit || '',
    poPrice: parseFloat(r.poPrice) || 0,
    notes: r.notes || '',
    pendingQuantity: parseFloat(r.pendingQuantity) || 0,
    billChallanQty: parseFloat(r.billChallanQty) || 0,
    storeQty: parseFloat(r.storeQty) || 0,
    storeUnit: r.storeUnit || '',
    billPrice: parseFloat(r.billPrice) || 0,
    priceUnit: r.priceUnit || r.storeUnit || '',
    isSelected: true
  }));

  state.editMode = true;
  state.editGrnNo = grnNo;

  // Update GRN display
  document.getElementById('top-grn-span').innerText = grnNo;
  document.getElementById('grnNoDisplay').value = grnNo;

  // Show edit mode badge
  let editBadge = document.getElementById('edit-mode-badge');
  if (editBadge) {
    editBadge.style.display = 'inline-flex';
    editBadge.innerText = `✏️ EDITING: ${grnNo}`;
  }

  // Update submit button text and ensure it is visible
  const submitBtn = document.querySelector('.btn-save-pdf');
  if (submitBtn) {
    submitBtn.style.display = 'inline-flex';
    submitBtn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Save and Submit Revised Entry';
  }

  renderItemsTable(state.currentPoItems);

  // Switch to form tab
  document.getElementById('main-inward-form').style.display = 'block';
  document.getElementById('history-view').style.display = 'none';

  showToast(`✏️ Editing GRN: ${grnNo} — ${records.length} item(s) loaded`, 'info');

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetHistoryFilters() {
  document.getElementById('history-search-input').value = '';
  document.getElementById('filter-history-po').value = '';
  document.getElementById('filter-history-vendor').value = '';
  document.getElementById('filter-history-person').value = '';
  applyHistoryFilters();
}

function renderHistoryTable(records) {
  const tbody = document.getElementById('history-tbody');
  if (!records || records.length === 0) {
    tbody.innerHTML = '<tr><td colspan="13" style="text-align:center; padding:2rem; color:var(--text-muted);">No matching history records found.</td></tr>';
    return;
  }

  let html = '';
  records.forEach(r => {
    html += `
          <tr>
            <td>${formatLongDate(r.timestamp)}</td>
            <td style="font-family:monospace; font-weight:700; color:var(--accent-primary);">${r.grnNo}</td>
            <td>${r.vendorPoNumber}</td>
            <td>${r.vendorName}</td>
            <td>${r.vendorInvoiceNumber}</td>
            <td>${formatShortDate(r.inwardDate)}</td>
            <td>${r.rmPmName}</td>
            <td><strong>${r.storeQty}</strong> ${r.storeUnit}</td>
            <td>${r.receivingPerson}</td>
            <td>${r.attachmentUrl ? `<a href="${r.attachmentUrl}" target="_blank" style="color:#2563eb; font-weight:600;"><i class="fa-solid fa-image me-1"></i> Photo</a>` : '-'}</td>
            <td>${r.pdfUrl ? `<a href="${r.pdfUrl}" target="_blank" style="color:#ea580c; font-weight:600;"><i class="fa-solid fa-file-pdf me-1"></i> PDF</a>` : '-'}</td>
            <td>${r.sheetUrl ? `<a href="${r.sheetUrl}" target="_blank" style="color:#10b981; font-weight:600;"><i class="fa-solid fa-file-excel me-1"></i> Sheet</a>` : '-'}</td>
            <td>
              <button class="btn-action-sec" style="color:#2563eb; border-color:#2563eb;" onclick="editRecord('${r.grnNo}')"><i class="fa-solid fa-pen-to-square"></i> Edit</button>
            </td>
          </tr>`;
  });
  tbody.innerHTML = html;
}

function showToast(msg, type = 'info') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast-msg toast-${type}`;
  t.innerHTML = `<i class="${type === 'success' ? 'fa-solid fa-circle-check text-success' : 'fa-solid fa-circle-exclamation text-danger'} me-2"></i> ${msg}`;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}



/* ─── Pending Entries Dashboard Logic ─── */
function renderPendingScorecardAndDetails() {
  const scorecardContainer = document.getElementById('pending-scorecard-container');
  const detailsPanel = document.getElementById('pending-details-panel');
  const detailsContainer = document.getElementById('pending-details-container');

  if (!scorecardContainer || !detailsPanel || !detailsContainer) return;

  if (!state.masterData || !state.masterData.poList || !state.masterData.gateEntryInvoicesMap) {
    scorecardContainer.style.display = 'none';
    detailsPanel.style.display = 'none';
    return;
  }

  const poList = state.masterData.poList;
  const invoicesMap = state.masterData.gateEntryInvoicesMap;
  const poMap = state.masterData.poMap || {};

  let totalPendingPOs = poList.length;
  let totalPendingInvoices = 0;

  let detailsHtml = '';

  poList.forEach(po => {
    const invoices = invoicesMap[po] || [];
    if (invoices.length > 0) {
      totalPendingInvoices += invoices.length;

      const vendorName = poMap[po] ? poMap[po].vendorName : 'Unknown Vendor';

      detailsHtml += `
        <div class="funky-notification-card">
          <div class="funky-icon-box">
            <i class="fa-solid fa-bell fa-shake" style="--fa-animation-duration: 3s;"></i>
          </div>
          <div class="funky-card-content">
            <div class="funky-po">
              <span class="funky-po-num"><i class="fa-solid fa-hashtag"></i> ${po}</span>
              <span class="funky-vendor"><i class="fa-solid fa-building me-1"></i> ${vendorName}</span>
            </div>
            <div class="funky-invoices">
              ${invoices.map(inv => `<span class="funky-invoice-tag"><i class="fa-solid fa-file-invoice"></i> ${inv}</span>`).join('')}
            </div>
          </div>
        </div>
      `;
    }
  });

  // Update Scorecards
  const scorecardPo = document.getElementById('scorecard-po');
  const scorecardInvoice = document.getElementById('scorecard-invoice');
  if (scorecardPo) scorecardPo.innerText = totalPendingPOs;
  if (scorecardInvoice) scorecardInvoice.innerText = totalPendingInvoices;

  if (totalPendingPOs > 0) {
    scorecardContainer.style.display = 'flex';
    detailsPanel.style.display = 'block';
    detailsContainer.innerHTML = detailsHtml;
  } else {
    // Show 0 scorecard
    scorecardContainer.style.display = 'flex';
    detailsPanel.style.display = 'block';
    detailsContainer.innerHTML = `<div style="text-align:center; color:var(--success); padding: 15px; font-weight:600;"><i class="fa-solid fa-circle-check" style="font-size:2rem; display:block; margin-bottom:8px;"></i> All Caught Up! No pending Gate Entries.</div>`;
  }
}

// --- Add Receiving Person / Location Modal Logic ---
let addReceivingModalInstance = null;
let addReceivingCurrentType = null; // 'person' or 'location'

function openAddReceivingModal(type) {
  addReceivingCurrentType = type;

  // Configure modal appearance
  const isPerson = type === 'person';
  const title = isPerson ? 'Add Receiving Person' : 'Add Receiving Location';
  const subtitle = isPerson ? 'नया प्राप्तकर्ता व्यक्ति जोड़ें' : 'नया प्राप्ति स्थान जोड़ें';
  const label = isPerson ? 'Person Name (व्यक्ति का नाम)' : 'Location Name (स्थान का नाम)';
  const placeholder = isPerson ? 'e.g. Ramesh Kumar' : 'e.g. Export Packing Section';
  const headerBg = isPerson
    ? 'linear-gradient(135deg,#1e40af,#3b82f6)'
    : 'linear-gradient(135deg,#065f46,#10b981)';
  const btnBg = isPerson
    ? 'linear-gradient(135deg,#1e40af,#3b82f6)'
    : 'linear-gradient(135deg,#065f46,#10b981)';
  const iconClass = isPerson ? 'fa-solid fa-user-plus' : 'fa-solid fa-location-dot';

  document.getElementById('addReceivingModal-title').textContent = title;
  document.getElementById('addReceivingModal-subtitle').textContent = subtitle;
  document.getElementById('addReceivingModal-label').textContent = label;
  document.getElementById('addReceivingModal-input').placeholder = placeholder;
  document.getElementById('addReceivingModal-input').value = '';
  document.getElementById('addReceivingModal-icon').style.background = headerBg;
  document.getElementById('addReceivingModal-icon-i').className = iconClass + ' ' + 'text-white';
  document.getElementById('addReceivingModal-submit-btn').style.background = btnBg;
  document.getElementById('addReceivingModal-error').style.display = 'none';
  document.getElementById('addReceivingModal-error').textContent = '';

  if (!addReceivingModalInstance) {
    addReceivingModalInstance = new bootstrap.Modal(document.getElementById('addReceivingModal'));
  }
  addReceivingModalInstance.show();
  setTimeout(() => document.getElementById('addReceivingModal-input').focus(), 350);
}

async function submitAddReceivingOption() {
  const inputEl = document.getElementById('addReceivingModal-input');
  const errorEl = document.getElementById('addReceivingModal-error');
  const submitBtn = document.getElementById('addReceivingModal-submit-btn');
  const value = (inputEl.value || '').trim();

  errorEl.style.display = 'none';
  errorEl.textContent = '';

  if (!value) {
    errorEl.textContent = 'Please enter a name before adding.';
    errorEl.style.display = 'block';
    inputEl.focus();
    return;
  }

  // Disable button to prevent double-click
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i> Saving...';

  try {
    const res = await callBackend('addReceivingOption', [addReceivingCurrentType, value]);
    if (res.status === 'success') {
      addReceivingModalInstance.hide();
      showToast(`✅ "${res.addedValue}" added to list!`, 'success');

      // Optimistically add to state + dropdown immediately
      if (addReceivingCurrentType === 'person') {
        if (!state.masterData.receivingPersons.includes(res.addedValue)) {
          state.masterData.receivingPersons.push(res.addedValue);
        }
        const sel = document.getElementById('receivingPerson');
        const opt = document.createElement('option');
        opt.value = res.addedValue;
        opt.text = res.addedValue;
        sel.appendChild(opt);
        sel.value = res.addedValue;
      } else {
        if (!state.masterData.receivingLocations.includes(res.addedValue)) {
          state.masterData.receivingLocations.push(res.addedValue);
        }
        const sel = document.getElementById('receivingLocation');
        const opt = document.createElement('option');
        opt.value = res.addedValue;
        opt.text = res.addedValue;
        sel.appendChild(opt);
        sel.value = res.addedValue;
      }

      // Also refresh master data in background to keep cache in sync
      loadMasterDataInstant();
    } else {
      errorEl.textContent = res.message || 'Failed to add. Please try again.';
      errorEl.style.display = 'block';
    }
  } catch (err) {
    errorEl.textContent = 'Network error. Please try again.';
    errorEl.style.display = 'block';
  } finally {
    submitBtn.disabled = false;
    const isPerson = addReceivingCurrentType === 'person';
    submitBtn.innerHTML = '<i class="fa-solid fa-check me-1"></i> Add to List';
  }
}

// --- Modern Passcode Logic ---
let passcodeCallback = null;
let passcodeModalInstance = null;

function showModernPasscodeModal(callback) {
  passcodeCallback = callback;
  if (!passcodeModalInstance) {
    passcodeModalInstance = new bootstrap.Modal(document.getElementById('passcodeModal'));
  }

  // Clear inputs
  const inputs = document.querySelectorAll('.passcode-box');
  inputs.forEach(input => input.value = '');
  inputs.forEach(input => input.classList.remove('error-shake'));

  passcodeModalInstance.show();

  // Focus first input
  setTimeout(() => inputs[0].focus(), 300);
}

function cancelPasscodeModal() {
  if (passcodeModalInstance) passcodeModalInstance.hide();
  passcodeCallback = null;
}

// Attach event listeners for OTP style input
document.addEventListener('DOMContentLoaded', () => {
  const inputs = document.querySelectorAll('.passcode-box');
  inputs.forEach((input, index) => {
    input.addEventListener('keyup', function (e) {
      if (e.key === 'Backspace') {
        if (index > 0 && !this.value) {
          inputs[index - 1].focus();
        }
      } else if (e.key >= '0' && e.key <= '9') {
        this.value = e.key;
        if (index < inputs.length - 1) {
          inputs[index + 1].focus();
        } else {
          // Last input, check passcode
          const passcode = Array.from(inputs).map(i => i.value).join('');
          if (passcode === '0548') {
            passcodeModalInstance.hide();
            if (passcodeCallback) {
              const cb = passcodeCallback;
              passcodeCallback = null;
              cb();
            }
          } else {
            inputs.forEach(i => i.classList.add('error-shake'));
            setTimeout(() => {
              inputs.forEach(i => {
                i.classList.remove('error-shake');
                i.value = '';
              });
              inputs[0].focus();
            }, 400);
          }
        }
      } else {
        this.value = ''; // prevent non-numeric
      }
    });
  });
});
