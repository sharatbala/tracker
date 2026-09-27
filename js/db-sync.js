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
} //[cite: 1]

async function syncBootstrapToIDB(rows) { 
  if (!rows || rows.length < 2) return; 
  const headers = rows[0]; 
  const tx = dbInstance.transaction('entries', 'readwrite'); 
  const store = tx.objectStore('entries');

  for (let i = 1; i < rows.length; i++) { 
    const row = rows[i]; 
    const obj = {}; 
    headers.forEach((h, idx) => { 
      if (h) obj[h] = row[idx] ?? ''; 
    }); 
    if (obj._activityKey) { 
      store.put({ ...obj, _synced: true }); 
    } 
  } 
} //[cite: 1]

async function getAllLocalEntries() { 
  return new Promise((resolve) => { 
    if (!dbInstance) return resolve([]);
    const tx = dbInstance.transaction('entries', 'readonly'); 
    const store = tx.objectStore('entries'); 
    const req = store.getAll(); 
    req.onsuccess = () => resolve(req.result || []); 
    req.onerror = () => resolve([]);
  }); 
} //[cite: 1]

async function upsertLocalEntry(payload, action = 'create') {
  if (!dbInstance) return;
  const tx = dbInstance.transaction(['entries', 'sync_queue'], 'readwrite');
  const store = tx.objectStore('entries');
  const queue = tx.objectStore('sync_queue');
  
  store.put(payload);
  queue.add({ action, payload, timestamp: Date.now() });
  
  tx.oncomplete = () => triggerBackgroundSync();
} //[cite: 1]

async function deleteLocalEntry(key) {
  if (!dbInstance) return;
  const tx = dbInstance.transaction(['entries', 'sync_queue'], 'readwrite');
  const store = tx.objectStore('entries');
  const queue = tx.objectStore('sync_queue');
  
  store.delete(key);
  queue.add({ action: 'delete', key, timestamp: Date.now() });
  
  tx.oncomplete = () => triggerBackgroundSync();
} //[cite: 1]

function setupBackgroundSync() { 
  window.addEventListener('online', triggerBackgroundSync); 
  setInterval(triggerBackgroundSync, 45000); 
} //[cite: 1]

async function triggerBackgroundSync() { 
  if (!navigator.onLine || !dbInstance) return;

  const tx = dbInstance.transaction('sync_queue', 'readonly'); 
  const store = tx.objectStore('sync_queue'); 
  const req = store.getAll();

  req.onsuccess = async () => { 
    const queue = req.result; 
    if (!queue || queue.length === 0) return;

    try { 
      await callApi('batchSync', { mutations: queue }); 
      const clearTx = dbInstance.transaction('sync_queue', 'readwrite'); 
      const clearStore = clearTx.objectStore('sync_queue'); 
      queue.forEach(item => clearStore.delete(item.id)); 
    } catch (err) { 
      console.warn('Background sync deferred:', err); 
    } 
  }; 
} //[cite: 1]

async function callApi(action, payload = {}) {
  const apiUrl = localStorage.getItem('littlelog-api-url');
  if (!apiUrl) throw new Error('No API URL available');
  
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...payload })
  });
  return await res.json();
} //[cite: 1]
