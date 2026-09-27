function openEditor(type, existingEntry = null) { 
  const isEdit = !!existingEntry; 
  const config = (typeof TYPES !== 'undefined' && TYPES[type]) 
    ? TYPES[type] 
    : { title: type, color: '#f1c550' }; 
  const now = new Date();

  const startVal = existingEntry ? (existingEntry['Start Date/time'] || '').slice(0, 16) : formatDateTimeLocal_(now); 
  const key = existingEntry ? existingEntry._activityKey : '';

  let overlay = document.getElementById('overlay-root');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'overlay-root';
    document.body.appendChild(overlay);
  }

  // If opening Feed for a NEW entry, show the Feed Type Selector bottom sheet first
  if (!isEdit && (type === 'Bottle Feed' || type === 'Feed')) {
    overlay.innerHTML = `
      <div class="editor-overlay" onclick="if(event.target===this) closeOverlay()">
        <div class="editor feed-picker-sheet">
          <div class="sheet-handle"></div>
          <div class="picker-options">
            <button type="button" class="picker-option" onclick="renderEditorForm('Bottle Feed', null, '${startVal}', '')">
              <span class="picker-icon">🍼</span>
              <span class="picker-label">Bottle Feed</span>
            </button>
            <button type="button" class="picker-option" onclick="renderEditorForm('Solid Feed', null, '${startVal}', '')">
              <span class="picker-icon">🥣</span>
              <span class="picker-label">Solids</span>
            </button>
            <button type="button" class="picker-option" onclick="renderEditorForm('Combo Feed', null, '${startVal}', '')">
              <span class="picker-icon">🤱🍼</span>
              <span class="picker-label">Combo Feed</span>
            </button>
          </div>
        </div>
      </div>`;
    return;
  }

  renderEditorForm(type, existingEntry, startVal, key);
} 

function renderEditorForm(type, existingEntry, startVal, key) {
  const isEdit = !!existingEntry;
  const config = (typeof TYPES !== 'undefined' && TYPES[type]) 
    ? TYPES[type] 
    : { title: type, color: '#f1c550' };

  let overlay = document.getElementById('overlay-root');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'overlay-root';
    document.body.appendChild(overlay);
  }

  overlay.innerHTML = `
    <div class="editor-overlay" onclick="if(event.target===this) closeOverlay()"> 
      <div class="editor"> 
        <div class="sheet-handle"></div>
        <div class="editor-header" style="background:${config.color || '#f1c550'}"> 
          <button type="button" class="close-btn" onclick="closeOverlay()">✕</button> 
          <h2>${isEdit ? 'Edit' : 'New'} ${type}</h2> 
          <button type="button" class="save-btn" onclick="saveEditor('${type}', '${key}')">Save</button> 
        </div> 
        <div class="editor-body"> 
          ${editorRow('Start Time', `<input id="edit-start" type="datetime-local" value="${startVal}">`)} 
          ${editorSpecificFields(type, existingEntry)} 
          ${isEdit ? `<button type="button" class="delete-button" onclick="deleteCurrent('${key}')">Delete Entry</button>` : ''} 
        </div> 
      </div> 
    </div>`; 

  if (type === 'Sleep') {
    initModalSleepClock();
  }
}

async function openEditorByKey(key) { 
  const entries = await getAllLocalEntries(); 
  const entry = entries.find(e => e._activityKey === key); 
  if (entry) openEditor(entry.Type, entry); 
} 

function editorSpecificFields(type, e) { 
  if (type === 'Bottle Feed') { 
    const vol = e ? (e['[Bottle Feed] Volume'] || e['[Bottle Feed] Formula Volume'] || '') : ''; 
    const unit = e ? (e['[Bottle Feed] Volume Unit'] || 'mL') : 'mL'; 
    const feedType = e ? (e['[Bottle Feed] Type'] || 'Formula') : 'Formula'; 

    return `
      ${editorRow('Volume', `<input id="edit-volume" type="number" value="${vol}" placeholder="0">`)} 
      ${editorRow('Unit', segmentedChoices('feed-unit', ['mL', 'oz'], unit, 'chooseFeedUnit'))} 
      ${editorRow('Type', segmentedChoices('feed-type', ['Formula', 'Breast Milk', 'Mixed'], feedType, 'chooseFeedType'))}
    `; 
  } 

  if (type === 'Solid Feed' || type === 'Solids') { 
    const meal = e ? (e['[Solid Feed] Meal'] || 'Breakfast') : 'Breakfast'; 
    const food = e ? (e['[Solid Feed] Food'] || '') : ''; 
    return `
      ${editorRow('Meal', segmentedChoices('solid-meal', ['Breakfast', 'Lunch', 'Dinner', 'Snack'], meal, 'chooseSolidMeal'))} 
      ${editorRow('Food', `<input id="edit-solid-food" value="${escapeHtml(food)}" placeholder="e.g. mashed banana, oatmeal">`)}
    `; 
  } 

  if (type === 'Combo Feed') { 
    const leftMin = e ? (e['[Nursing] Left Duration (Minutes)'] || '0') : '0';
    const rightMin = e ? (e['[Nursing] Right Duration (Minutes)'] || '0') : '0';
    const vol = e ? (e['[Bottle Feed] Volume'] || '') : ''; 
    const unit = e ? (e['[Bottle Feed] Volume Unit'] || 'mL') : 'mL'; 
    const feedType = e ? (e['[Bottle Feed] Type'] || 'Formula') : 'Formula';

    return `
      <div style="font-weight:700; margin:12px 0 6px; color:var(--muted); text-transform:uppercase; font-size:11px;">Breastfeed</div>
      ${editorRow('Left (mins)', `<input id="edit-nursing-left" type="number" value="${leftMin}" placeholder="0">`)}
      ${editorRow('Right (mins)', `<input id="edit-nursing-right" type="number" value="${rightMin}" placeholder="0">`)}
      
      <div style="font-weight:700; margin:16px 0 6px; color:var(--muted); text-transform:uppercase; font-size:11px;">Bottle Feed</div>
      ${editorRow('Volume', `<input id="edit-volume" type="number" value="${vol}" placeholder="0">`)} 
      ${editorRow('Unit', segmentedChoices('feed-unit', ['mL', 'oz'], unit, 'chooseFeedUnit'))} 
      ${editorRow('Type', segmentedChoices('feed-type', ['Formula', 'Breast Milk', 'Mixed'], feedType, 'chooseFeedType'))}
    `; 
  }

  if (type === 'Diaper') { 
    const diaperType = e ? (e['[Diaper] Type'] || 'Wet') : 'Wet'; 
    const detail = e ? (e['[Diaper] Detail'] || '') : ''; 
    return `
      ${editorRow('Type', segmentedChoices('diaper-type', ['Wet', 'Dirty', 'Both', 'Dry'], diaperType, 'chooseDiaperType'))} 
      ${editorRow('Note', `<input id="edit-diaper-detail" value="${escapeHtml(detail)}" placeholder="e.g. blowout, rash cream">`)}
    `; 
  } 

  if (type === 'Sleep') { 
    const endVal = e && e['[Sleep] End Date/time'] ? e['[Sleep] End Date/time'].slice(0, 16) : ''; 
    const active = state.home?.activeSleep;
    const isCurrentlyActive = active && (!e || e._activityKey === active._activityKey);

    let timerCard = '';
    if (isCurrentlyActive || !e) {
      timerCard = `
        <div class="sleep-timer-card">
          <small style="color: var(--muted); text-transform: uppercase; font-size: 10px; letter-spacing: 0.1em;">
            ${active ? 'Active Sleep Timer' : 'Live Sleep Controls'}
          </small>
          <div class="timer-display" id="modal-sleep-timer-readout">00:00:00</div>
          <button type="button" id="modal-sleep-toggle-btn" class="timer-action-btn ${active ? 'stop' : 'start'}" onclick="toggleModalSleepTimer()">
            ${active ? 'Stop Sleep' : 'Start Live Timer'}
          </button>
        </div>
      `;
    }

    return `
      ${timerCard}
      ${editorRow('End Time', `<input id="edit-sleep-end" type="datetime-local" value="${endVal}">`)}
    `; 
  } 
  return ''; 
} 

function editorRow(label, content) { 
  return `<div class="editor-row"><label>${label}</label><div>${content}</div></div>`; 
} 

function segmentedChoices(name, options, selected, callbackName) { 
  return `
    <div class="segmented" data-group="${name}"> 
      ${options.map(opt => `<button type="button" class="${opt === selected ? 'active' : ''}" onclick="${callbackName}('${opt}', this)">${opt}</button>`).join('')}
    </div>`; 
} 

function chooseFeedUnit(val, btn) { selectSegment(btn); } 
function chooseFeedType(val, btn) { selectSegment(btn); } 
function chooseDiaperType(val, btn) { selectSegment(btn); } 
function chooseSolidMeal(val, btn) { selectSegment(btn); } 
function chooseCaregiver(val, btn) { selectSegment(btn); } 

function selectSegment(btn) { 
  const group = btn.parentElement; 
  group.querySelectorAll('button').forEach(b => b.classList.remove('active')); 
  btn.classList.add('active'); 
} 

function getSelectedSegment(groupName) { 
  const group = document.querySelector(`[data-group="${groupName}"]`); 
  const active = group?.querySelector('button.active'); 
  return active ? active.textContent.trim() : ''; 
} 

function saveFeedFields(payload) { 
  payload['[Bottle Feed] Volume'] = document.getElementById('edit-volume')?.value || ''; 
  payload['[Bottle Feed] Volume Unit'] = getSelectedSegment('feed-unit'); 
  payload['[Bottle Feed] Type'] = getSelectedSegment('feed-type'); 
} 

function saveDiaperFields(payload) { 
  payload['[Diaper] Type'] = getSelectedSegment('diaper-type'); 
  payload['[Diaper] Detail'] = document.getElementById('edit-diaper-detail')?.value || ''; 
} 

function saveSleepFields(payload) {
  const endStr = document.getElementById('edit-sleep-end')?.value || '';
  payload['[Sleep] End Date/time'] = endStr;
  if (endStr) {
    const endEpoch = new Date(endStr).getTime();
    const startEpoch = Number(payload['Start Date/time (Epoch)'] || Date.now());
    payload['[Sleep] End Date/time (Epoch)'] = endEpoch;
    payload['[Sleep] Duration (Seconds)'] = Math.floor((endEpoch - startEpoch) / 1000);
  }
} 

function saveSolidFields(payload) {
  payload['[Solid Feed] Meal'] = getSelectedSegment('solid-meal');
  payload['[Solid Feed] Food'] = document.getElementById('edit-solid-food')?.value || '';
} 

function saveComboFields(payload) {
  payload['[Nursing] Left Duration (Minutes)'] = document.getElementById('edit-nursing-left')?.value || '0';
  payload['[Nursing] Right Duration (Minutes)'] = document.getElementById('edit-nursing-right')?.value || '0';
  saveFeedFields(payload);
}

async function saveEditor(type, key) { 
  const startStr = document.getElementById('edit-start')?.value; 
  if (!startStr) { 
    showToast('Start time is required', true); 
    return; 
  }

  const entries = await getAllLocalEntries();
  const existing = entries.find(e => e._activityKey === key) || {};
  const startDate = new Date(startStr);

  const payload = {
    ...existing,
    Type: type,
    'Profile Name': state.profile,
    'Created By Caregiver': state.caregiver,
    'Start Date/time': startStr,
    'Start Date/time (Epoch)': startDate.getTime()
  };

  if (type === 'Bottle Feed') {
    saveFeedFields(payload);
  } else if (type === 'Solid Feed' || type === 'Solids') {
    payload.Type = 'Solid Feed';
    saveSolidFields(payload);
  } else if (type === 'Combo Feed') {
    saveComboFields(payload);
  } else if (type === 'Diaper') {
    saveDiaperFields(payload);
  } else if (type === 'Sleep') {
    saveSleepFields(payload);
  }

  await saveEditorEntry(payload.Type, key, payload);
} 

async function saveEditorEntry(type, key, payload) { 
  if (!payload._activityKey) { 
    payload._activityKey = 't-' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15); 
  } 
  await upsertLocalEntry(payload, key ? 'update' : 'create'); 
  closeOverlay(); 
  showToast(key ? 'Updated' : 'Saved'); 
  if (state.detail) loadDetail(); 
  await loadHome(); 
} 

function initModalSleepClock() {
  clearInterval(state.modalSleepTimer);
  const readout = document.getElementById('modal-sleep-timer-readout');
  if (!readout) return;

  const active = state.home?.activeSleep;
  if (active) {
    const startEpoch = Number(active['Start Date/time (Epoch)'] || Date.now());
    const updateReadout = () => {
      const el = document.getElementById('modal-sleep-timer-readout');
      if (!el) {
        clearInterval(state.modalSleepTimer);
        return;
      }
      const diffSecs = Math.floor((Date.now() - startEpoch) / 1000);
      const hrs = String(Math.floor(diffSecs / 3600)).padStart(2, '0');
      const mins = String(Math.floor((diffSecs % 3600) / 60)).padStart(2, '0');
      const secs = String(diffSecs % 60).padStart(2, '0');
      el.textContent = `${hrs}:${mins}:${secs}`;
    };
    updateReadout();
    state.modalSleepTimer = setInterval(updateReadout, 1000);
  } else {
    readout.textContent = "00:00:00";
  }
}

async function toggleModalSleepTimer() {
  if (state.home?.activeSleep) {
    await endActiveSleep();
    closeOverlay();
    showToast('Sleep ended');
  } else {
    const now = new Date();
    const startStr = document.getElementById('edit-start')?.value || formatDateTimeLocal_(now);
    const startDate = new Date(startStr);
    const payload = {
      Type: 'Sleep',
      'Profile Name': state.profile,
      'Created By Caregiver': state.caregiver,
      'Start Date/time': startStr,
      'Start Date/time (Epoch)': startDate.getTime()
    };
    await upsertLocalEntry(payload, 'create');
    await loadHome();
    closeOverlay();
    showToast('Sleep timer started');
  }
}

async function deleteCurrent(key) {
  if (!key) return;
  if (confirm('Are you sure you want to delete this entry?')) {
    await deleteLocalEntry(key);
    closeOverlay();
    showToast('Deleted');
    if (state.detail) loadDetail();
    await loadHome();
  }
} 

function openSettings(navButton) { 
  if (navButton) activateNav(navButton); 
  let overlay = document.getElementById('overlay-root');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'overlay-root';
    document.body.appendChild(overlay);
  }

  overlay.innerHTML = `
    <div class="editor-overlay" onclick="if(event.target===this) closeOverlay()"> 
      <div class="editor settings-editor"> 
        <div class="sheet-handle"></div>
        <div class="editor-header settings"> 
          <button type="button" class="close-btn" onclick="closeOverlay()">✕</button> 
          <h2>Settings</h2> 
          <button type="button" class="save-btn" onclick="saveSettings()">Save</button> 
        </div> 
        <div class="editor-body"> 
          <input id="setting-original-name" type="hidden" value="${escapeHtml(state.profile)}"> 
          ${editorRow('Name', `<input id="setting-name" value="${escapeHtml(state.profile)}">`)} 
          <input id="setting-caregiver" type="hidden" value="${escapeHtml(state.caregiver)}"> 
          <div class="settings-section-label">Caregiver</div> 
          ${segmentedChoices('caregiver', state.caregivers, state.caregiver, 'chooseCaregiver')} 
        </div> 
      </div> 
    </div>`; 
} 

function saveSettings() { 
  state.profile = document.getElementById('setting-name')?.value.trim() || state.profile; 
  state.caregiver = getSelectedSegment('caregiver') || state.caregiver; 
  localStorage.setItem('littlelog-settings', JSON.stringify({ profile: state.profile, caregiver: state.caregiver })); 
  closeOverlay(); 
  showHome(); 
} 

function closeOverlay() {
  if (state.modalSleepTimer) {
    clearInterval(state.modalSleepTimer);
    state.modalSleepTimer = null;
  }
  const overlay = document.getElementById('overlay-root');
  if (overlay) {
    overlay.innerHTML = '';
  }
}
