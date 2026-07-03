// ============================================================================
// world.js — procedurally generated neon city track, day/night cycle,
// background traffic, and the obstacle / coin / power-up spawn manager.
// Everything here is primitive-based (boxes, cylinders, cones) so no
// external or copyrighted art assets are used.
// ============================================================================
import * as THREE from 'three';
import { LANE_X, OBSTACLE_TYPES } from './data.js';

const SEG_LENGTH = 40;
const SEG_COUNT = 7;
const SPAWN_AHEAD = 130;
const ROAD_WIDTH = 8.2;

function emissiveMat(color, intensity = 0.6, base = 0x111116) {
  return new THREE.MeshStandardMaterial({ color: base, emissive: color, emissiveIntensity: intensity, roughness: 0.6, metalness: 0.2 });
}
function solidMat(color, rough = 0.6, metal = 0.3) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}

// ---------------------------------------------------------------- WORLD ----
export class World {
  constructor(scene) {
    this.scene = scene;
    this.segments = [];
    this.flyers = [];
    this.dayNightT = 0.15; // 0..1 cycle position, start at dawn-ish
    this._buildLights();
    this._buildSky();
    this._buildSegments();
    this._buildFlyers();
  }

  _buildLights() {
    this.hemi = new THREE.HemisphereLight(0x8fb0ff, 0x0a0612, 0.55);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.1);
    this.sun.position.set(-10, 22, 8);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -20; this.sun.shadow.camera.right = 20;
    this.sun.shadow.camera.top = 20; this.sun.shadow.camera.bottom = -20;
    this.sun.shadow.camera.far = 60;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.rim1 = new THREE.PointLight(0x3ef2ff, 1.2, 18);
    this.rim1.position.set(-3, 3, 3);
    this.rim2 = new THREE.PointLight(0xff2ea6, 1.0, 18);
    this.rim2.position.set(3, 3, -1);
    this.scene.add(this.rim1, this.rim2);
  }

  _buildSky() {
    this.scene.background = new THREE.Color(0x090714);
    this.scene.fog = new THREE.FogExp2(0x0a0716, 0.028);
  }

  _makeBuilding(side) {
    const g = new THREE.Group();
    const w = 3.2 + Math.random() * 2.6;
    const d = 3.2 + Math.random() * 2.6;
    const h = 6 + Math.random() * 22;
    const hue = Math.random();
    const bodyColor = new THREE.Color().setHSL(0.62 + hue * 0.05, 0.25, 0.08 + Math.random() * 0.06);
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), solidMat(bodyColor, 0.8, 0.15));
    body.position.y = h / 2;
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);

    // window grid using emissive strips (cheap: a handful of thin boxes)
    const neonPalette = [0x3ef2ff, 0xff2ea6, 0xffb545, 0x7b5bff, 0x39ff8c];
    const stripCount = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < stripCount; i++) {
      const color = neonPalette[Math.floor(Math.random() * neonPalette.length)];
      const stripH = 0.15 + Math.random() * 0.2;
      const y = 1 + Math.random() * (h - 2);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, stripH, 0.05), emissiveMat(color, 1.4));
      strip.position.set(0, y, d / 2 + 0.03);
      g.add(strip);
      if (Math.random() > 0.4) {
        const strip2 = strip.clone();
        strip2.position.z = -d / 2 - 0.03;
        g.add(strip2);
      }
    }
    // rooftop sign
    if (Math.random() > 0.6) {
      const color = neonPalette[Math.floor(Math.random() * neonPalette.length)];
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.4 + Math.random(), 0.15), emissiveMat(color, 1.8));
      sign.position.set((Math.random() - 0.5) * w * 0.5, h + 0.8, 0);
      g.add(sign);
    }
    g.position.x = side * (ROAD_WIDTH / 2 + 2 + Math.random() * 3);
    g.position.z = (Math.random() - 0.5) * 6;
    return g;
  }

  _buildSegments() {
    for (let i = 0; i < SEG_COUNT; i++) {
      const seg = this._makeSegment();
      seg.worldZ = i * SEG_LENGTH;
      this.scene.add(seg.group);
      this.segments.push(seg);
    }
  }

  _makeSegment() {
    const group = new THREE.Group();

    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_WIDTH, SEG_LENGTH),
      solidMat(0x111018, 0.9, 0.1)
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, 0);
    road.receiveShadow = true;
    group.add(road);

    // lane divider glow lines
    for (const lx of [-ROAD_WIDTH / 6, ROAD_WIDTH / 6]) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.08, SEG_LENGTH), emissiveMat(0x3ef2ff, 1.2));
      line.rotation.x = -Math.PI / 2;
      line.position.set(lx, 0.01, 0);
      group.add(line);
    }
    // edge glow strips
    for (const lx of [-ROAD_WIDTH / 2, ROAD_WIDTH / 2]) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.12, SEG_LENGTH), emissiveMat(0xff2ea6, 1.0));
      line.rotation.x = -Math.PI / 2;
      line.position.set(lx, 0.015, 0);
      group.add(line);
    }

    // sidewalks
    for (const side of [-1, 1]) {
      const walk = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.3, SEG_LENGTH), solidMat(0x1a1826, 0.9, 0.05));
      walk.position.set(side * (ROAD_WIDTH / 2 + 1.2), 0.14, 0);
      walk.receiveShadow = true;
      group.add(walk);
    }

    const buildings = [];
    for (const side of [-1, 1]) {
      const n = 3;
      for (let i = 0; i < n; i++) {
        const b = this._makeBuilding(side);
        b.position.z = -SEG_LENGTH / 2 + (i + 0.5) * (SEG_LENGTH / n);
        group.add(b);
        buildings.push(b);
      }
    }

    // occasional street lamp / holo-sign prop above the road
    if (Math.random() > 0.5) {
      const arch = new THREE.Group();
      const postH = 4.4;
      const postL = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, postH, 6), solidMat(0x22202e));
      postL.position.set(-ROAD_WIDTH / 2 - 0.3, postH / 2, 0);
      const postR = postL.clone(); postR.position.x = ROAD_WIDTH / 2 + 0.3;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(ROAD_WIDTH + 0.6, 0.12, 0.12), emissiveMat(0x7b5bff, 1.4));
      bar.position.set(0, postH, 0);
      arch.add(postL, postR, bar);
      arch.position.z = (Math.random() - 0.5) * SEG_LENGTH * 0.6;
      group.add(arch);
    }

    return { group, buildings };
  }

  _regenSegment(seg) {
    // Rebuild buildings/props cheaply by disposing & recreating the group content.
    const old = seg.group;
    const fresh = this._makeSegment();
    fresh.group.position.copy(old.position);
    this.scene.remove(old);
    disposeGroup(old);
    seg.group = fresh.group;
    seg.buildings = fresh.buildings;
    this.scene.add(seg.group);
  }

  _buildFlyers() {
    // Ambient background flying vehicles for atmosphere (visual only).
    for (let i = 0; i < 5; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 0.4), emissiveMat(0xffffff, 0.2, 0x1a1a22));
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), emissiveMat(Math.random() > 0.5 ? 0x3ef2ff : 0xff2ea6, 2));
      light.position.x = 0.5;
      g.add(body, light);
      g.position.set((Math.random() - 0.5) * 30, 8 + Math.random() * 10, -Math.random() * 100);
      g.userData.speed = 4 + Math.random() * 4;
      g.userData.baseX = g.position.x;
      this.scene.add(g);
      this.flyers.push(g);
    }
  }

  update(dt, distanceTraveled, elapsed) {
    // recycle ground segments
    for (const seg of this.segments) {
      const centerZ = -(seg.worldZ - distanceTraveled);
      const nearEdge = centerZ + SEG_LENGTH / 2; // edge closest to camera / most likely to pass behind first
      if (nearEdge > 14) {
        seg.worldZ += SEG_LENGTH * SEG_COUNT;
        this._regenSegment(seg);
      }
      seg.group.position.z = -(seg.worldZ - distanceTraveled);
    }

    // flyers drift and wrap
    for (const f of this.flyers) {
      f.position.z += f.userData.speed * dt;
      f.position.x = f.userData.baseX + Math.sin(elapsed * 0.3 + f.userData.baseX) * 2;
      if (f.position.z > 20) f.position.z = -110 - Math.random() * 40;
    }

    // day/night cycle: slow drift, full loop roughly every ~6 minutes of distance-time
    this.dayNightT = (this.dayNightT + dt * 0.0035) % 1;
    this._applyDayNight(this.dayNightT);
  }

  _applyDayNight(t) {
    // t: 0 dawn -> 0.25 day -> 0.5 dusk -> 0.75 night -> 1 dawn
    const dayCol = new THREE.Color(0x0d0f22);
    const duskCol = new THREE.Color(0x2a1030);
    const nightCol = new THREE.Color(0x030309);
    const dawnCol = new THREE.Color(0x1a1230);
    let sky, fogD, sunI, sunColor, hemiI;
    const seg = (t * 4) % 4;
    if (seg < 1) { // dawn->day
      sky = dawnCol.clone().lerp(dayCol, seg); sunI = THREE.MathUtils.lerp(0.5, 1.2, seg); sunColor = 0xfff2df; hemiI = 0.55;
    } else if (seg < 2) { // day->dusk
      const k = seg - 1; sky = dayCol.clone().lerp(duskCol, k); sunI = THREE.MathUtils.lerp(1.2, 0.6, k); sunColor = 0xffb37a; hemiI = 0.5;
    } else if (seg < 3) { // dusk->night
      const k = seg - 2; sky = duskCol.clone().lerp(nightCol, k); sunI = THREE.MathUtils.lerp(0.6, 0.15, k); sunColor = 0x5d6bff; hemiI = 0.32;
    } else { // night->dawn
      const k = seg - 3; sky = nightCol.clone().lerp(dawnCol, k); sunI = THREE.MathUtils.lerp(0.15, 0.5, k); sunColor = 0x8391ff; hemiI = 0.4;
    }
    this.scene.background = sky;
    this.scene.fog.color = sky;
    this.sun.intensity = sunI;
    this.sun.color.set(sunColor);
    this.hemi.intensity = hemiI;
  }
}

function disposeGroup(group) {
  group.traverse(obj => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
      else obj.material.dispose();
    }
  });
}

// ------------------------------------------------------------- SPAWNING ----
const OBSTACLE_GEO_CACHE = {};

function buildObstacleMesh(type) {
  const g = new THREE.Group();
  switch (type) {
    case OBSTACLE_TYPES.BARRIER_LOW: {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.7, 0.35), emissiveMat(0xffb545, 0.9, 0x2a1c08));
      bar.position.y = 0.35;
      bar.castShadow = true;
      g.add(bar);
      for (const x of [-0.7, 0.7]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.7, 6), solidMat(0x2b2b33));
        post.position.set(x, 0.35, 0);
        g.add(post);
      }
      g.userData = { requiredAction: 'jump', radius: 0.55 };
      break;
    }
    case OBSTACLE_TYPES.CONE: {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.6, 8), emissiveMat(0xff6a2e, 0.8, 0x2a1408));
      cone.position.y = 0.3; cone.castShadow = true;
      g.add(cone);
      g.userData = { requiredAction: 'jump', radius: 0.45 };
      break;
    }
    case OBSTACLE_TYPES.LASER_GATE: {
      for (const x of [-0.9, 0.9]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.9, 6), solidMat(0x1c1c24));
        post.position.set(x, 0.95, 0);
        g.add(post);
      }
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.9, 8), emissiveMat(0xff2e4a, 2.2, 0x2a0206));
      beam.rotation.z = Math.PI / 2;
      beam.position.y = 1.32;
      g.add(beam);
      g.userData = { requiredAction: 'slide', radius: 0.4 };
      break;
    }
    case OBSTACLE_TYPES.TRAIN: {
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 2.6, 6), solidMat(0x232634, 0.7, 0.4));
      body.position.y = 1.3; body.castShadow = true;
      g.add(body);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.15, 6.05), emissiveMat(0x3ef2ff, 1.4));
      stripe.position.y = 1.9;
      g.add(stripe);
      const front = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.4, 0.2), emissiveMat(0xffe15a, 1.6));
      front.position.set(0, 0.8, -2.9);
      g.add(front);
      g.userData = { requiredAction: 'switch', radius: 3.2 };
      break;
    }
    case OBSTACLE_TYPES.VEHICLE: {
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.9, 3.2), solidMat(0x3a1830, 0.5, 0.5));
      body.position.y = 0.5; body.castShadow = true;
      g.add(body);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.55, 1.4), solidMat(0x241224, 0.5, 0.5));
      cab.position.set(0, 1.05, -0.2);
      g.add(cab);
      const lightL = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), emissiveMat(0xff2e2e, 2));
      lightL.position.set(-0.55, 0.5, -1.62);
      const lightR = lightL.clone(); lightR.position.x = 0.55;
      g.add(lightL, lightR);
      g.userData = { requiredAction: 'switch', radius: 1.9 };
      break;
    }
    case OBSTACLE_TYPES.GAP: {
      const hole = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3), emissiveMat(0x000000, 0, 0x000000));
      hole.material = new THREE.MeshBasicMaterial({ color: 0x000000 });
      hole.rotation.x = -Math.PI / 2;
      hole.position.y = 0.02;
      g.add(hole);
      for (const dz of [-1.5, 1.5]) {
        const edge = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 0.15), emissiveMat(0xff6a2e, 1.6));
        edge.position.set(0, 0.05, dz);
        g.add(edge);
      }
      g.userData = { requiredAction: 'jump', radius: 1.6 };
      break;
    }
  }
  g.userData.type = type;
  return g;
}

const POWERUP_DEFS = {
  magnet: { color: 0x39ff8c, build: () => {
    const g = new THREE.Group();
    const torus = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.09, 8, 16, Math.PI * 1.4), emissiveMat(0x39ff8c, 1.8));
    g.add(torus);
    return g;
  }},
  doubleScore: { color: 0xffe15a, build: () => {
    const g = new THREE.Group();
    const star = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), emissiveMat(0xffe15a, 1.8));
    g.add(star);
    return g;
  }},
  speedBoost: { color: 0x3ef2ff, build: () => {
    const g = new THREE.Group();
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.6, 4), emissiveMat(0x3ef2ff, 1.8));
    arrow.rotation.x = Math.PI / 2;
    g.add(arrow);
    return g;
  }},
  shield: { color: 0x7b9bff, build: () => {
    const g = new THREE.Group();
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshStandardMaterial({ color: 0x7b9bff, emissive: 0x7b9bff, emissiveIntensity: 1.2, transparent: true, opacity: 0.55 }));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.03, 6, 16), emissiveMat(0xdfe8ff, 1.6));
    ring.rotation.x = Math.PI / 2.3;
    g.add(sphere, ring);
    return g;
  }},
  jetpack: { color: 0xff6a2e, build: () => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.5, 8), emissiveMat(0xff6a2e, 1.4, 0x1a0d05));
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 8), emissiveMat(0xffd23e, 2.2));
    flame.position.y = -0.38; flame.rotation.x = Math.PI;
    g.add(body, flame);
    return g;
  }},
};

export class SpawnManager {
  constructor(scene) {
    this.scene = scene;
    this.obstaclePool = [];
    this.coinPool = [];
    this.powerupPool = [];
    this.nextObstacleZ = 26;
    this.nextCoinZ = 14;
    this.nextPowerupZ = 34;
    this.rng = Math.random;
  }

  reset() {
    [...this.obstaclePool, ...this.coinPool, ...this.powerupPool].forEach(r => { r.active = false; r.mesh.visible = false; });
    this.nextObstacleZ = 26;
    this.nextCoinZ = 14;
    this.nextPowerupZ = 34;
  }

  _acquire(pool, factory) {
    let rec = pool.find(r => !r.active);
    if (!rec) {
      const mesh = factory();
      mesh.castShadow = true;
      this.scene.add(mesh);
      rec = { mesh, active: false };
      pool.push(rec);
    }
    rec.active = true;
    rec.mesh.visible = true;
    return rec;
  }

  _spawnObstacleAt(worldZ, difficulty) {
    const lane = Math.floor(Math.random() * 3);
    const weights = [
      [OBSTACLE_TYPES.BARRIER_LOW, 3],
      [OBSTACLE_TYPES.CONE, 3],
      [OBSTACLE_TYPES.LASER_GATE, 2 + difficulty * 2],
      [OBSTACLE_TYPES.TRAIN, 1 + difficulty * 3],
      [OBSTACLE_TYPES.VEHICLE, 1 + difficulty * 2],
      [OBSTACLE_TYPES.GAP, 1 + difficulty * 1.5],
    ];
    const total = weights.reduce((s, w) => s + w[1], 0);
    let r = Math.random() * total;
    let type = OBSTACLE_TYPES.BARRIER_LOW;
    for (const [t, w] of weights) { if (r < w) { type = t; break; } r -= w; }

    const placeSingle = (ln, z, ty) => {
      const rec = this._acquire(this.obstaclePool, () => buildObstacleMesh(ty));
      if (rec.mesh.userData.type !== ty) {
        // regenerate mesh for correct type if pooled slot mismatched type
        this.scene.remove(rec.mesh);
        disposeGroup(rec.mesh);
        rec.mesh = buildObstacleMesh(ty);
        this.scene.add(rec.mesh);
      }
      rec.lane = ln;
      rec.worldZ = z;
      rec.type = ty;
      rec.requiredAction = rec.mesh.userData.requiredAction;
      rec.radius = rec.mesh.userData.radius;
    };

    if (type === OBSTACLE_TYPES.GAP && Math.random() < 0.4 + difficulty * 0.3) {
      // full-width gap: forces a jump regardless of lane
      for (let l = 0; l < 3; l++) placeSingle(l, worldZ, OBSTACLE_TYPES.GAP);
    } else if (Math.random() < 0.28 + difficulty * 0.25) {
      // two-lane block pattern, one lane stays free
      const free = Math.floor(Math.random() * 3);
      for (let l = 0; l < 3; l++) {
        if (l === free) continue;
        const t2 = (type === OBSTACLE_TYPES.TRAIN || type === OBSTACLE_TYPES.VEHICLE) ? type : (Math.random() > 0.5 ? OBSTACLE_TYPES.BARRIER_LOW : OBSTACLE_TYPES.CONE);
        placeSingle(l, worldZ, t2);
      }
    } else {
      placeSingle(lane, worldZ, type);
    }
  }

  _spawnCoinRow(worldZ) {
    const lane = Math.floor(Math.random() * 3);
    const pattern = Math.random();
    const isCrystal = Math.random() < 0.18;
    if (isCrystal) {
      const rec = this._acquire(this.coinPool, buildCrystal);
      rec.lane = lane; rec.worldZ = worldZ; rec.value = 5; rec.isCrystal = true;
      return;
    }
    const count = pattern < 0.5 ? 6 : 4;
    for (let i = 0; i < count; i++) {
      const rec = this._acquire(this.coinPool, buildCoin);
      rec.lane = lane; rec.worldZ = worldZ - i * 1.1; rec.value = 1; rec.isCrystal = false;
    }
  }

  _spawnPowerup(worldZ) {
    const keys = Object.keys(POWERUP_DEFS);
    const key = keys[Math.floor(Math.random() * keys.length)];
    const lane = Math.floor(Math.random() * 3);
    const rec = this._acquire(this.powerupPool, POWERUP_DEFS[key].build);
    if (rec.key !== key) {
      this.scene.remove(rec.mesh);
      disposeGroup(rec.mesh);
      rec.mesh = POWERUP_DEFS[key].build();
      this.scene.add(rec.mesh);
    }
    rec.key = key;
    rec.lane = lane;
    rec.worldZ = worldZ;
  }

  update(dt, distanceTraveled, elapsed, difficulty) {
    while (this.nextObstacleZ < distanceTraveled + SPAWN_AHEAD) {
      this._spawnObstacleAt(this.nextObstacleZ, difficulty);
      this.nextObstacleZ += THREE.MathUtils.lerp(15, 9, difficulty) + Math.random() * 4;
    }
    while (this.nextCoinZ < distanceTraveled + SPAWN_AHEAD) {
      this._spawnCoinRow(this.nextCoinZ);
      this.nextCoinZ += 9 + Math.random() * 6;
    }
    while (this.nextPowerupZ < distanceTraveled + SPAWN_AHEAD) {
      this._spawnPowerup(this.nextPowerupZ);
      this.nextPowerupZ += 26 + Math.random() * 14;
    }

    const activeObstacles = [];
    for (const rec of this.obstaclePool) {
      if (!rec.active) continue;
      const rz = -(rec.worldZ - distanceTraveled);
      rec.mesh.position.set(0, 0, rz);
      if (rz > 8) { rec.active = false; rec.mesh.visible = false; continue; }
      rec.renderZ = rz;
      activeObstacles.push(rec);
    }

    const activeCoins = [];
    for (const rec of this.coinPool) {
      if (!rec.active) continue;
      const rz = -(rec.worldZ - distanceTraveled);
      const lx = LANE_X[rec.lane];
      rec.mesh.position.set(lx, rec.isCrystal ? 1.1 : 0.9, rz);
      rec.mesh.rotation.y += dt * 2.4;
      rec.mesh.position.y += Math.sin(elapsed * 4 + rec.worldZ) * 0.08;
      if (rz > 6) { rec.active = false; rec.mesh.visible = false; continue; }
      rec.renderZ = rz;
      activeCoins.push(rec);
    }

    const activePowerups = [];
    for (const rec of this.powerupPool) {
      if (!rec.active) continue;
      const rz = -(rec.worldZ - distanceTraveled);
      const lx = LANE_X[rec.lane];
      rec.mesh.position.set(lx, 1.15 + Math.sin(elapsed * 3 + rec.worldZ) * 0.12, rz);
      rec.mesh.rotation.y += dt * 1.8;
      if (rz > 6) { rec.active = false; rec.mesh.visible = false; continue; }
      rec.renderZ = rz;
      activePowerups.push(rec);
    }

    return { obstacles: activeObstacles, coins: activeCoins, powerups: activePowerups };
  }
}

function buildCoin() {
  const g = new THREE.Group();
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 14), emissiveMat(0xffd23e, 1.6));
  coin.rotation.x = Math.PI / 2;
  g.add(coin);
  return g;
}
function buildCrystal() {
  const g = new THREE.Group();
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), emissiveMat(0x3ef2ff, 2));
  g.add(gem);
  return g;
}

export { disposeGroup, LANE_X };
