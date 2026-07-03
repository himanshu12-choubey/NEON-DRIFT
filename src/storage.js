// ============================================================================
// storage.js — persistence layer (localStorage). All game progress, unlocks,
// settings and mission state live here so main.js never touches localStorage
// directly.
// ============================================================================

const SAVE_KEY = 'neonDrift.save.v1';

const MISSION_POOL = [
  { id: 'collect_coins', label: c => `Collect ${c} crystals in one run`, goalRange: [30, 80], reward: 60, type: 'coins_single_run' },
  { id: 'run_distance', label: c => `Run ${c}m in one run`, goalRange: [400, 1200], reward: 70, type: 'distance_single_run' },
  { id: 'use_powerups', label: c => `Use ${c} power-ups`, goalRange: [2, 6], reward: 40, type: 'powerups_used' },
  { id: 'combo_streak', label: c => `Reach a x${c} combo`, goalRange: [4, 10], reward: 55, type: 'combo_reached' },
  { id: 'jump_count', label: c => `Jump ${c} times`, goalRange: [15, 40], reward: 35, type: 'jumps_total' },
  { id: 'slide_count', label: c => `Slide ${c} times`, goalRange: [15, 40], reward: 35, type: 'slides_total' },
  { id: 'no_hit_run', label: c => `Run ${c}m without crashing`, goalRange: [250, 600], reward: 80, type: 'distance_single_run' },
];

const ACHIEVEMENTS = [
  { id: 'ach_first_run', name: 'First Steps', desc: 'Complete your first run', goal: 1, type: 'runs_total', reward: 30 },
  { id: 'ach_1000m', name: 'Kilometer Club', desc: 'Run 1000m in a single run', goal: 1000, type: 'best_distance', reward: 100 },
  { id: 'ach_5000m', name: 'Skyline Legend', desc: 'Run 5000m in a single run', goal: 5000, type: 'best_distance', reward: 250 },
  { id: 'ach_500coins', name: 'Crystal Hoarder', desc: 'Collect 500 crystals total', goal: 500, type: 'coins_total', reward: 100 },
  { id: 'ach_5000coins', name: 'Crystal Baron', desc: 'Collect 5000 crystals total', goal: 5000, type: 'coins_total', reward: 300 },
  { id: 'ach_combo10', name: 'Chain Reaction', desc: 'Reach a x10 combo', goal: 10, type: 'best_combo', reward: 80 },
  { id: 'ach_owned5', name: 'Collector', desc: 'Unlock 5 shop items', goal: 5, type: 'items_owned', reward: 90 },
  { id: 'ach_jetpack', name: 'Sky High', desc: 'Use the Jetpack power-up 10 times', goal: 10, type: 'jetpack_used', reward: 70 },
];

function seededRandom(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return function () {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function dayKey(date = new Date()) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayNumericSeed(date = new Date()) {
  return date.getFullYear() * 372 + date.getMonth() * 31 + date.getDate();
}

function defaultSave() {
  return {
    coins: 40,
    highScore: 0,
    bestDistance: 0,
    totalCoinsEver: 0,
    totalRuns: 0,
    bestCombo: 0,
    jetpackUsesTotal: 0,
    ownedCharacters: ['kade'],
    ownedOutfits: ['default_kade', 'default_rin', 'default_zeph'],
    ownedBoards: ['starter_board'],
    equippedCharacter: 'kade',
    equippedOutfit: { kade: 'default_kade', rin: 'default_rin', zeph: 'default_zeph' },
    equippedBoard: 'starter_board',
    powerLevels: { magnet: 0, doubleScore: 0, shield: 0, jetpack: 0, speedBoost: 0 },
    settings: { music: true, sfx: true, shake: true, bloom: true, fps: false, invertSwipe: false },
    missions: { dayKey: null, list: [] },
    achievements: {}, // id -> true
  };
}

function migrate(save) {
  const d = defaultSave();
  const out = { ...d, ...save };
  out.settings = { ...d.settings, ...(save.settings || {}) };
  out.powerLevels = { ...d.powerLevels, ...(save.powerLevels || {}) };
  out.equippedOutfit = { ...d.equippedOutfit, ...(save.equippedOutfit || {}) };
  out.achievements = { ...(save.achievements || {}) };
  out.missions = save.missions && save.missions.list ? save.missions : d.missions;
  return out;
}

export class SaveStore {
  constructor() {
    this.data = this.load();
    this.ensureDailyMissions();
  }

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return defaultSave();
      return migrate(JSON.parse(raw));
    } catch (e) {
      console.warn('Save load failed, using defaults', e);
      return defaultSave();
    }
  }

  persist() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
    } catch (e) {
      console.warn('Save persist failed', e);
    }
  }

  reset() {
    this.data = defaultSave();
    this.ensureDailyMissions(true);
    this.persist();
  }

  ensureDailyMissions(force = false) {
    const key = dayKey();
    if (!force && this.data.missions.dayKey === key && this.data.missions.list.length) return;
    const rnd = seededRandom(dayNumericSeed());
    const pool = [...MISSION_POOL];
    const picked = [];
    for (let i = 0; i < 3 && pool.length; i++) {
      const idx = Math.floor(rnd() * pool.length);
      picked.push(pool.splice(idx, 1)[0]);
    }
    this.data.missions = {
      dayKey: key,
      list: picked.map(m => {
        const [lo, hi] = m.goalRange;
        const goal = Math.round(lo + rnd() * (hi - lo));
        return { id: m.id, type: m.type, label: m.label(goal), goal, progress: 0, reward: m.reward, done: false, claimed: false };
      }),
    };
    this.persist();
  }

  msUntilReset() {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
    return next.getTime() - now.getTime();
  }

  addCoins(n) {
    this.data.coins += n;
    this.data.totalCoinsEver += Math.max(0, n);
    this.persist();
  }

  spendCoins(n) {
    if (this.data.coins < n) return false;
    this.data.coins -= n;
    this.persist();
    return true;
  }

  get achievementsData() { return ACHIEVEMENTS; }
}
