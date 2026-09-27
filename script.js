<script>
const TYPES = {
  'Bottle Feed': { key: 'feed', title: 'Feed', icon: '🍼', color: '#ffd052' },
  'Diaper': { key: 'diaper', title: 'Diaper', icon: '◒', color: '#f2ecdc' },
  'Sleep': { key: 'sleep', title: 'Sleep', icon: '☾', color: '#bfe7f3' },
  'Solid Feed': { key: 'solids', title: 'Solids', icon: '🥣', color: '#e8c6d5' }
};

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

function initialize() {
  const saved = JSON.parse(localStorage.getItem('littlelog-settings') || '{}');
  state.profile = saved.profile || '';
  state.caregiver = saved.caregiver || 'Sharat';

  run('getBootstrap', [], bootstrap => {
    state.profiles = bootstrap.profiles.length ? bootstrap.profiles : ['Baby'];
    state.caregivers = bootstrap.caregivers || ['Sharat', 'Marianne'];

    if (!state.profiles.includes(state.profile)) state.profile = state.profiles[0];
    if (!state.caregivers.includes(state.caregiver)) state.caregiver = state.caregivers[0];

    loadHome();
  });
}

function run(method, args, success) {
  setLoading(true);
  google.script.run
    .withSuccessHandler(result => {
      setLoading(false);
      success(result);
    })
    .withFailureHandler(error => {
      setLoading(false);
      showToast(error.message || 'Something went wrong.', true);
    })[method](...(args || []));
}

function setLoading(visible) {
  state.loadingCount += visible ? 1 : -1;
  state.loadingCount = Math.max(0, state.loadingCount);
  document.getElementById('loading').classList.toggle('hidden', state.loadingCount === 0);
}

function loadHome() {
  clearInterval(state.sleepTimer);
  document.getElementById('profile-title').textContent = state.profile;

  run('getHomeData', [state.profile, localDate()], data => {
    state.home = data;
    renderHome();
    startSleepClock();
  });
}

function renderHome() {
  const types = ['Bottle Feed', 'Diaper', 'Sleep', 'Solid Feed'];
  document.getElementById('activity-cards').innerHTML = types.map(renderCard).join('');

  const today = state.home.today;
  document.getElementById('today-summary').innerHTML = `
    <div class="section-heading">
      <h2>Today</h2>
      <span>${formatDate(localDate())}</span>
    </div>
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

  if (type === 'Sleep' && state.home.activeSleep) {
    return renderActiveSleep(config, recent);
  }

  const latest = recent[0];
  const highlightAction = latest
    ? `openEditorByKey('${latest._activityKey}')`
    : `openEditor('${type}')`;

  return `
    <article class="activity-card">
      <div class="card-header" style="background:${config.color}">
        <h2>${config.title}</h2>
        <button class="add-button" onclick="openEditor('${type}')">+</button>
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
  return `
    <button class="compact-entry" onclick="openEditorByKey('${entry._activityKey}')">
      <span>${formatTimeEntry(entry)}</span>
      <strong>${escapeHtml(entryDetail(entry))}</strong>
    </button>`;
}

function renderActiveSleep(config, recent) {
  const active = state.home.activeSleep;
  return `
    <article class="activity-card">
      <div class="card-header" style="background:${config.color}">
        <h2>Sleep</h2><span class="live-badge">LIVE</span>
      </div>
      <div class="active-sleep">
        <span class="activity-icon">☾</span>
        <div><strong>Sleeping</strong><small>Started ${formatTimeEntry(active)}</small></div>
        <b id="sleep-clock">00:00:00</b>
      </div>
      <button class="sleep-stop" onclick="endSleep()">End Sleep</button>
      <div class="recent-panel">
        ${recent.filter(entry => entry._activityKey !== active._activityKey).slice(0, 2).map(compactEntry).join('')}
        <button class="see-all" onclick="openDetail('Sleep')">See all →</button>
      </div>
    </article>`;
}

function openDetail(type, navButton) {
  state.detailType = type;
  state.selectedDate = state.endDate;
  activateNav(navButton || document.querySelectorAll('.bottom-nav button')[1]);
  document.getElementById('home-page').classList.add('hidden');
  document.getElementById('detail-page').classList.remove('hidden');
  loadDetail();
}

function loadDetail() {
  run('getActivityDetail', [
    state.profile,
    state.detailType,
    state.endDate,
    state.days
  ], data => {
    state.detail = data;
    renderDetail();
  });
}

function renderDetail() {
  const config = TYPES[state.detailType];
  const showDates = state.detailTab !== 'entries';

  document.getElementById('detail-page').innerHTML = `
    <div class="detail-header">
      <button onclick="showHome()">‹</button>
      <h2>${config.title}</h2>
      <select onchange="changeDays(this.value)">
        <option value="7" ${state.days === 7 ? 'selected' : ''}>7d</option>
        <option value="14" ${state.days === 14 ? 'selected' : ''}>14d</option>
        <option value="30" ${state.days === 30 ? 'selected' : ''}>30d</option>
      </select>
    </div>

    <div class="type-filter">
      ${Object.entries(TYPES).map(([type, item]) => `
        <button class="${type === state.detailType ? 'active' : ''}" onclick="changeType('${type}')">
          ${item.icon} ${item.title}
        </button>`).join('')}
    </div>

    <div class="detail-headline">${state.detail.headline}</div>

    <div class="view-tabs">
      ${['calendar', 'graph', 'entries'].map(tab => `
        <button class="${tab === state.detailTab ? 'active' : ''}" onclick="changeTab('${tab}')">
          ${capitalize(tab)}
        </button>`).join('')}
    </div>

    ${showDates ? renderDateScroller() : ''}
    <section class="detail-content">${renderDetailContent()}</section>`;

  if (showDates) scrollSelectedDateIntoView();
}

function renderDateScroller() {
  return `
    <div class="date-scroller" id="date-scroller">
      ${state.detail.dates.map(date => `
        <button class="${date === state.selectedDate ? 'active' : ''}" onclick="selectDate('${date}')">
          <small>${weekday(date)}</small><strong>${date.slice(8)}</strong>
        </button>`).join('')}
    </div>`;
}

function renderDetailContent() {
  if (state.detailTab === 'entries') return renderEntries(state.detail.entries);
  if (state.detailTab === 'graph') return renderGraph();
  return renderCalendar();
}

function renderCalendar() {
  const buckets = state.detail.buckets;
  const items = buckets.flatMap((bucket, dayIndex) =>
    bucket.instances.map(instance => ({ ...instance, dayIndex, date: bucket.date }))
  );

  return `
    <div class="calendar-viewport">
      <div class="calendar-canvas" style="--days:${buckets.length}">
        <div class="time-axis">
          ${[0, 3, 6, 9, 12, 15, 18, 21, 24].map(hour => `
            <span style="top:${hour / 24 * 100}%">${hourLabel(hour)}</span>
          `).join('')}
        </div>
        <div class="day-columns">
          ${buckets.map((bucket, index) => `
            <div class="day-column">
              ${items.filter(item => item.dayIndex === index).map(item =>
                state.detailType === 'Sleep' ? sleepBlock(item) : eventMark(item)
              ).join('')}
            </div>`).join('')}
        </div>
      </div>
    </div>
    ${legend()}`;
}

function eventMark(item) {
  const minute = minuteOfDay(item.startEpoch, item.start);
  const dirty = state.detailType === 'Diaper' && item.detail.toLowerCase().includes('dirty');
  return `
    <button class="event-mark ${dirty ? 'dirty' : ''}"
      style="top:${minute / 1440 * 100}%"
      onclick="openEditorByKey('${item.key}')"
      title="${escapeHtml(item.detail)}"></button>`;
}

function sleepBlock(item) {
  const startMinute = minuteOfDay(item.startEpoch, item.start);
  const durationMinutes = Math.max(8, ((item.endEpoch || Date.now()) - item.startEpoch) / 60000);
  const maxHeight = 100 - startMinute / 14.4;
  return `
    <button class="sleep-block"
      style="top:${startMinute / 1440 * 100}%;height:${Math.min(maxHeight, durationMinutes / 1440 * 100)}%"
      onclick="openEditorByKey('${item.key}')"></button>`;
}

function renderGraph() {
  const buckets = state.detail.buckets;
  const maximum = Math.max(1, ...buckets.map(bucket => bucket.total));
  return `
    <div class="graph-viewport">
      <div class="bar-chart" style="--days:${buckets.length}">
        ${buckets.map(bucket => graphBar(bucket, maximum)).join('')}
      </div>
    </div>
    ${legend()}`;
}

function graphBar(bucket, maximum) {
  if (state.detailType === 'Diaper') {
    return stackedBar(bucket, maximum, bucket.wet, bucket.dirty);
  }
  if (state.detailType === 'Bottle Feed') {
    return stackedBar(bucket, maximum, bucket.formula, bucket.breastMilk);
  }
  return `
    <div class="bar-column">
      <span>${graphValue(bucket.total)}</span>
      <div class="single-bar" style="height:${bucket.total / maximum * 100}%"></div>
      <small>${bucket.date.slice(8)}</small>
    </div>`;
}

function stackedBar(bucket, maximum, first, second) {
  return `
    <div class="bar-column">
      <span>${graphValue(bucket.total)}</span>
      <div class="stacked-bar" style="height:${bucket.total / maximum * 100}%">
        <i class="first" style="flex:${first || 0}"></i>
        <i class="second" style="flex:${second || 0}"></i>
      </div>
      <small>${bucket.date.slice(8)}</small>
    </div>`;
}

function renderEntries(entries) {
  return `
    <div class="entries-list">
      ${entries.length ? entries.map(entry => `
        <button class="entry-row" onclick="openEditorByKey('${entry._activityKey}')">
          <span>
            <strong>${formatDateEntry(entry)} · ${formatTimeEntry(entry)}</strong>
            <small>${escapeHtml(entryDetail(entry))}</small>
          </span>
          <b>›</b>
        </button>`).join('') : '<div class="empty-state">No entries in this range.</div>'}
    </div>`;
}

function selectDate(date) {
  state.selectedDate = date;
  renderDetail();

  const index = state.detail.dates.indexOf(date);
  const viewport = document.querySelector('.calendar-viewport');
  if (viewport && state.days > 7) viewport.scrollLeft = Math.max(0, index - 3) * 54;
}

function openEditorByKey(key) {
  run('getEntry', [key], entry => openEditor(entry.Type, entry));
}

function openEditor(type, entry) {

  const config = TYPES[type];
  const editing = Boolean(entry);
  const startValue = entry
    ? inputDateTime(entry['Start Date/time'], entry['Start Date/time (Epoch)'])
    : localDateTime();

  let body = '';
  if (type === 'Bottle Feed') body = feedEditor(entry, startValue);
  if (type === 'Diaper') body = diaperEditor(entry, startValue);
  if (type === 'Sleep') body = sleepEditor(entry, startValue);
  if (type === 'Solid Feed') body = solidsEditor(entry, startValue);

  document.getElementById('overlay-root').innerHTML = `
    <div class="editor-overlay">
      <div class="editor">
        <div class="editor-header" style="background:${config.color}">
          <button onclick="closeOverlay()">×</button>
          <h2>${config.title}</h2>
          <button onclick="saveEditor('${type}', '${editing ? entry._activityKey : ''}')">Save</button>
        </div>
        <div class="editor-body">${body}</div>
        ${editing ? `<button class="delete-button" onclick="deleteCurrent('${entry._activityKey}')">Delete Entry</button>` : ''}
      </div>
    </div>`;

  if (type === 'Diaper') renderDirtyDetails(document.getElementById('edit-diaper-type').value);
}

function segmentedChoices(groupName, values, selected, handler) {
  return `
    <div class="choice-row" data-choice-group="${groupName}">
      ${values.map(value => `
        <button type="button"
          class="choice ${value === selected ? 'active' : ''}"
          onclick="${handler}('${value}', this)">${value}</button>
      `).join('')}
    </div>`;
}

function selectChoice(hiddenId, value, button) {
  document.getElementById(hiddenId).value = value;
  button.parentElement.querySelectorAll('.choice').forEach(item => item.classList.remove('active'));
  button.classList.add('active');
}

function chooseFeedType(value, button) {
  selectChoice('edit-feed-type', value, button);
  document.getElementById('formula-row').classList.toggle('hidden', value !== 'Formula');
}

function chooseDiaperType(value, button) {
  selectChoice('edit-diaper-type', value, button);
  renderDirtyDetails(value);
}

function feedEditor(entry, start) {
  const type = entry?.['[Bottle Feed] Type'] || 'Formula';
  const volume = entry?.['[Bottle Feed] Volume'] ||
    entry?.['[Bottle Feed] Formula Volume'] ||
    entry?.['[Bottle Feed] Breast Milk Volume'] || '';
  const unit = entry?.['[Bottle Feed] Volume Unit'] ||
    entry?.['[Bottle Feed] Formula Volume Unit'] ||
    entry?.['[Bottle Feed] Breast Milk Volume Unit'] || 'ML';

  return `
    <input id="edit-feed-type" type="hidden" value="${type}">
    ${segmentedChoices('feed-type', ['Breast Milk', 'Formula'], type, 'chooseFeedType')}
    ${editorRow('Time', `<input id="edit-start" type="datetime-local" value="${start}">`)}
    ${editorRow('Amount', `
      <div class="inline-input">
        <input id="edit-volume" type="number" inputmode="decimal" value="${volume}" placeholder="Add">
        <select id="edit-unit">
          <option ${String(unit).toUpperCase() === 'ML' ? 'selected' : ''}>ML</option>
          <option ${String(unit).toUpperCase() === 'OZ' ? 'selected' : ''}>OZ</option>
        </select>
      </div>`)}
    <div id="formula-row" class="${type !== 'Formula' ? 'hidden' : ''}">
      ${editorRow('Formula / Brand', `<input id="edit-formula" value="${escapeHtml(entry?.['[Bottle Feed] Formula Name'] || '')}">`)}
    </div>
    ${notesRow(entry?.Note)}
  `;
}

function diaperEditor(entry, start) {
  const type = entry?.['[Diaper] Type'] || 'Wet';
  const selectedColors = splitSelections(entry?.['[Diaper] Dirty Color']);
  const selectedTextures = splitSelections(entry?.['[Diaper] Dirty Texture']);

  return `
    <input id="edit-diaper-type" type="hidden" value="${type}">
    ${segmentedChoices('diaper-type', ['Wet', 'Dirty', 'Both'], type, 'chooseDiaperType')}
    ${editorRow('Time', `<input id="edit-start" type="datetime-local" value="${start}">`)}
    <div id="dirty-details"
      data-colors="${escapeHtml(selectedColors.join('|'))}"
      data-textures="${escapeHtml(selectedTextures.join('|'))}"></div>
    ${notesRow(entry?.Note)}
  `;
}

function splitSelections(value) {
  return String(value || '').trim().split(/\s+/).filter(Boolean);
}

function renderDirtyDetails(type) {
  const container = document.getElementById('dirty-details');
  if (!container) return;

  if (type === 'Wet') {
    container.innerHTML = '';
    return;
  }

  const selectedColors = (container.dataset.colors || '').split('|').filter(Boolean);
  const selectedTextures = (container.dataset.textures || '').split('|').filter(Boolean);

  container.innerHTML = `
    ${multiSelectRow('Color', 'dirty-colors', ['YELLOW', 'GREEN', 'BROWN', 'BLACK'], selectedColors)}
    ${multiSelectRow('Texture', 'dirty-textures', ['MUSH', 'MUCOUS', 'RUN', 'SOLID', 'PEBBLE'], selectedTextures)}
  `;
}

function multiSelectRow(label, name, values, selected) {
  return `
    <div class="editor-row multi-row">
      <label>${label}</label>
      <div class="multi-options" data-name="${name}">
        ${values.map(value => `
          <button type="button"
            class="multi-option ${selected.includes(value) ? 'active' : ''}"
            data-value="${value}"
            onclick="this.classList.toggle('active')">${value}</button>
        `).join('')}
      </div>
    </div>`;
}

function selectedMultiValues(name) {
  return [...document.querySelectorAll(`[data-name="${name}"] .multi-option.active`)]
    .map(item => item.dataset.value);
}

function sleepEditor(entry, start) {
  const end = inputDateTime(
    entry?.['[Sleep] End Date/time'],
    entry?.['[Sleep] End Date/time (Epoch)']
  );

  return `
    ${editorRow('Start', `<input id="edit-start" type="datetime-local" value="${start}">`)}
    ${editorRow('End', `<input id="edit-end" type="datetime-local" value="${end}">`)}
    ${notesRow(entry?.Note)}
  `;
}

function solidsEditor(entry, start) {
  const meal = entry?.['[Solid Feed] Meal'] || 'Breakfast';
  return `
    ${editorRow('Time', `<input id="edit-start" type="datetime-local" value="${start}">`)}
    ${editorRow('Meal', `
      <select id="edit-meal">
        ${['Breakfast', 'Lunch', 'Dinner', 'Snack']
          .map(item => `<option ${item === meal ? 'selected' : ''}>${item}</option>`)
          .join('')}
      </select>`)}
    ${editorRow('Food', `<input id="edit-food" value="${escapeHtml(entry?.['[Solid Feed] Food'] || '')}">`)}
    ${notesRow(entry?.Note)}
  `;
}

function editorRow(label, control) {
  return `<div class="editor-row"><label>${label}</label><div>${control}</div></div>`;
}

function notesRow(value) {
  return `
    <div class="editor-row notes">
      <label>Notes</label>
      <textarea id="edit-note">${escapeHtml(value || '')}</textarea>
    </div>`;
}

function saveEditor(type, key) {
  const start = document.getElementById('edit-start').value;
  if (!start) return showToast('Please select a time.', true);

  const payload = commonPayload(type, start);
  if (key) payload._activityKey = key;

  if (type === 'Bottle Feed') saveFeedFields(payload);
  if (type === 'Diaper') saveDiaperFields(payload);
  if (type === 'Sleep') saveSleepFields(payload, start);
  if (type === 'Solid Feed') saveSolidFields(payload);

  run(key ? 'updateEntry' : 'createEntry', [payload], () => {
    closeOverlay();
    showToast(key ? 'Updated' : 'Saved');
    if (state.detail) loadDetail();
    loadHome();
  });
}

function saveFeedFields(payload) {
  const feedType = document.getElementById('edit-feed-type').value;
  const volume = document.getElementById('edit-volume').value;
  const unit = document.getElementById('edit-unit').value;

  payload['[Bottle Feed] Type'] = feedType;
  payload['[Bottle Feed] Volume'] = volume;
  payload['[Bottle Feed] Volume Unit'] = unit;

  if (feedType === 'Formula') {
    payload['[Bottle Feed] Formula Name'] = document.getElementById('edit-formula').value;
    payload['[Bottle Feed] Formula Volume'] = volume;
    payload['[Bottle Feed] Formula Volume Unit'] = unit;
    payload['[Bottle Feed] Breast Milk Volume'] = '';
    payload['[Bottle Feed] Breast Milk Volume Unit'] = '';
  } else {
    payload['[Bottle Feed] Breast Milk Volume'] = volume;
    payload['[Bottle Feed] Breast Milk Volume Unit'] = unit;
    payload['[Bottle Feed] Formula Name'] = '';
    payload['[Bottle Feed] Formula Volume'] = '';
    payload['[Bottle Feed] Formula Volume Unit'] = '';
  }
}

function saveDiaperFields(payload) {
  const diaperType = document.getElementById('edit-diaper-type').value;
  payload['[Diaper] Type'] = diaperType;

  if (diaperType === 'Dirty' || diaperType === 'Both') {
    const colors = selectedMultiValues('dirty-colors');
    const textures = selectedMultiValues('dirty-textures');
    payload['[Diaper] Dirty Color'] = colors.join(' ');
    payload['[Diaper] Dirty Texture'] = textures.join(' ');
    payload['[Diaper] Detail'] = [colors.join(' '), textures.join(' ')].filter(Boolean).join(', ');
  } else {
    payload['[Diaper] Dirty Color'] = '';
    payload['[Diaper] Dirty Texture'] = '';
    payload['[Diaper] Detail'] = '';
  }
}

function saveSleepFields(payload, start) {
  const end = document.getElementById('edit-end').value;
  payload['[Sleep] End Date/time'] = end ? `${end.replace('T', ' ')}:00` : '';
  payload['[Sleep] End Date/time (Epoch)'] = end ? new Date(end).getTime() : '';
  payload['[Sleep] Duration (Seconds)'] = end
    ? Math.max(0, Math.floor((new Date(end) - new Date(start)) / 1000))
    : '';
}

function saveSolidFields(payload) {
  payload['[Solid Feed] Meal'] = document.getElementById('edit-meal').value;
  payload['[Solid Feed] Food'] = document.getElementById('edit-food').value;
}

function commonPayload(type, start) {
  return {
    Type: type,
    'Profile Name': state.profile,
    'Start Date/time': `${start.replace('T', ' ')}:00`,
    'Start Date/time (Epoch)': new Date(start).getTime(),
    'Created By Caregiver': state.caregiver,
    'Last Updated By Caregiver': state.caregiver,
    Note: document.getElementById('edit-note')?.value || '',
    'Time Zone': Intl.DateTimeFormat().resolvedOptions().timeZone
  };
}

function startSleep() {
  run('startSleep', [
    state.profile,
    state.caregiver,
    Intl.DateTimeFormat().resolvedOptions().timeZone
  ], () => {
    showToast('Sleep started');
    loadHome();
  });
}

function endSleep() {
  run('endSleep', [
    state.home.activeSleep._activityKey,
    state.caregiver,
    Intl.DateTimeFormat().resolvedOptions().timeZone
  ], () => {
    showToast('Sleep saved');
    loadHome();
  });
}

function deleteCurrent(key) {
  if (!confirm('Delete this entry?')) return;
  run('deleteEntry', [key], () => {
    closeOverlay();
    showToast('Deleted');
    if (state.detail) loadDetail();
    loadHome();
  });
}

function startSleepClock() {
  const active = state.home?.activeSleep;
  if (!active) return;

  const tick = () => {
    const element = document.getElementById('sleep-clock');
    if (element) {
      element.textContent = clock(
        (Date.now() - Number(active['Start Date/time (Epoch)'])) / 1000
      );
    }
  };

  tick();
  state.sleepTimer = setInterval(tick, 1000);
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
  run('getProfileSettings', [state.profile], profile => {
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
            <input id="setting-profile-key" type="hidden" value="${escapeHtml(profile.profileKey || '')}">
            ${editorRow('Name', `<input id="setting-name" value="${escapeHtml(profile.profileName || state.profile)}">`)}
            ${editorRow('Birth Date', `<input id="setting-birth-date" type="date" value="${escapeHtml(profile.birthDate || '')}">`)}
            ${editorRow('Adjusted', `<input id="setting-birth-adjusted" type="date" value="${escapeHtml(profile.birthDateAdjusted || '')}">`)}
            ${editorRow('Sex', `<select id="setting-sex"><option value=""></option><option ${profile.sex === 'FEMALE' ? 'selected' : ''}>FEMALE</option><option ${profile.sex === 'MALE' ? 'selected' : ''}>MALE</option></select>`)}
            <input id="setting-caregiver" type="hidden" value="${escapeHtml(state.caregiver)}">
            <div class="settings-section-label">Caregiver</div>
            ${segmentedChoices('caregiver', state.caregivers, state.caregiver, 'chooseCaregiver')}
          </div>
        </div>
      </div>`;
  });
}

function chooseCaregiver(value, button) {
  selectChoice('setting-caregiver', value, button);
}

function saveSettings() {
  const settings = {
    originalProfileName: document.getElementById('setting-original-name').value,
    profileName: document.getElementById('setting-name').value.trim() || state.profile,
    profileKey: document.getElementById('setting-profile-key').value,
    birthDate: document.getElementById('setting-birth-date').value,
    birthDateAdjusted: document.getElementById('setting-birth-adjusted').value,
    sex: document.getElementById('setting-sex').value,
    profileType: 'CHILD'
  };

  state.caregiver = document.getElementById('setting-caregiver').value;
  run('updateProfileSettings', [settings], result => {
    state.profile = result.profileName;
    localStorage.setItem('littlelog-settings', JSON.stringify({
      profile: state.profile,
      caregiver: state.caregiver
    }));
    closeOverlay();
    showHome();
  });
}

function closeOverlay() {
  document.getElementById('overlay-root').innerHTML = '';
}

function activateNav(button) {
  document.querySelectorAll('.bottom-nav button').forEach(item => item.classList.remove('active'));
  if (button) button.classList.add('active');
}

function changeType(type) {
  state.detailType = type;
  state.selectedDate = state.endDate;
  loadDetail();
}

function changeTab(tab) {
  state.detailTab = tab;
  renderDetail();
}

function changeDays(days) {
  state.days = Number(days);
  loadDetail();
}

function scrollSelectedDateIntoView() {
  requestAnimationFrame(() => {
    document.querySelector('.date-scroller button.active')?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest'
    });
  });
}

function minuteOfDay(epoch, text) {
  if (epoch) {
    const date = new Date(Number(epoch));
    return date.getHours() * 60 + date.getMinutes();
  }
  const match = String(text || '').match(/ (\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
}

function inputDateTime(text, epoch) {
  if (epoch) return localDateTime(new Date(Number(epoch)));
  const match = String(text || '').match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})/);
  return match ? `${match[1]}T${String(match[2]).padStart(2, '0')}:${match[3]}` : '';
}

function formatDateEntry(entry) {
  const value = dateFromEntry(entry);
  return value ? formatDate(value) : 'Unknown date';
}

function formatTimeEntry(entry) {
  const epoch = Number(entry['Start Date/time (Epoch)']);
  if (epoch) {
    return new Date(epoch).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  const match = String(entry['Start Date/time'] || '').match(/ (\d{1,2}:\d{2})/);
  return match ? match[1] : '';
}

function dateFromEntry(entry) {
  const match = String(entry['Start Date/time'] || '').match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function localDate(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function localDateTime(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatDate(value) {
  const parts = String(value).split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return value;
  return new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  });
}

function weekday(value) {
  const parts = value.split('-').map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2])
    .toLocaleDateString(undefined, { weekday: 'short' })
    .slice(0, 2);
}

function hourLabel(hour) {
  if (hour === 0 || hour === 24) return '12 AM';
  if (hour < 12) return String(hour);
  if (hour === 12) return '12 PM';
  return String(hour - 12);
}

function latestLabel(type) {
  return {
    'Bottle Feed': 'Last feeding',
    'Diaper': 'Last change',
    'Sleep': 'Woke up',
    'Solid Feed': 'Last meal'
  }[type];
}

function latestValue(entry) {
  if (entry.Type === 'Bottle Feed') {
    const value = entry['[Bottle Feed] Volume'] ||
      entry['[Bottle Feed] Formula Volume'] ||
      entry['[Bottle Feed] Breast Milk Volume'] || '';
    const unit = entry['[Bottle Feed] Volume Unit'] ||
      entry['[Bottle Feed] Formula Volume Unit'] ||
      entry['[Bottle Feed] Breast Milk Volume Unit'] || '';
    return `${value}<small>${unit}</small>`;
  }
  if (entry.Type === 'Diaper') return escapeHtml((entry['[Diaper] Type'] || 'Diaper').toLowerCase());
  if (entry.Type === 'Sleep') return duration(entry['[Sleep] Duration (Seconds)']);
  return escapeHtml(entry['[Solid Feed] Meal'] || 'Meal');
}

function entryDetail(entry) {
  if (entry.Type === 'Bottle Feed') {
    return `${entry['[Bottle Feed] Volume'] || entry['[Bottle Feed] Formula Volume'] || entry['[Bottle Feed] Breast Milk Volume'] || ''} ${entry['[Bottle Feed] Volume Unit'] || entry['[Bottle Feed] Formula Volume Unit'] || entry['[Bottle Feed] Breast Milk Volume Unit'] || ''} ${entry['[Bottle Feed] Type'] || ''}`;
  }
  if (entry.Type === 'Diaper') {
    const type = entry['[Diaper] Type'] || 'Diaper';
    return entry['[Diaper] Detail'] ? `${type}: ${entry['[Diaper] Detail']}` : `${type} diaper`;
  }
  if (entry.Type === 'Sleep') {
    return entry['[Sleep] End Date/time (Epoch)']
      ? duration(entry['[Sleep] Duration (Seconds)'])
      : 'Timer running';
  }
  return `${entry['[Solid Feed] Meal'] || ''} ${entry['[Solid Feed] Food'] || ''}`.trim();
}

function relativeTime(entry) {
  const end = entry.Type === 'Sleep' && entry['[Sleep] End Date/time (Epoch)'];
  const epoch = Number(end || entry['Start Date/time (Epoch)']);
  if (!epoch) return formatTimeEntry(entry);

  const minutes = Math.max(0, Math.floor((Date.now() - epoch) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ${minutes % 60}m ago` : `${Math.floor(hours / 24)}d ago`;
}

function graphValue(value) {
  if (state.detailType === 'Sleep') return duration(value);
  if (state.detailType === 'Bottle Feed') return Math.round(value);
  return value;
}

function legend() {
  if (state.detailType === 'Diaper') {
    return '<div class="legend"><span><i class="first"></i>Wet</span><span><i class="second"></i>Dirty</span></div>';
  }
  if (state.detailType === 'Bottle Feed') {
    return '<div class="legend"><span><i class="first"></i>Formula</span><span><i class="second"></i>Breast milk</span></div>';
  }
  return '';
}

function duration(seconds) {
  seconds = Number(seconds) || 0;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function clock(seconds) {
  seconds = Math.max(0, Math.floor(seconds));
  return [
    Math.floor(seconds / 3600),
    Math.floor((seconds % 3600) / 60),
    seconds % 60
  ].map(value => String(value).padStart(2, '0')).join(':');
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[character]));
}

function showToast(message, error = false) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast${error ? ' error' : ''}`;
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => toast.classList.add('hidden'), 2500);
}
</script>
