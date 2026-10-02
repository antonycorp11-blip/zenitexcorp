import { CELL } from '../core/constants';
import { IS_SOLID } from '../data/materials';
import { LORE, LORE_BY_ID, type LoreDef } from '../data/lore';
import { fmtInt } from '../core/math';
import type { Game } from '../Game';
import type { RuinSite, LooseArtifact } from '../world/WorldGen';

export interface Artifact { id: number; x: number; y: number; sector: number; cx: number; cy: number; done: boolean; destroyed: boolean; seen: boolean; kind: number; }

/** Artefatos espalhados pelo mundo e o Arquivo de Khelos. */
export class Lore {
  artifacts: Artifact[] = [];
  unlocked = new Set<string>();
  order: string[] = [];
  preserved = 0; demolished = 0; destroyed = 0;
  private byCell = new Map<number, Artifact>();

  constructor(private g: Game, legacy?: { ruins: RuinSite[]; loose: LooseArtifact[] }) {
    let id = 0;
    // Os IDs dos registros antigos precisam vir antes dos novos para preservar o progresso salvo.
    if (legacy) {
      for (const site of legacy.ruins) for (const a of site.artifacts) this.addArt(id++, a.x, a.y, site.sector);
      for (const a of legacy.loose) this.addArt(id++, a.x, a.y, a.sector);
    }
    for (const site of g.world.gen.ruins) if (!legacy?.ruins.includes(site)) for (const a of site.artifacts) this.addArt(id++, a.x, a.y, site.sector);
    for (const l of g.world.gen.loose) if (!legacy?.loose.includes(l)) this.addArt(id++, l.x, l.y, l.sector);
  }
  private addArt(id: number, cx: number, cy: number, sector: number) {
    const a: Artifact = { id, x: cx * CELL + 2, y: cy * CELL + 2, sector, cx, cy, done: false, destroyed: false, seen: false, kind: id % 4 };
    this.artifacts.push(a);
    this.byCell.set(cy * 100000 + cx, a);
  }

  visible(a: Artifact) { return !a.done && !a.destroyed && !IS_SOLID[this.g.world.get(a.cx, a.cy)]; }

  onCellRemoved(x: number, y: number, cause: string) {
    const a = this.byCell.get(y * 100000 + x);
    if (!a || a.done || a.destroyed) return;
    if (cause === 'player') return; // a precisão manual expõe sem destruir
    a.destroyed = true;
    this.destroyed++;
    this.g.toast('Um artefato de Khelos foi destruído pela extração automática.', '#ff6a3a');
    this.g.dialogue.line('sera', 'Destruído. Era um registro inteiro, e virou pó numa esteira.');
  }

  /** Cataloga um artefato: libera o próximo registro do setor. */
  catalog(a: Artifact) {
    const g = this.g;
    a.done = true;
    const pool = LORE.filter(l => l.sector === a.sector && !this.unlocked.has(l.id));
    // setores sem registros restantes liberam registros de setores anteriores ainda pendentes
    const entry: LoreDef | undefined = pool[0] ?? LORE.find(l => l.sector < a.sector && !this.unlocked.has(l.id));
    g.pack.add('artefato', 2) || g.stock.add('artefato', 2, false);
    g.stats.artifacts++;
    if (!entry) {
      g.stock.credits += 200;
      g.toast('Fragmento ancestral catalogado (+200 créditos).', '#4af0e0');
      return;
    }
    this.unlocked.add(entry.id);
    this.order.push(entry.id);
    g.stock.credits += entry.credits;
    g.ui.discovery(entry);
    g.audio.discover(true);
    g.bus.emit('lore_unlocked', entry);
  }

  /** Decisão em templos */
  templeChoice(entry: LoreDef, demolish: boolean) {
    const g = this.g;
    if (demolish) {
      const val = Math.round(entry.massT * 15);
      g.stock.credits += val;
      g.planet.addUnits(Math.max(1, entry.massT / 10));
      this.demolished++;
      g.dialogue.line('zena', `Demolição registrada. ${fmtInt(val)} créditos creditados. A história agradece a sua contribuição para o PIB.`);
      g.dialogue.line('sera', 'Eu... vou guardar as fotos. Pelo menos as fotos.');
    } else {
      this.preserved++;
      g.dialogue.line('sera', 'Obrigada. De verdade. Pelo menos isso vai ficar... até o fim.');
      g.dialogue.line('varren', 'Preservação registrada como "atraso operacional". Vamos conversar sobre isso na sua avaliação.');
    }
  }

  get(id: string) { return LORE_BY_ID[id]; }
  serialize() { return { unlocked: [...this.unlocked], order: this.order, arts: this.artifacts.filter(a => a.done || a.destroyed).map(a => [a.id, a.done ? 1 : 2]), preserved: this.preserved, demolished: this.demolished, destroyed: this.destroyed }; }
  load(s: any) {
    this.unlocked = new Set(s.unlocked); this.order = s.order ?? [...this.unlocked];
    this.preserved = s.preserved ?? 0; this.demolished = s.demolished ?? 0; this.destroyed = s.destroyed ?? 0;
    for (const [id, st] of s.arts ?? []) { const a = this.artifacts[id]; if (a) { a.done = st === 1; a.destroyed = st === 2; } }
  }
}
