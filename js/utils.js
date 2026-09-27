function localDate(date = new Date()) {
  const d = new Date(date);
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().split('T')[0];
} //[cite: 1]

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${m}/${d}/${y}`;
} //[cite: 1]

function formatDateTimeLocal_(date = new Date()) {
  const d = new Date(date);
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 16);
} //[cite: 1]

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
} //[cite: 1]

function entryDate_(entry) {
  if (!entry) return '';
  const dt = entry['Start Date/time'] || '';
  return dt.slice(0, 10);
} //[cite: 1]

function entryDetail_(entry) {
  if (!entry) return '';
  if (entry.Type === 'Bottle Feed') {
    const vol = entry['[Bottle Feed] Volume'] || entry['[Bottle Feed] Formula Volume'] || '';
    const unit = entry['[Bottle Feed] Volume Unit'] || 'mL';
    const type = entry['[Bottle Feed] Type'] || '';
    return `${vol} ${unit}${type ? ' (' + type + ')' : ''}`;
  }
  if (entry.Type === 'Diaper') {
    const t = entry['[Diaper] Type'] || '';
    const d = entry['[Diaper] Detail'] || '';
    return t + (d ? ` - ${d}` : '');
  }
  if (entry.Type === 'Sleep') {
    const start = entry['Start Date/time'] || '';
    const end = entry['[Sleep] End Date/time'] || '';
    return end ? `${start.slice(11, 16)} - ${end.slice(11, 16)}` : 'Ongoing';
  }
  if (entry.Type === 'Solid Feed') {
    const meal = entry['[Solid Feed] Meal'] || '';
    const food = entry['[Solid Feed] Food'] || '';
    return `${meal}${food ? ': ' + food : ''}`;
  }
  return '';
} //[cite: 1]

function entryDetail(entry) { 
  return entryDetail_(entry); 
} //[cite: 1]

function dateRange_(endDateStr, days) {
  const result = [];
  const end = new Date(endDateStr);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    result.push(localDate(d));
  }
  return result;
} //[cite: 1]

function duration(seconds) {
  if (!seconds || seconds <= 0) return '0m';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
} //[cite: 1]

function formatTimeEntry(entry) {
  if (!entry || !entry['Start Date/time']) return '';
  return entry['Start Date/time'].slice(11, 16);
} //[cite: 1]

function relativeTime(entry) {
  if (!entry || !entry['Start Date/time (Epoch)']) return '';
  const epoch = Number(entry['Start Date/time (Epoch)']);
  const diffMs = Date.now() - epoch;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
} //[cite: 1]

function latestLabel(type) {
  return type;
} //[cite: 1]

function latestValue(latest) {
  return entryDetail_(latest);
} //[cite: 1]

function showToast(msg, isError = false) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = `toast ${isError ? 'error' : ''}`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
} //[cite: 1]
