/**
 * settings.js
 */

function renderSettingsPageContent(container) {
  if (!container) container = document.getElementById('settings-page');
  if (!container) return;

  // Make container visible
  container.classList.remove('hidden');
  container.style.display = 'block';

  const savedSettings = JSON.parse(localStorage.getItem('littlelog-settings') || '{}');
  
  // 1. Correct Default States
  const currentProfile = (window.state && window.state.profile) || savedSettings.profile || 'Alicia';
  const currentCaregiver = (window.state && window.state.caregiver) || savedSettings.caregiver || 'Sharat';
  
  // 2. Profile Options (Baby Name)
  const profiles = (window.state && window.state.profiles && window.state.profiles.length) 
    ? window.state.profiles 
    : ['Alicia', 'Baby'];
    
  // 3. Caregivers List (Only Caregivers)
  const caregivers = (window.state && window.state.caregivers && window.state.caregivers.length) 
    ? window.state.caregivers.filter(c => c !== 'Alicia')
    : ['Sharat', 'Marianne'];

  const uniqueProfiles = [...new Set(profiles)];
  const uniqueCaregivers = [...new Set(caregivers)];

  container.innerHTML = `
    <div style="max-width: 600px; margin: 0 auto; padding: 16px; display: flex; flex-direction: column; gap: 16px; box-sizing: border-box; color: #fff;">
      
      <!-- Top Navigation Header -->
      <div style="display: flex; align-items: center; justify-content: space-between; padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.1);">
        <button onclick="showHome()" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15); color: #fff; padding: 8px 16px; border-radius: 20px; cursor: pointer; font-size: 0.9rem;">
          &#10094; Back
        </button>
        <h2 style="margin: 0; font-size: 1.2rem; font-weight: bold;">Settings</h2>
        <div style="width: 60px;"></div>
      </div>

      <!-- Child Profile / Name -->
      <div style="background: #232736; border-radius: 16px; padding: 16px; border: 1px solid rgba(255, 255, 255, 0.06);">
        <label style="display: block; font-size: 0.85rem; font-weight: 600; color: #94a3b8; margin-bottom: 10px;">Name</label>
        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
          ${uniqueProfiles.map(p => `
            <button onclick="window.updateProfileSetting('${p}')" 
                    style="flex: 1; min-width: 90px; padding: 12px 14px; border-radius: 12px; border: none; font-size: 0.95rem; font-weight: 600; cursor: pointer; transition: all 0.2s;
                           background: ${p === currentProfile ? '#5b82c2' : 'rgba(255, 255, 255, 0.06)'}; color: #fff;">
              ${p}
            </button>
          `).join('')}
        </div>
      </div>

      <!-- Caregiver Selection -->
      <div style="background: #232736; border-radius: 16px; padding: 16px; border: 1px solid rgba(255, 255, 255, 0.06);">
        <label style="display: block; font-size: 0.85rem; font-weight: 600; color: #94a3b8; margin-bottom: 10px;">Caregiver</label>
        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
          ${uniqueCaregivers.map(c => `
            <button onclick="window.updateCaregiverSetting('${c}')" 
                    style="flex: 1; min-width: 90px; padding: 12px 14px; border-radius: 12px; border: none; font-size: 0.95rem; font-weight: 600; cursor: pointer; transition: all 0.2s;
                           background: ${c === currentCaregiver ? '#5b82c2' : 'rgba(255, 255, 255, 0.06)'}; color: #fff;">
              ${c}
            </button>
          `).join('')}
        </div>
      </div>

      <!-- API Web App URL -->
      <div style="background: #232736; border-radius: 16px; padding: 16px; border: 1px solid rgba(255, 255, 255, 0.06);">
        <label style="display: block; font-size: 0.85rem; font-weight: 600; color: #94a3b8; margin-bottom: 10px;">API Web App URL</label>
        <input type="text" id="setting-api-url" value="${localStorage.getItem('littlelog-api-url') || ''}" placeholder="https://script.google.com/..." 
               style="width: 100%; padding: 12px 16px; border-radius: 12px; background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.1); color: #fff; font-size: 0.9rem; box-sizing: border-box; outline: none; margin-bottom: 10px;" />
        <button onclick="window.saveApiUrlSetting()" style="width: 100%; padding: 12px; border-radius: 12px; background: #5b82c2; border: none; color: #fff; font-weight: 600; font-size: 0.95rem; cursor: pointer;">
          Save API URL
        </button>
      </div>

      <!-- Feedback Toast -->
      <div id="settings-save-toast" style="text-align: center; font-size: 0.85rem; color: #4ade80; opacity: 0; transition: opacity 0.3s ease;">
        Settings updated
      </div>

    </div>
  `;
}

// Global initialization alias
window.initSettingsView = function() {
  const container = document.getElementById('settings-page');
  renderSettingsPageContent(container);
};

// State Handlers
window.updateProfileSetting = function(val) {
  if (!window.state) window.state = {};
  window.state.profile = val;
  saveSettingsToLocalStorage();
  renderSettingsPageContent();
  showSaveToast();
};

window.updateCaregiverSetting = function(val) {
  if (!window.state) window.state = {};
  window.state.caregiver = val;
  saveSettingsToLocalStorage();
  renderSettingsPageContent();
  showSaveToast();
};

window.saveApiUrlSetting = function() {
  const input = document.getElementById('setting-api-url');
  if (input && input.value.trim()) {
    localStorage.setItem('littlelog-api-url', input.value.trim());
    showSaveToast('API URL saved');
    if (typeof syncInBackground === 'function') {
      syncInBackground();
    }
  }
};

function saveSettingsToLocalStorage() {
  localStorage.setItem('littlelog-settings', JSON.stringify({
    profile: (window.state && window.state.profile) || 'Alicia',
    caregiver: (window.state && window.state.caregiver) || 'Sharat'
  }));
}

function showSaveToast(msg = 'Settings updated') {
  const toast = document.getElementById('settings-save-toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.style.opacity = '1';
  setTimeout(() => { toast.style.opacity = '0'; }, 2000);
}
