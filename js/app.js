/**
 * app.js - Main Application Entry & Page Navigation Router
 */

async function initialize() { 
  const saved = JSON.parse(localStorage.getItem('littlelog-settings') || '{}'); 
  
  // Fully data-driven: no hardcoded personal or family name defaults
  state.profile = saved.profile || ''; 
  state.caregiver = saved.caregiver || '';
  state.caregivers = saved.caregivers || [];
  state.profiles = saved.profiles || [];

  let apiUrl = localStorage.getItem('littlelog-api-url'); 
  if (!apiUrl) { 
    apiUrl = prompt('Please enter your Google Apps Script Web App URL:'); 
    if (apiUrl && apiUrl.trim()) { 
      localStorage.setItem('littlelog-api-url', apiUrl.trim()); 
    } else { 
      showToast('Offline mode: No API URL provided', true); 
    } 
  }

  try { 
    // 1. Open database
    dbInstance = await openDatabase(); 
    
    // 2. Render UI immediately
    await loadHome();

    // 3. Sync background
    if (apiUrl) {
      syncInBackground();
    } else {
      updateSyncBadge('offline', 'Offline');
    }
  } catch (err) { 
    console.error('Initialization error:', err); 
    showToast('Offline mode active', true); 
    updateSyncBadge('offline', 'Offline');
    await loadHome(); 
  } 
}

// Background sync function
async function syncInBackground() {
  updateSyncBadge('syncing', 'Syncing...');

  try {
    const bootstrap = await callApi('getBootstrap');

    if (bootstrap) {
      state.profiles = bootstrap.profiles?.length ? bootstrap.profiles : (state.profile ? [state.profile] : []);
      state.caregivers = bootstrap.caregivers?.length ? bootstrap.caregivers : (state.caregiver ? [state.caregiver] : []);

      // Set valid profile/caregiver dynamically from data if not already set
      if (!state.profile && state.profiles.length > 0) {
        state.profile = state.profiles[0];
      }
      if (!state.caregiver && state.caregivers.length > 0) {
        state.caregiver = state.caregivers[0];
      }

      if (bootstrap.allRows) {
        await syncBootstrapToIDB(bootstrap.allRows);
        await loadHome(); // Re-render view with downloaded data
      }
    }
    
    updateSyncBadge('synced', 'Synced');
    setupBackgroundSync();
  } catch (err) {
    console.warn('Background sync failed:', err);
    updateSyncBadge('offline', 'Offline');
  }
}

// Helper to update sync badge text and status
function updateSyncBadge(statusClass, labelText) {
  const badge = document.getElementById('sync-status');
  const textEl = document.getElementById('sync-text');

  if (badge) {
    badge.className = `sync-badge ${statusClass}`;
  }
  if (textEl) {
    textEl.textContent = labelText;
  }
}

// Open Detail Page View
function openDetail(type, navButton) { 
  state.detailType = type; 
  state.selectedDate = state.endDate; 
  if (navButton) activateNav(navButton); 

  document.getElementById('home-page')?.classList.add('hidden'); 
  document.getElementById('history-page')?.classList.add('hidden'); 
  document.getElementById('settings-page')?.classList.add('hidden'); 
  document.getElementById('detail-page')?.classList.remove('hidden'); 
  document.getElementById('trends-page')?.classList.add('hidden');
  loadDetail(); 
} 

// Switch to History/Timeline Page View
function showHistoryPage(navButton) {
  if (navButton) activateNav(navButton);
  
  document.getElementById('home-page')?.classList.add('hidden');
  document.getElementById('detail-page')?.classList.add('hidden');
  document.getElementById('settings-page')?.classList.add('hidden');
  document.getElementById('trends-page')?.classList.add('hidden');
  document.getElementById('history-page')?.classList.remove('hidden');

  if (typeof initHistoryView === 'function') {
    initHistoryView();
  }
}

// Switch to Settings Page View (Single streamlined handler)
function showSettingsPage(navButton) {
  if (navButton) activateNav(navButton);

  document.getElementById('home-page')?.classList.add('hidden');
  document.getElementById('detail-page')?.classList.add('hidden');
  document.getElementById('history-page')?.classList.add('hidden');
  document.getElementById('trends-page')?.classList.add('hidden');
  document.getElementById('settings-page')?.classList.remove('hidden');

  if (typeof initSettingsView === 'function') {
    initSettingsView();
  }
}

// Switch to Home Page View
function showHome(navButton) { 
  document.getElementById('history-page')?.classList.add('hidden'); 
  document.getElementById('detail-page')?.classList.add('hidden'); 
  document.getElementById('settings-page')?.classList.add('hidden'); 
  document.getElementById('home-page')?.classList.remove('hidden'); 
  document.getElementById('trends-page')?.classList.add('hidden');
  
  if (navButton) activateNav(navButton); 
  state.detail = null; 
  loadHome(); 
}

function showTrendsPage(navButton) {
  if (navButton) activateNav(navButton);
  
  document.getElementById('home-page')?.classList.add('hidden');
  document.getElementById('detail-page')?.classList.add('hidden');
  document.getElementById('history-page')?.classList.add('hidden');
  document.getElementById('settings-page')?.classList.add('hidden');
  
  let trendsPage = document.getElementById('trends-page');
  if (!trendsPage) {
    trendsPage = document.createElement('div');
    trendsPage.id = 'trends-page';
    document.body.appendChild(trendsPage); // or append inside your main app container container element
  }
  trendsPage.classList.remove('hidden');
  initTrendsView();
}

// Navigation button active status helper
function activateNav(btn) {
  if (!btn) return;
  document.querySelectorAll('.bottom-nav button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
} 

window.addEventListener('DOMContentLoaded', () => {
  initialize();
});
