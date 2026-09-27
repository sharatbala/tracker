const TYPES = { 
  'Bottle Feed': { key: 'feed', title: 'Feed', icon: '🍼', color: '#ffd052' }, 
  'Diaper': { key: 'diaper', title: 'Diaper', icon: '💩', color: '#f2ecdc' }, 
  'Sleep': { key: 'sleep', title: 'Sleep', icon: '🌙', color: '#bfe7f3' }, 
  'Solid Feed': { key: 'solids', title: 'Solids', icon: '🥣', color: '#e8c6d5' } 
}; //[cite: 1]

const DB_NAME = 'LittleLogLocalDB'; //[cite: 1]
const DB_VERSION = 1; //[cite: 1]
let dbInstance = null; //[cite: 1]

const state = { 
  profile: '', 
  caregiver: 'Sharat', 
  profiles: [], 
  caregivers: ['Sharat', 'Marianne'], 
  home: null, 
  sleepTimer: null, 
  loadingCount: 0 
}; //[cite: 1]
