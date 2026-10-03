import type { MatSound } from '../data/materials';
import type { SpeakerId } from '../data/dialogue';

type Mood = 'calmo' | 'industrial' | 'tenso' | 'misterio' | 'nucleo';

/** Áudio 100% sintetizado: nenhum arquivo externo. */
export class Audio {
  ctx: AudioContext | null = null;
  master!: GainNode; sfx!: GainNode; music!: GainNode;
  private noiseBuf!: AudioBuffer;
  private drill: { osc: OscillatorNode; laser: OscillatorNode; n: AudioBufferSourceNode; g: GainNode; f: BiquadFilterNode } | null = null;
  private hum: { g: GainNode; o: OscillatorNode } | null = null;
  volume = { master: 0.8, sfx: 0.9, music: 0.32 };
  mood: Mood = 'calmo';
  private musicT = 0; private chordI = 0; private duck = 0;
  private lastGrain = 0; private lastTube = 0;

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const C = (window.AudioContext || (window as any).webkitAudioContext);
    if (!C) return;
    this.ctx = new C();
    const c = this.ctx;
    this.master = c.createGain(); this.master.connect(c.destination);
    this.sfx = c.createGain(); this.sfx.connect(this.master);
    this.music = c.createGain(); this.music.connect(this.master);
    this.applyVolume();
    this.noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // zumbido de máquinas
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 55;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 180;
    const g = c.createGain(); g.gain.value = 0;
    o.connect(f); f.connect(g); g.connect(this.sfx); o.start();
    this.hum = { g, o };
  }

  applyVolume() {
    if (!this.ctx) return;
    this.master.gain.value = this.volume.master;
    this.sfx.gain.value = this.volume.sfx;
    this.music.gain.value = this.volume.music * 0.22;
  }

  private env(g: GainNode, a: number, peak: number, d: number) {
    const t = this.ctx!.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  private noise(dur: number, type: BiquadFilterType, freq: number, q: number, vol: number) {
    const c = this.ctx; if (!c) return;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    s.connect(f); f.connect(g); g.connect(this.sfx);
    this.env(g, 0.004, vol, dur);
    s.start(0, Math.random()); s.stop(c.currentTime + dur + 0.05);
  }
  private tone(freq: number, dur: number, type: OscillatorType, vol: number, delay = 0, dest?: AudioNode) {
    const c = this.ctx; if (!c) return;
    const o = c.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = c.createGain();
    o.connect(g); g.connect(dest ?? this.sfx);
    const t = c.currentTime + delay;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.05);
  }

  /** Som de impacto de mineração, diferente por material. */
  tick(s: MatSound, v = 0.5) {
    if (!this.ctx) return;
    const r = 0.9 + Math.random() * 0.2;
    switch (s) {
      case 'rock': this.noise(0.08, 'lowpass', 700 * r, 1, 0.22 * v); break;
      case 'crystal': this.noise(0.05, 'highpass', 2500, 1, 0.1 * v); this.tone(1400 * r + Math.random() * 600, 0.18, 'sine', 0.06 * v); break;
      case 'metal': this.noise(0.06, 'bandpass', 2800 * r, 4, 0.18 * v); this.tone(620 * r, 0.12, 'square', 0.03 * v); break;
      case 'organic': this.noise(0.1, 'lowpass', 380 * r, 3, 0.25 * v); break;
      case 'ice': this.noise(0.05, 'highpass', 3500, 1, 0.12 * v); this.tone(2400 * r, 0.1, 'triangle', 0.05 * v); break;
      case 'glass': this.tone(1800 * r, 0.12, 'sine', 0.06 * v); this.noise(0.04, 'highpass', 4000, 1, 0.08 * v); break;
      case 'ancient': this.tone(220 * r, 0.4, 'triangle', 0.07 * v); this.noise(0.08, 'lowpass', 500, 1, 0.15 * v); break;
    }
  }

  setDrilling(on: boolean, intensity = 1) {
    const c = this.ctx; if (!c) return;
    if (on && !this.drill) {
      const osc = c.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 85;
      const laser = c.createOscillator(); laser.type = 'triangle'; laser.frequency.value = 520;
      const n = c.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1250; f.Q.value = 1.4;
      const g = c.createGain(); g.gain.value = 0;
      const lg = c.createGain(); lg.gain.value = 0.18;
      osc.connect(f); n.connect(f); f.connect(g); laser.connect(lg); lg.connect(g); g.connect(this.sfx);
      osc.start(); laser.start(); n.start();
      g.gain.linearRampToValueAtTime(0.048 * intensity, c.currentTime + 0.06);
      this.drill = { osc, laser, n, g, f };
    } else if (!on && this.drill) {
      const d = this.drill; this.drill = null;
      d.g.gain.linearRampToValueAtTime(0, c.currentTime + 0.12);
      d.osc.stop(c.currentTime + 0.16); d.laser.stop(c.currentTime + 0.16); d.n.stop(c.currentTime + 0.16);
    }
    if (this.drill) {
      this.drill.osc.frequency.setTargetAtTime(85 + Math.random() * 10, c.currentTime, 0.04);
      this.drill.laser.frequency.setTargetAtTime(480 + Math.random() * 190, c.currentTime, 0.035);
      this.drill.f.frequency.setTargetAtTime(1050 + Math.random() * 500, c.currentTime, 0.04);
    }
  }

  /** Batidas granuladas das pilhas próximas; limita vozes quando muitos grãos caem juntos. */
  grainFall(moving: number) {
    const c = this.ctx;
    if (!c || c.state !== 'running' || moving < 3 || c.currentTime - this.lastGrain < 0.18) return;
    this.lastGrain = c.currentTime;
    const strength = Math.min(1, Math.sqrt(moving) / 13);
    this.noise(0.09, 'lowpass', 480 + Math.random() * 380, 0.8, 0.05 * strength);
    this.noise(0.035, 'bandpass', 1300 + Math.random() * 800, 0.8, 0.022 * strength);
  }

  /** Estalo e sopro curto quando um grão cruza o tubo perto do jogador. */
  tubePass(distance: number) {
    const c = this.ctx;
    if (!c || c.state !== 'running' || distance > 280 || c.currentTime - this.lastTube < 0.11) return;
    this.lastTube = c.currentTime;
    const v = (1 - distance / 280) * 0.06;
    this.noise(0.055, 'bandpass', 1100 + Math.random() * 500, 1.8, v);
    this.tone(390 + Math.random() * 170, 0.08, 'sine', v * 0.5);
  }

  machinesHum(level: number) { if (this.hum && this.ctx) this.hum.g.gain.setTargetAtTime(Math.min(0.06, level * 0.004), this.ctx.currentTime, 0.5); }

  click() { this.tone(900, 0.05, 'square', 0.04); }
  error() { this.tone(180, 0.15, 'square', 0.05); }
  success() { this.tone(523, 0.18, 'triangle', 0.08); this.tone(784, 0.3, 'triangle', 0.08, 0.1); }
  scan() {
    const c = this.ctx; if (!c) return;
    const o = c.createOscillator(); o.type = 'sine';
    const g = c.createGain(); o.connect(g); g.connect(this.sfx);
    o.frequency.setValueAtTime(300, c.currentTime); o.frequency.exponentialRampToValueAtTime(2400, c.currentTime + 0.5);
    this.env(g, 0.02, 0.06, 0.55); o.start(); o.stop(c.currentTime + 0.6);
  }
  discover(big = false) {
    this.duck = big ? 6 : 2.5;
    const notes = big ? [392, 523, 659, 784, 1047] : [659, 988];
    notes.forEach((n, i) => this.tone(n, 0.9, 'sine', 0.07, i * 0.12));
  }
  boom() { this.noise(1.2, 'lowpass', 300, 1, 0.6); this.tone(55, 0.8, 'sine', 0.3); }
  rumble() { this.noise(1.8, 'lowpass', 140, 1, 0.5); }
  death() { this.tone(220, 0.6, 'sawtooth', 0.06); this.tone(110, 0.9, 'sawtooth', 0.06, 0.2); }
  alarm() { this.tone(880, 0.25, 'square', 0.05); this.tone(660, 0.25, 'square', 0.05, 0.25); }
  blip(sp: SpeakerId) {
    const base: Record<string, number> = { zena: 1200, br7: 600, rocha: 300, varren: 260, sera: 520, kilo: 900, zenitex: 400, sistema: 800 };
    for (let i = 0; i < 3; i++) this.tone((base[sp] ?? 600) * (0.9 + Math.random() * 0.3), 0.05, sp === 'br7' || sp === 'kilo' ? 'square' : 'triangle', 0.025, i * 0.06);
  }

  /** Música generativa — chamada a cada frame. */
  updateMusic(dt: number, mood: Mood, silent: boolean) {
    const c = this.ctx; if (!c) return;
    this.mood = mood;
    this.duck = Math.max(0, this.duck - dt);
    const target = silent || this.duck > 0 ? 0.15 : 1;
    this.music.gain.setTargetAtTime(this.volume.music * 0.22 * target, c.currentTime, 0.8);
    this.musicT -= dt;
    if (this.musicT > 0) return;
    const prog: Record<Mood, number[][]> = {
      calmo: [[0, 3, 7, 10], [-4, 0, 3, 7], [-7, -3, 0, 5], [-2, 2, 5, 9]],
      industrial: [[0, 7, 12], [0, 5, 10], [-2, 5, 10], [-5, 2, 7]],
      tenso: [[0, 3, 6, 9], [1, 4, 7, 10], [0, 3, 6], [-1, 2, 5, 8]],
      misterio: [[0, 4, 8], [2, 6, 10], [0, 6, 10], [-2, 4, 8]],
      nucleo: [[0, 7], [-5, 0, 7], [0, 6], [-12, 0]],
    };
    const root: Record<Mood, number> = { calmo: 110, industrial: 98, tenso: 87.3, misterio: 123.5, nucleo: 55 };
    const ch = prog[mood][this.chordI++ % prog[mood].length];
    const dur = mood === 'industrial' ? 4 : 7;
    this.musicT = dur * 0.95;
    for (const semi of ch) {
      const f = root[mood] * Math.pow(2, semi / 12);
      const o = c.createOscillator(); o.type = mood === 'nucleo' ? 'sawtooth' : 'triangle';
      o.frequency.value = f; o.detune.value = (Math.random() - 0.5) * 12;
      const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = mood === 'nucleo' ? 300 : 900;
      const g = c.createGain();
      o.connect(fl); fl.connect(g); g.connect(this.music);
      const t = c.currentTime;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + dur * 0.35);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.1);
      o.start(t); o.stop(t + dur * 1.2);
    }
    // sinos esparsos / pulso industrial
    if (mood === 'misterio' || mood === 'calmo') {
      for (let i = 0; i < 3; i++) if (Math.random() < 0.5) this.tone(root[mood] * 4 * Math.pow(2, ch[i % ch.length] / 12), 2.5, 'sine', 0.025, Math.random() * dur, this.music);
    }
    if (mood === 'industrial' || mood === 'tenso') {
      for (let i = 0; i < dur * 2; i++) this.tone(root[mood] / 2, 0.15, 'square', 0.03, i * 0.5, this.music);
    }
    // Motivo espaçado sobre os acordes, audível como trilha mesmo em áreas sem máquinas.
    if (mood !== 'tenso' && mood !== 'nucleo') {
      for (let i = 0; i < 4; i++) {
        const semi = ch[(i * 3 + this.chordI) % ch.length] + 24;
        this.tone(root[mood] * Math.pow(2, semi / 12), 0.8, 'sine', 0.022, 0.6 + i * dur / 5, this.music);
      }
    }
  }
}
