// ============================================================================
// effects.js — particle bursts (coins, crashes, powerups) and screen shake.
// Uses a small reusable pool of glowing sprites for performance.
// ============================================================================
import * as THREE from 'three';

function makeGlowTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

export class ParticleSystem {
  constructor(scene, maxParticles = 220) {
    this.scene = scene;
    this.texture = makeGlowTexture();
    this.max = maxParticles;
    this.particles = [];
    const geo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < maxParticles; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: this.texture, color: 0xffffff, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.scale.setScalar(0.001);
      scene.add(mesh);
      this.particles.push({ mesh, life: 0, maxLife: 1, vel: new THREE.Vector3(), active: false, size: 0.2 });
    }
  }

  burst(position, color, count = 14, opts = {}) {
    const speed = opts.speed || 3;
    const size = opts.size || 0.18;
    const life = opts.life || 0.6;
    let spawned = 0;
    for (const p of this.particles) {
      if (p.active) continue;
      p.active = true;
      p.mesh.visible = true;
      p.mesh.position.copy(position);
      p.mesh.material.color.set(color);
      p.mesh.material.opacity = 1;
      p.size = size * (0.6 + Math.random() * 0.8);
      p.mesh.scale.setScalar(p.size);
      const ang = Math.random() * Math.PI * 2;
      const upBias = 0.6 + Math.random() * 0.6;
      p.vel.set(Math.cos(ang) * speed * Math.random(), upBias * speed, Math.sin(ang) * speed * Math.random());
      p.life = 0;
      p.maxLife = life * (0.7 + Math.random() * 0.6);
      spawned++;
      if (spawned >= count) break;
    }
  }

  update(dt, camera) {
    for (const p of this.particles) {
      if (!p.active) continue;
      p.life += dt;
      if (p.life >= p.maxLife) { p.active = false; p.mesh.visible = false; continue; }
      p.vel.y -= 6 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      const t = p.life / p.maxLife;
      p.mesh.material.opacity = 1 - t;
      p.mesh.scale.setScalar(p.size * (1 - t * 0.4));
      if (camera) p.mesh.quaternion.copy(camera.quaternion);
    }
  }
}

export class ScreenShake {
  constructor() { this.trauma = 0; this.enabled = true; }
  add(amount) { if (this.enabled) this.trauma = Math.min(1, this.trauma + amount); }
  update(dt, camera, baseOffset) {
    if (this.trauma > 0) {
      this.trauma = Math.max(0, this.trauma - dt * 1.8);
      const t = this.trauma * this.trauma;
      camera.position.x = baseOffset.x + (Math.random() - 0.5) * 0.4 * t;
      camera.position.y = baseOffset.y + (Math.random() - 0.5) * 0.3 * t;
      camera.rotation.z = (Math.random() - 0.5) * 0.04 * t;
    } else {
      camera.rotation.z += (0 - camera.rotation.z) * Math.min(1, dt * 8);
    }
  }
}
