// qc.js

const API_URL = 'https://script.google.com/macros/s/AKfycbyB5bn-l5Tpi259vOtf_O2EIzhTeQRWAPeo7ojUMcahmXF03HL7hwATrol3wKIMG23zjA/exec';

let state = {
  pendingGRNs: [],
  passingPersons: [],
  selectedGRN: null,
  status: null,
  checklistUrl: null,
  invoiceUrl: null
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
  
  document.getElementById('loading-state').style.display = 'flex';
  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('cards-container').innerHTML = '';
  document.getElementById('pending-count').innerText = '...';

  try {
    const json = await callBackend('getQualityCheckData');
    
    if (json.status === 'success') {
      state.pendingGRNs = json.data.pendingGRNs || [];
      state.passingPersons = json.data.passingPersons || [];
      renderCards();
      
      // Auto-open form if GRN parameter exists
      if (autoSelectGrn) {
        const target = state.pendingGRNs.find(g => g.grnNo === autoSelectGrn);
        if (target) openForm(target);
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
      <input type="radio" name="passing_person" value="${p}" ${idx===0?'checked':''}>
      ${p}
    </label>
  `).join('');

  // Reset Form state
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
    const data = await callBackend('saveQualityCheckEntry', [{
      grnNo: state.selectedGRN.grnNo,
      deliveryStatus: state.status,
      passingPerson: personEl.value,
      checklistPicUrl: state.checklistUrl,
      invoicePicUrl: state.invoiceUrl,
      anythingToReturn: returnText,
      nextDeliveryDate: nextDate,
      email: ''
    }]);
    
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
