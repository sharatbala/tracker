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
  
  // 2. Define targetDate properly (fallback to today if no entry exists)
  const targetDate = latest ? entryDate_(latest) : localDate();
  const highlightAction = latest ? `openEditorByKey('${latest._activityKey}')` : `openEditor('${type}')`;
  const cardId = `drawer-${type.toLowerCase().replace(/\s+/g, '-')}`;

  let maxVal = 1;
  if (type === 'Bottle Feed') {
    maxVal = Math.max(...recent.map(e => Number(e['[Bottle Feed] Volume'] || e['[Bottle Feed] Formula Volume'] || 0)), 1);
  } else if (type === 'Sleep') {
    maxVal = Math.max(...recent.map(e => Number(e['[Sleep] Duration (Seconds)'] || 0)), 1);
  }

  let topHighlightVal = '—';
  if (latest) {
    if (type === 'Sleep') {
      const startStr = formatDrawerTime(latest);
      const endEpoch = Number(latest['[Sleep] End Date/time (Epoch)'] || 0);
      if (endEpoch) {
        const endDate = new Date(endEpoch);
        const endStr = endDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
        topHighlightVal = `${startStr} – ${endStr}`;
      } else {
        topHighlightVal = formatSleepDuration(Number(latest['[Sleep] Duration (Seconds)'] || 0));
      }
    } else {
      topHighlightVal = latestValue(latest);
    }
  }

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
        <span class="highlight-value">${topHighlightVal}</span> 
      </button> 
      ${recent.length > 0 ? `
        <div class="card-drawer-toggle" onclick="toggleCardDrawer('${cardId}')" id="${cardId}-toggle">
          <span id="${cardId}-toggle-text">Show More</span>
          <span id="${cardId}-toggle-icon" style="transition: transform 0.2s ease;">▼</span>
        </div>
        <div class="card-drawer-content" id="${cardId}" style="max-height: 0; overflow: hidden; transition: max-height 0.3s ease;">
          ${recent.map(entry => {
            const hasBar = type === 'Bottle Feed' || type === 'Sleep';
            let barWidthPx = 60;
            
            if (hasBar) {
              const val = type === 'Bottle Feed'
                ? Number(entry['[Bottle Feed] Volume'] || entry['[Bottle Feed] Formula Volume'] || 0)
                : Number(entry['[Sleep] Duration (Seconds)'] || 0);
              barWidthPx = Math.max(15, Math.round((val / maxVal) * 100));
            }

            // Build time label: for sleep, show start – end; for others, just start time
            let timeLabel = formatDrawerTime(entry);
            let detailText = escapeHtml(latestValue(entry));

            if (type === 'Sleep') {
              const endEpoch = Number(entry['[Sleep] End Date/time (Epoch)'] || 0);
              if (endEpoch) {
                const endDate = new Date(endEpoch);
                const endStr = endDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
                const now = new Date();
                const isYesterdayEnd = endDate.toDateString() === new Date(now.setDate(now.getDate() - 1)).toDateString();
                // If it ends yesterday or spans days, keep it clean
                timeLabel = `${timeLabel} – ${endStr}`;
              }
              const secs = Number(entry['[Sleep] Duration (Seconds)'] || 0);
              detailText = formatSleepDuration(secs);
            }

            return `
              <button class="drawer-item" onclick="openEditorByKey('${entry._activityKey}')">
                <span class="activity-icon">${config.icon}</span>
                <div class="drawer-item-copy">
                  <strong>${timeLabel}</strong>
                  <div class="drawer-row-details">
                    ${hasBar ? `
                      <div class="drawer-bar" style="background:${config.color}; width:${barWidthPx}px; height: 6px; border-radius: 3px; display: inline-block;"></div>
                    ` : ''}
                    <span class="drawer-text-detail">${detailText}</span>
                  </div>
                </div>
                <span class="drawer-chevron">›</span>
              </button>
            `;
          }).join('')}
          <button class="see-all-drawer" onclick="openHistoryFiltered('${type}', '${targetDate}')">
            <span>See all entries</span>
            <span>›</span>
          </button>
        </div>
      ` : ''}
    </article>`; 
}

function formatDrawerTime(entry) {
  const epoch = Number(entry['Start Date/time (Epoch)'] || 0);
  if (!epoch) return formatTimeEntry(entry);
  
  const date = new Date(epoch);
  const now = new Date();
  const isYesterday = date.toDateString() === new Date(now.setDate(now.getDate() - 1)).toDateString();
  
  // Format cleanly as e.g. "9:14 am" or "yd 7:35 pm" without trailing colons
  const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
  
  if (isYesterday) {
    return `yd ${timeStr}`;
  }
  return timeStr;
}

function formatSleepDuration(totalSeconds) {
  if (!totalSeconds || totalSeconds <= 0) return '0m';
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.round((totalSeconds % 3600) / 60);
  
  if (hrs === 0) {
    return `${mins}m`;
  }
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

function toggleCardDrawer(cardId) {
  const content = document.getElementById(cardId);
  const toggleText = document.getElementById(`${cardId}-toggle-text`);
  const toggleIcon = document.getElementById(`${cardId}-toggle-icon`);
  if (!content) return;

  const isOpen = content.style.maxHeight && content.style.maxHeight !== '0px';
  if (isOpen) {
    content.style.maxHeight = '0px';
    if (toggleText) toggleText.textContent = 'Show More';
    if (toggleIcon) toggleIcon.style.transform = 'rotate(0deg)';
  } else {
    content.style.maxHeight = content.scrollHeight + 'px';
    if (toggleText) toggleText.textContent = 'Show Less';
    if (toggleIcon) toggleIcon.style.transform = 'rotate(180deg)';
  }
}

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
        <button class="see-all" onclick="openHistoryFiltered('Sleep', '${active ? entryDate_(active) : localDate()}')">See all ›</button> 
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

