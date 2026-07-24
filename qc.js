// qc.js

const API_URL = 'https://script.google.com/macros/s/AKfycbzhndPekBZSYxWyh4T41FPC_5wHz_-4o4rsngWOFtzCC_9X4YAHcGxZgIBZ66qCjAioBg/exec';

let state = {
  pendingGRNs: [],
  passingPersons: [],
  completedQCs: [],
  selectedGRN: null,
  status: null,
  checklistUrl: null,
  invoiceUrl: null,
  photoBase64: null,
  qcEditMode: false,
  qcEditData: null
};

async function callBackend(funcName, params = []) {
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
    if (!response.ok) throw new Error('Network response was not ok');
    return await response.json();
  } catch (error) {
    console.error("API Call Error:", error);
    throw error;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Check if GRN is passed via URL parameter
  const urlParams = new URLSearchParams(window.location.search);
  const grnParam = urlParams.get('grn');
  
  loadQCData(false, grnParam);
});

async function loadQCData(force = false, autoSelectGrn = null) {
  if (!force && state.pendingGRNs.length > 0) return;
  
  if (!autoSelectGrn) {
    document.getElementById('loading-state').style.display = 'flex';
  } else {
    // Instantly show skeleton form to avoid user wait time
    document.getElementById('form-grn-title').innerText = autoSelectGrn;
    document.getElementById('form-vendor-name').innerText = 'Loading details...';
    document.getElementById('form-po-info').innerText = 'Syncing from server...';
    document.getElementById('form-items-tags').innerHTML = '<span class="tag"><i class="fa-solid fa-spinner fa-spin"></i> Fetching items...</span>';
    
    // Temporary selected GRN so the form doesn't crash if they try to interact
    state.selectedGRN = { grnNo: autoSelectGrn };
    
    document.getElementById('view-list').classList.remove('active-view');
    document.getElementById('view-list').classList.add('slide-right');
    document.getElementById('view-form').classList.remove('slide-right');
    document.getElementById('view-form').classList.add('active-view');
  }

  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('cards-container').innerHTML = '';
  document.getElementById('pending-count').innerText = '...';

  try {
    const json = await callBackend('getQualityCheckData');
    
    if (json.status === 'success') {
      state.pendingGRNs = json.data.pendingGRNs || [];
      state.passingPersons = json.data.passingPersons || [];
      state.completedQCs = json.data.completedQCs || [];
      renderCards();
      populateHistoryFilter();
      
      // Auto-open form if GRN parameter exists
      if (autoSelectGrn) {
        const target = state.pendingGRNs.find(g => g.grnNo === autoSelectGrn);
        if (target) {
          openForm(target);
        } else {
          // If not found in pending, maybe it's already complete or invalid
          document.getElementById('form-vendor-name').innerText = 'Entry Not Found';
          document.getElementById('form-po-info').innerText = 'This GRN might already be completed.';
          document.getElementById('form-items-tags').innerHTML = '<span class="tag" style="background:#fee2e2; color:#ef4444;">No pending items</span>';
        }
      }
    } else {
      alert('Error loading data: ' + json.message);
    }
  } catch (err) {
    alert('Network error. Please try again.');
  } finally {
    document.getElementById('loading-state').style.display = 'none';
  }
}

function renderCards() {
  const container = document.getElementById('cards-container');
  container.innerHTML = '';
  
  document.getElementById('pending-count').innerText = state.pendingGRNs.length;

  if (state.pendingGRNs.length === 0) {
    document.getElementById('empty-state').style.display = 'flex';
    return;
  }
  document.getElementById('empty-state').style.display = 'none';

  state.pendingGRNs.forEach((grn, idx) => {
    const card = document.createElement('div');
    card.className = 'grn-card';
    
    const itemsHtml = (grn.items || []).map(i =>
      `<span class="tag">${i.name}${i.qty ? ` (${i.qty} ${i.unit})` : ''}</span>`
    ).join('');

    card.innerHTML = `
      <div class="card-accent-bar"></div>
      <div class="card-body">
        <div class="card-top">
          <span class="card-grn">${grn.grnNo}</span>
          <span class="card-date"><i class="fa-regular fa-calendar"></i> ${grn.inwardDate || '—'}</span>
        </div>
        <div class="card-vendor">${grn.vendorName || '—'}</div>
        <div class="card-meta-row">
          <span class="card-meta-item"><i class="fa-solid fa-file-invoice"></i> ${grn.invoiceNo || 'N/A'}</span>
          <span class="card-meta-item"><i class="fa-solid fa-hashtag"></i> ${grn.poNumber || 'N/A'}</span>
        </div>
        <div class="tags-container">${itemsHtml}</div>
        <button class="btn-card-action" onclick='openFormById("${grn.grnNo}")'>
          <i class="fa-solid fa-clipboard-check"></i> Start Inspection
          <i class="fa-solid fa-arrow-right ms-1"></i>
        </button>
      </div>
    `;
    container.appendChild(card);
  });
}


function openFormById(grnNo) {
  const grn = state.pendingGRNs.find(g => g.grnNo === grnNo);
  if (grn) openForm(grn);
}

function openForm(grn) {
  state.selectedGRN = grn;
  
  document.getElementById('form-grn-title').innerText = grn.grnNo;
  document.getElementById('form-vendor-name').innerText = grn.vendorName;
  document.getElementById('form-po-info').innerText = `PO: ${grn.poNumber || 'N/A'} | Inv: ${grn.invoiceNo || 'N/A'}`;
  
  document.getElementById('form-items-tags').innerHTML = (grn.items || []).map(i => `<span class="tag">${i.name} (${i.qty} ${i.unit})</span>`).join('');
  
  // Render passing persons
  const grid = document.getElementById('person-grid');
  grid.innerHTML = state.passingPersons.map((p, idx) => `
    <label class="radio-option">
      <input type="radio" name="passing_person" value="${p}" ${idx===0?'checked':''} onchange="toggleCustomPerson()">
      ${p}
    </label>
  `).join('') + `
    <label class="radio-option">
      <input type="radio" name="passing_person" value="Other" onchange="toggleCustomPerson()">
      <i class="fa-solid fa-plus me-1"></i> Add New Person
    </label>
  `;

  // Reset Form state
  state.qcEditMode = false;
  state.qcEditData = null;
  setStatus(null);
  state.checklistUrl = null;
  state.invoiceUrl = null;
  resetUpload('checklist');
  resetUpload('invoice');
  document.getElementById('return-detail').value = '';
  document.querySelector('input[name="return_opt"][value="No"]').checked = true;
  toggleReturnInput();
  document.getElementById('input-next-date').value = '';

  document.getElementById('view-form').classList.add('active-view');
  document.getElementById('view-list').classList.remove('active-view');
}

function closeForm() {
  document.getElementById('view-form').classList.remove('active-view');
  document.getElementById('view-list').classList.add('active-view');
  state.selectedGRN = null;
  state.qcEditMode = false;
  state.qcEditData = null;
  document.getElementById('btn-submit').innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit Entry';
}

function setStatus(statusValue) {
  state.status = statusValue;
  const btnComp = document.getElementById('btn-status-completed');
  const btnPend = document.getElementById('btn-status-pending');
  
  btnComp.classList.remove('active');
  btnPend.classList.remove('active');
  
  const dynFields = document.getElementById('dynamic-fields');
  const actBar = document.getElementById('action-bar');
  const nextDateSec = document.getElementById('section-next-date');

  if (!statusValue) {
    dynFields.style.display = 'none';
    actBar.style.display = 'none';
    return;
  }

  dynFields.style.display = 'block';
  actBar.style.display = 'block';

  if (statusValue === 'Delivery Completed') {
    btnComp.classList.add('active');
    nextDateSec.style.display = 'none';
  } else {
    btnPend.classList.add('active');
    nextDateSec.style.display = 'block';
  }
}

function toggleReturnInput() {
  const val = document.querySelector('input[name="return_opt"]:checked').value;
  document.getElementById('return-detail').style.display = val === 'Other' ? 'block' : 'none';
}

window.toggleCustomPerson = function() {
  const checked = document.querySelector('input[name="passing_person"]:checked');
  const customInput = document.getElementById('custom-person-input');
  if (customInput) {
    if (checked && checked.value === 'Other') {
      customInput.style.display = 'block';
      customInput.focus();
    } else {
      customInput.style.display = 'none';
    }
  }
}

function resetUpload(type) {
  const zone = document.getElementById(`zone-${type}`);
  if (zone) { zone.style.display = 'block'; zone.classList.remove('uploaded'); }
  const preview = document.getElementById(`preview-${type}`);
  if (preview) { preview.style.display = 'none'; preview.innerHTML = ''; }
  const prog = document.getElementById(`progress-${type}`);
  if (prog) { prog.style.display = 'none'; prog.innerHTML = '<div class="progress-bar"></div><span>Compressing...</span>'; }
  // Clear both inputs
  ['cam', 'gal'].forEach(suffix => {
    const el = document.getElementById(`input-${type}-${suffix}`);
    if (el) el.value = '';
  });
  if (type === 'checklist') state.checklistUrl = null;
  if (type === 'invoice') state.invoiceUrl = null;
}

/**
 * Compress an image File using Canvas API.
 * Max dimension: 1280px. Quality: 0.65 JPEG.
 * Reduces 10-20MB camera photo → ~150-300KB.
 */
function compressImage(file, maxPx = 1280, quality = 0.65) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        try {
          let { width, height } = img;
          if (width > maxPx || height > maxPx) {
            if (width > height) {
              height = Math.round((height * maxPx) / width);
              width = maxPx;
            } else {
              width = Math.round((width * maxPx) / height);
              height = maxPx;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', quality);
          resolve(compressed);
        } catch (err) {
          reject(err);
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function handleFile(input, type) {
  const file = input.files[0];
  if (!file) return;

  const zone    = document.getElementById(`zone-${type}`);
  const preview = document.getElementById(`preview-${type}`);
  const progEl  = document.getElementById(`progress-${type}`);
  const progTxt = document.getElementById(`progress-${type}-text`);

  // Show progress immediately, hide upload zone
  zone.style.display = 'none';
  progEl.style.display = 'flex';
  if (progTxt) progTxt.textContent = 'Compressing...';

  try {
    // 1. Compress (canvas, max 1280px, JPEG 0.65)
    const compressed = await compressImage(file, 1280, 0.65);

    // 2. Show thumbnail preview
    preview.style.display = 'block';
    preview.innerHTML = `<img src="${compressed}" style="max-height:160px;">
      <button type="button" class="img-remove-btn" onclick="resetUpload('${type}')">
        <i class="fa-solid fa-times"></i>
      </button>`;

    // 3. Upload to backend
    if (progTxt) progTxt.textContent = 'Uploading...';
    const data = await callBackend('uploadQcPhoto', [compressed, file.name.replace(/\.[^.]+$/, '.jpg'), type]);

    if (data.status === 'success') {
      if (type === 'checklist') state.checklistUrl = data.fileUrl;
      if (type === 'invoice')   state.invoiceUrl   = data.fileUrl;
      zone.classList.add('uploaded');
      progEl.innerHTML = '<span style="color:var(--success);"><i class="fa-solid fa-check"></i> Uploaded ✓</span>';
    } else {
      throw new Error(data.message || 'Upload failed');
    }
  } catch (err) {
    console.error('handleFile error:', err);
    alert('Error: ' + (err.message || 'Please try again.'));
    resetUpload(type);
  }
}

async function submitForm() {
  if (!state.checklistUrl || !state.invoiceUrl) {
    alert('Please upload both Checklist and Invoice pictures.');
    return;
  }

  const personEl = document.querySelector('input[name="passing_person"]:checked');
  if (!personEl) {
    alert('Please select a Passing Person.');
    return;
  }
  
  let passingPersonVal = personEl.value;
  if (passingPersonVal === 'Other') {
    passingPersonVal = document.getElementById('custom-person-input').value.trim();
    if (!passingPersonVal) {
      alert('Please enter the name of the new Passing Person.');
      return;
    }
  }

  let nextDate = '';
  if (state.status === 'Delivery Pending') {
    nextDate = document.getElementById('input-next-date').value;
    if (!nextDate) {
      alert('Please select Next Delivery Date.');
      return;
    }
  }

  const returnOpt = document.querySelector('input[name="return_opt"]:checked').value;
  let returnText = 'No';
  if (returnOpt === 'Other') {
    returnText = document.getElementById('return-detail').value.trim() || 'Other (No details)';
  }

  const btn = document.getElementById('btn-submit');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner" style="width:20px;height:20px;border-width:2px;display:inline-block;margin:0;"></div>';

  try {
    const payload = {
      grnNo: state.selectedGRN.grnNo,
      deliveryStatus: state.status,
      passingPerson: passingPersonVal,
      checklistPicUrl: state.checklistUrl,
      invoicePicUrl: state.invoiceUrl,
      anythingToReturn: returnText,
      nextDeliveryDate: nextDate,
      email: ''
    };
    
    const actionName = state.qcEditMode ? 'updateQualityCheckEntry' : 'saveQualityCheckEntry';
    if (state.qcEditMode) {
      payload.rowNum = state.qcEditData.rowNum;
    }
    
    const data = await callBackend(actionName, [payload]);
    
    if (data.status === 'success') {
      document.getElementById('success-overlay').style.display = 'flex';
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } else {
      alert('Submit failed: ' + data.message);
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit Entry';
    }
  } catch (err) {
    alert('Network error. Try again.');
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit Entry';
  }
}

/* ─── History View Logic ─── */
function openHistory() {
  document.getElementById('view-list').classList.remove('active-view');
  document.getElementById('view-list').classList.add('slide-right');
  
  document.getElementById('view-history').classList.remove('slide-right');
  document.getElementById('view-history').classList.add('active-view');
  
  renderHistory();
}

function closeHistory() {
  document.getElementById('view-history').classList.remove('active-view');
  document.getElementById('view-history').classList.add('slide-right');
  
  document.getElementById('view-list').classList.remove('slide-right');
  document.getElementById('view-list').classList.add('active-view');
}

function populateHistoryFilter() {
  const select = document.getElementById('history-person-filter');
  select.innerHTML = '<option value="">All Passing Persons</option>' + 
    state.passingPersons.map(p => `<option value="${p}">${p}</option>`).join('');
}

function filterHistory() {
  renderHistory();
}

function renderHistory() {
  const container = document.getElementById('history-cards-container');
  const searchTxt = document.getElementById('history-search').value.toLowerCase();
  const personFilter = document.getElementById('history-person-filter').value;
  
  let filtered = state.completedQCs.filter(qc => {
    const matchSearch = qc.grnNo.toLowerCase().includes(searchTxt);
    const matchPerson = personFilter === "" || qc.passingPerson === personFilter;
    return matchSearch && matchPerson;
  });
  
  if (filtered.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding: 20px; color:#64748b;">No completed entries found.</div>';
    return;
  }
  
  container.innerHTML = filtered.map((qc, index) => {
    // Map filtered index to original state.completedQCs array index
    const origIndex = state.completedQCs.findIndex(q => q.rowNum === qc.rowNum);
    return `
      <div class="history-card" onclick="openHistoryDetail(${origIndex})">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div class="hc-grn">${qc.grnNo}</div>
          <div class="hc-icon"><i class="fa-solid fa-chevron-right"></i></div>
        </div>
        <div class="hc-meta"><i class="fa-solid fa-user" style="color:var(--primary-light)"></i> ${qc.passingPerson || 'N/A'}</div>
        <div class="hc-time"><i class="fa-solid fa-calendar"></i> ${qc.timestamp}</div>
      </div>
    `;
  }).join('');
}

function openHistoryDetail(index) {
  const qc = state.completedQCs[index];
  if (!qc) return;
  
  const statusClass = qc.deliveryStatus === 'Delivery Completed' ? 'ds-completed' : 'ds-pending';
  
  const bodyHtml = `
    <div class="detail-item">
      <div class="detail-label">GRN Number</div>
      <div class="detail-value">${qc.grnNo}</div>
    </div>
    
    <div class="detail-item">
      <div class="detail-label">Status</div>
      <div class="detail-status-badge ${statusClass}">${qc.deliveryStatus || 'N/A'}</div>
    </div>

    <div class="detail-item">
      <div class="detail-label">Passing Person</div>
      <div class="detail-value">${qc.passingPerson || 'N/A'}</div>
    </div>
    
    <div class="detail-item">
      <div class="detail-label">QC Timestamp</div>
      <div class="detail-value">${qc.timestamp}</div>
    </div>
    
    ${qc.deliveryStatus === 'Delivery Pending' ? `
      <div class="detail-item">
        <div class="detail-label">Next Delivery Date</div>
        <div class="detail-value" style="color:var(--warning)">${qc.nextDeliveryDate || 'N/A'}</div>
      </div>
    ` : ''}

    <div class="detail-item">
      <div class="detail-label">Anything to Return</div>
      <div class="detail-value">${qc.anythingToReturn || 'No'}</div>
    </div>

    <div class="detail-item">
      <div class="detail-label">Pictures</div>
      <div class="thumb-grid">
        <div class="thumb-box" onclick="openImageViewer('${qc.checklistPicUrl}')">
          ${qc.checklistPicUrl ? `<img src="${qc.checklistPicUrl}"> <div class="thumb-overlay"><i class="fa-solid fa-magnifying-glass-plus"></i></div>` : '<div class="thumb-none">No Image</div>'}
          <div class="thumb-label">Checklist</div>
        </div>
        <div class="thumb-box" onclick="openImageViewer('${qc.invoicePicUrl}')">
          ${qc.invoicePicUrl ? `<img src="${qc.invoicePicUrl}"> <div class="thumb-overlay"><i class="fa-solid fa-magnifying-glass-plus"></i></div>` : '<div class="thumb-none">No Image</div>'}
          <div class="thumb-label">Invoice</div>
        </div>
      </div>
    </div>
  `;
  
  document.getElementById('hist-modal-body').innerHTML = bodyHtml;
  
  const isToday = qc.timestamp.substring(0, 10) === new Date().toLocaleDateString('en-GB').replace(/\\//g, '-');
  const footer = document.getElementById('hist-modal-footer');
  if (isToday) {
    footer.style.display = 'block';
    document.getElementById('btn-edit-history').onclick = () => editQCEntry(index);
  } else {
    footer.style.display = 'none';
  }
  
  document.getElementById('history-modal').style.display = 'flex';
}

function closeHistoryDetail() {
  document.getElementById('history-modal').style.display = 'none';
}

function openImageViewer(url) {
  if (!url || url === 'undefined') return;
  document.getElementById('iv-img').src = url;
  document.getElementById('image-viewer').style.display = 'flex';
}

function closeImageViewer() {
  document.getElementById('image-viewer').style.display = 'none';
  document.getElementById('iv-img').src = '';
}

function editQCEntry(index) {
  const qc = state.completedQCs[index];
  if (!qc) return;
  
  closeHistoryDetail();
  closeHistory(); // Go back to main view but we will directly jump to form view
  
  state.qcEditMode = true;
  state.qcEditData = qc;
  
  // Set basic form state
  state.selectedGRN = { grnNo: qc.grnNo }; // Mock the selected GRN object
  state.status = qc.deliveryStatus || 'Delivery Completed';
  state.checklistUrl = qc.checklistPicUrl || null;
  state.invoiceUrl = qc.invoicePicUrl || null;
  
  // Navigate to form view
  document.getElementById('view-list').classList.remove('active-view');
  document.getElementById('view-list').classList.add('slide-right');
  document.getElementById('view-form').classList.remove('slide-right');
  document.getElementById('view-form').classList.add('active-view');
  document.getElementById('action-bar').style.display = 'block';
  
  // Populate form fields
  document.getElementById('form-grn-title').innerText = qc.grnNo;
  
  // Status Buttons
  document.getElementById('btn-completed').classList.toggle('active', state.status === 'Delivery Completed');
  document.getElementById('btn-pending').classList.toggle('active', state.status === 'Delivery Pending');
  document.getElementById('section-next-date').style.display = state.status === 'Delivery Pending' ? 'block' : 'none';
  if (state.status === 'Delivery Pending' && qc.nextDeliveryDate) {
    document.getElementById('input-next-date').value = qc.nextDeliveryDate;
  }
  
  // Passing Person
  const isCustomPerson = !state.passingPersons.includes(qc.passingPerson);
  const grid = document.getElementById('person-grid');
  let radioHtml = state.passingPersons.map((p, idx) => `
    <label class="radio-option">
      <input type="radio" name="passing_person" value="${p}" ${!isCustomPerson && p === qc.passingPerson ? 'checked' : ''} onchange="toggleCustomPerson()">
      <span class="radio-label">${p}</span>
    </label>
  `).join('');
  radioHtml += `
    <label class="radio-option">
      <input type="radio" name="passing_person" value="Other" ${isCustomPerson ? 'checked' : ''} onchange="toggleCustomPerson()">
      <span class="radio-label">+ Add New</span>
    </label>
  `;
  grid.innerHTML = radioHtml;
  
  const customInput = document.getElementById('custom-person-input');
  if (isCustomPerson) {
    customInput.style.display = 'block';
    customInput.value = qc.passingPerson;
  } else {
    customInput.style.display = 'none';
    customInput.value = '';
  }
  
  // Thumbnails pre-fill visually
  if (state.checklistUrl) {
    document.getElementById('zone-checklist').style.display = 'none';
    const preview = document.getElementById('preview-checklist');
    preview.style.display = 'block';
    preview.innerHTML = `<img src="${state.checklistUrl}" style="max-height:160px;">
      <button type="button" class="img-remove-btn" onclick="resetUpload('checklist')">
        <i class="fa-solid fa-times"></i>
      </button>`;
  }
  if (state.invoiceUrl) {
    document.getElementById('zone-invoice').style.display = 'none';
    const preview = document.getElementById('preview-invoice');
    preview.style.display = 'block';
    preview.innerHTML = `<img src="${state.invoiceUrl}" style="max-height:160px;">
      <button type="button" class="img-remove-btn" onclick="resetUpload('invoice')">
        <i class="fa-solid fa-times"></i>
      </button>`;
  }
  
  // Return Notes
  const returnDetail = document.getElementById('return-detail');
  if (qc.anythingToReturn && qc.anythingToReturn !== 'No') {
    document.querySelector('input[name="return_opt"][value="Other"]').checked = true;
    returnDetail.style.display = 'block';
    returnDetail.value = qc.anythingToReturn;
  } else {
    document.querySelector('input[name="return_opt"][value="No"]').checked = true;
    returnDetail.style.display = 'none';
    returnDetail.value = '';
  }
  
  // Change submit button text
  document.getElementById('btn-submit').innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Update QC Entry';
}
