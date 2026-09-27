const SHEET_NAME = 'Core Data';
const CAREGIVERS = ['Sharat', 'Marianne'];

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('LittleLog')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
}

function getSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error(`Sheet not found: ${SHEET_NAME}`);
  return sheet;
}

function getColumnMap_(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  return headers.reduce((map, header, index) => {
    if (header) map[header] = index + 1;
    return map;
  }, {});
}

function rowsToObjects_(sheet, rows) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  return rows.map(row => headers.reduce((object, header, index) => {
    if (header) object[header] = row[index] == null ? '' : row[index];
    return object;
  }, {}));
}

function getBootstrap() {
  return {
    profiles: getProfiles(),
    caregivers: CAREGIVERS
  };
}

function getProfileSettings(profileName) {
  const sheet = getSheet_();
  const map = getColumnMap_(sheet);
  const rows = sheet.getDataRange().getDisplayValues();

  for (let index = 1; index < rows.length; index++) {
    if (rows[index][map.Type - 1] === 'Profile' &&
        rows[index][map['Profile Name'] - 1] === profileName) {
      return {
        profileName: rows[index][map['Profile Name'] - 1] || profileName,
        birthDate: rows[index][map['[Profile] Birth Date'] - 1] || '',
        birthDateAdjusted: rows[index][map['[Profile] Birth Date (Adjusted)'] - 1] || '',
        sex: rows[index][map['[Profile] Sex'] - 1] || '',
        profileType: rows[index][map['[Profile] Type'] - 1] || 'CHILD',
        familyKey: rows[index][map._familyKey - 1] || '',
        profileKey: rows[index][map._profileKey - 1] || ''
      };
    }
  }

  return {
    profileName: profileName,
    birthDate: '',
    birthDateAdjusted: '',
    sex: '',
    profileType: 'CHILD',
    familyKey: '',
    profileKey: ''
  };
}

function updateProfileSettings(settings) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getSheet_();
    const map = getColumnMap_(sheet);
    const rows = sheet.getDataRange().getValues();
    let profileRow = null;
    let profileKey = settings.profileKey || '';
    const oldName = settings.originalProfileName || settings.profileName;

    for (let index = 1; index < rows.length; index++) {
      const isProfile = rows[index][map.Type - 1] === 'Profile';
      const sameProfile = profileKey
        ? rows[index][map._profileKey - 1] === profileKey
        : rows[index][map['Profile Name'] - 1] === oldName;
      if (isProfile && sameProfile) {
        profileRow = index + 1;
        profileKey = profileKey || rows[index][map._profileKey - 1];
        break;
      }
    }

    if (!profileRow) throw new Error('Profile row not found.');

    const row = sheet.getRange(profileRow, 1, 1, sheet.getLastColumn()).getValues()[0];
    row[map['Profile Name'] - 1] = settings.profileName;
    row[map['[Profile] Birth Date'] - 1] = settings.birthDate || '';
    row[map['[Profile] Birth Date (Adjusted)'] - 1] = settings.birthDateAdjusted || '';
    row[map['[Profile] Sex'] - 1] = settings.sex || '';
    row[map['[Profile] Type'] - 1] = settings.profileType || 'CHILD';
    sheet.getRange(profileRow, 1, 1, row.length).setValues([row]);

    if (settings.profileName !== oldName && profileKey) {
      for (let index = 1; index < rows.length; index++) {
        if (rows[index][map._profileKey - 1] === profileKey) {
          sheet.getRange(index + 1, map['Profile Name']).setValue(settings.profileName);
        }
      }
    }

    return { success: true, profileName: settings.profileName };
  } finally {
    lock.releaseLock();
  }
}

function getProfiles() {
  const sheet = getSheet_();
  const map = getColumnMap_(sheet);
  if (!map['Profile Name'] || sheet.getLastRow() < 2) return ['Baby'];

  const names = sheet
    .getRange(2, map['Profile Name'], sheet.getLastRow() - 1, 1)
    .getDisplayValues()
    .flat()
    .map(String)
    .map(value => value.trim())
    .filter(Boolean);

  return [...new Set(names)].sort();
}

function getEntries(options) {
  const sheet = getSheet_();
  if (sheet.getLastRow() < 2) return [];

  options = options || {};
  const rows = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn())
    .getDisplayValues();

  return rowsToObjects_(sheet, rows)
    .filter(entry => entry.Type && entry._activityKey)
    .filter(entry => !options.profile || entry['Profile Name'] === options.profile)
    .filter(entry => !options.type || entry.Type === options.type)
    .filter(entry => !options.from || entryDate_(entry) >= options.from)
    .filter(entry => !options.to || entryDate_(entry) <= options.to)
    .sort((a, b) => entryEpoch_(b) - entryEpoch_(a))
    .slice(0, Number(options.limit) || 500);
}

function getEntry(activityKey) {
  const sheet = getSheet_();
  const rowNumber = findRow_(sheet, activityKey);
  if (!rowNumber) return null;

  return rowsToObjects_(
    sheet,
    sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getDisplayValues()
  )[0];
}

function getHomeData(profile, date) {
  const entries = getEntries({ profile, limit: 600 });
  const recent = type => entries.filter(entry => entry.Type === type).slice(0, 3);
  const todayEntries = entries.filter(entry => entryDate_(entry) === date);
  const activeSleep = entries.find(entry =>
    entry.Type === 'Sleep' && !entry['[Sleep] End Date/time (Epoch)']
  ) || null;

  return {
    recent: {
      feed: recent('Bottle Feed'),
      diaper: recent('Diaper'),
      sleep: recent('Sleep'),
      solids: recent('Solid Feed')
    },
    activeSleep,
    today: {
      feedCount: todayEntries.filter(entry => entry.Type === 'Bottle Feed').length,
      feedMl: Math.round(
        todayEntries
          .filter(entry => entry.Type === 'Bottle Feed')
          .reduce((sum, entry) => sum + bottleMl_(entry), 0)
      ),
      diaperCount: todayEntries.filter(entry => entry.Type === 'Diaper').length,
      solidsCount: todayEntries.filter(entry => entry.Type === 'Solid Feed').length,
      sleepSeconds: entries
        .filter(entry => entry.Type === 'Sleep' && entry['[Sleep] End Date/time (Epoch)'])
        .reduce((sum, entry) => sum + sleepOverlap_(entry, date), 0)
    }
  };
}

function getActivityDetail(profile, type, endDate, days) {
  days = Number(days) || 7;
  const dates = dateRange_(endDate, days);
  const entries = getEntries({
    profile,
    type,
    from: dates[0],
    to: endDate,
    limit: 2000
  });
  const allSleep = type === 'Sleep'
    ? getEntries({ profile, type: 'Sleep', limit: 2000 })
    : [];

  const buckets = dates.map(date => summarizeDay_(
    date,
    type,
    entries.filter(entry => entryDate_(entry) === date),
    allSleep
  ));

  const average = buckets.reduce((sum, bucket) => sum + bucket.total, 0) / days;
  let headline = `${round_(average, 1)} per day`;
  if (type === 'Bottle Feed') headline = `${Math.round(average)} mL per day`;
  if (type === 'Diaper') headline = `${round_(average, 1)} diapers per day`;
  if (type === 'Sleep') headline = `${formatDuration_(average)} sleep per day`;
  if (type === 'Solid Feed') headline = `${round_(average, 1)} meals per day`;

  return { type, days, endDate, dates, headline, buckets, entries };
}

function summarizeDay_(date, type, entries, allSleep) {
  if (type === 'Bottle Feed') {
    let formula = 0;
    let breastMilk = 0;

    entries.forEach(entry => {
      const formulaValue = volumeMl_(
        entry['[Bottle Feed] Formula Volume'],
        entry['[Bottle Feed] Formula Volume Unit']
      );
      const breastValue = volumeMl_(
        entry['[Bottle Feed] Breast Milk Volume'],
        entry['[Bottle Feed] Breast Milk Volume Unit']
      );

      if (formulaValue || breastValue) {
        formula += formulaValue;
        breastMilk += breastValue;
      } else {
        formula += bottleMl_(entry);
      }
    });

    return {
      date,
      total: formula + breastMilk,
      formula,
      breastMilk,
      instances: entries.map(instance_)
    };
  }

  if (type === 'Diaper') {
    const wet = entries.filter(entry =>
      ['Wet', 'Both'].includes(entry['[Diaper] Type'])
    ).length;
    const dirty = entries.filter(entry =>
      ['Dirty', 'Both'].includes(entry['[Diaper] Type'])
    ).length;

    return {
      date,
      total: entries.length,
      wet,
      dirty,
      instances: entries.map(instance_)
    };
  }

  if (type === 'Sleep') {
    const matching = allSleep.filter(entry => sleepOverlap_(entry, date) > 0);
    return {
      date,
      total: matching.reduce((sum, entry) => sum + sleepOverlap_(entry, date), 0),
      instances: matching.map(instance_)
    };
  }

  return {
    date,
    total: entries.length,
    instances: entries.map(instance_)
  };
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

function createEntry(entry) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getSheet_();
    const map = getColumnMap_(sheet);
    const keys = findProfileKeys_(sheet, entry['Profile Name']);
    const row = new Array(sheet.getLastColumn()).fill('');

    entry._activityKey = entry._activityKey || newKey_('t');
    entry._familyKey = entry._familyKey || keys.family;
    entry._profileKey = entry._profileKey || keys.profile;

    Object.keys(entry).forEach(field => {
      if (map[field]) row[map[field] - 1] = entry[field];
    });

    sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);
    return { success: true, key: entry._activityKey };
  } finally {
    lock.releaseLock();
  }
}

function updateEntry(entry) {
  if (!entry || !entry._activityKey) throw new Error('Missing activity key.');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getSheet_();
    const map = getColumnMap_(sheet);
    const rowNumber = findRow_(sheet, entry._activityKey);
    if (!rowNumber) throw new Error('Entry not found.');

    const row = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
    Object.keys(entry).forEach(field => {
      if (map[field] && field !== '_activityKey') row[map[field] - 1] = entry[field];
    });
    row[map._activityKey - 1] = entry._activityKey;
    sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);

    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

function startSleep(profile, caregiver, timeZone) {
  const active = getEntries({ profile, type: 'Sleep', limit: 100 })
    .find(entry => !entry['[Sleep] End Date/time (Epoch)']);

  if (active) return { success: true, entry: active };

  const now = new Date();
  const zone = timeZone || Session.getScriptTimeZone();
  const entry = {
    Type: 'Sleep',
    'Profile Name': profile,
    'Start Date/time': Utilities.formatDate(now, zone, 'yyyy-MM-dd HH:mm:ss'),
    'Start Date/time (Epoch)': now.getTime(),
    'Created By Caregiver': caregiver,
    'Last Updated By Caregiver': caregiver,
    'Time Zone': zone
  };

  const result = createEntry(entry);
  entry._activityKey = result.key;
  return { success: true, entry };
}

function endSleep(activityKey, caregiver, timeZone) {
  const sheet = getSheet_();
  const map = getColumnMap_(sheet);
  const rowNumber = findRow_(sheet, activityKey);
  if (!rowNumber) throw new Error('Active sleep entry not found.');

  const row = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
  const startEpoch = Number(row[map['Start Date/time (Epoch)'] - 1]);
  const now = new Date();
  const zone = timeZone || row[map['Time Zone'] - 1] || Session.getScriptTimeZone();

  row[map['[Sleep] End Date/time'] - 1] = Utilities.formatDate(now, zone, 'yyyy-MM-dd HH:mm:ss');
  row[map['[Sleep] End Date/time (Epoch)'] - 1] = now.getTime();
  row[map['[Sleep] Duration (Seconds)'] - 1] = Math.max(
    0,
    Math.floor((now.getTime() - startEpoch) / 1000)
  );
  row[map['Last Updated By Caregiver'] - 1] = caregiver;
  sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);

  return { success: true };
}

function deleteEntry(activityKey) {
  const sheet = getSheet_();
  const rowNumber = findRow_(sheet, activityKey);
  if (!rowNumber) throw new Error('Entry not found.');
  sheet.deleteRow(rowNumber);
  return { success: true };
}

function findRow_(sheet, activityKey) {
  const map = getColumnMap_(sheet);
  if (!map._activityKey || sheet.getLastRow() < 2) return null;

  const values = sheet
    .getRange(2, map._activityKey, sheet.getLastRow() - 1, 1)
    .getDisplayValues();

  for (let index = 0; index < values.length; index++) {
    if (values[index][0] === activityKey) return index + 2;
  }
  return null;
}

function findProfileKeys_(sheet, profileName) {
  const map = getColumnMap_(sheet);
  const rows = sheet.getDataRange().getDisplayValues();

  for (let index = 1; index < rows.length; index++) {
    if (rows[index][map['Profile Name'] - 1] === profileName) {
      return {
        family: rows[index][map._familyKey - 1] || newKey_('f'),
        profile: rows[index][map._profileKey - 1] || newKey_('c')
      };
    }
  }

  return { family: newKey_('f'), profile: newKey_('c') };
}

function newKey_(prefix) {
  return `${prefix}-${Utilities.getUuid().replace(/-/g, '').slice(0, 20)}`;
}

function entryEpoch_(entry) {
  return Number(entry['Start Date/time (Epoch)']) || 0;
}

function entryDate_(entry) {
  const match = String(entry['Start Date/time'] || '').match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function volumeMl_(value, unit) {
  const number = Number(value) || 0;
  return String(unit).toUpperCase() === 'OZ' ? number * 29.5735 : number;
}

function bottleMl_(entry) {
  const generic = volumeMl_(
    entry['[Bottle Feed] Volume'],
    entry['[Bottle Feed] Volume Unit']
  );
  if (generic) return generic;

  return volumeMl_(
    entry['[Bottle Feed] Formula Volume'],
    entry['[Bottle Feed] Formula Volume Unit']
  ) + volumeMl_(
    entry['[Bottle Feed] Breast Milk Volume'],
    entry['[Bottle Feed] Breast Milk Volume Unit']
  );
}

function entryDetail_(entry) {
  if (entry.Type === 'Bottle Feed') {
    return `${Math.round(bottleMl_(entry))} mL ${entry['[Bottle Feed] Type'] || ''}`;
  }
  if (entry.Type === 'Diaper') {
    const type = entry['[Diaper] Type'] || 'Diaper';
    const detail = entry['[Diaper] Detail'] || '';
    return detail ? `${type}: ${detail}` : `${type} diaper`;
  }
  if (entry.Type === 'Sleep') {
    return entry['[Sleep] End Date/time (Epoch)']
      ? formatDuration_(entry['[Sleep] Duration (Seconds)'])
      : 'Timer running';
  }
  return `${entry['[Solid Feed] Meal'] || ''} ${entry['[Solid Feed] Food'] || ''}`.trim();
}

function dateRange_(endDate, days) {
  const parts = endDate.split('-').map(Number);
  const dates = [];
  for (let offset = days - 1; offset >= 0; offset--) {
    dates.push(Utilities.formatDate(
      new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] - offset)),
      'UTC',
      'yyyy-MM-dd'
    ));
  }
  return dates;
}

function sleepOverlap_(entry, date) {
  const start = Number(entry['Start Date/time (Epoch)']);
  const end = Number(entry['[Sleep] End Date/time (Epoch)']);
  if (!start || !end) return 0;

  const zone = entry['Time Zone'] || Session.getScriptTimeZone();
  const from = midnight_(date, zone);
  const to = midnight_(nextDate_(date), zone);
  return Math.max(0, Math.floor((Math.min(end, to) - Math.max(start, from)) / 1000));
}

function midnight_(date, zone) {
  const parts = date.split('-').map(Number);
  const noon = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12));
  const offset = Utilities.formatDate(noon, zone, 'Z');
  const sign = offset[0] === '-' ? -1 : 1;
  const minutes = sign * (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(3, 5)));
  return Date.UTC(parts[0], parts[1] - 1, parts[2]) - minutes * 60000;
}

function nextDate_(date) {
  const parts = date.split('-').map(Number);
  return Utilities.formatDate(
    new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + 1)),
    'UTC',
    'yyyy-MM-dd'
  );
}

function round_(number, places) {
  const power = Math.pow(10, places);
  return Math.round(number * power) / power;
}

function formatDuration_(seconds) {
  seconds = Number(seconds) || 0;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}
