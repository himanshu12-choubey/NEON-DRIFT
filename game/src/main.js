// ============================================================================
// main.js — boots the renderer, owns the game loop and state machine, wires
// input, collisions, scoring, power-ups, missions and achievements.
// ============================================================================
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { SaveStore } from './storage.js';
import { AudioEngine } from './audio.js';
import { UI } from './ui.js';
import { Character } from './player.js';
import { World, SpawnManager } from './world.js';
import { ParticleSystem, ScreenShake } from './effects.js';
import { CHARACTERS, OUTFITS, BOARDS, LANE_X, powerValue } from './data.js';

// ------------------------------------------------------------------ SETUP --
const canvas = document.getElementById('gameCanvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 200);
const CAM_BASE = new THREE.Vector3(0, 4.4, 8.6);
camera.position.copy(CAM_BASE);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.5, 0.78);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h; camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloomPass.setSize(w, h);
}
window.addEventListener('resize', resize);
resize();

const world = new World(scene);
const spawner = new SpawnManager(scene);
const particles = new ParticleSystem(scene, 260);
const shake = new ScreenShake();

const store = new SaveStore();
const audio = new AudioEngine(() => store.data.settings);
bloomPass.enabled = store.data.settings.bloom;
shake.enabled = store.data.settings.shake;

// ------------------------------------------------------------ PLAYER OBJ --
const LANES = LANE_X;
const player = {
  lane: 1, laneX: LANES[1], targetLaneX: LANES[1],
  y: 0, velY: 0, state: 'run',
  jumpsThisRun: 0, slidesThisRun: 0,
  invuln: 0,
};
let character = null;
let hoverboardMesh = null;

function currentCharDef() { return CHARACTERS.find(c => c.id === store.data.equippedCharacter) || CHARACTERS[0]; }
function currentOutfitTint() {
  const cd = currentCharDef();
  const outfitId = store.data.equippedOutfit[cd.id];
  const outfit = OUTFITS.find(o => o.id === outfitId);
  return outfit ? outfit.tint : cd.primary;
}
function currentBoardTint() {
  const b = BOARDS.find(b => b.id === store.data.equippedBoard);
  return b ? b.tint : 0x3ef2ff;
}

function buildPlayer() {
  if (character) scene.remove(character.group);
  if (hoverboardMesh) scene.remove(hoverboardMesh);
  character = new Character(currentCharDef(), currentOutfitTint());
  scene.add(character.group);

  const boardGeo = new THREE.CylinderGeometry(0.32, 0.34, 0.06, 16);
  const boardMat = new THREE.MeshStandardMaterial({ color: 0x111116, emissive: currentBoardTint(), emissiveIntensity: 1.1, roughness: 0.4 });
  hoverboardMesh = new THREE.Mesh(boardGeo, boardMat);
  hoverboardMesh.rotation.x = Math.PI / 2;
  scene.add(hoverboardMesh);
}
buildPlayer();

// -------------------------------------------------------------- GAME STATE
const GameState = { MENU: 'menu', PLAYING: 'playing', PAUSED: 'paused', GAMEOVER: 'gameover' };
let gameState = GameState.MENU;

let distanceTraveled = 0;
let speed = 9;
const BASE_SPEED = 9;
const MAX_SPEED = 26;
let elapsed = 0;
let runCoins = 0;
let runScore = 0;
let combo = 0;
let comboMultiplier = 1;
let comboTimer = 0;
let bestComboThisRun = 0;
let powerupsUsedThisRun = 0;

// power-up runtime state
const powers = {
  magnet: { active: false, timer: 0 },
  doubleScore: { active: false, timer: 0 },
  speedBoost: { active: false, timer: 0 },
  shield: { active: false, timer: 0 },
  jetpack: { active: false, timer: 0 },
};

const POWER_META = {
  magnet: { icon: '🧲', color: '#39ff8c' },
  doubleScore: { icon: '★', color: '#ffe15a' },
  speedBoost: { icon: '⚡', color: '#3ef2ff' },
  shield: { icon: '🛡', color: '#7b9bff' },
  jetpack: { icon: '🚀', color: '#ff6a2e' },
};

function resetRun() {
  distanceTraveled = 0; speed = BASE_SPEED; elapsed = 0;
  runCoins = 0; runScore = 0; combo = 0; comboMultiplier = 1; comboTimer = 0; bestComboThisRun = 0;
  powerupsUsedThisRun = 0;
  player.lane = 1; player.laneX = LANES[1]; player.targetLaneX = LANES[1];
  player.y = 0; player.velY = 0; player.state = 'run'; player.jumpsThisRun = 0; player.slidesThisRun = 0; player.invuln = 0;
  for (const k in powers) { powers[k].active = false; powers[k].timer = 0; }
  spawner.reset();
  character.setState('run');
}

// ------------------------------------------------------------------- UI ---
const ui = new UI(store, audio, {
  onPlay: () => startGame(),
  onResume: () => resumeGame(),
  onQuit: () => quitToMenu(),
  onGoMenu: () => quitToMenu(),
  onCharSelect: () => buildPlayer(),
  onSettingsChanged: () => { bloomPass.enabled = store.data.settings.bloom; shake.enabled = store.data.settings.shake; },
  onResetSave: () => { store.reset(); buildPlayer(); },
  onClaimMission: (id) => {
    const m = store.data.missions.list.find(mm => mm.id === id);
    if (m && m.done && !m.claimed) { m.claimed = true; store.addCoins(m.reward); audio.powerup(); }
  },
});

function startGame() {
  audio.resume();
  resetRun();
  gameState = GameState.PLAYING;
  document.getElementById('mainMenu').classList.add('hidden');
  document.getElementById('gameOverPanel').classList.add('hidden');
  document.getElementById('pausePanel').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  audio.startMusic();
}

function resumeGame() {
  gameState = GameState.PLAYING;
  document.getElementById('pausePanel').classList.add('hidden');
}

function pauseGame() {
  if (gameState !== GameState.PLAYING) return;
  gameState = GameState.PAUSED;
  document.getElementById('pausePanel').classList.remove('hidden');
}

function quitToMenu() {
  gameState = GameState.MENU;
  document.getElementById('hud').classList.add('hidden');
  document.getElementById('pausePanel').classList.add('hidden');
  document.getElementById('gameOverPanel').classList.add('hidden');
  document.getElementById('mainMenu').classList.remove('hidden');
  audio.stopMusic();
  ui.refreshMenu();
}

function endRun() {
  gameState = GameState.GAMEOVER;
  audio.stopMusic();

  const dist = Math.floor(distanceTraveled);
  const finalScore = dist + runScore;
  const isNewBest = dist > store.data.bestDistance;

  store.data.totalRuns += 1;
  store.data.bestDistance = Math.max(store.data.bestDistance, dist);
  store.data.highScore = Math.max(store.data.highScore, finalScore);
  store.data.bestCombo = Math.max(store.data.bestCombo, bestComboThisRun);
  store.addCoins(runCoins);

  // mission progress
  for (const m of store.data.missions.list) {
    if (m.claimed) continue;
    let val = null;
    switch (m.type) {
      case 'coins_single_run': val = Math.max(m.progress, runCoins); break;
      case 'distance_single_run': val = Math.max(m.progress, dist); break;
      case 'powerups_used': val = m.progress + powerupsUsedThisRun; break;
      case 'combo_reached': val = Math.max(m.progress, bestComboThisRun); break;
      case 'jumps_total': val = m.progress + player.jumpsThisRun; break;
      case 'slides_total': val = m.progress + player.slidesThisRun; break;
    }
    if (val !== null) m.progress = val;
    if (m.progress >= m.goal) m.done = true;
  }
  store.persist();

  // achievements
  const ownedCount = store.data.ownedCharacters.length + store.data.ownedOutfits.length + store.data.ownedBoards.length;
  const achValues = {
    runs_total: store.data.totalRuns,
    best_distance: store.data.bestDistance,
    coins_total: store.data.totalCoinsEver,
    best_combo: store.data.bestCombo,
    items_owned: ownedCount,
    jetpack_used: store.data.jetpackUsesTotal,
  };
  let unlockedSomething = false;
  for (const a of store.achievementsData) {
    if (store.data.achievements[a.id]) continue;
    if ((achValues[a.type] || 0) >= a.goal) {
      store.data.achievements[a.id] = true;
      store.addCoins(a.reward);
      unlockedSomething = true;
      ui.showMissionToast(`🏆 Achievement unlocked: ${a.name} (+${a.reward}◆)`);
    }
  }
  store.persist();

  document.getElementById('finalDistance').textContent = dist;
  document.getElementById('finalCoins').textContent = runCoins;
  document.getElementById('finalScore').textContent = finalScore;
  document.getElementById('newBestTag').classList.toggle('hidden', !isNewBest);
  const doneMissions = store.data.missions.list.filter(m => m.done && !m.claimed).length;
  document.getElementById('missionProgressToast').textContent = doneMissions > 0 ? `${doneMissions} mission${doneMissions > 1 ? 's' : ''} ready to claim!` : '';

  document.getElementById('hud').classList.add('hidden');
  document.getElementById('gameOverPanel').classList.remove('hidden');
}

// ------------------------------------------------------------------ INPUT -
function tryChangeLane(dir) {
  if (gameState !== GameState.PLAYING) return;
  if (player.state === 'stumble') return;
  const nl = THREE.MathUtils.clamp(player.lane + dir, 0, 2);
  if (nl !== player.lane) { player.lane = nl; audio.uiClick(); }
}
function tryJump() {
  if (gameState !== GameState.PLAYING) return;
  if (player.state === 'stumble' || player.state === 'fly') return;
  if (player.state === 'jump') return;
  player.state = 'jump';
  player.velY = 8.6;
  player.jumpsThisRun++;
  character.setState('jump');
  audio.jump();
}
function trySlide() {
  if (gameState !== GameState.PLAYING) return;
  if (player.state === 'stumble' || player.state === 'fly') return;
  if (player.state === 'jump') { /* fast-fall into slide not supported, ignore mid-air */ return; }
  player.state = 'slide';
  player.slideTimer = 0.62;
  player.slidesThisRun++;
  character.setState('slide');
  audio.slide();
}

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  switch (e.code) {
    case 'KeyA': case 'ArrowLeft': tryChangeLane(-1); break;
    case 'KeyD': case 'ArrowRight': tryChangeLane(1); break;
    case 'Space': case 'ArrowUp': tryJump(); break;
    case 'KeyS': case 'ArrowDown': trySlide(); break;
    case 'Escape':
      if (gameState === GameState.PLAYING) pauseGame();
      else if (gameState === GameState.PAUSED) resumeGame();
      break;
  }
});

// touch swipe
const touchLayer = document.getElementById('touchLayer');
let touchStart = null;
touchLayer.addEventListener('touchstart', (e) => {
  const t = e.changedTouches[0];
  touchStart = { x: t.clientX, y: t.clientY, time: performance.now() };
}, { passive: true });
touchLayer.addEventListener('touchend', (e) => {
  if (!touchStart) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touchStart.x;
  const dy = t.clientY - touchStart.y;
  const adx = Math.abs(dx), ady = Math.abs(dy);
  const THRESH = 28;
  audio.resume();
  if (Math.max(adx, ady) < THRESH) { touchStart = null; return; }
  const invert = store.data.settings.invertSwipe;
  if (adx > ady) {
    tryChangeLane(dx > 0 ? 1 : -1);
  } else {
    const isUp = invert ? dy > 0 : dy < 0;
    if (isUp) tryJump(); else trySlide();
  }
  touchStart = null;
}, { passive: true });

document.getElementById('pauseBtn').addEventListener('click', () => {
  audio.uiClick();
  if (gameState === GameState.PLAYING) pauseGame();
});

// -------------------------------------------------------------- POWER BAR
function renderPowerBar() {
  const bar = document.getElementById('powerBar');
  bar.innerHTML = '';
  for (const key of Object.keys(powers)) {
    const p = powers[key];
    if (!p.active) continue;
    const meta = POWER_META[key];
    const wrap = document.createElement('div');
    wrap.className = 'power-icon';
    wrap.style.color = meta.color;
    wrap.style.borderColor = meta.color;
    const durTotal = key === 'magnet' ? 8 : powerValue(store, key);
    const pct = Math.max(0, Math.min(100, (p.timer / durTotal) * 100));
    wrap.innerHTML = `<div class="fill" style="height:${pct}%; background:${meta.color}66;"></div><span style="position:relative;">${meta.icon}</span>`;
    bar.appendChild(wrap);
  }
}

// --------------------------------------------------------- COLLECT / HIT -
function collectPowerup(key) {
  powerupsUsedThisRun++;
  audio.powerup();
  particles.burst(new THREE.Vector3(player.laneX, 1.2, 0), POWER_META[key].color, 22, { speed: 4, size: 0.22, life: 0.8 });
  if (key === 'magnet') { powers.magnet.active = true; powers.magnet.timer = 8; }
  else if (key === 'doubleScore') { powers.doubleScore.active = true; powers.doubleScore.timer = powerValue(store, 'doubleScore'); }
  else if (key === 'speedBoost') { powers.speedBoost.active = true; powers.speedBoost.timer = powerValue(store, 'speedBoost'); }
  else if (key === 'shield') { powers.shield.active = true; powers.shield.timer = powerValue(store, 'shield'); }
  else if (key === 'jetpack') {
    powers.jetpack.active = true; powers.jetpack.timer = powerValue(store, 'jetpack');
    store.data.jetpackUsesTotal++; store.persist();
    player.state = 'fly'; character.setState('fly');
  }
}

function addCoin(value) {
  const mult = comboMultiplier * (powers.doubleScore.active ? 2 : 1);
  runCoins += value;
  runScore += value * 10 * mult;
  combo++;
  comboTimer = 1.4;
  comboMultiplier = Math.min(5, 1 + Math.floor(combo / 5));
  bestComboThisRun = Math.max(bestComboThisRun, comboMultiplier);
  audio.coin(combo);
  const badge = document.getElementById('comboBadge');
  if (comboMultiplier > 1) {
    badge.textContent = `x${comboMultiplier} COMBO`;
    badge.classList.add('show');
  }
}

function crash() {
  if (player.invuln > 0) return;
  if (powers.shield.active) {
    powers.shield.active = false; powers.shield.timer = 0;
    player.invuln = 0.8;
    audio.shieldHit();
    shake.add(0.35);
    particles.burst(new THREE.Vector3(player.laneX, 1.2, 0), 0x7b9bff, 24, { speed: 5, size: 0.24, life: 0.6 });
    return;
  }
  player.state = 'stumble';
  character.setState('stumble');
  audio.crash();
  shake.add(0.9);
  particles.burst(new THREE.Vector3(player.laneX, 0.8, 0), 0xff5a3e, 30, { speed: 5.5, size: 0.22, life: 0.9 });
  gameState = 'gameover_pending';
  setTimeout(() => { if (gameState === 'gameover_pending') endRun(); }, 550);
}

// -------------------------------------------------------------- MAIN LOOP
const clock = new THREE.Clock();
let fpsAccum = 0, fpsFrames = 0, fpsTimer = 0;

function animate() {
  requestAnimationFrame(animate);
  const rawDt = Math.min(0.05, clock.getDelta());
  const dt = rawDt;

  if (gameState === GameState.PLAYING) {
    elapsed += dt;
    stepGame(dt);
  } else if (gameState === 'gameover_pending') {
    elapsed += dt;
    character.update(dt, speedFactor());
    speed = Math.max(0, speed - dt * 30);
    distanceTraveled += speed * dt;
    world.update(dt, distanceTraveled, elapsed);
    spawner.update(dt, distanceTraveled, elapsed, difficulty());
  } else {
    // idle ambient motion in menu/pause
    world.update(dt * 0.4, distanceTraveled, elapsed);
  }

  updatePlayerVisual(dt);
  particles.update(dt, camera);
  updateCamera(dt);

  if (store.data.settings.bloom) composer.render();
  else renderer.render(scene, camera);

  // fps
  fpsAccum += dt; fpsFrames++; fpsTimer += dt;
  if (fpsTimer > 0.5) {
    const fps = Math.round(fpsFrames / fpsAccum);
    document.getElementById('fpsCounter').textContent = `${fps} FPS`;
    fpsAccum = 0; fpsFrames = 0; fpsTimer = 0;
  }
}

function speedFactor() { return (speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED); }
function difficulty() { return Math.min(1, distanceTraveled / 2200); }

function stepGame(dt) {
  // speed ramps with distance, boosted temporarily by speedBoost
  const targetBase = THREE.MathUtils.lerp(BASE_SPEED, MAX_SPEED, difficulty());
  const boostAdd = powers.speedBoost.active ? 9 : 0;
  speed += ((targetBase + boostAdd) - speed) * Math.min(1, dt * 1.5);
  audio.setMusicIntensity(speedFactor());

  distanceTraveled += speed * dt;

  // power-up timers
  for (const key of Object.keys(powers)) {
    const p = powers[key];
    if (!p.active) continue;
    p.timer -= dt;
    if (p.timer <= 0) {
      p.active = false;
      if (key === 'jetpack' && player.state === 'fly') { player.state = 'run'; character.setState('run'); }
    }
  }
  if (player.invuln > 0) player.invuln -= dt;
  if (comboTimer > 0) { comboTimer -= dt; if (comboTimer <= 0) { combo = 0; comboMultiplier = 1; document.getElementById('comboBadge').classList.remove('show'); } }

  // jump physics
  if (player.state === 'jump') {
    player.velY -= 22 * dt;
    player.y += player.velY * dt;
    if (player.y <= 0) { player.y = 0; player.velY = 0; player.state = 'run'; character.setState('run'); }
  } else if (player.state === 'slide') {
    player.slideTimer -= dt;
    if (player.slideTimer <= 0) { player.state = 'run'; character.setState('run'); }
  } else if (player.state === 'fly') {
    player.y = 2.3 + Math.sin(elapsed * 5) * 0.15;
  }

  player.targetLaneX = LANES[player.lane];
  const prevX = player.laneX;
  player.laneX += (player.targetLaneX - player.laneX) * Math.min(1, dt * 10);
  character._laneVel = (player.laneX - prevX) / Math.max(dt, 0.0001);

  world.update(dt, distanceTraveled, elapsed);
  const { obstacles, coins, powerups } = spawner.update(dt, distanceTraveled, elapsed, difficulty());

  // collisions: obstacles
  if (player.state !== 'fly') {
    for (const rec of obstacles) {
      if (rec.resolved) continue;
      if (rec.lane !== player.lane) continue;
      const tol = Math.max(0.4, rec.radius * 0.55);
      if (Math.abs(rec.renderZ) < tol) {
        const safe = (rec.requiredAction === 'jump' && player.state === 'jump') ||
                     (rec.requiredAction === 'slide' && player.state === 'slide');
        if (!safe) { rec.resolved = true; crash(); if (gameState !== GameState.PLAYING) break; }
        else rec.resolved = true;
      }
    }
  }

  // coins (+ magnet)
  if (gameState === GameState.PLAYING) {
    for (const rec of coins) {
      if (rec.collected) continue;
      const dx = LANES[rec.lane] - player.laneX;
      const dz = rec.renderZ;
      const dist = Math.hypot(dx, dz);
      const magnetRadius = powers.magnet.active ? powerValue(store, 'magnet') : 0;
      if (player.state === 'fly' && dist < 3.2) {
        rec.collected = true; rec.active = false; rec.mesh.visible = false;
        particles.burst(rec.mesh.position.clone(), rec.isCrystal ? 0x3ef2ff : 0xffd23e, 8, { speed: 2.5, size: 0.14, life: 0.4 });
        addCoin(rec.value);
        continue;
      }
      if (magnetRadius > 0 && dist < magnetRadius) {
        const target = new THREE.Vector3(player.laneX, 1.1, 0);
        rec.mesh.position.lerp(target, Math.min(1, dt * 6));
        if (rec.mesh.position.distanceTo(target) < 0.4) {
          rec.collected = true; rec.active = false; rec.mesh.visible = false;
          addCoin(rec.value);
        }
        continue;
      }
      if (rec.lane === player.lane && Math.abs(dz) < 0.65) {
        rec.collected = true; rec.active = false; rec.mesh.visible = false;
        particles.burst(rec.mesh.position.clone(), rec.isCrystal ? 0x3ef2ff : 0xffd23e, 8, { speed: 2.5, size: 0.14, life: 0.4 });
        addCoin(rec.value);
      }
    }

    // powerups
    for (const rec of powerups) {
      if (rec.collected) continue;
      const dz = rec.renderZ;
      if (rec.lane === player.lane && Math.abs(dz) < 0.75) {
        rec.collected = true; rec.active = false; rec.mesh.visible = false;
        collectPowerup(rec.key);
      }
    }
  }

  // HUD
  document.querySelector('#hudCoin .value').textContent = runCoins;
  document.querySelector('#hudScore .value').textContent = Math.floor(distanceTraveled) + runScore;
  renderPowerBar();
}

function updatePlayerVisual(dt) {
  if (!character) return;
  character.update(dt, speedFactor());
  character.group.position.set(player.laneX, player.y, 0);
  if (hoverboardMesh) hoverboardMesh.position.set(player.laneX, Math.max(0.06, player.y + 0.05), 0.05);

  // shield visual pulse
  if (powers.shield && powers.shield.active) {
    const s = 1 + Math.sin(elapsed * 8) * 0.03;
    character.group.scale.setScalar(s);
  } else {
    character.group.scale.setScalar(1);
  }
}

function updateCamera(dt) {
  const boosting = powers.speedBoost.active;
  camera.fov = THREE.MathUtils.lerp(camera.fov, boosting ? 70 : 62, dt * 4);
  camera.updateProjectionMatrix();

  const base = new THREE.Vector3(
    CAM_BASE.x + player.laneX * 0.3,
    CAM_BASE.y + player.y * 0.35,
    CAM_BASE.z
  );
  shake.update(dt, camera, base);
  if (shake.trauma <= 0) camera.position.lerp(base, Math.min(1, dt * 6));
  const lookTarget = new THREE.Vector3(player.laneX * 0.5, 1.3 + player.y * 0.3, -8);
  camera.lookAt(lookTarget);
}

// ------------------------------------------------------------------ BOOT --
function boot() {
  const bar = document.getElementById('loadingBarFill');
  const label = document.getElementById('loadingLabel');
  const steps = ['booting city grid…', 'polishing neon signage…', 'synthesizing soundtrack…', 'warming up hover-boards…', 'ready'];
  let i = 0;
  const iv = setInterval(() => {
    i++;
    bar.style.width = `${Math.min(100, i * 22)}%`;
    label.textContent = steps[Math.min(i, steps.length - 1)];
    if (i >= steps.length) {
      clearInterval(iv);
      setTimeout(() => {
        document.getElementById('loadingScreen').classList.add('hidden');
        ui.refreshMenu();
      }, 200);
    }
  }, 160);
  animate();
}
boot();
