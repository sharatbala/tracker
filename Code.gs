const SHEET_NAME = 'Core Data';
const CAREGIVERS = ['Sharat', 'Marianne'];

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

function getBootstrap() {
  const sheet = getSheet_();
  const rows = sheet.getDataRange().getDisplayValues();
  const headers = rows[0] || [];
  const profileNameIndex = headers.indexOf('Profile Name');
  
  let profiles = ['Baby'];
  if (profileNameIndex !== -1 && rows.length > 1) {
    const names = rows.slice(1).map(r => r[profileNameIndex]).map(String).map(v => v.trim()).filter(Boolean);
    profiles = [...new Set(names)].sort();
  }

  return {
    profiles: profiles,
    caregivers: CAREGIVERS,
    allRows: rows // Full sheet rows sent down for local IndexedDB hydration
  };
}

// Background sync route that processes batch changes from IndexedDB queue
function batchSyncData(mutations) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getSheet_();
    const rows = sheet.getDataRange().getValues();
    const headers = rows[0] || [];
    const keyIndex = headers.indexOf('_activityKey');

    mutations.forEach(mutation => {
      if (mutation.action === 'create') {
        const newRow = headers.map(h => mutation.data[h] || '');
        sheet.appendRow(newRow);
      } else if (mutation.action === 'update') {
        const rowIndex = rows.findIndex((r, idx) => idx > 0 && r[keyIndex] === mutation.key);
        if (rowIndex !== -1) {
          const updatedRow = rows[rowIndex].map((val, idx) => {
            const field = headers[idx];
            return mutation.data[field] !== undefined ? mutation.data[field] : val;
          });
          sheet.getRange(rowIndex + 1, 1, 1, updatedRow.length).setValues([updatedRow]);
        }
      } else if (mutation.action === 'delete') {
        const rowIndex = rows.findIndex((r, idx) => idx > 0 && r[keyIndex] === mutation.key);
        if (rowIndex !== -1) {
          sheet.deleteRow(rowIndex + 1);
        }
      }
    });

    return { success: true, serverTimestamp: Date.now() };
  } finally {
    lock.releaseLock();
  }
}
