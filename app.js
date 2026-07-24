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
        nextGrnNo: 'RKD/GRN/2026/2173'
      },
      currentPoItems: [],
      photoBase64: null,
      historyRecords: [],
      filteredHistory: [],
      editMode: false,
      editGrnNo: null
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
        } catch(e) {}
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

    const API_URL = 'https://script.google.com/macros/s/AKfycbydpyiSWMvBVNo-O3NKKdEOC_GRzv3MTPpQkmfqoBqOUzIpPQKpuVxdUk-_Ye3Vf4vg8g/exec'; // New Web App URL

    function switchTab(tab) {
      document.getElementById('main-inward-form').style.display = tab === 'form' ? 'block' : 'none';
      document.getElementById('history-view').style.display = tab === 'history' ? 'block' : 'none';
      if (tab === 'history') {
        // Only reload if no data yet or explicitly requested
        if (!state.historyRecords || state.historyRecords.length === 0) {
          loadInwardHistory();
        } else {
          applyHistoryFilters();
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

      document.getElementById('confirm-grn').innerText = state.editMode ? state.editGrnNo : state.masterData.nextGrnNo;
      document.getElementById('confirm-po').innerText = document.getElementById('vendorPoNumber').value || '-';
      document.getElementById('confirm-invoice').innerText = document.getElementById('vendorInvoiceNumber').value || '-';
      document.getElementById('confirm-vendor').innerText = document.getElementById('vendorName').value || '-';
      document.getElementById('confirm-person').innerText = document.getElementById('receivingPerson').value || '-';
      document.getElementById('confirm-items-count').innerText = `${selectedItems.length} items`;
      
      const photoStatus = state.photoBase64 ? '<span class="text-success"><i class="fa-solid fa-check-circle me-1"></i> Attached (Will save to Drive)</span>' : '<span class="text-muted">No photo attached</span>';
      document.getElementById('confirm-photo-status').innerHTML = photoStatus;

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
        photoBase64: state.photoBase64
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
      if(res.status !== 'success') return;
      
      const container = document.getElementById('latest-entry-links-container');
      if(!container) return;
      
      let html = `<div style="background: linear-gradient(45deg, #6a1b9a, #8e24aa); padding: 15px; border-radius: 12px; color: white; margin-top: 20px; box-shadow: 0 4px 15px rgba(106, 27, 154, 0.4); animation: blinkBackground 2.5s infinite;">`;
      html += `<h4 style="margin: 0 0 10px 0; font-size: 1.1rem; font-weight: 700;"><i class="fa-solid fa-bolt text-warning me-2"></i>Background Process Finished for ${grnNo}!</h4>`;
      html += `<div style="display: flex; gap: 10px; flex-wrap: wrap;">`;
      
      if(res.photoUrl) html += `<a href="${res.photoUrl}" target="_blank" style="background: white; color: #6a1b9a; padding: 6px 14px; border-radius: 20px; text-decoration: none; font-weight: bold; font-size: 0.9rem; box-shadow: 0 2px 5px rgba(0,0,0,0.2);"><i class="fa-solid fa-image me-1"></i> Invoice Photo</a>`;
      
      if(res.pdfUrl) html += `<a href="${res.pdfUrl}" target="_blank" style="background: white; color: #6a1b9a; padding: 6px 14px; border-radius: 20px; text-decoration: none; font-weight: bold; font-size: 0.9rem; box-shadow: 0 2px 5px rgba(0,0,0,0.2);"><i class="fa-solid fa-file-pdf me-1"></i> Goods Receipt Note</a>`;
      
      if(res.sheetUrl) html += `<a href="${res.sheetUrl}" target="_blank" style="background: white; color: #6a1b9a; padding: 6px 14px; border-radius: 20px; text-decoration: none; font-weight: bold; font-size: 0.9rem; box-shadow: 0 2px 5px rgba(0,0,0,0.2);"><i class="fa-solid fa-table me-1"></i> Sheet Record</a>`;
      
      html += `</div></div>`;
      
      container.innerHTML = html;
      container.style.display = 'block';
    }

    function resetFormOptimistically() {
      if (successModalObj) successModalObj.hide();
      document.getElementById('main-inward-form').reset();
      removePhoto();
      
      state.editMode = false;
      state.editGrnNo = null;

      // Remove edit mode badge
      const editBadge = document.getElementById('edit-mode-badge');
      if (editBadge) editBadge.style.display = 'none';
      
      const submitBtn = document.querySelector('#main-inward-form button[type="submit"]');
      if(submitBtn) submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane me-2"></i> Submit Inward Entry';

      renderItemsTable([]);
      
      // Optimistically increment GRN NO
      if (state.masterData && state.masterData.nextGrnNo) {
        const match = state.masterData.nextGrnNo.match(/\d+$/);
        if(match) {
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
      removePhoto();
      
      state.editMode = false;
      state.editGrnNo = null;
      document.getElementById('grnDisplayBtn').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Refreshing...';
      document.getElementById('top-grn-span').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Refreshing...';
      
      const submitBtn = document.querySelector('#main-inward-form button[type="submit"]');
      if(submitBtn) submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane me-2"></i> Submit Inward Entry';

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
        } catch(e) { document.getElementById('vendorPoDate').value = header.vendorPoDate || ''; }
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
        } catch(e) { document.getElementById('inwardDate').value = header.inwardDate || ''; }
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

      // Update submit button text
      const submitBtn = document.querySelector('#main-inward-form button[type="submit"]');
      if (submitBtn) submitBtn.innerHTML = '<i class="fa-solid fa-pen-to-square me-2"></i> Update Inward Entry';
      
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
