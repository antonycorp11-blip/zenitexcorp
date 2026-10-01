import { POOLS, type Line, type SpeakerId } from '../data/dialogue';
import type { Game } from '../Game';

/** Fila de falas curtas não-bloqueantes. */
export class Dialogue {
  queue: Line[] = [];
  current: { line: Line; t: number; dur: number } | null = null;
  private cooldown = new Map<string, number>();
  private used = new Map<string, Set<number>>();
  private ambientT = 70;
  history: { line: Line; time: number }[] = [];

  constructor(private g: Game) {}

  /** Fala aleatória de um pool. cooldown em segundos impede repetição frequente. */
  say(pool: string, cooldown = 0, force = false) {
    const lines = POOLS[pool];
    if (!lines?.length) return;
    const now = this.g.time;
    if (!force && cooldown && (this.cooldown.get(pool) ?? -1e9) + cooldown > now) return;
    if (!force && this.queue.length > 3) return;
    this.cooldown.set(pool, now);
    let used = this.used.get(pool);
    if (!used || used.size >= lines.length) { used = new Set(); this.used.set(pool, used); }
    let i = Math.floor(Math.random() * lines.length);
    for (let k = 0; k < lines.length && used.has(i); k++) i = (i + 1) % lines.length;
    used.add(i);
    this.queue.push(lines[i]);
  }

  /** Todas as falas do pool em ordem (ex.: introdução). */
  sayAll(pool: string) { for (const l of POOLS[pool] ?? []) this.queue.push(l); }
  line(speaker: SpeakerId, text: string) { this.queue.push([speaker, text]); }

  update(dt: number) {
    if (this.current) {
      this.current.t += dt;
      if (this.current.t >= this.current.dur) this.current = null;
    }
    if (!this.current && this.queue.length) {
      const line = this.queue.shift()!;
      const dur = Math.min(11, 3.2 + line[1].length * 0.045);
      this.current = { line, t: 0, dur };
      this.history.push({ line, time: this.g.time });
      if (this.history.length > 80) this.history.shift();
      this.g.audio.blip(line[0]);
    }
    // conversa de ambiente
    this.ambientT -= dt;
    if (this.ambientT <= 0 && !this.g.flags.intro) {
      this.ambientT = 100 + Math.random() * 80;
      const f = this.g.planet.fraction();
      const r = Math.random();
      if (f > 0.25 && r < 0.3) this.say('ambient_late');
      else if (this.g.lore.unlocked.size > 3 && r < 0.45) this.say('ambient_sera');
      else if (this.g.robots.list.some(x => x.name === 'KILO') && r < 0.6) this.say('kilo_banter');
      else this.say('ambient');
    }
  }

  skip() { if (this.current) this.current.t = this.current.dur; }
}
