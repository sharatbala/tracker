/**
 * history.js - Fixed Visual Timeline Schedule Grid
 */

const historyState = {
  selectedDate: null,
  activeFilters: new Set(['all']),
  allEntries: []
};

/**
 * Main Entry Point
 */
async function initHistoryView() {
  const container = document.getElementById('history-page') || document.getElementById('main-content');
  if (!container) return;

  container.innerHTML = `
    <div class="history-container" style="display: flex; flex-direction: column; gap: 16px; padding: 12px; max-width: 600px; margin: 0 auto; box-sizing: border-box;">
      
      <!-- Header Navigation -->
      <div class="calendar-header-wrapper" style="display: flex; align-items: center; justify-content: space-between; padding: 0 4px;">
        <button id="prev-week-btn" style="background: rgba(255,255,255,0.1); border: none; color: #fff; font-size: 1.2rem; border-radius: 50%; width: 36px; height: 36px; cursor: pointer; display: flex; align-items: center; justify-content: center;">&#10094;</button>

        <div style="position: relative; text-align: center;">
          <button id="calendar-month-btn" style="background: none; border: 1px solid rgba(255,255,255,0.2); color: inherit; font-size: 1rem; font-weight: bold; padding: 6px 16px; border-radius: 20px; cursor: pointer; display: inline-flex; align-items: center; gap: 8px;">
            <span id="calendar-month-title">SELECT DATE</span>
            <span style="font-size: 0.7rem;">&#9660;</span>
          </button>
          <input type="date" id="calendar-date-picker" style="position: absolute; opacity: 0; width: 1px; height: 1px; pointer-events: none; left: 50%; top: 50%;" />
        </div>

        <button id="next-week-btn" style="background: rgba(255,255,255,0.1); border: none; color: #fff; font-size: 1.2rem; border-radius: 50%; width: 36px; height: 36px; cursor: pointer; display: flex; align-items: center; justify-content: center;">&#10095;</button>
      </div>

      <!-- Timeline Card -->
      <div class="weekly-grid-card" style="background: rgba(255, 255, 255, 0.03); border-radius: 12px; padding: 12px; border: 1px solid rgba(255,255,255,0.08); overflow: hidden;">
        <div id="weekly-grid" style="position: relative; width: 100%; box-sizing: border-box;"></div>
      </div>

      <!-- Activity Filters -->
      <div class="filter-chips-wrapper" id="filter-chips" style="display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px;">
        <button class="chip" data-filter="all">All</button>
        <button class="chip" data-filter="nursing">🤱 Nursing</button>
        <button class="chip" data-filter="bottle feed">🍼 Bottle</button>
        <button class="chip" data-filter="solid feed">🥗 Solids</button>
        <button class="chip" data-filter="sleep">😴 Sleep</button>
        <button class="chip" data-filter="diaper">🧷 Diaper</button>
      </div>

      <!-- Detailed Day List Feed -->
      <div class="history-feed" id="history-feed"></div>
    </div>
  `;

  historyState.allEntries = await fetchDBEntriesSafely();

  const latestDateInDB = getLatestEntryDate(historyState.allEntries);
  historyState.selectedDate = latestDateInDB || getFormattedDate(new Date());

  setupDatePickerListeners();
  setupFilterListeners();
  syncFilterChipsUI(); // Apply persistent active filters on view load
  renderWeeklyGrid();
  renderHistoryFeed();
}

/**
 * Fetch entries directly from IndexedDB or state
 */
async function fetchDBEntriesSafely() {
  let records = [];

  try {
    const db = window.dbInstance || (typeof openDatabase === 'function' ? await openDatabase() : null);
    if (db) {
      window.dbInstance = db;
      records = await new Promise((resolve) => {
        const tx = db.transaction('entries', 'readonly');
        const store = tx.objectStore('entries');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
    }
  } catch (err) {
    console.warn("Direct IDB read failed:", err);
  }

  if ((!records || records.length === 0) && typeof getAllLocalEntries === 'function') {
    records = await getAllLocalEntries();
  }

  if ((!records || records.length === 0) && window.state) {
    records = window.state.allRows || window.state.entries || [];
  }

  return Array.isArray(records) ? records : [];
}

/**
 * Render Weekly Grid Frame (Full 24-Hour Coverage)
 */
function renderWeeklyGrid() {
  const gridContainer = document.getElementById('weekly-grid');
  const monthTitle = document.getElementById('calendar-month-title');
  if (!gridContainer) return;

  const anchorDate = parseLocalDate(historyState.selectedDate);
  const weekDays = getWeekDateRange(anchorDate);

  if (monthTitle) {
    monthTitle.textContent = anchorDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
  }

  const timeMarkers = [0, 3, 6, 9, 12, 15, 18, 21, 24];

  let html = `
    <!-- Header Row -->
    <div style="display: grid; grid-template-columns: 35px repeat(7, 1fr); text-align: center; font-size: 0.75rem; margin-bottom: 8px;">
      <div></div>
      ${weekDays.map(d => {
        const isSelected = d.dateStr === historyState.selectedDate;
        return `
          <div class="grid-day-header ${isSelected ? 'active' : ''}" 
               data-date="${d.dateStr}"
               onclick="selectGridDate('${d.dateStr}')"
               style="cursor: pointer; padding: 4px 2px; border-radius: 6px; ${isSelected ? 'background: #3b82f6; color: #fff; font-weight: bold;' : 'opacity: 0.7;'}">
            <div>${d.dayName}</div>
            <div style="font-size: 0.9rem; font-weight: bold;">${d.dayNum}</div>
          </div>
        `;
      }).join('')}
    </div>

    <!-- Timeline Body (480px Viewport covering all 24 hours) -->
    <div style="display: grid; grid-template-columns: 35px repeat(7, 1fr); height: 480px; position: relative; overflow: hidden; box-sizing: border-box;">
      
      <!-- Time Axis -->
      <div style="display: flex; flex-direction: column; justify-content: space-between; font-size: 0.65rem; color: #888; text-align: right; padding-right: 4px;">
        ${timeMarkers.map(h => `<div>${formatHourLabel(h)}</div>`).join('')}
      </div>

      <!-- Day Columns -->
      ${weekDays.map(d => {
        const isSelected = d.dateStr === historyState.selectedDate;
        
        // Find entries overlapping this day
        const dayEntries = historyState.allEntries.filter(e => {
          if (!historyState.activeFilters.has('all')) {
            const type = (e["Type"] || e.type || '').toLowerCase().trim();
            if (!historyState.activeFilters.has(type)) return false;
          }

          const startMs = getEntryTime(e);
          if (!startMs) return false;

          let rawDuration = Number(e["[Sleep] Duration (Seconds)"]) || 0;
          if (rawDuration > 86400) rawDuration = Math.round(rawDuration / 1000);
          const endMs = startMs + (rawDuration * 1000);

          const dayStartMs = parseLocalDate(d.dateStr).getTime();
          const dayEndMs = dayStartMs + 86400000;

          return startMs < dayEndMs && endMs > dayStartMs;
        });

        return `
          <div onclick="selectGridDate('${d.dateStr}')" 
               style="position: relative; height: 100%; border-left: 1px solid rgba(255,255,255,0.05); cursor: pointer; overflow: hidden;
                      background: ${isSelected ? 'rgba(59, 130, 246, 0.08)' : 'transparent'};">
            
            <!-- Grid Lines -->
            <div style="position: absolute; top:0; left:0; right:0; bottom:0; display: flex; flex-direction: column; justify-content: space-between; pointer-events: none;">
              ${timeMarkers.map(() => `<div style="border-top: 1px dashed rgba(255,255,255,0.05); width: 100%; height: 0;"></div>`).join('')}
            </div>

            <!-- Positioned Activity Bars -->
            ${dayEntries.map(e => renderGridBarForDay(e, d.dateStr)).join('')}
          </div>
        `;
      }).join('')}
    </div>
  `;

  gridContainer.innerHTML = html;
}

/**
 * Render Bars Handling Overnight Spans across Midnight
 */
function renderGridBarForDay(entry, targetDateStr) {
  const startMs = getEntryTime(entry);
  if (!startMs) return '';

  let rawDuration = Number(entry["[Sleep] Duration (Seconds)"]) || 0;
  if (rawDuration > 86400) rawDuration = Math.round(rawDuration / 1000);

  const endMs = startMs + (rawDuration * 1000);

  const targetDateObj = parseLocalDate(targetDateStr);
  const dayStartMs = new Date(targetDateObj.getFullYear(), targetDateObj.getMonth(), targetDateObj.getDate(), 0, 0, 0).getTime();
  const dayEndMs = dayStartMs + 86400000;

  if (endMs <= dayStartMs || startMs >= dayEndMs) return '';

  const effectiveStartMs = Math.max(startMs, dayStartMs);
  const effectiveEndMs = Math.min(endMs, dayEndMs);

  const startDate = new Date(effectiveStartMs);
  const startMinutes = startDate.getHours() * 60 + startDate.getMinutes();
  
  const durationMinutes = (effectiveEndMs - effectiveStartMs) / (1000 * 60);

  const topPercent = (startMinutes / 1440) * 100;
  let heightPercent = (durationMinutes / 1440) * 100;

  if (heightPercent < 2.0) heightPercent = 2.0;

  const type = (entry["Type"] || entry.type || '').toLowerCase();
  let bgColor = '#60a5fa'; // Blue
  if (type.includes('sleep')) bgColor = '#818cf8'; // Indigo
  if (type.includes('diaper')) bgColor = '#f472b6'; // Pink
  if (type.includes('solid')) bgColor = '#fbbf24'; // Yellow

  return `
    <div style="position: absolute; top: ${topPercent.toFixed(2)}%; height: ${heightPercent.toFixed(2)}%; left: 2px; right: 2px; 
                background: ${bgColor}; border-radius: 2px; opacity: 0.85; pointer-events: none;"
         title="${type} @ ${formatTime(startMs)}">
    </div>
  `;
}

/**
 * Select Date & Render
 */
window.selectGridDate = function(dateStr) {
  historyState.selectedDate = dateStr;
  renderWeeklyGrid();
  renderHistoryFeed();
};

/**
 * Retrieves and clamps all entries overlapping targetDateStr strictly to that 24-hour day
 */
function getClampedDayFeedEntries(targetDateStr) {
  const targetDateObj = parseLocalDate(targetDateStr);
  const dayStartMs = new Date(targetDateObj.getFullYear(), targetDateObj.getMonth(), targetDateObj.getDate(), 0, 0, 0).getTime();
  const dayEndMs = dayStartMs + 86400000;

  const result = [];

  historyState.allEntries.forEach(entry => {
    if (!historyState.activeFilters.has('all')) {
      const type = (entry["Type"] || entry.type || '').toLowerCase().trim();
      if (!historyState.activeFilters.has(type)) return;
    }

    const startMs = getEntryTime(entry);
    if (!startMs) return;

    let rawDuration = Number(entry["[Sleep] Duration (Seconds)"]) || 0;
    if (rawDuration > 86400) rawDuration = Math.round(rawDuration / 1000);

    const endMs = startMs + (rawDuration * 1000);

    if (endMs > dayStartMs && startMs < dayEndMs) {
      const effectiveStartMs = Math.max(startMs, dayStartMs);
      const effectiveEndMs = Math.min(endMs, dayEndMs);
      const clampedDurationSec = Math.round((effectiveEndMs - effectiveStartMs) / 1000);

      result.push({
        ...entry,
        _displayTimeMs: effectiveStartMs,
        _clampedDurationSec: clampedDurationSec,
        _isCarryoverFromPrevDay: startMs < dayStartMs
      });
    }
  });

  return result;
}

/**
 * Render Feed for Selected Day
 */
function renderHistoryFeed() {
  const feed = document.getElementById('history-feed');
  if (!feed) return;

  const targetDateStr = historyState.selectedDate;
  const filtered = getClampedDayFeedEntries(targetDateStr);

  // Chronological order: Oldest to Newest across the day
  filtered.sort((a, b) => a._displayTimeMs - b._displayTimeMs);

  if (filtered.length === 0) {
    feed.innerHTML = `<div class="empty-history" style="text-align:center; padding: 2rem; color: #888;">No entries recorded for ${targetDateStr}</div>`;
    return;
  }

  feed.innerHTML = filtered.map(entry => {
    const activityType = entry["Type"] || entry.type || 'Activity';
    const entryKey = entry._activityKey || entry.key || entry.id || '';
    const details = buildClampedEntryDetails(entry);
    const timeMs = entry._displayTimeMs;
    const timeStr = formatTime(timeMs);

    return `
      <div class="history-item" 
           style="display: flex; align-items: center; gap: 12px; padding: 12px; margin-bottom: 8px; background: rgba(255,255,255,0.04); border-radius: 8px; cursor: pointer; border: 1px solid rgba(255,255,255,0.05);"
           onclick="if(typeof openEditorByKey === 'function') openEditorByKey('${entryKey}')">
        <span class="activity-icon" style="font-size: 1.4rem;">${getActivityIcon(activityType)}</span>
        <div class="history-details" style="flex: 1;">
          <div class="history-title" style="display: flex; justify-content: space-between; align-items: center;">
            <strong style="font-size: 0.95rem;">
              ${capitalize(activityType)} ${entry._isCarryoverFromPrevDay ? '<span style="font-size:0.75rem; color:#818cf8;">(Overnight)</span>' : ''}
            </strong>
            <span class="history-time" style="font-size: 0.8rem; color: #aaa;">${timeStr}</span>
          </div>
          <div class="history-value" style="font-size: 0.85rem; color: #ccc; margin-top: 2px;">${details}</div>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Setup Event Handlers
 */
function setupDatePickerListeners() {
  const btn = document.getElementById('calendar-month-btn');
  const picker = document.getElementById('calendar-date-picker');
  const prevBtn = document.getElementById('prev-week-btn');
  const nextBtn = document.getElementById('next-week-btn');

  if (btn && picker) {
    btn.addEventListener('click', () => {
      picker.value = historyState.selectedDate;
      if (typeof picker.showPicker === 'function') {
        picker.showPicker();
      } else {
        picker.click();
      }
    });

    picker.addEventListener('change', (e) => {
      if (!e.target.value) return;
      historyState.selectedDate = e.target.value;
      renderWeeklyGrid();
      renderHistoryFeed();
    });
  }

  if (prevBtn) prevBtn.addEventListener('click', () => shiftWeek(-7));
  if (nextBtn) nextBtn.addEventListener('click', () => shiftWeek(7));
}

function shiftWeek(days) {
  const current = parseLocalDate(historyState.selectedDate);
  current.setDate(current.getDate() + days);
  historyState.selectedDate = getFormattedDate(current);
  renderWeeklyGrid();
  renderHistoryFeed();
}

function syncFilterChipsUI() {
  const filterContainer = document.getElementById('filter-chips');
  if (!filterContainer) return;

  filterContainer.querySelectorAll('.chip').forEach(chip => {
    const filterVal = chip.dataset.filter;
    if (historyState.activeFilters.has(filterVal)) {
      chip.classList.add('active');
    } else {
      chip.classList.remove('active');
    }
  });
}

function setupFilterListeners() {
  const filterContainer = document.getElementById('filter-chips');
  if (!filterContainer) return;

  filterContainer.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;

    const filterVal = chip.dataset.filter;

    if (filterVal === 'all') {
      historyState.activeFilters.clear();
      historyState.activeFilters.add('all');
    } else {
      historyState.activeFilters.delete('all');

      if (historyState.activeFilters.has(filterVal)) {
        historyState.activeFilters.delete(filterVal);
      } else {
        historyState.activeFilters.add(filterVal);
      }

      if (historyState.activeFilters.size === 0) {
        historyState.activeFilters.add('all');
      }
    }

    syncFilterChipsUI();
    renderWeeklyGrid();
    renderHistoryFeed();
  });
}

/* Helpers */

function getWeekDateRange(anchorDate) {
  const dates = [];
  const curr = new Date(anchorDate);
  const day = curr.getDay();
  const diff = curr.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(curr.setDate(diff));

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push({
      dateObj: d,
      dateStr: getFormattedDate(d),
      dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
      dayNum: d.getDate()
    });
  }
  return dates;
}

function buildClampedEntryDetails(entry) {
  const type = (entry["Type"] || entry.type || '').toLowerCase();
  const parts = [];

  if (type.includes('bottle')) {
    const formulaVol = entry["[Bottle Feed] Formula Volume"];
    const formulaUnit = entry["[Bottle Feed] Formula Volume Unit"] || 'ml';
    const formulaName = entry["[Bottle Feed] Formula Name"];
    if (formulaVol) parts.push(`${formulaVol} ${formulaUnit} ${formulaName ? `(${formulaName})` : ''}`);
  } else if (type.includes('diaper')) {
    const dType = entry["[Diaper] Type"];
    const dDetail = entry["[Diaper] Detail"];
    if (dType) parts.push(dType);
    if (dDetail) parts.push(dDetail);
  } else if (type.includes('sleep')) {
    const durationSec = entry._clampedDurationSec !== undefined 
      ? entry._clampedDurationSec 
      : Number(entry["[Sleep] Duration (Seconds)"]) || 0;

    const totalMins = Math.round(durationSec / 60);
    const hrs = Math.floor(totalMins / 60);
    const mins = totalMins % 60;

    if (hrs > 0) {
      parts.push(mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`);
    } else {
      parts.push(`${mins} mins`);
    }
  }

  if (entry["Note"]) parts.push(entry["Note"]);
  return parts.filter(Boolean).join(' - ') || 'No details recorded';
}

function extractFormattedDate(entry) {
  const timeMs = getEntryTime(entry);
  if (!timeMs) return '';
  return getFormattedDate(new Date(timeMs));
}

function getEntryTime(entry) {
  const epoch = entry["Start Date/time (Epoch)"];
  if (epoch && !isNaN(Number(epoch))) {
    return Number(epoch);
  }

  const rawStr = entry["Start Date/time"] || entry.timestamp || entry.date;
  if (!rawStr) return 0;

  if (typeof rawStr === 'string' && !rawStr.includes('Z') && !rawStr.includes('+')) {
    const normalized = rawStr.replace(' ', 'T');
    const d = new Date(normalized);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }

  const d = new Date(rawStr);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

function getLatestEntryDate(entries) {
  if (!entries || !entries.length) return null;
  let maxTime = 0;

  entries.forEach(e => {
    const t = getEntryTime(e);
    if (t > maxTime) maxTime = t;
  });

  return maxTime > 0 ? getFormattedDate(new Date(maxTime)) : null;
}

function getFormattedDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseLocalDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatHourLabel(h) {
  if (h === 0 || h === 24) return '12 AM';
  if (h < 12) return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
}

function formatTime(timestamp) {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getActivityIcon(type) {
  const t = (type || '').toLowerCase();
  if (t.includes('solid')) return '🥗';
  if (t.includes('nursing')) return '🤱';
  if (t.includes('bottle')) return '🍼';
  if (t.includes('sleep')) return '😴';
  if (t.includes('diaper')) return '🧷';
  return '📝';
}

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}
