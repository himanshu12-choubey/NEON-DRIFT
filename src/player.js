// ============================================================================
// player.js — builds an original low-poly runner character out of primitive
// Three.js geometry (no external models) and animates it procedurally.
// ============================================================================
import * as THREE from 'three';

function mat(color, emissiveIntensity = 0, emissive = color) {
  return new THREE.MeshStandardMaterial({
    color, emissive, emissiveIntensity, roughness: 0.45, metalness: 0.35,
  });
}

export class Character {
  constructor(charDef, tint) {
    this.def = charDef;
    this.tint = tint !== undefined ? tint : charDef.primary;
    this.group = new THREE.Group();
    this.limbs = {};
    this._build();

    // state
    this.state = 'run'; // run | jump | slide | stumble | fly
    this.stateTime = 0;
    this.lane = 1;
    this.laneX = 0;
    this.y = 0;
    this.velY = 0;
    this.tilt = 0;
    this._laneVel = 0;
    this._smoothRotY = 0;
  }

  _build() {
    const primary = mat(this.tint, 0.35, this.tint);
    const secondary = mat(this.def.secondary, 0.15, this.def.secondary);
    const accent = mat(this.def.accent, 0.6, this.def.accent);
    const skin = mat(0xffd7ad, 0.02, 0x000000);

    const root = this.group;

    const hips = new THREE.Group();
    hips.position.y = 0.95;
    root.add(hips);
    this.hips = hips;

    // torso
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.5, 4, 8), primary);
    torso.position.y = 0.42;
    torso.castShadow = true;
    hips.add(torso);
    this.torso = torso;

    // chest stripe (accent)
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.04), accent);
    stripe.position.set(0, 0.42, 0.24);
    hips.add(stripe);

    // head
    const headGroup = new THREE.Group();
    headGroup.position.y = 0.86;
    hips.add(headGroup);
    this.head = headGroup;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), skin);
    head.castShadow = true;
    headGroup.add(head);
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), accent);
    visor.position.set(0, 0.03, 0.05);
    visor.rotation.x = -0.15;
    headGroup.add(visor);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.225, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), secondary);
    hair.position.y = 0.04;
    headGroup.add(hair);

    // arms
    const armGeo = new THREE.CapsuleGeometry(0.075, 0.42, 4, 6);
    this.limbs.armL = this._makeLimb(armGeo, secondary, -0.32, 0.55, 0);
    this.limbs.armR = this._makeLimb(armGeo, secondary, 0.32, 0.55, 0);
    hips.add(this.limbs.armL.pivot, this.limbs.armR.pivot);

    // forearm accents (gloves)
    [this.limbs.armL, this.limbs.armR].forEach(l => {
      const glove = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), accent);
      glove.position.y = -0.42;
      l.mesh.add(glove);
    });

    // legs
    const legGeo = new THREE.CapsuleGeometry(0.095, 0.46, 4, 6);
    this.limbs.legL = this._makeLimb(legGeo, secondary, -0.14, 0.02, 0);
    this.limbs.legR = this._makeLimb(legGeo, secondary, 0.14, 0.02, 0);
    hips.add(this.limbs.legL.pivot, this.limbs.legR.pivot);

    // shoes (accent glow)
    [this.limbs.legL, this.limbs.legR].forEach(l => {
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.09, 0.24), accent);
      shoe.position.set(0, -0.46, 0.05);
      l.mesh.add(shoe);
    });

    // small back-mounted stabiliser fins (cosmetic, purely original silhouette)
    const finGeo = new THREE.ConeGeometry(0.05, 0.28, 6);
    const finL = new THREE.Mesh(finGeo, accent);
    finL.rotation.z = Math.PI / 2.2; finL.position.set(-0.22, 0.55, -0.18);
    const finR = finL.clone(); finR.position.x = 0.22; finR.rotation.z = -Math.PI / 2.2;
    hips.add(finL, finR);

    root.scale.setScalar(1.0);
  }

  _makeLimb(geo, material, x, y, z) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.y = -geo.parameters.length / 2 - geo.parameters.radius;
    mesh.castShadow = true;
    pivot.add(mesh);
    return { pivot, mesh };
  }

  setState(state) {
    if (this.state === state) return;
    this.state = state;
    this.stateTime = 0;
  }

  update(dt, speedFactor) {
    this.stateTime += dt;
    const t = this.stateTime;
    const runSpeed = 9 + speedFactor * 6;

    // reset tilt baseline
    let targetTilt = 0;

    if (this.state === 'run') {
      const phase = t * runSpeed;
      this.limbs.legL.pivot.rotation.x = Math.sin(phase) * 0.9;
      this.limbs.legR.pivot.rotation.x = Math.sin(phase + Math.PI) * 0.9;
      this.limbs.armL.pivot.rotation.x = Math.sin(phase + Math.PI) * 0.7;
      this.limbs.armR.pivot.rotation.x = Math.sin(phase) * 0.7;
      this.hips.position.y = 0.95 + Math.abs(Math.sin(phase)) * 0.05;
      targetTilt = 0.06;
    } else if (this.state === 'jump') {
      const p = Math.min(1, t / 0.55);
      this.limbs.legL.pivot.rotation.x = -0.5 + p * 0.3;
      this.limbs.legR.pivot.rotation.x = -0.7 + p * 0.5;
      this.limbs.armL.pivot.rotation.x = -1.6 + p * 0.6;
      this.limbs.armR.pivot.rotation.x = -1.6 + p * 0.6;
      targetTilt = -0.18;
    } else if (this.state === 'fly') {
      const phase = t * 6;
      this.limbs.legL.pivot.rotation.x = -0.3 + Math.sin(phase) * 0.15;
      this.limbs.legR.pivot.rotation.x = -0.3 + Math.sin(phase + Math.PI) * 0.15;
      this.limbs.armL.pivot.rotation.x = -1.3;
      this.limbs.armR.pivot.rotation.x = -1.3;
      targetTilt = -0.28;
    } else if (this.state === 'slide') {
      this.limbs.legL.pivot.rotation.x = -1.2;
      this.limbs.legR.pivot.rotation.x = -0.3;
      this.limbs.armL.pivot.rotation.x = 0.3;
      this.limbs.armR.pivot.rotation.x = 0.3;
      targetTilt = 0;
    } else if (this.state === 'stumble') {
      const p = Math.min(1, t / 0.6);
      this.limbs.legL.pivot.rotation.x = 0.6;
      this.limbs.legR.pivot.rotation.x = -0.4;
      this.limbs.armL.pivot.rotation.x = -1.4 * p;
      this.limbs.armR.pivot.rotation.x = 1.2 * p;
      targetTilt = 0.9 * p;
    }

    this.tilt += (targetTilt - this.tilt) * Math.min(1, dt * 10);
    this.torso.rotation.x = this.tilt;
    this.head.rotation.x = -this.tilt * 0.4;

    // slide crouch scale
    const targetScaleY = this.state === 'slide' ? 0.55 : 1;
    this.hips.scale.y += (targetScaleY - this.hips.scale.y) * Math.min(1, dt * 14);

    // lean into lane changes
    const targetRotY = THREE.MathUtils.clamp(-this._laneVel * 0.25, -0.35, 0.35);
    root_rotY_smooth(this, targetRotY, dt);
  }
}

function root_rotY_smooth(char, target, dt) {
  char._smoothRotY = char._smoothRotY || 0;
  char._smoothRotY += (target - char._smoothRotY) * Math.min(1, dt * 8);
  char.group.rotation.y = char._smoothRotY;
}
