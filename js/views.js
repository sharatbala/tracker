async function loadHome() { 
  clearInterval(state.sleepTimer); 
  const titleEl = document.getElementById('profile-title');
  if (titleEl) titleEl.textContent = state.profile;

  const entries = await getAllLocalEntries(); 
  const profileEntries = entries 
    .filter(e => e.Type && e._activityKey && (!state.profile || e['Profile Name'] === state.profile)) 
    .sort((a, b) => Number(b['Start Date/time (Epoch)'] || 0) - Number(a['Start Date/time (Epoch)'] || 0));

  const todayStr = localDate(); 
  const recent = type => profileEntries.filter(e => e.Type === type).slice(0, 3); 
  const todayEntries = profileEntries.filter(e => entryDate_(e) === todayStr); 
  const activeSleep = profileEntries.find(e => e.Type === 'Sleep' && !e['[Sleep] End Date/time (Epoch)']) || null;

  let sleepSecs = 0;
  let feedCount = 0;
  let feedMl = 0;
  let diaperCount = 0;
  let solidsCount = 0;

  todayEntries.forEach(e => {
    if (e.Type === 'Bottle Feed') {
      feedCount++;
      feedMl += Number(e['[Bottle Feed] Volume'] || e['[Bottle Feed] Formula Volume'] || 0);
    } else if (e.Type === 'Diaper') {
      diaperCount++;
    } else if (e.Type === 'Solid Feed') {
      solidsCount++;
    } else if (e.Type === 'Sleep' && e['[Sleep] Duration (Seconds)']) {
      sleepSecs += Number(e['[Sleep] Duration (Seconds)']);
    }
  });

  state.home = {
    recent: {
      feed: recent('Bottle Feed'),
      diaper: recent('Diaper'),
      sleep: recent('Sleep'),
      solids: recent('Solid Feed')
    },
    today: { sleepSeconds: sleepSecs, feedCount, feedMl, diaperCount, solidsCount },
    activeSleep
  };

  renderHome(); 
  startSleepClock(); 
} //[cite: 1]

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

  const buckets = dates.map(d => {
    const dayEntries = filtered.filter(e => entryDate_(e) === d);
    let total = 0;
    const instances = dayEntries.map(e => {
      const vol = Number(e['[Bottle Feed] Volume'] || e['[Bottle Feed] Formula Volume'] || 0);
      total += vol;
      return {
        key: e._activityKey,
        start: e['Start Date/time'] || '',
        detail: entryDetail_(e)
      };
    });
    return { date: d, total, instances };
  });

  state.detail = {
    type,
    headline: `${type} History`,
    entries: filtered,
    buckets
  };

  renderDetail();
} //[cite: 1]

function renderHome() { 
  const types = ['Bottle Feed', 'Diaper', 'Sleep', 'Solid Feed']; 
  const cardsContainer = document.getElementById('activity-cards');
  if (cardsContainer) cardsContainer.innerHTML = types.map(renderCard).join(''); 
  
  const today = state.home?.today || { sleepSeconds: 0, feedCount: 0, feedMl: 0, diaperCount: 0, solidsCount: 0 }; 
  const summaryContainer = document.getElementById('today-summary');
  if (summaryContainer) {
    summaryContainer.innerHTML = `
      <div class="section-heading"><h2>Today</h2><span>${formatDate(localDate())}</span></div> 
      <div class="summary-grid"> 
        <div><strong>${duration(today.sleepSeconds)}</strong><span>Sleep</span></div> 
        <div><strong>${today.feedCount}</strong><span>Feeds • ${today.feedMl} mL</span></div> 
        <div><strong>${today.diaperCount}</strong><span>Diapers</span></div> 
        <div><strong>${today.solidsCount}</strong><span>Meals</span></div> 
      </div>`; 
  }
} //[cite: 1]

function renderCard(type) { 
  const config = TYPES[type]; 
  const recent = state.home?.recent[config.key] || []; 
  if (type === 'Sleep' && state.home?.activeSleep) return renderActiveSleep(config, recent);

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
        <button class="see-all" onclick="openDetail('${type}')">See all ›</button> 
      </div> 
    </article>`; 
} //[cite: 1]

function compactEntry(entry) { 
  return `<button class="compact-entry" onclick="openEditorByKey('${entry._activityKey}')"><span>${formatTimeEntry(entry)}</span><strong>${escapeHtml(entryDetail(entry))}</strong></button>`; 
} //[cite: 1]

function renderActiveSleep(config, recent) { 
  const active = state.home.activeSleep; 
  return `
    <article class="activity-card"> 
      <div class="card-header" style="background:${config.color}"><h2>Sleep</h2><span class="live-badge">LIVE</span></div> 
      <div class="active-sleep"> 
        <span class="activity-icon">🌙</span> 
        <div><strong>Sleeping</strong><small>Started ${formatTimeEntry(active)}</small></div> 
        <b id="sleep-clock">00:00:00</b> 
      </div> 
      <button class="sleep-stop" onclick="endActiveSleep()">End Sleep</button> 
      <div class="recent-panel"> 
        ${recent.filter(e => e._activityKey !== active._activityKey).slice(0, 2).map(compactEntry).join('')} 
        <button class="see-all" onclick="openDetail('Sleep')">See all ›</button> 
      </div> 
    </article>`; 
} //[cite: 1]

function startSleepClock() {
  if (!state.home?.activeSleep) return;
  const startEpoch = Number(state.home.activeSleep['Start Date/time (Epoch)'] || Date.now());
  
  state.sleepTimer = setInterval(() => {
    const clockEl = document.getElementById('sleep-clock');
    if (!clockEl) return;
    const diffSecs = Math.floor((Date.now() - startEpoch) / 1000);
    const hrs = String(Math.floor(diffSecs / 3600)).padStart(2, '0');
    const mins = String(Math.floor((diffSecs % 3600) / 60)).padStart(2, '0');
    const secs = String(diffSecs % 60).padStart(2, '0');
    clockEl.textContent = `${hrs}:${mins}:${secs}`;
  }, 1000);
} //[cite: 1]

async function endActiveSleep() {
  if (!state.home?.activeSleep) return;
  const active = state.home.activeSleep;
  const now = new Date();
  active['[Sleep] End Date/time'] = formatDateTimeLocal_(now);
  active['[Sleep] End Date/time (Epoch)'] = now.getTime();
  const startEpoch = Number(active['Start Date/time (Epoch)'] || now.getTime());
  active['[Sleep] Duration (Seconds)'] = Math.floor((now.getTime() - startEpoch) / 1000);
  
  await upsertLocalEntry(active, 'update');
  await loadHome();
} //[cite: 1]

function renderDetail() { 
  const detail = state.detail; 
  if (!detail) return;

  const typeConfig = TYPES[detail.type] || { title: detail.type, icon: '📋', color: '#f2ecdc' };

  document.getElementById('detail-page').innerHTML = ` 
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
} //[cite: 1]

function switchDetailTab(tab) { 
  state.detailTab = tab; 
  renderDetail(); 
} //[cite: 1]

function renderDetailCalendar(detail) { 
  return `
    <div class="calendar-view"> 
      ${detail.buckets.slice().reverse().map(b => `
        <div class="calendar-day-row"> 
          <div class="calendar-day-meta"> 
            <strong>${formatDate(b.date)}</strong> 
            <span>${b.total ? Math.round(b.total) : '0'}${detail.type === 'Bottle Feed' ? ' mL' : ''}</span> 
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
} //[cite: 1]

function renderDetailList(detail) { 
  return `
    <div class="list-view"> 
      ${detail.entries.length ? detail.entries.map(entry => `
        <button class="list-row-item" onclick="openEditorByKey('${entry._activityKey}')"> 
          <div class="list-row-left"> 
            <strong>${escapeHtml(entry['Start Date/time'] || '')}</strong> 
            <small>${escapeHtml(entry['Created By Caregiver'] || '')}</small> 
          </div> 
          <div class="list-row-right"> 
            <span>${escapeHtml(entryDetail_(entry))}</span> 
          </div> 
        </button> 
      `).join('') : '<div class="empty-instance">No entries found</div>'} 
    </div>`; 
} //[cite: 1]
