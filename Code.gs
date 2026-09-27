const SHEET_NAME = 'Core Data';
const CAREGIVERS = ['Sharat', 'Marianne'];

// Handle incoming requests from your hosted front-end
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    
    if (action === 'getBootstrap') {
      return jsonResponse_(getBootstrapData_());
    } else if (action === 'batchSync') {
      const result = batchSyncData_(data.mutations);
      return jsonResponse_(result);
    }
    
    return jsonResponse_({ error: 'Invalid action' });
  } catch (err) {
    return jsonResponse_({ error: err.toString() });
  }
}

function doGet(e) {
  // Optional: Handle simple GET requests or health checks
  return jsonResponse_({ status: 'LittleLog API is active' });
}

function getSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error(`Sheet not found: ${SHEET_NAME}`);
  return sheet;
}

function getBootstrapData_() {
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
    allRows: rows
  };
}

function batchSyncData_(mutations) {
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

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
