// ============================================================================
// data.js — all original character / cosmetic / economy definitions.
// Every name, palette and stat here is invented for this project.
// ============================================================================

export const CHARACTERS = [
  {
    id: 'kade', name: 'Kade "Volt"', price: 0,
    primary: 0x3ef2ff, secondary: 0x0c2a3a, accent: 0xffffff,
    desc: 'Ex-courier. Balanced speed and a signature cyan afterglow.',
  },
  {
    id: 'rin', name: 'Rin Sable', price: 250,
    primary: 0xff2ea6, secondary: 0x2a0c22, accent: 0xffe1f2,
    desc: 'Rooftop free-runner. Slightly faster slide recovery.',
  },
  {
    id: 'zeph', name: 'Zeph-9', price: 400,
    primary: 0xffb545, secondary: 0x3a2a0c, accent: 0x1a1a1a,
    desc: 'Augmented drone technician. Longer jetpack duration.',
  },
];

export const OUTFITS = [
  { id: 'default_kade', charId: 'kade', name: 'Courier Jacket', price: 0, tint: 0x3ef2ff },
  { id: 'default_rin', charId: 'rin', name: 'Street Wraps', price: 0, tint: 0xff2ea6 },
  { id: 'default_zeph', charId: 'zeph', name: 'Drone Rig', price: 0, tint: 0xffb545 },
  { id: 'kade_violet', charId: 'kade', name: 'Violet Circuit', price: 150, tint: 0x7b5bff },
  { id: 'kade_emerald', charId: 'kade', name: 'Emerald Static', price: 150, tint: 0x39ff8c },
  { id: 'rin_gold', charId: 'rin', name: 'Gold Rush', price: 180, tint: 0xffd23e },
  { id: 'rin_ice', charId: 'rin', name: 'Ice Wraith', price: 180, tint: 0x9df7ff },
  { id: 'zeph_crimson', charId: 'zeph', name: 'Crimson Core', price: 200, tint: 0xff3e3e },
  { id: 'zeph_void', charId: 'zeph', name: 'Void Plating', price: 220, tint: 0x6a4bff },
];

export const BOARDS = [
  { id: 'starter_board', name: 'Street Deck', price: 0, tint: 0x3ef2ff },
  { id: 'ember_board', name: 'Ember Glide', price: 200, tint: 0xff6a2e },
  { id: 'toxic_board', name: 'Toxic Trail', price: 220, tint: 0x39ff8c },
  { id: 'royal_board', name: 'Royal Circuit', price: 260, tint: 0x7b5bff },
  { id: 'chrome_board', name: 'Chrome Phantom', price: 320, tint: 0xf2f2f2 },
];

// power-up upgrade tiers extend duration / effect of each power-up
export const POWER_UPGRADES = [
  { key: 'magnet', name: 'Coin Magnet Range', base: 5, perLevel: 1.4, priceBase: 80, priceStep: 60, maxLevel: 4, unit: 'm radius' },
  { key: 'doubleScore', name: 'Double Score Duration', base: 8, perLevel: 2, priceBase: 80, priceStep: 60, maxLevel: 4, unit: 's' },
  { key: 'shield', name: 'Shield Duration', base: 10, perLevel: 3, priceBase: 90, priceStep: 65, maxLevel: 4, unit: 's' },
  { key: 'jetpack', name: 'Jetpack Duration', base: 7, perLevel: 1.8, priceBase: 100, priceStep: 70, maxLevel: 4, unit: 's' },
  { key: 'speedBoost', name: 'Speed Boost Duration', base: 6, perLevel: 1.5, priceBase: 80, priceStep: 60, maxLevel: 4, unit: 's' },
];

export function powerValue(save, key) {
  const def = POWER_UPGRADES.find(p => p.key === key);
  const lvl = save.data.powerLevels[key] || 0;
  return def.base + def.perLevel * lvl;
}

export function powerUpgradeCost(save, key) {
  const def = POWER_UPGRADES.find(p => p.key === key);
  const lvl = save.data.powerLevels[key] || 0;
  if (lvl >= def.maxLevel) return null;
  return def.priceBase + def.priceStep * lvl;
}

export const LANE_X = [-2.4, 0, 2.4];

export const OBSTACLE_TYPES = {
  BARRIER_LOW: 'barrier_low',     // jump over
  LASER_GATE: 'laser_gate',       // slide under
  TRAIN: 'train',                 // full lane block, must switch lane
  CONE: 'cone',                   // small, jump or switch
  VEHICLE: 'vehicle',             // lane block, appears with warning
  GAP: 'gap',                     // broken road, must jump
};
