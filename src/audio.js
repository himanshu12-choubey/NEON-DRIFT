// ============================================================================
// audio.js — 100% procedural synth audio (Web Audio API). No sample files are
// used anywhere, so the entire soundtrack and SFX set is original.
// ============================================================================

export class AudioEngine {
  constructor(getSettings) {
    this.getSettings = getSettings; // () => { music, sfx }
    this.ctx = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.musicTimer = null;
    this.musicStep = 0;
    this.started = false;
    this.filterSweep = null;
  }

  ensureCtx() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.22;
    this.musicGain.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.5;
    this.sfxGain.connect(this.ctx.destination);
  }

  resume() {
    this.ensureCtx();
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  // --------------------------------------------------------------- SFX ----
  _tone(freq, dur, type = 'sine', gainPeak = 0.5, delay = 0, bus = this.sfxGain) {
    if (!this.getSettings().sfx) return;
    this.ensureCtx();
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gainPeak, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g); g.connect(bus);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
    return { osc, g, t0 };
  }

  jump() {
    this._tone(420, 0.14, 'triangle', 0.4);
    this._tone(680, 0.1, 'triangle', 0.25, 0.03);
  }
  slide() {
    this.ensureCtx();
    if (!this.getSettings().sfx) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, t0);
    osc.frequency.exponentialRampToValueAtTime(90, t0 + 0.22);
    g.gain.setValueAtTime(0.3, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.24);
    osc.connect(g); g.connect(this.sfxGain);
    osc.start(t0); osc.stop(t0 + 0.26);
  }
  coin(pitchUp = 0) {
    this._tone(880 + pitchUp * 40, 0.09, 'square', 0.22);
    this._tone(1320 + pitchUp * 40, 0.12, 'sine', 0.18, 0.02);
  }
  crash() {
    this.ensureCtx();
    if (!this.getSettings().sfx) return;
    const t0 = this.ctx.currentTime;
    const bufferSize = this.ctx.sampleRate * 0.35;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.setValueAtTime(1800, t0);
    filt.frequency.exponentialRampToValueAtTime(120, t0 + 0.35);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.6, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35);
    noise.connect(filt); filt.connect(g); g.connect(this.sfxGain);
    noise.start(t0); noise.stop(t0 + 0.36);
    this._tone(90, 0.3, 'square', 0.3);
  }
  powerup() {
    [0, 0.06, 0.12].forEach((d, i) => this._tone(500 + i * 220, 0.15, 'triangle', 0.3, d));
  }
  shieldHit() {
    this._tone(200, 0.2, 'square', 0.35);
    this._tone(150, 0.25, 'sawtooth', 0.25, 0.03);
  }
  uiClick() { this._tone(600, 0.06, 'square', 0.15); }
  milestone() {
    [0, 0.09, 0.18, 0.27].forEach((d, i) => this._tone(523 * Math.pow(1.1225, i), 0.14, 'triangle', 0.25, d));
  }

  // ------------------------------------------------------------- MUSIC ----
  // A generative arpeggio + bass + hat loop. Original chord progression,
  // synthesized entirely at runtime — nothing pre-recorded.
  startMusic() {
    if (this.musicTimer) return;
    this.ensureCtx();
    const bpm = 128;
    const stepDur = 60 / bpm / 2; // 8th notes
    const scale = [0, 3, 5, 7, 10, 12, 15, 19]; // minor-pentatonic-ish, in semitones
    const root = 220; // A3
    const bassPattern = [0, 0, 7, 5];
    let step = this.musicStep;

    const schedule = () => {
      if (!this.getSettings().music) { this.musicStep = step; this.musicTimer = setTimeout(schedule, stepDur * 1000); return; }
      const t0 = this.ctx.currentTime + 0.02;
      // arpeggio lead
      const note = scale[(step * 3) % scale.length];
      const freq = root * 2 * Math.pow(2, note / 12);
      const lead = this.ctx.createOscillator();
      const leadGain = this.ctx.createGain();
      lead.type = 'square';
      lead.frequency.setValueAtTime(freq, t0);
      leadGain.gain.setValueAtTime(0, t0);
      leadGain.gain.linearRampToValueAtTime(0.09, t0 + 0.01);
      leadGain.gain.exponentialRampToValueAtTime(0.001, t0 + stepDur * 0.9);
      lead.connect(leadGain); leadGain.connect(this.musicGain);
      lead.start(t0); lead.stop(t0 + stepDur);

      // bass every 2 steps
      if (step % 2 === 0) {
        const bnote = bassPattern[(step / 2) % bassPattern.length];
        const bfreq = root * Math.pow(2, bnote / 12);
        const bass = this.ctx.createOscillator();
        const bgain = this.ctx.createGain();
        bass.type = 'sawtooth';
        bass.frequency.setValueAtTime(bfreq, t0);
        bgain.gain.setValueAtTime(0.001, t0);
        bgain.gain.linearRampToValueAtTime(0.16, t0 + 0.02);
        bgain.gain.exponentialRampToValueAtTime(0.001, t0 + stepDur * 1.8);
        bass.connect(bgain); bgain.connect(this.musicGain);
        bass.start(t0); bass.stop(t0 + stepDur * 2);
      }

      // hat every step, softer
      const bufferSize = 800;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
      const hat = this.ctx.createBufferSource();
      hat.buffer = buffer;
      const hg = this.ctx.createGain();
      hg.gain.setValueAtTime(step % 2 === 0 ? 0.05 : 0.03, t0);
      hg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
      hat.connect(hg); hg.connect(this.musicGain);
      hat.start(t0); hat.stop(t0 + 0.06);

      step = (step + 1) % 64;
      this.musicStep = step;
      this.musicTimer = setTimeout(schedule, stepDur * 1000);
    };
    schedule();
  }

  stopMusic() {
    if (this.musicTimer) { clearTimeout(this.musicTimer); this.musicTimer = null; }
  }

  setMusicIntensity(t) {
    // t: 0..1 speed factor, subtly raises music volume with speed
    if (!this.musicGain) return;
    const target = 0.18 + 0.12 * Math.min(1, t);
    this.musicGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.5);
  }
}
