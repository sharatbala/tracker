const TYPES = {
  'Bottle Feed': { key: 'feed', title: 'Feed', icon: '🍼', color: '#ffd052' },
  'Diaper': { key: 'diaper', title: 'Diaper', icon: '◒', color: '#f2ecdc' },
  'Sleep': { key: 'sleep', title: 'Sleep', icon: '☾', color: '#bfe7f3' },
  'Solid Feed': { key: 'solids', title: 'Solids', icon: '🥣', color: '#e8c6d5' }
};

const DB_NAME = 'LittleLogLocalDB';
const DB_VERSION = 1;
let dbInstance = null;

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

window.addEventListener('DOMContentLoaded', initialize);

async function initialize() {
  const saved = JSON.parse(localStorage.getItem('littlelog-settings') || '{}');
  state.profile = saved.profile || '';
  state.caregiver = saved.caregiver || 'Sharat';

  try {
    dbInstance = await openDatabase();
    
    // Fetch bootstrap data from server to hydrate IndexedDB on first load
    run('getBootstrap', [], async (bootstrap) => {
      state.profiles = bootstrap.profiles.length ? bootstrap.profiles : ['Baby'];
      state.caregivers = bootstrap.caregivers || ['Sharat', 'Marianne'];

      if (!state.profiles.includes(state.profile)) state.profile = state.profiles[0];
      if (!state.caregivers.includes(state.caregiver)) state.caregiver = state.caregivers[0];

      await syncBootstrapToIDB(bootstrap.allRows);
      await loadHome();
      setupBackgroundSync();
    });
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
  return new Promise((resolve) => {
    const tx = dbInstance.transaction('entries', 'readonly');
    const store = tx.objectStore('entries');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
  });
}

async function upsertLocalEntry(entry, action = 'create') {
  const tx = dbInstance.transaction(['entries', 'sync_queue'], 'readwrite');
  entry._synced = false;
  tx.objectStore('entries').put(entry);
  tx.objectStore('sync_queue').add({ action, key: entry._activityKey, data: entry, timestamp: Date.now() });
  
  tx.oncomplete = () => triggerBackgroundSync();
}

async function deleteLocalEntry(key) {
  const tx = dbInstance.transaction(['entries', 'sync_queue'], 'readwrite');
  tx.objectStore('entries').delete(key);
  tx.objectStore('sync_queue').add({ action: 'delete', key, timestamp: Date.now() });
  
  tx.oncomplete = () => triggerBackgroundSync();
}

// --- Background Sync Engine ---
function setupBackgroundSync() {
  window.addEventListener('online', triggerBackgroundSync);
  setInterval(triggerBackgroundSync, 45000); // Try syncing every 45s
}

async function triggerBackgroundSync() {
  if (!navigator.onLine || !dbInstance) return;

  const tx = dbInstance.transaction('sync_queue', 'readonly');
  const store = tx.objectStore('sync_queue');
  const req = store.getAll();

  req.onsuccess = () => {
    const queue = req.result;
    if (!queue || queue.length === 0) return;

    google.script.run
      .withSuccessHandler(() => {
        // Clear sync queue items on success
        const clearTx = dbInstance.transaction('sync_queue', 'readwrite');
        const clearStore = clearTx.objectStore('sync_queue');
        queue.forEach(item => clearStore.delete(item.id));
      })
      .withFailureHandler(err => console.warn('Background sync deferred:', err))
      .batchSyncData(queue);
  };
}

// --- Client-Side Local Aggregations (Replaces Server Compute) ---
async function loadHome() {
  clearInterval(state.sleepTimer);
  document.getElementById('profile-title').textContent = state.profile;

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

// --- Helper Utilities & Calculations ---
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

// Standard UI Rendering Helpers matching original layout
function renderHome() {
  const types = ['Bottle Feed', 'Diaper', 'Sleep', 'Solid Feed'];
  document.getElementById('activity-cards').innerHTML = types.map(renderCard).join('');
  const today = state.home.today;
  document.getElementById('today-summary').innerHTML = `
    <div class="section-heading"><h2>Today</h2><span>${formatDate(localDate())}</span></div>
    <div class="summary-grid">
      <div><strong>${duration(today.sleepSeconds)}</strong><span>Sleep</span></div>
      <div><strong>${today.feedCount}</strong><span>Feeds · ${today.feedMl} mL</span></div>
      <div><strong>${today.diaperCount}</strong><span>Diapers</span></div>
      <div><strong>${today.solidsCount}</strong><span>Meals</span></div>
    </div>`;
}

function renderCard(type) {
  const config = TYPES[type];
  const recent = state.home.recent[config.key] || [];
  if (type === 'Sleep' && state.home.activeSleep) return renderActiveSleep(config, recent);

  const latest = recent[0];
  const highlightAction = latest ? `openEditorByKey('${latest._activityKey}')` : `openEditor('${type}')`;

  return `
    <article class="activity-card">
      <div class="card-header" style="background:${config.color}">
        <h2>${config.title}</h2><button class="add-button" onclick="openEditor('${type}')">+</button>
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

async function openEditorByKey(key) {
  const entries = await getAllLocalEntries();
  const entry = entries.find(e => e._activityKey === key);
  if (entry) openEditor(entry.Type, entry);
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

async function deleteCurrent(key) {
  if (!confirm('Delete this entry?')) return;
  await deleteLocalEntry(key);
  closeOverlay();
  showToast('Deleted');
  if (state.detail) loadDetail();
  await loadHome();
}

async function startSleep() {
  const now = new Date();
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const entry = {
    Type: 'Sleep',
    'Profile Name': state.profile,
    'Start Date/time': formatDateTimeString(now),
    'Start Date/time (Epoch)': now.getTime(),
    'Created By Caregiver': state.caregiver,
    'Last Updated By Caregiver': state.caregiver,
    'Time Zone': zone,
    _activityKey: 't-' + Math.random().toString(36).substring(2, 15)
  };
  await upsertLocalEntry(entry, 'create');
  showToast('Sleep started');
  await loadHome();
}

async function endActiveSleep() {
  const active = state.home.activeSleep;
  if (!active) return;
  const now = new Date();
  const startEpoch = Number(active['Start Date/time (Epoch)']);
  
  active['[Sleep] End Date/time'] = formatDateTimeString(now);
  active['[Sleep] End Date/time (Epoch)'] = now.getTime();
  active['[Sleep] Duration (Seconds)'] = Math.max(0, Math.floor((now.getTime() - startEpoch) / 1000));
  active['Last Updated By Caregiver'] = state.caregiver;

  await upsertLocalEntry(active, 'update');
  showToast('Sleep saved');
  await loadHome();
}

// --- Standard UI Navigation & Utilities ---
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
  document.getElementById('overlay-root').innerHTML = `
    <div class="editor-overlay">
      <div class="editor settings-editor">
        <div class="editor-header settings">
          <button onclick="closeOverlay()">×</button>
          <h2>Settings</h2>
          <button onclick="saveSettings()">Save</button>
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
  state.profile = document.getElementById('setting-name').value.trim() || state.profile;
  state.caregiver = document.getElementById('setting-caregiver').value;
  localStorage.setItem('littlelog-settings', JSON.stringify({ profile: state.profile, caregiver: state.caregiver }));
  closeOverlay();
  showHome();
}

// Form Submission Hook override
function saveEditor(type, key) {
  const start = document.getElementById('edit-start').value;
  if (!start) return showToast('Please select a time.', true);

  const payload = commonPayload(type, start);
  if (key) payload._activityKey = key;

  if (type === 'Bottle Feed') saveFeedFields(payload);
  if (type === 'Diaper') saveDiaperFields(payload);
  if (type === 'Sleep') saveSleepFields(payload, start);
  if (type === 'Solid Feed') saveSolidFields(payload);

  saveEditorEntry(type, key, payload);
}

// Utility formatting calculations (copied from original codebase for client-side evaluation)
function newKey_(prefix) { return `${prefix}-${Math.random().toString(36).substring(2, 12)}`; }
function entryDate_(entry) { const m = String(entry['Start Date/time'] || '').match(/^(\d{4}-\d{2}-\d{2})/); return m ? m[1] : ''; }
function volumeMl_(v, u) { const n = Number(v) || 0; return String(u).toUpperCase() === 'OZ' ? n * 29.5735 : n; }
function bottleMl_(e) {
  const gen = volumeMl_(e['[Bottle Feed] Volume'], e['[Bottle Feed] Volume Unit']);
  if (gen) return gen;
  return volumeMl_(e['[Bottle Feed] Formula Volume'], e['[Bottle Feed] Formula Volume Unit']) + volumeMl_(e['[Bottle Feed] Breast Milk Volume'], e['[Bottle Feed] Breast Milk Volume Unit']);
}
function entryDetail_(entry) {
  if (entry.Type === 'Bottle Feed') return `${Math.round(bottleMl_(entry))} mL ${entry['[Bottle Feed] Type'] || ''}`;
  if (entry.Type === 'Diaper') { const t = entry['[Diaper] Type'] || 'Diaper'; const d = entry['[Diaper] Detail'] || ''; return d ? `${t}: ${d}` : `${t} diaper`; }
  if (entry.Type === 'Sleep') return entry['[Sleep] End Date/time (Epoch)'] ? formatDuration_(entry['[Sleep] Duration (Seconds)']) : 'Timer running';
  return `${entry['[Solid Feed] Meal'] || ''} ${entry['[Solid Feed] Food'] || ''}`.trim();
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
function round_(n, p) { const pw = Math.pow(10, p); return Math.round(n * pw) / pw; }
function formatDuration_(s) { s = Number(s) || 0; const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); return h ? `${h}h ${m}m` : `${m}m`; }
function localDate(d = new Date()) { const off = d.getTimezoneOffset() * 60000; return new Date(d.getTime() - off).toISOString().slice(0, 10); }
function formatDateTimeString(d) { return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0') + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0') + ':' + String(d.getSeconds()).padStart(2,'0'); }
function showToast(msg, isError = false) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.style.background = isError ? '#e53e3e' : '#2d3748';
  t.classList.remove('hidden'); setTimeout(() => t.classList.add('hidden'), 3000);
}
function closeOverlay() { document.getElementById('overlay-root').innerHTML = ''; }
function activateNav(b) { document.querySelectorAll('.bottom-nav button').forEach(i => i.classList.remove('active')); if (b) b.classList.add('active'); }
function escapeHtml(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function startSleepClock() {
  const active = state.home?.activeSleep;
  if (!active) return;
  const tick = () => { const el = document.getElementById('sleep-clock'); if (el) el.textContent = clock((Date.now() - Number(active['Start Date/time (Epoch)'])) / 1000); };
  tick(); state.sleepTimer = setInterval(tick, 1000);
}
function clock(s) { s = Math.max(0, Math.floor(s)); return [Math.floor(s/3600), Math.floor((s%3600)/60), s%60].map(v => String(v).padStart(2,'0')).join(':'); }
function duration(s) { return formatDuration_(s); }
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
function latestLabel(t) { return { 'Bottle Feed': 'Last feeding', 'Diaper': 'Last change', 'Sleep': 'Woke up', 'Solid Feed': 'Last meal' }[t]; }
function latestValue(e) {
  if (e.Type === 'Bottle Feed') { const v = e['[Bottle Feed] Volume'] || e['[Bottle Feed] Formula Volume'] || ''; const u = e['[Bottle Feed] Volume Unit'] || ''; return `${v}<small>${u}</small>`; }
  if (e.Type === 'Diaper') return escapeHtml((e['[Diaper] Type'] || 'Diaper').toLowerCase());
  if (e.Type === 'Sleep') return duration(e['[Sleep] Duration (Seconds)']);
  return escapeHtml(e['[Solid Feed] Meal'] || 'Meal');
}
