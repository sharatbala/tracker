/**
 * settings.js - Clean Settings Page View (Managed by bottom nav)
 */

function renderSettingsPageContent(container) {
  if (!container) container = document.getElementById('settings-page');
  if (!container) return;

  container.classList.remove('hidden');
  container.style.display = 'block';

  // Fallback to global state or window.state, and localStorage
  const appState = (typeof state !== 'undefined' ? state : null) || window.state || {};
  const savedSettings = JSON.parse(localStorage.getItem('littlelog-settings') || '{}');
  
  const currentProfile = appState.profile || savedSettings.profile || '';
  const currentCaregiver = appState.caregiver || savedSettings.caregiver || '';
  const caregivers = (appState.caregivers && appState.caregivers.length > 0) ? appState.caregivers : (savedSettings.caregivers || []);

  container.innerHTML = `
    <div style="max-width: 600px; margin: 0 auto; padding: 20px 16px 100px 16px; display: flex; flex-direction: column; gap: 20px; box-sizing: border-box; color: #fff;">
      
      <!-- Header -->
      <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 14px;">
        <h2 style="margin: 0; font-size: 1.3rem; font-weight: 700; color: #f8fafc;">Settings</h2>
      </div>

      <!-- Baby Name Card -->
      <div style="background: #232736; border-radius: 16px; padding: 18px; border: 1px solid rgba(255, 255, 255, 0.08); box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
        <label style="display: block; font-size: 0.85rem; font-weight: 600; color: #94a3b8; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.05em;">Baby Name</label>
        <div style="display: flex; gap: 10px;">
          <input id="setting-name-input" type="text" value="${escapeHtml(currentProfile)}" placeholder="Enter baby name..." 
                 style="flex: 1; padding: 12px 16px; border-radius: 12px; background: rgba(0,0,0,0.3); color: #fff; border: 1px solid rgba(255,255,255,0.15); font-size: 0.95rem; outline: none; box-sizing: border-box;">
          <button type="button" onclick="saveProfileFromSettings()" style="padding: 12px 20px; background: #5b82c2; border: none; color: #fff; border-radius: 12px; cursor: pointer; font-weight: 600; font-size: 0.9rem; transition: background 0.2s;">
            Save
          </button>
        </div>
      </div>

      <!-- Caregivers Card -->
      <div style="background: #232736; border-radius: 16px; padding: 18px; border: 1px solid rgba(255, 255, 255, 0.08); box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
        <label style="display: block; font-size: 0.85rem; font-weight: 600; color: #94a3b8; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Caregivers</label>
        
        <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px;">
          ${caregivers.length === 0 ? '<span style="color: #64748b; font-size: 0.9rem;">No caregivers added yet. Type below to add one.</span>' : caregivers.map(c => `
            <div style="display: flex; align-items: center; background: ${c === currentCaregiver ? '#5b82c2' : 'rgba(255,255,255,0.06)'}; border-radius: 10px; padding: 8px 14px; gap: 8px; border: 1px solid ${c === currentCaregiver ? 'transparent' : 'rgba(255,255,255,0.08)'};">
              <span onclick="updateCaregiverSetting('${escapeHtml(c)}')" style="cursor: pointer; color: #fff; font-weight: 600; font-size: 0.9rem;">${escapeHtml(c)}</span>${c === currentCaregiver ? '<span style="font-size: 0.7rem; background: rgba(0,0,0,0.25); padding: 2px 6px; border-radius: 4px; font-weight: 500;">Active</span>' : ''}
            </div>
          `).join('')}
        </div>

        <!-- Add Caregiver Input -->
        <div style="display: flex; gap: 10px;">
          <input id="new-caregiver-input" type="text" placeholder="Type new caregiver name..." 
                 style="flex: 1; padding: 12px 16px; border-radius: 12px; background: rgba(0,0,0,0.3); color: #fff; border: 1px solid rgba(255,255,255,0.15); font-size: 0.95rem; outline: none; box-sizing: border-box;"
                 onkeydown="if(event.key === 'Enter') addCaregiverFromSettings()">
          <button type="button" onclick="addCaregiverFromSettings()" style="padding: 12px 20px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15); color: #fff; border-radius: 12px; cursor: pointer; font-weight: 600; font-size: 0.9rem;">
            Add
          </button>
        </div>
      </div>

      <!-- API URL Card -->
      <div style="background: #232736; border-radius: 16px; padding: 18px; border: 1px solid rgba(255, 255, 255, 0.08); box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
        <label style="display: block; font-size: 0.85rem; font-weight: 600; color: #94a3b8; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.05em;">API Web App URL</label>
        <input type="text" id="setting-api-url" value="${escapeHtml(localStorage.getItem('littlelog-api-url') || '')}" placeholder="https://script.google.com/..." 
               style="width: 100%; padding: 12px 16px; border-radius: 12px; background: rgba(0,0,0,0.3); color: #fff; border: 1px solid rgba(255,255,255,0.15); font-size: 0.9rem; box-sizing: border-box; margin-bottom: 12px; outline: none;" />
        <button type="button" onclick="saveApiUrlSetting()" style="width: 100%; background: rgba(91, 130, 194, 0.2); border: 1px solid #5b82c2; color: #60a5fa; padding: 12px; border-radius: 12px; cursor: pointer; font-weight: 600; font-size: 0.9rem;">
          Save API URL
        </button>
      </div>

      <!-- Toast Feedback -->
      <div id="settings-toast" style="text-align: center; font-size: 0.85rem; color: #4ade80; opacity: 0; transition: opacity 0.3s ease; font-weight: 500;">
        Updated successfully
      </div>

    </div>
  `;
}

window.initSettingsView = function() {
  const container = document.getElementById('settings-page');
  renderSettingsPageContent(container);
};

window.saveProfileFromSettings = function() {
  const input = document.getElementById('setting-name-input');
  if (!input) return;
  const val = input.value.trim();
  if (!val) {
    alert('Please enter a valid baby name.');
    return;
  }
  
  if (typeof state !== 'undefined') {
    state.profile = val;
    if (!state.profiles) state.profiles = [];
    if (!state.profiles.includes(val)) state.profiles.push(val);
  }
  if (!window.state) window.state = {};
  window.state.profile = val;

  saveSettingsToLocalStorage();
  showSettingsToast('Baby name updated');
  renderSettingsPageContent(document.getElementById('settings-page'));
  if (typeof loadHome === 'function') loadHome();
};

window.updateCaregiverSetting = function(val) {
  if (typeof state !== 'undefined') {
    state.caregiver = val;
  }
  if (!window.state) window.state = {};
  window.state.caregiver = val;

  saveSettingsToLocalStorage();
  renderSettingsPageContent(document.getElementById('settings-page'));
  showSettingsToast('Active caregiver updated');
};

window.addCaregiverFromSettings = function() {
  const input = document.getElementById('new-caregiver-input');
  if (!input) return;
  const val = input.value.trim();
  if (!val) return;

  const targetState = (typeof state !== 'undefined' ? state : window.state);
  if (targetState) {
    if (!targetState.caregivers) targetState.caregivers = [];
    if (!targetState.caregivers.includes(val)) {
      targetState.caregivers.push(val);
    }
    targetState.caregiver = val;
  }
  if (!window.state) window.state = {};
  window.state.caregiver = val;

  saveSettingsToLocalStorage();
  renderSettingsPageContent(document.getElementById('settings-page'));
  showSettingsToast(`Caregiver "${val}" added`);
};

window.saveApiUrlSetting = function() {
  const input = document.getElementById('setting-api-url');
  if (input && input.value.trim()) {
    localStorage.setItem('littlelog-api-url', input.value.trim());
    showSettingsToast('API URL saved');
    if (typeof syncInBackground === 'function') {
      syncInBackground();
    }
  }
};

function saveSettingsToLocalStorage() {
  const appState = (typeof state !== 'undefined' ? state : null) || window.state || {};
  localStorage.setItem('littlelog-settings', JSON.stringify({
    profile: appState.profile || '',
    caregiver: appState.caregiver || '',
    caregivers: appState.caregivers || [],
    profiles: appState.profiles || []
  }));
}

function showSettingsToast(msg) {
  const toast = document.getElementById('settings-toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.style.opacity = '1';
  setTimeout(() => { toast.style.opacity = '0'; }, 2000);
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
