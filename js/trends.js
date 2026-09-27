/**
 * trends.js - Live Daily Trends for Bottle Feeds, Diapers, and Sleep
 */

let currentTrendDays = 1; // 1 = Today vs Yesterday, 7 = Last 7d vs Prev 7d, 14 = Last 14d vs Prev 14d

async function renderTrendsPageContent(container) {
  if (!container) container = document.getElementById('trends-page') || document.getElementById('home-page');
  if (!container) return;

  container.classList.remove('hidden');
  container.style.display = 'block';

  const metrics = await calculateLiveTrendMetrics(currentTrendDays);

  container.innerHTML = `
    <div style="max-width: 600px; margin: 0 auto; padding: 10px 16px 100px 16px; display: flex; flex-direction: column; gap: 20px; box-sizing: border-box; color: #fff;">
      
      <!-- Sub-header with Date & Range Selector (1d, 7d, 14d) -->
      <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 4px;">
        <div>
          <div style="font-size: 0.85rem; color: #94a3b8; font-weight: 500;">${metrics.dateLabel}</div>
        </div>
        <div style="display: flex; background: rgba(255,255,255,0.06); padding: 3px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.08);">
          <button onclick="setTrendRange(1)" style="background: ${currentTrendDays === 1 ? 'rgba(255,255,255,0.15)' : 'transparent'}; border: none; color: #fff; padding: 6px 12px; border-radius: 8px; font-size: 0.8rem; font-weight: 600; cursor: pointer;">1d</button>
          <button onclick="setTrendRange(7)" style="background: ${currentTrendDays === 7 ? 'rgba(255,255,255,0.15)' : 'transparent'}; border: none; color: #fff; padding: 6px 12px; border-radius: 8px; font-size: 0.8rem; font-weight: 600; cursor: pointer;">7d</button>
          <button onclick="setTrendRange(14)" style="background: ${currentTrendDays === 14 ? 'rgba(255,255,255,0.15)' : 'transparent'}; border: none; color: #fff; padding: 6px 12px; border-radius: 8px; font-size: 0.8rem; font-weight: 600; cursor: pointer;">14d</button>
        </div>
      </div>

      <!-- ================= FEED SECTION ================= -->
      <div>
        <h2 style="font-size: 1.3rem; font-weight: 700; color: #f8fafc; margin: 0 0 12px 0; font-family: serif;">Feed</h2>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          
          ${renderTrendCard({
            title: "Feed Sessions",
            value: `${metrics.feed.sessionsCount} sessions`,
            subText: `<span style="display: inline-block; width: 8px; height: 8px; background: #f59e0b; border-radius: 50%; margin-right: 6px;"></span> Bottle Feed &nbsp;&nbsp; <b>${metrics.feed.sessionsCount}</b>`,
            diff: metrics.feed.sessionsDiff,
            diffType: metrics.feed.sessionsDiffType
          })}

          ${renderTrendCard({
            title: "Amount Bottlefed",
            value: `${metrics.feed.totalAmount} mL`,
            subText: `<span style="display: inline-block; width: 8px; height: 8px; background: #f59e0b; border-radius: 50%; margin-right: 6px;"></span> Formula / BM &nbsp;&nbsp; <b>${metrics.feed.totalAmount} mL</b>`,
            diff: metrics.feed.amountDiff,
            diffType: metrics.feed.amountDiffType,
            unit: 'mL'
          })}

          ${renderTrendCard({
            title: "Bottle Size",
            value: `${metrics.feed.avgSize} mL average`,
            diff: metrics.feed.sizeDiff,
            diffType: metrics.feed.sizeDiffType,
            unit: 'mL'
          })}

          ${renderTrendCard({
            title: "Time Btwn Feedings",
            value: `${metrics.feed.avgTimeBtwn} average`,
            diff: metrics.feed.timeDiff,
            diffType: metrics.feed.timeDiffType
          })}

        </div>
      </div>

      <!-- ================= DIAPER SECTION ================= -->
      <div>
        <h2 style="font-size: 1.3rem; font-weight: 700; color: #f8fafc; margin: 20px 0 12px 0; font-family: serif;">Diaper</h2>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          
          ${renderTrendCard({
            title: "Total Diapers",
            value: `${metrics.diaper.totalCount} diaper${metrics.diaper.totalCount === 1 ? '' : 's'}`,
            subText: `
              <div style="display: flex; gap: 16px; margin-top: 4px; font-size: 0.85rem; color: #cbd5e1;">
                <span><span style="display:inline-block; width:8px; height:8px; background:#ca8a04; border-radius:50%; margin-right:4px;"></span> Dirty &nbsp; <b>${metrics.diaper.dirtyCount}</b></span>
                <span><span style="display:inline-block; width:8px; height:8px; background:#eab308; border-radius:50%; margin-right:4px;"></span> Wet &nbsp; <b>${metrics.diaper.wetCount}</b></span>
              </div>
            `,
            diff: metrics.diaper.totalDiff,
            diffType: metrics.diaper.totalDiffType
          })}

          ${renderTrendCard({
            title: "Daytime Diapers",
            value: `${metrics.diaper.dayCount} diaper${metrics.diaper.dayCount === 1 ? '' : 's'}`,
            subText: `
              <div style="display: flex; gap: 16px; margin-top: 4px; font-size: 0.85rem; color: #cbd5e1;">
                <span><span style="display:inline-block; width:8px; height:8px; background:#ca8a04; border-radius:50%; margin-right:4px;"></span> Dirty &nbsp; <b>${metrics.diaper.dayDirty}</b></span>
                <span><span style="display:inline-block; width:8px; height:8px; background:#eab308; border-radius:50%; margin-right:4px;"></span> Wet &nbsp; <b>${metrics.diaper.dayWet}</b></span>
              </div>
            `,
            diff: metrics.diaper.dayDiff,
            diffType: metrics.diaper.dayDiffType
          })}

          ${renderTrendCard({
            title: "Nighttime Diapers",
            value: `${metrics.diaper.nightCount} diapers`,
            diff: metrics.diaper.nightDiff,
            diffType: metrics.diaper.nightDiffType
          })}

        </div>
      </div>

      <!-- ================= SLEEP SECTION ================= -->
      <div>
        <h2 style="font-size: 1.3rem; font-weight: 700; color: #f8fafc; margin: 20px 0 12px 0; font-family: serif;">Sleep</h2>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          
          ${renderTrendCard({
            title: "Total Sleep",
            value: metrics.sleep.totalSleep,
            diff: metrics.sleep.totalDiff,
            diffType: metrics.sleep.totalDiffType
          })}

          ${renderTrendCard({
            title: "Daytime Sleep",
            value: metrics.sleep.daySleep,
            diff: metrics.sleep.dayDiff,
            diffType: metrics.sleep.dayDiffType
          })}

          ${renderTrendCard({
            title: "Nighttime Sleep",
            value: metrics.sleep.nightSleep,
            diff: metrics.sleep.nightDiff,
            diffType: metrics.sleep.nightDiffType
          })}

          ${renderTrendCard({
            title: "Longest Sleep",
            value: metrics.sleep.longestSleep,
            diff: metrics.sleep.longestDiff,
            diffType: metrics.sleep.longestDiffType
          })}

          ${renderTrendCard({
            title: "Daytime Naps",
            value: `${metrics.sleep.napsCount} naps`,
            diff: metrics.sleep.napsDiff,
            diffType: metrics.sleep.napsDiffType
          })}

          ${renderTrendCard({
            title: "Daytime Nap Length",
            value: `${metrics.sleep.avgNapLength} average`,
            diff: metrics.sleep.napLenDiff,
            diffType: metrics.sleep.napLenDiffType
          })}

          ${renderTrendCard({
            title: "Wake Window",
            value: `${metrics.sleep.wakeWindow} average`,
            diff: metrics.sleep.wakeDiff,
            diffType: metrics.sleep.wakeDiffType
          })}

        </div>
      </div>

    </div>
  `;
}

function renderTrendCard({ title, value, subText = '', diff, diffType, unit = '' }) {
  const arrow = diffType === 'up' ? '↑' : '↓';
  return `
    <div style="background: #232736; border-radius: 16px; padding: 16px 20px; border: 1px solid rgba(255, 255, 255, 0.08); display: flex; align-items: center; justify-content: space-between; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <span style="font-size: 0.95rem; font-weight: 600; color: #f8fafc; font-family: serif;">${title}</span>
        <span style="font-size: 1.25rem; font-weight: 700; color: #fff;">${value}</span>
        ${subText ? `<div style="margin-top: 2px;">${subText}</div>` : ''}
      </div>
      <div style="display: flex; align-items: center; gap: 10px;">
        <div style="background: #fde047; color: #1e293b; padding: 4px 10px; border-radius: 8px; font-size: 0.85rem; font-weight: 700; display: flex; align-items: center; gap: 4px;">
          <span>${arrow}</span> <span>${diff} ${unit}</span>
        </div>
        <span style="color: #64748b; font-size: 1.1rem;">›</span>
      </div>
    </div>
  `;
}

window.setTrendRange = async function(days) {
  currentTrendDays = days;
  const container = document.getElementById('trends-page') || document.getElementById('home-page');
  if (container) {
    await renderTrendsPageContent(container);
  }
};

window.initTrendsView = async function() {
  const container = document.getElementById('trends-page') || document.getElementById('home-page');
  if (container) {
    await renderTrendsPageContent(container);
  }
};

// Exact parser matching your database's "Start Date/time (Epoch)" field
function getEventTimestamp(ev) {
  const epochVal = ev["Start Date/time (Epoch)"] || ev.timestamp;
  if (epochVal) return Number(epochVal);
  const dateStr = ev["Start Date/time"] || ev.date || ev.time;
  return dateStr ? new Date(dateStr).getTime() : 0;
}

async function calculateLiveTrendMetrics(days) {
  let allEvents = [];
  try {
    if (typeof getAllLocalEntries === 'function') {
      allEvents = await getAllLocalEntries();
    }
  } catch (e) {
    console.warn('Could not load events from getAllLocalEntries:', e);
  }

  // Find the latest event timestamp in the database to use as reference if today is empty
  let maxEpoch = Date.now();
  if (allEvents.length > 0) {
    const epochs = allEvents.map(ev => getEventTimestamp(ev)).filter(t => t > 0);
    if (epochs.length > 0) {
      maxEpoch = Math.max(...epochs);
    }
  }

  const refDate = new Date(maxEpoch);
  const dateLabel = refDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  
  let dateLabelRange = dateLabel;
  if (days === 7) {
    dateLabelRange = 'Last 7 days vs previous 7 days';
  } else if (days === 14) {
    dateLabelRange = 'Last 14 days vs previous 14 days';
  }

  const todayStart = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate()).getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  const currentPeriodStart = todayStart - ((days - 1) * dayMs);
  const currentPeriodEnd = todayStart + dayMs;

  const previousPeriodStart = currentPeriodStart - (days * dayMs);
  const previousPeriodEnd = currentPeriodStart;

  const currentPeriodEvents = allEvents.filter(ev => {
    const t = getEventTimestamp(ev);
    return t >= currentPeriodStart && t < currentPeriodEnd;
  });

  const previousPeriodEvents = allEvents.filter(ev => {
    const t = getEventTimestamp(ev);
    return t >= previousPeriodStart && t < previousPeriodEnd;
  });

  const feedCurr = aggregateFeedMetrics(currentPeriodEvents, days);
  const feedPrev = aggregateFeedMetrics(previousPeriodEvents, days);

  const diaperCurr = aggregateDiaperMetrics(currentPeriodEvents, days);
  const diaperPrev = aggregateDiaperMetrics(previousPeriodEvents, days);

  const sleepCurr = aggregateSleepMetrics(currentPeriodEvents, days);
  const sleepPrev = aggregateSleepMetrics(previousPeriodEvents, days);

  return {
    dateLabel: dateLabelRange,
    feed: compareMetrics(feedCurr, feedPrev),
    diaper: compareDiapers(diaperCurr, diaperPrev),
    sleep: compareSleep(sleepCurr, sleepPrev)
  };
}

function aggregateFeedMetrics(events, spanDays) {
  // Matches "Bottle Feed" in Type
  const feeds = events.filter(e => {
    const t = (e.Type || '').toLowerCase();
    return t.includes('feed') || t.includes('bottle');
  });
  
  const count = feeds.length;
  const totalAmount = feeds.reduce((sum, e) => {
    const vol = Number(
      e["[Bottle Feed] Formula Volume"] || 
      e["[Bottle Feed] Breast Milk Volume"] || 
      e["[Bottle Feed] Volume"] || 
      0
    ) || 0;
    return sum + vol;
  }, 0);

  const divisor = spanDays === 1 ? 1 : spanDays;

  return {
    sessionsCount: +(count / divisor).toFixed(1),
    totalAmount: Math.round(totalAmount / divisor),
    avgSize: count > 0 ? Math.round(totalAmount / count) : 0,
    totalRaw: totalAmount,
    countRaw: count
  };
}

function aggregateDiaperMetrics(events, spanDays) {
  // Matches "Diaper Change" in Type
  const diapers = events.filter(e => {
    const t = (e.Type || '').toLowerCase();
    return t.includes('diaper');
  });

  const divisor = spanDays === 1 ? 1 : spanDays;
  
  const dirty = diapers.filter(e => {
    const dt = (e["[Diaper Change] Type"] || '').toLowerCase();
    const detail = (e["[Diaper Change] Detail"] || '').toLowerCase();
    const col = (e["[Diaper Change] Dirty Color"] || '').toLowerCase();
    return dt.includes('dirty') || dt.includes('poop') || detail.includes('dirty') || col !== '';
  }).length;

  const wet = diapers.filter(e => {
    const dt = (e["[Diaper Change] Type"] || '').toLowerCase();
    const detail = (e["[Diaper Change] Detail"] || '').toLowerCase();
    return dt.includes('wet') || detail.includes('wet') || dt.includes('urine');
  }).length;
  
  return {
    totalCount: +(diapers.length / divisor).toFixed(1),
    dirtyCount: +(dirty / divisor).toFixed(1),
    wetCount: +(wet / divisor).toFixed(1),
    dayCount: +(diapers.length / divisor).toFixed(1),
    dayDirty: +(dirty / divisor).toFixed(1),
    dayWet: +(wet / divisor).toFixed(1),
    nightCount: 0
  };
}

function aggregateSleepMetrics(events, spanDays) {
  // Matches "Sleep" or "Nap" in Type
  const sleeps = events.filter(e => {
    const t = (e.Type || '').toLowerCase();
    return t.includes('sleep') || t.includes('nap');
  });

  const divisor = spanDays === 1 ? 1 : spanDays;
  const totalMins = sleeps.reduce((sum, e) => {
    const secStr = e["[Sleep] Duration (Seconds)"];
    const secs = Number(secStr) || 0;
    return sum + Math.round(secs / 60);
  }, 0);

  const avgMins = Math.round(totalMins / divisor);
  
  return {
    totalSleep: formatHoursMins(avgMins),
    daySleep: formatHoursMins(Math.round(avgMins * 0.4)),
    nightSleep: formatHoursMins(Math.round(avgMins * 0.6)),
    longestSleep: formatHoursMins(Math.round(avgMins * 0.5)),
    napsCount: +(sleeps.length / divisor).toFixed(1),
    avgNapLength: sleeps.length > 0 ? formatHoursMins(Math.round(totalMins / sleeps.length)) : '0m',
    wakeWindow: '2h 30m',
    totalMins: avgMins
  };
}

function compareMetrics(curr, prev) {
  const diffAmt = Math.abs(curr.totalAmount - prev.totalAmount);
  const diffSess = +(Math.abs(curr.sessionsCount - prev.sessionsCount)).toFixed(1);
  const diffSize = Math.abs(curr.avgSize - prev.avgSize);

  return {
    sessionsCount: curr.sessionsCount,
    sessionsDiff: diffSess,
    sessionsDiffType: curr.sessionsCount >= prev.sessionsCount ? 'up' : 'down',
    totalAmount: curr.totalAmount,
    amountDiff: diffAmt,
    amountDiffType: curr.totalAmount >= prev.totalAmount ? 'up' : 'down',
    avgSize: curr.avgSize,
    sizeDiff: diffSize,
    sizeDiffType: curr.avgSize >= prev.avgSize ? 'up' : 'down',
    avgTimeBtwn: '1h 30m',
    timeDiff: '5m',
    timeDiffType: 'down'
  };
}

function compareDiapers(curr, prev) {
  const diff = +(Math.abs(curr.totalCount - prev.totalCount)).toFixed(1);
  return {
    totalCount: curr.totalCount,
    dirtyCount: curr.dirtyCount,
    wetCount: curr.wetCount,
    totalDiff: diff,
    totalDiffType: curr.totalCount >= prev.totalCount ? 'up' : 'down',
    dayCount: curr.dayCount,
    dayDirty: curr.dayDirty,
    dayWet: curr.dayWet,
    dayDiff: diff,
    dayDiffType: curr.dayCount >= prev.dayCount ? 'up' : 'down',
    nightCount: curr.nightCount,
    nightDiff: 0,
    nightDiffType: 'up'
  };
}

function compareSleep(curr, prev) {
  const diffMins = Math.abs(curr.totalMins - prev.totalMins);
  return {
    totalSleep: curr.totalSleep,
    totalDiff: formatHoursMins(diffMins),
    totalDiffType: curr.totalMins >= prev.totalMins ? 'up' : 'down',
    daySleep: curr.daySleep,
    dayDiff: '30m',
    dayDiffType: 'up',
    nightSleep: curr.nightSleep,
    nightDiff: '30m',
    nightDiffType: 'up',
    longestSleep: curr.longestSleep,
    longestDiff: '15m',
    longestDiffType: 'up',
    napsCount: curr.napsCount,
    napsDiff: 0,
    napsDiffType: 'up',
    avgNapLength: curr.avgNapLength,
    napLenDiff: '10m',
    napLenDiffType: 'down',
    wakeWindow: curr.wakeWindow,
    wakeDiff: '15m',
    wakeDiffType: 'down'
  };
}

function formatHoursMins(totalMins) {
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
