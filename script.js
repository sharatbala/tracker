// --- Constants & Global State ---
const TYPES = {
  'Bottle Feed': { key: 'feed', title: 'Feed', icon: '🍼', color: '#ffd052' },
  'Diaper': { key: 'diaper', title: 'Diaper', icon: '◒', color: '#f2ecdc' },
  'Sleep': { key: 'sleep', title: 'Sleep', icon: '☾', color: '#bfe7f3' },
  'Solid Feed': { key: 'solids', title: 'Solids', icon: '🥣', color: '#e8c6d5' }
};

const DB_NAME = 'LittleLogLocalDB';
const DB_VERSION = 1;
let dbInstance = null;
let closeOverlayTimer = null;

const state = {
  profile: '',
  caregiver: 'Sharat',
  profiles: [],
  caregivers: ['Sharat', 'Marianne'],
  home: null,
  detailType: 'Bottle Feed',
  detailTab: 'calendar',
  days: 7,
  endDate: localDate(),
  selectedDate: localDate(),
  detail: null,
  sleepTimer: null,
  loadingCount: 0
};

// --- App Lifecycle ---
window.addEventListener('DOMContentLoaded', initialize);

function getApiUrl() {
  return localStorage.getItem('littlelog-api-url') || '';
}

async function callApi(action, payload = {}) {
  const url = getApiUrl();
  if (!url) throw new Error('Apps Script Web App URL is not configured.');

  const response = await fetch(url, {
    method: 'POST',
    body: JSON.stringify({ action, ...payload })
  });

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error('API returned non-JSON:', text);
    throw new Error('Invalid response from Google Apps Script. Check deployment permissions.');
  }
}

async function initialize() {
  const saved = JSON.parse(localStorage.getItem('littlelog-settings') || '{}');
  state.profile = saved.profile || '';
  state.caregiver = saved.caregiver || 'Sharat';

  let apiUrl = localStorage.getItem('littlelog-api-url');
  if (!apiUrl) {
    apiUrl = prompt('Please enter your Google Apps Script Web App URL:');
    if (apiUrl && apiUrl.trim()) {
      localStorage.setItem('littlelog-api-url', apiUrl.trim());
    } else {
      showToast('Offline mode: No API URL provided', true);
      await loadHome();
      return;
    }
  }

  try {
    dbInstance = await openDatabase();
    const bootstrap = await callApi('getBootstrap');

    state.profiles = bootstrap?.profiles?.length ? bootstrap.profiles : ['Baby'];
    state.caregivers = bootstrap?.caregivers || ['Sharat', 'Marianne'];

    if (!state.profiles.includes(state.profile)) state.profile = state.profiles[0];
    if (!state.caregivers.includes(state.caregiver)) state.caregiver = state.caregivers[0];

    await syncBootstrapToIDB(bootstrap.allRows);
    await loadHome();
    setupBackgroundSync();
  } catch (err) {
    console.error('Initialization error:', err);
    showToast('Offline mode active', true);
    await loadHome();
  }
}

// --- IndexedDB Layer ---
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('entries')) {
        db.createObjectStore('entries', { keyPath: '_activityKey' });
      }
      if (!db.objectStoreNames.contains('sync_queue')) {
        db.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

async function syncBootstrapToIDB(rows) {
  if (!rows || rows.length < 2) return;
  const headers = rows[0];
  const tx = dbInstance.transaction('entries', 'readwrite');
  const store = tx.objectStore('entries');

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const obj = {};
    headers.forEach((h, idx) => { if (h) obj[h] = row[idx] ?? ''; });
    if (obj._activityKey) {
      store.put({ ...obj, _synced: true });
    }
  }
}

async function getAllLocalEntries() {
  if (!dbInstance) return [];
  return new Promise((resolve) => {
    const tx = dbInstance.transaction('entries', 'readonly');
    const store = tx.objectStore('entries');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
}

async function upsertLocalEntry(entry, action = 'create') {
  if (!dbInstance) return;
  const tx = dbInstance.transaction(['entries', 'sync_queue'], 'readwrite');
  entry._synced = false;
  tx.objectStore('entries').put(entry);
  tx.objectStore('sync_queue').add({ action, key: entry._activityKey, data: entry, timestamp: Date.now() });
  tx.oncomplete = () => triggerBackgroundSync();
}

async function deleteLocalEntry(key) {
  if (!dbInstance) return;
  const tx = dbInstance.transaction(['entries', 'sync_queue'], 'readwrite');
  tx.objectStore('entries').delete(key);
  tx.objectStore('sync_queue').add({ action: 'delete', key, timestamp: Date.now() });
  tx.oncomplete = () => triggerBackgroundSync();
}

// --- Background Sync Engine ---
function setupBackgroundSync() {
  window.addEventListener('online', triggerBackgroundSync);
  setInterval(triggerBackgroundSync, 45000);
}

async function triggerBackgroundSync() {
  if (!navigator.onLine || !dbInstance) return;

  const tx = dbInstance.transaction('sync_queue', 'readonly');
  const store = tx.objectStore('sync_queue');
  const req = store.getAll();

  req.onsuccess = async () => {
    const queue = req.result;
    if (!queue || queue.length === 0) return;

    try {
      await callApi('batchSync', { mutations: queue });
      const clearTx = dbInstance.transaction('sync_queue', 'readwrite');
      const clearStore = clearTx.objectStore('sync_queue');
      queue.forEach(item => clearStore.delete(item.id));
    } catch (err) {
      console.warn('Background sync deferred:', err);
    }
  };
}

// --- Aggregation & Data Loading ---
async function loadHome() {
  clearInterval(state.sleepTimer);
  const profileTitleEl = document.getElementById('profile-title');
  if (profileTitleEl) profileTitleEl.textContent = state.profile;

  const entries = await getAllLocalEntries();
  const profileEntries = entries
    .filter(e => e.Type && e._activityKey && (!state.profile || e['Profile Name'] === state.profile))
    .sort((a, b) => Number(b['Start Date/time (Epoch)'] || 0) - Number(a['Start Date/time (Epoch)'] || 0));

  const todayStr = localDate();
  const recent = type => profileEntries.filter(e => e.Type === type).slice(0, 3);
  const todayEntries = profileEntries.filter(e => entryDate_(e) === todayStr);
  const activeSleep = profileEntries.find(e => e.Type === 'Sleep' && !e['[Sleep] End Date/time (Epoch)']) || null;

  state.home = {
    recent: {
      feed: recent('Bottle Feed'),
      diaper: recent('Diaper'),
      sleep: recent('Sleep'),
      solids: recent('Solid Feed')
    },
    activeSleep,
    today: {
      feedCount: todayEntries.filter(e => e.Type === 'Bottle Feed').length,
      feedMl: Math.round(todayEntries.filter(e => e.Type === 'Bottle Feed').reduce((sum, e) => sum + bottleMl_(e), 0)),
      diaperCount: todayEntries.filter(e => e.Type === 'Diaper').length,
      solidsCount: todayEntries.filter(e => e.Type === 'Solid Feed').length,
      sleepSeconds: profileEntries
        .filter(e => e.Type === 'Sleep' && e['[Sleep] End Date/time (Epoch)'])
        .reduce((sum, e) => sum + sleepOverlap_(e, todayStr), 0)
    }
  };

  renderHome();
  startSleepClock();
}

async function loadDetail() {
  const entries = await getAllLocalEntries();
  const profileEntries = entries
    .filter(e => e.Type && e._activityKey && (!state.profile || e['Profile Name'] === state.profile))
    .sort((a, b) => Number(b['Start Date/time (Epoch)'] || 0) - Number(a['Start Date/time (Epoch)'] || 0));

  const days = Number(state.days) || 7;
  const dates = dateRange_(state.endDate, days);
  const type = state.detailType;

  const filtered = profileEntries.filter(entry => {
    if (entry.Type !== type && !(type === 'Sleep' && entry.Type === 'Sleep')) return false;
    const d = entryDate_(entry);
    return d >= dates[0] && d <= state.endDate;
  });

  const allSleep = type === 'Sleep' ? profileEntries.filter(e => e.Type === 'Sleep') : [];
  const buckets = dates.map(date => summarizeDay_(date, type, filtered.filter(e => entryDate_(e) === date), allSleep));

  const average = buckets.reduce((sum, b) => sum + b.total, 0) / days;
  let headline = `${round_(average, 1)} per day`;
  if (type === 'Bottle Feed') headline = `${Math.round(average)} mL per day`;
  if (type === 'Diaper') headline = `${round_(average, 1)} diapers per day`;
  if (type === 'Sleep') headline = `${formatDuration_(average)} sleep per day`;
  if (type === 'Solid Feed') headline = `${round_(average, 1)} meals per day`;

  state.detail = { type, days, endDate: state.endDate, dates, headline, buckets, entries: filtered };
  renderDetail();
}

// --- Home UI Rendering ---
function renderHome() {
  const types = ['Bottle Feed', 'Diaper', 'Sleep', 'Solid Feed'];
  const cardsContainer = document.getElementById('activity-cards');
  if (cardsContainer) {
    cardsContainer.innerHTML = types.map(renderCard).join('');
  }

  const today = state.home.today;
  const todaySummaryEl = document.getElementById('today-summary');
  if (todaySummaryEl) {
    todaySummaryEl.innerHTML = `
      <div class="section-heading"><h2>Today</h2><span>${formatDate(localDate())}</span></div>
      <div class="summary-grid">
        <div><strong>${duration(today.sleepSeconds)}</strong><span>Sleep</span></div>
        <div><strong>${today.feedCount}</strong><span>Feeds · ${today.feedMl} mL</span></div>
        <div><strong>${today.diaperCount}</strong><span>Diapers</span></div>
        <div><strong>${today.solidsCount}</strong><span>Meals</span></div>
      </div>`;
  }
}

function renderCard(type) {
  const config = TYPES[type];
  const recent = state.home.recent[config.key] || [];
  if (type === 'Sleep' && state.home.activeSleep) return renderActiveSleep(config, recent);

  const latest = recent[0];
  const highlightAction = latest ? `openEditorByKey('${latest._activityKey}')` : (type === 'Bottle Feed' ? "openFeedActionSheet()" : `openEditor('${type}')`);
  const addAction = type === 'Bottle Feed' ? "openFeedActionSheet()" : `openEditor('${type}')`;

  return `
    <article class="activity-card">
      <div class="card-header" style="background:${config.color}">
        <h2>${config.title}</h2>
        <button class="add-button" onclick="${addAction}">+</button>
      </div>
      <button class="card-highlight" onclick="${highlightAction}">
        <span class="activity-icon">${config.icon}</span>
        <span class="highlight-copy">
          <strong>${latest ? latestLabel(type) : 'No entries yet'}</strong>
          <small>${latest ? relativeTime(latest) : 'Tap to add one'}</small>
        </span>
        <span class="highlight-value">${latest ? latestValue(latest) : '—'}</span>
      </button>
      <div class="recent-panel">
        ${recent.slice(1).map(compactEntry).join('') || '<div class="empty-compact">No earlier entries</div>'}
        <button class="see-all" onclick="openDetail('${type}')">See all →</button>
      </div>
    </article>`;
}

function compactEntry(entry) {
  return `<button class="compact-entry" onclick="openEditorByKey('${entry._activityKey}')"><span>${formatTimeEntry(entry)}</span><strong>${escapeHtml(entryDetail(entry))}</strong></button>`;
}

function renderActiveSleep(config, recent) {
  const active = state.home.activeSleep;
  return `
    <article class="activity-card">
      <div class="card-header" style="background:${config.color}"><h2>Sleep</h2><span class="live-badge">LIVE</span></div>
      <div class="active-sleep">
        <span class="activity-icon">☾</span>
        <div><strong>Sleeping</strong><small>Started ${formatTimeEntry(active)}</small></div>
        <b id="sleep-clock">00:00:00</b>
      </div>
      <button class="sleep-stop" onclick="endActiveSleep()">End Sleep</button>
      <div class="recent-panel">
        ${recent.filter(e => e._activityKey !== active._activityKey).slice(0, 2).map(compactEntry).join('')}
        <button class="see-all" onclick="openDetail('Sleep')">See all →</button>
      </div>
    </article>`;
}

// --- Detail Screen UI Rendering ---
function renderDetail() {
  const detail = state.detail;
  if (!detail) return;

  const typeConfig = TYPES[detail.type] || { title: detail.type, icon: '📋', color: '#f2ecdc' };
  const pageEl = document.getElementById('detail-page');
  if (!pageEl) return;

  pageEl.innerHTML = `
    <div class="detail-header" style="background:${typeConfig.color}">
      <button onclick="showHome()">← Back</button>
      <h2>${typeConfig.icon} ${typeConfig.title}</h2>
      <button onclick="openEditor('${detail.type}')">+</button>
    </div>
    <div class="detail-sub-banner">
      <div class="detail-headline"><strong>${escapeHtml(detail.headline)}</strong></div>
      <div class="detail-tabs">
        <button class="${state.detailTab === 'calendar' ? 'active' : ''}" onclick="switchDetailTab('calendar')">Calendar</button>
        <button class="${state.detailTab === 'list' ? 'active' : ''}" onclick="switchDetailTab('list')">List</button>
      </div>
    </div>
    <div class="detail-content">
      ${state.detailTab === 'calendar' ? renderDetailCalendar(detail) : renderDetailList(detail)}
    </div>`;
}

function switchDetailTab(tab) {
  state.detailTab = tab;
  renderDetail();
}

function renderDetailCalendar(detail) {
  return `
    <div class="calendar-view">
      ${detail.buckets.slice().reverse().map(b => `
        <div class="calendar-day-row">
          <div class="calendar-day-meta">
            <strong>${formatDate(b.date)}</strong>
            <span>${b.total ? `${Math.round(b.total)}${detail.type === 'Bottle Feed' ? ' mL' : ''}` : '0'}</span>
          </div>
          <div class="calendar-day-chips">
            ${b.instances.length ? b.instances.map(inst => `
              <button class="calendar-chip" onclick="openEditorByKey('${inst.key}')">
                <small>${inst.start.slice(11, 16)}</small>
                <span>${escapeHtml(inst.detail)}</span>
              </button>
            `).join('') : '<span class="empty-chip-slot">—</span>'}
          </div>
        </div>
      `).join('')}
    </div>`;
}

function renderDetailList(detail) {
  return `
    <div class="list-view">
      ${detail.entries.length ? detail.entries.map(entry => `
        <button class="list-row-item" onclick="openEditorByKey('${entry._activityKey}')">
          <div class="list-row-left">
            <strong>${escapeHtml(entry['Start Date/time'])}</strong>
            <small>${escapeHtml(entry['Created By Caregiver'] || '')}</small>
          </div>
          <div class="list-row-right">
            <span>${escapeHtml(entryDetail_(entry))}</span>
          </div>
        </button>
      `).join('') : '<div class="empty-instance">No entries found</div>'}
    </div>`;
}

// --- Bottom Sheet & Action Menu Engine ---
function openFeedActionSheet() {
  const content = `
    <div class="sheet-options">
      <button class="sheet-option-btn" onclick="openEditor('Bottle Feed')">
        <span style="font-size: 1.4rem;">🍼</span>
        <div>
          <strong>Bottle Feed</strong>
          <div style="font-size:0.8rem; color:#8e8e93;">Log formula or breast milk volume</div>
        </div>
      </button>
      <button class="sheet-option-btn" onclick="openEditor('Solid Feed')">
        <span style="font-size: 1.4rem;">🥣</span>
        <div>
          <strong>Solids</strong>
          <div style="font-size:0.8rem; color:#8e8e93;">Log breakfast, lunch, or meal items</div>
        </div>
      </button>
    </div>
  `;
  showBottomSheet('Choose Feed Type', content, false);
}

function openEditor(type, existingEntry = null) {
  const isEdit = !!existingEntry;
  const config = TYPES[type] || { title: type, color: '#f2ecdc' };
  const now = new Date();
  
  const startVal = existingEntry && existingEntry['Start Date/time'] 
    ? existingEntry['Start Date/time'].slice(0, 16).replace(' ', 'T') 
    : formatDateTimeLocal_(now);
    
  const key = existingEntry ? existingEntry._activityKey : '';

  const content = `
    <div id="editor-fields">
      ${type === 'Sleep' ? renderSleepTimerHero(existingEntry) : ''}
      
      ${editorRow('Start Time', `<input id="edit-start" type="datetime-local" value="${startVal}">`)}
      
      ${editorSpecificFields(type, existingEntry)}
      
      ${isEdit ? `<button class="delete-button" onclick="deleteCurrent('${key}')">Delete Entry</button>` : ''}
    </div>
  `;

  showBottomSheet(
    `${isEdit ? 'Edit' : 'New'} ${config.title}`, 
    content, 
    true, 
    () => saveEditor(type, key)
  );
}

function showBottomSheet(title, bodyHtml, showSaveBtn = true, onSave = null) {
  if (closeOverlayTimer) {
    clearTimeout(closeOverlayTimer);
    closeOverlayTimer = null;
  }

  let root = document.getElementById('overlay-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'overlay-root';
    document.body.appendChild(root);
  }

  root.innerHTML = `
    <div class="sheet-overlay" id="sheet-overlay" onclick="handleBackdropClick(event)">
      <div class="bottom-sheet" onclick="event.stopPropagation()">
        <div class="sheet-handle"></div>
        <div class="sheet-header">
          <button class="btn-cancel" onclick="closeOverlay()">Cancel</button>
          <h2>${title}</h2>
          ${showSaveBtn ? `<button class="btn-save" id="sheet-save-btn">Save</button>` : '<div style="width:40px;"></div>'}
        </div>
        <div class="sheet-body">
          ${bodyHtml}
        </div>
      </div>
    </div>
  `;

  if (showSaveBtn && onSave) {
    document.getElementById('sheet-save-btn').onclick = onSave;
  }

  requestAnimationFrame(() => {
    document.getElementById('sheet-overlay')?.classList.add('active');
  });
}

function closeOverlay() {
  const overlay = document.getElementById('sheet-overlay');
  if (overlay) {
    overlay.classList.remove('active');
    if (closeOverlayTimer) clearTimeout(closeOverlayTimer);
    closeOverlayTimer = setTimeout(() => {
      const root = document.getElementById('overlay-root');
      if (root) root.innerHTML = '';
      closeOverlayTimer = null;
    }, 250);
  }
}

function handleBackdropClick(e) {
  if (e.target.id === 'sheet-overlay') closeOverlay();
}

// --- Specific Field Renderers ---
function editorRow(label, content) {
  return `<div class="editor-row"><label>${label}</label><div>${content}</div></div>`;
}

function editorSpecificFields(type, e) {
  if (type === 'Bottle Feed') {
    const vol = e ? (e['[Bottle Feed] Volume'] || e['[Bottle Feed] Formula Volume'] || '') : '';
    const unit = e ? (e['[Bottle Feed] Volume Unit'] || 'mL') : 'mL';
    const feedType = e ? (e['[Bottle Feed] Type'] || 'Formula') : 'Formula';
    return `
      ${editorRow('Volume', `<input id="edit-volume" type="number" value="${vol}" placeholder="0" step="5">`)}
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
    const endVal = e && e['[Sleep] End Date/time'] ? e['[Sleep] End Date/time'].slice(0, 16).replace(' ', 'T') : '';
    return `
      ${editorRow('End Time', `<input id="edit-sleep-end" type="datetime-local" value="${endVal}">`)}
    `;
  }
  if (type === 'Solid Feed') {
    const meal = e ? (e['[Solid Feed] Meal'] || 'Breakfast') : 'Breakfast';
    const food = e ? (e['[Solid Feed] Food'] || '') : '';
    return `
      ${editorRow('Meal', segmentedChoices('solid-meal', ['Breakfast', 'Lunch', 'Dinner', 'Snack'], meal, 'chooseSolidMeal'))}
      ${editorRow('Food', `<input id="edit-solid-food" value="${escapeHtml(food)}" placeholder="e.g. mashed banana, oatmeal">`)}
    `;
  }
  return '';
}

function renderSleepTimerHero(e) {
  const active = state.home?.activeSleep;
  if (!e && active) {
    return `
      <div class="timer-hero">
        <div class="timer-display" id="sheet-sleep-clock">00:00:00</div>
        <button type="button" class="timer-btn" style="background:#ff453a; color:#fff;" onclick="endActiveSleep()">Stop & Save Sleep</button>
      </div>
    `;
  }
  return `
    <div class="timer-hero">
      <div class="timer-display">0H 0M</div>
      <button type="button" class="timer-btn" onclick="startSleepNow()">Start Sleep Timer</button>
    </div>
  `;
}

// --- Segmented Control Component Helpers ---
function segmentedChoices(name, options, selected, callbackName) {
  return `
    <div class="segmented" data-group="${name}">
      ${options.map(opt => `
        <button type="button" class="${opt === selected ? 'active' : ''}" onclick="${callbackName}('${opt}', this)">${opt}</button>
      `).join('')}
    </div>
  `;
}

function chooseFeedUnit(val, btn) { selectSegment(btn); }
function chooseFeedType(val, btn) { selectSegment(btn); }
function chooseDiaperType(val, btn) { selectSegment(btn); }
function chooseSolidMeal(val, btn) { selectSegment(btn); }
function chooseCaregiver(val, btn) { 
  selectSegment(btn); 
  const input = document.getElementById('setting-caregiver');
  if (input) input.value = val;
}

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

// --- Field Saver Processors ---
function saveFeedFields(payload) {
  payload['[Bottle Feed] Volume'] = document.getElementById('edit-volume')?.value || '';
  payload['[Bottle Feed] Volume Unit'] = getSelectedSegment('feed-unit');
  payload['[Bottle Feed] Type'] = getSelectedSegment('feed-type');
}

function saveDiaperFields(payload) {
  payload['[Diaper] Type'] = getSelectedSegment('diaper-type');
  payload['[Diaper] Detail'] = document.getElementById('edit-diaper-detail')?.value || '';
}

function saveSleepFields(payload, startStr) {
  const endStr = document.getElementById('edit-sleep-end')?.value;
  if (endStr) {
    const startEpoch = new Date(startStr).getTime();
    const endEpoch = new Date(endStr).getTime();
    payload['[Sleep] End Date/time'] = formatDateTimeString(new Date(endEpoch));
    payload['[Sleep] End Date/time (Epoch)'] = endEpoch;
    payload['[Sleep] Duration (Seconds)'] = Math.max(0, Math.floor((endEpoch - startEpoch) / 1000));
  }
}

function saveSolidFields(payload) {
  payload['[Solid Feed] Meal'] = getSelectedSegment('solid-meal');
  payload['[Solid Feed] Food'] = document.getElementById('edit-solid-food')?.value || '';
}

function commonPayload(type, startStr) {
  const startDate = new Date(startStr);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return {
    Type: type,
    'Profile Name': state.profile,
    'Start Date/time': formatDateTimeString(startDate),
    'Start Date/time (Epoch)': startDate.getTime(),
    'Created By Caregiver': state.caregiver,
    'Last Updated By Caregiver': state.caregiver,
    'Time Zone': zone
  };
}

function formatDateTimeLocal_(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// --- Form Actions & Timers ---
async function startSleepNow() {
  const now = new Date();
  const payload = commonPayload('Sleep', now.toISOString());
  payload._activityKey = 'act_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
  
  await upsertLocalEntry(payload, 'create');
  closeOverlay();
  showToast('Sleep timer started');
  await loadHome();
}

async function endActiveSleep() {
  const active = state.home?.activeSleep;
  if (!active) return;
  const now = new Date();
  const startEpoch = Number(active['Start Date/time (Epoch)']);

  active['[Sleep] End Date/time'] = formatDateTimeString(now);
  active['[Sleep] End Date/time (Epoch)'] = now.getTime();
  active['[Sleep] Duration (Seconds)'] = Math.max(0, Math.floor((now.getTime() - startEpoch) / 1000));
  active['Last Updated By Caregiver'] = state.caregiver;

  await upsertLocalEntry(active, 'update');
  closeOverlay();
  showToast('Sleep saved');
  await loadHome();
}

async function openEditorByKey(key) {
  const entries = await getAllLocalEntries();
  const entry = entries.find(e => e._activityKey === key);
  if (entry) openEditor(entry.Type, entry);
}

async function saveEditor(type, key) {
  const startInput = document.getElementById('edit-start');
  const startStr = startInput ? startInput.value : '';
  if (!startStr) {
    showToast('Start time is required', true);
    return;
  }

  const payload = commonPayload(type, startStr);

  if (type === 'Bottle Feed') saveFeedFields(payload);
  else if (type === 'Diaper') saveDiaperFields(payload);
  else if (type === 'Sleep') saveSleepFields(payload, startStr);
  else if (type === 'Solid Feed') saveSolidFields(payload);

  const action = key ? 'update' : 'create';
  const activityKey = key || 'act_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
  payload._activityKey = activityKey;

  try {
    await upsertLocalEntry(payload, action);
    closeOverlay();
    showToast(key ? 'Updated' : 'Saved');
    if (state.detail) loadDetail();
    await loadHome();
  } catch (err) {
    console.error('Save failed:', err);
    showToast('Failed to save entry', true);
  }
}

async function deleteCurrent(key) {
  if (!confirm('Are you sure you want to delete this entry?')) return;
  try {
    await deleteLocalEntry(key);
    closeOverlay();
    if (state.detail) loadDetail();
    await loadHome();
    showToast('Deleted entry');
  } catch (err) {
    console.error('Delete failed:', err);
    showToast('Failed to delete entry', true);
  }
}

// --- Navigation & Settings ---
function openDetail(type, navButton) {
  state.detailType = type;
  state.selectedDate = state.endDate;
  activateNav(navButton || document.querySelectorAll('.bottom-nav button')[1]);
  document.getElementById('home-page').classList.add('hidden');
  document.getElementById('detail-page').classList.remove('hidden');
  loadDetail();
}

function showHome(navButton) {
  document.getElementById('detail-page').classList.add('hidden');
  document.getElementById('home-page').classList.remove('hidden');
  activateNav(navButton || document.querySelector('.bottom-nav button'));
  state.detail = null;
  loadHome();
}

function openSettings(navButton) {
  activateNav(navButton || document.querySelectorAll('.bottom-nav button')[2]);
  
  const content = `
    <div style="padding-bottom: 10px;">
      <input id="setting-original-name" type="hidden" value="${escapeHtml(state.profile)}">
      ${editorRow('Name', `<input id="setting-name" type="text" value="${escapeHtml(state.profile)}">`)}
      <input id="setting-caregiver" type="hidden" value="${escapeHtml(state.caregiver)}">
      <div style="margin: 16px 0 8px; font-size: 0.825rem; color: #a1a1a6; text-transform: uppercase;">Caregiver</div>
      ${segmentedChoices('caregiver', state.caregivers, state.caregiver, 'chooseCaregiver')}
    </div>
  `;

  showBottomSheet('Settings', content, true, saveSettings);
}

function saveSettings() {
  const nameInput = document.getElementById('setting-name');
  if (nameInput) state.profile = nameInput.value.trim() || state.profile;
  localStorage.setItem('littlelog-settings', JSON.stringify({ profile: state.profile, caregiver: state.caregiver }));
  closeOverlay();
  showHome();
}

function activateNav(b) {
  document.querySelectorAll('.bottom-nav button').forEach(i => i.classList.remove('active'));
  if (b) b.classList.add('active');
}

// --- Data & Formatting Utilities ---
function summarizeDay_(date, type, entries, allSleep) {
  if (type === 'Bottle Feed') {
    let formula = 0, breastMilk = 0;
    entries.forEach(entry => {
      const fVal = volumeMl_(entry['[Bottle Feed] Formula Volume'], entry['[Bottle Feed] Formula Volume Unit']);
      const bVal = volumeMl_(entry['[Bottle Feed] Breast Milk Volume'], entry['[Bottle Feed] Breast Milk Volume Unit']);
      if (fVal || bVal) { formula += fVal; breastMilk += bVal; } 
      else { formula += bottleMl_(entry); }
    });
    return { date, total: formula + breastMilk, formula, breastMilk, instances: entries.map(instance_) };
  }
  if (type === 'Diaper') {
    const wet = entries.filter(e => ['Wet', 'Both'].includes(e['[Diaper] Type'])).length;
    const dirty = entries.filter(e => ['Dirty', 'Both'].includes(e['[Diaper] Type'])).length;
    return { date, total: entries.length, wet, dirty, instances: entries.map(instance_) };
  }
  if (type === 'Sleep') {
    const matching = allSleep.filter(e => sleepOverlap_(e, date) > 0);
    return { date, total: matching.reduce((sum, e) => sum + sleepOverlap_(e, date), 0), instances: matching.map(instance_) };
  }
  return { date, total: entries.length, instances: entries.map(instance_) };
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function instance_(entry) {
  return {
    key: entry._activityKey,
    start: entry['Start Date/time'],
    startEpoch: Number(entry['Start Date/time (Epoch)']) || 0,
    end: entry['[Sleep] End Date/time'] || '',
    endEpoch: Number(entry['[Sleep] End Date/time (Epoch)']) || 0,
    detail: entryDetail_(entry)
  };
}

function entryDetail(entry) { return entryDetail_(entry); }

function entryDetail_(entry) {
  if (entry.Type === 'Bottle Feed') return `${Math.round(bottleMl_(entry))} mL ${entry['[Bottle Feed] Type'] || ''}`;
  if (entry.Type === 'Diaper') {
    const t = entry['[Diaper] Type'] || 'Diaper';
    const d = entry['[Diaper] Detail'] || '';
    return d ? `${t}: ${d}` : `${t} diaper`;
  }
  if (entry.Type === 'Sleep') return entry['[Sleep] End Date/time (Epoch)'] ? formatDuration_(entry['[Sleep] Duration (Seconds)']) : 'Timer running';
  return `${entry['[Solid Feed] Meal'] || ''} ${entry['[Solid Feed] Food'] || ''}`.trim();
}

function entryDate_(entry) {
  const m = String(entry['Start Date/time'] || '').match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

function volumeMl_(v, u) {
  const n = Number(v) || 0;
  return String(u).toUpperCase() === 'OZ' ? n * 29.5735 : n;
}

function bottleMl_(e) {
  const gen = volumeMl_(e['[Bottle Feed] Volume'], e['[Bottle Feed] Volume Unit']);
  if (gen) return gen;
  return volumeMl_(e['[Bottle Feed] Formula Volume'], e['[Bottle Feed] Formula Volume Unit']) + volumeMl_(e['[Bottle Feed] Breast Milk Volume'], e['[Bottle Feed] Breast Milk Volume Unit']);
}

function dateRange_(endDate, days) {
  const p = endDate.split('-').map(Number);
  const dates = [];
  for (let o = days - 1; o >= 0; o--) {
    const d = new Date(Date.UTC(p[0], p[1] - 1, p[2] - o));
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function sleepOverlap_(entry, date) {
  const start = Number(entry['Start Date/time (Epoch)']);
  const end = Number(entry['[Sleep] End Date/time (Epoch)']);
  if (!start || !end) return 0;
  const parts = date.split('-').map(Number);
  const from = Date.UTC(parts[0], parts[1] - 1, parts[2]);
  const to = from + 86400000;
  return Math.max(0, Math.floor((Math.min(end, to) - Math.max(start, from)) / 1000));
}

function round_(n, p) {
  const pw = Math.pow(10, p);
  return Math.round(n * pw) / pw;
}

function formatDuration_(s) {
  s = Number(s) || 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

function localDate(d = new Date()) {
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

function formatDateTimeString(d) {
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0') + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0') + ':' + String(d.getSeconds()).padStart(2,'0');
}

function showToast(msg, isError = false) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.style.position = 'fixed';
    t.style.bottom = '80px';
    t.style.left = '50%';
    t.style.transform = 'translateX(-50%)';
    t.style.padding = '10px 18px';
    t.style.borderRadius = '20px';
    t.style.color = '#fff';
    t.style.fontSize = '0.9rem';
    t.style.zIndex = '2000';
    t.style.transition = 'opacity 0.3s ease';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.background = isError ? '#e53e3e' : '#2d3748';
  t.style.opacity = '1';
  setTimeout(() => { t.style.opacity = '0'; }, 3000);
}

function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function startSleepClock() {
  const active = state.home?.activeSleep;
  if (!active) return;
  const tick = () => {
    const el = document.getElementById('sleep-clock');
    if (el) el.textContent = clock((Date.now() - Number(active['Start Date/time (Epoch)'])) / 1000);
    const sheetEl = document.getElementById('sheet-sleep-clock');
    if (sheetEl) sheetEl.textContent = clock((Date.now() - Number(active['Start Date/time (Epoch)'])) / 1000);
  };
  tick();
  state.sleepTimer = setInterval(tick, 1000);
}

function clock(s) {
  s = Math.max(0, Math.floor(s));
  return [Math.floor(s/3600), Math.floor((s%3600)/60), s%60].map(v => String(v).padStart(2,'0')).join(':');
}

function duration(s) {
  return formatDuration_(s);
}

function formatTimeEntry(e) {
  const ep = Number(e['Start Date/time (Epoch)']);
  if (ep) return new Date(ep).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const m = String(e['Start Date/time'] || '').match(/ (\d{1,2}:\d{2})/);
  return m ? m[1] : '';
}

function relativeTime(e) {
  const ep = Number(e['[Sleep] End Date/time (Epoch)'] || e['Start Date/time (Epoch)']);
  if (!ep) return formatTimeEntry(e);
  const mins = Math.max(0, Math.floor((Date.now() - ep) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return hrs < 24 ? `${hrs}h ${mins % 60}m ago` : `${Math.floor(hrs / 24)}d ago`;
}

function latestLabel(t) {
  return { 'Bottle Feed': 'Last feeding', 'Diaper': 'Last change', 'Sleep': 'Woke up', 'Solid Feed': 'Last meal' }[t] || 'Last entry';
}

function latestValue(e) {
  if (e.Type === 'Bottle Feed') {
    const v = e['[Bottle Feed] Volume'] || e['[Bottle Feed] Formula Volume'] || '';
    const u = e['[Bottle Feed] Volume Unit'] || '';
    return `${v}<small>${u}</small>`;
  }
  if (e.Type === 'Diaper') return escapeHtml((e['[Diaper] Type'] || 'Diaper').toLowerCase());
  if (e.Type === 'Sleep') return duration(e['[Sleep] Duration (Seconds)']);
  return escapeHtml(e['[Solid Feed] Meal'] || 'Meal');
}
