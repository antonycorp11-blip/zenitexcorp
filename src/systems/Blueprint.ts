import { CELL, SURFACE_Y, TILE } from '../core/constants';
import { MACHINE } from '../data/machines';
import type { Game } from '../Game';
import type { Machine } from './Machines';

export interface BPItem { id: string; key: string; tx: number; ty: number; dir: number; label: string; tx2?: number; ty2?: number; }

/**
 * Projeto guiado da primeira indústria (tutorial): onde vai cada peça, com que rotação, e a verificação
 * de que a linha funciona de verdade (perfuradora → esteira → funil do armazém).
 */
export class Blueprint {
  items: BPItem[] = [];
  constructor(private g: Game) {}

  /** monta o projeto a partir da posição da cápsula (vale para qualquer camada) */
  layout() {
    // tudo é medido a partir do ponto de pouso (o centro do platô), exista a cápsula ou não
    const L = this.g.world.gen.landing;
    const tx0 = Math.floor((L.x * CELL) / TILE), gy = Math.floor((SURFACE_Y * CELL) / TILE);   // gy = primeira fileira de chão
    // TORRE DE SEPARAÇÃO, à direita da cápsula (tudo cai por gravidade), alimentada por um SOPRADOR numa frente de escavação:
    //            ◀════════ tubo ═══╗
    //   [PENEIRA ◀]                ║
    //   [ÍMÃ ▶]                    ║
    // [PRENSA][COLETOR][SILO ◀]    ╚[SOPRADOR ◀]  ← cave aqui perto
    const x = tx0 + 4;
    this.items = [
      // PLATAFORMA ORBITAL: piso de 8 peças onde a cápsula pousa (tx0-6 … tx0+1)
      { id: 'piso', key: 'piso_orbital', tx: tx0 - 6, tx2: tx0 + 1, ty: gy - 1, dir: 0, label: 'PLATAFORMA ORBITAL' },
      { id: 'armazem', key: 'armazem', tx: x, ty: gy - 2, dir: 0, label: 'COLETOR' },
      { id: 'ima', key: 'ima', tx: x, ty: gy - 3, dir: 0, label: 'ÍMÃ ▶' },
      { id: 'peneira', key: 'peneira', tx: x, ty: gy - 4, dir: 2, label: 'PENEIRA ◀' },
      { id: 'compactador', key: 'compactador', tx: x - 1, ty: gy - 2, dir: 0, label: 'PRENSA' },
      { id: 'silo', key: 'silo', tx: x + 2, ty: gy - 2, dir: 2, label: 'SILO ◀' },
      { id: 'soprador', key: 'soprador', tx: x + 9, ty: gy - 1, dir: 2, label: 'SOPRADOR ◀' },
      { id: 'tubo', key: 'tubo', tx: x + 8, ty: gy - 1, tx2: x + 2, ty2: gy - 5, dir: 3, label: 'TUBO' },
    ];
  }

  /** peças do tubo em L (sobe primeiro, depois vai para o lado), cada uma apontando para a próxima */
  tubePath(it: BPItem): [number, number, number][] {
    const pts: [number, number][] = [[it.tx, it.ty]];
    let x = it.tx, y = it.ty;
    while (y !== it.ty2!) { y += Math.sign(it.ty2! - y); pts.push([x, y]); }
    while (x !== it.tx2!) { x += Math.sign(it.tx2! - x); pts.push([x, y]); }
    const dirOf = (dx: number, dy: number) => (dx > 0 ? 0 : dy > 0 ? 1 : dx < 0 ? 2 : 3);
    return pts.map(([px, py], i) => {
      const [nx, ny] = i < pts.length - 1 ? pts[i + 1] : [px * 2 - pts[i - 1][0], py * 2 - pts[i - 1][1]];
      return [px, py, dirOf(nx - px, ny - py)];
    });
  }

  item(id: string) { return this.items.find(i => i.id === id); }

  /** a peça foi posta onde o projeto pede, girada certo? */
  placed(id: string): boolean {
    const it = this.item(id); if (!it) return false;
    if (it.key === 'tubo') {
      for (const [px, py, d] of this.tubePath(it)) { const m = this.g.machines.at(px, py); if (!m || m.def.behavior !== 'tube' || m.dir !== d) return false; }
      return true;
    }
    if (it.key === 'esteira') {
      for (let x = Math.min(it.tx, it.tx2!); x <= Math.max(it.tx, it.tx2!); x++) { const m = this.g.machines.at(x, it.ty); if (!m?.belt || m.dir !== it.dir) return false; }
      return true;
    }
    if (it.tx2 !== undefined) {
      for (let x = Math.min(it.tx, it.tx2); x <= Math.max(it.tx, it.tx2); x++) { const m = this.g.machines.at(x, it.ty); if (!m || m.key !== it.key) return false; }
      return true;
    }
    if (it.ty2 !== undefined) {
      for (let y = Math.min(it.ty, it.ty2); y <= Math.max(it.ty, it.ty2); y++) { const m = this.g.machines.at(it.tx, y); if (!m || m.key !== it.key) return false; }
      const top = this.g.machines.at(it.tx, Math.min(it.ty, it.ty2));
      return !!top && top.dir === it.dir;
    }
    const m = this.g.machines.at(it.tx, it.ty);
    return !!m && m.key === it.key && m.tx === it.tx && m.ty === it.ty && (!MACHINE[it.key].rotatable || m.dir === it.dir);
  }

  /** Segue a esteira a partir de um tile até a máquina que recebe. */
  private follow(start: Machine | undefined, from: Machine): { ok: boolean; to?: Machine; msg: string } {
    const g = this.g;
    if (!start?.belt) return { ok: false, msg: `Não há esteira encostada na saída de ${from.def.name}.` };
    let b: Machine = start;
    for (let guard = 0; guard < 200; guard++) {
      const step = b.dir === 2 ? -1 : 1;
      const n: Machine | undefined = g.machines.at(b.tx + step, b.ty) ?? g.machines.at(b.tx + step, b.ty - 1);
      if (!n) return { ok: false, msg: 'A esteira termina no vazio: o material cai no chão.' };
      if (n.belt) { if (n.dir !== b.dir) return { ok: false, msg: 'Uma esteira está virada para o lado contrário: toque nela e gire.' }; b = n; continue; }
      if (n === from) return { ok: false, msg: `A esteira está andando de volta para ${from.def.name}. Ela tem que andar para longe dela.` };
      return { ok: true, to: n, msg: '' };
    }
    return { ok: false, msg: 'Esteira longa demais.' };
  }
  /** a esteira encostada na calha (saída) de uma máquina */
  private outBelt(m: Machine): Machine | undefined {
    const side = m.def.behavior === 'drill' ? (m.dir === 0 ? -1 : m.dir === 2 ? 1 : -1) : (m.dir === 2 ? -1 : 1);
    const bx = side < 0 ? m.tx - 1 : m.tx + m.def.w;
    return this.g.machines.at(bx, m.ty + m.def.h - 1);
  }

  /** Confere a fábrica do projeto peça a peça e diz exatamente o que falta ou está errado. */
  checkLine(): { ok: boolean; msg: string; stage: number } {
    const order: [string, string][] = [
      ['armazem', 'Falta o Coletor no quadrado marcado.'],
      ['ima', 'O Ímã vai EM CIMA do Coletor, com a seta ▶ (os metálicos são puxados para a direita, para o Silo).'],
      ['peneira', 'A Peneira vai EM CIMA do Ímã, com a seta ◀ (resíduo para a esquerda).'],
      ['compactador', 'A Prensa vai do lado esquerdo, embaixo da borda por onde o resíduo escorrega.'],
      ['silo', 'O Silo vai à direita do Coletor, com a seta ◀ (transborda para dentro do Coletor).'],
      ['soprador', 'O Soprador vai no quadrado marcado, com o bocal ◀ virado para a fábrica.'],
      ['tubo', 'O tubo sai do bocal do soprador, SOBE e vai até em cima da Peneira (arraste do 1 até o 2).'],
    ];
    for (let i = 0; i < order.length; i++) if (!this.placed(order[i][0])) return { ok: false, msg: order[i][1], stage: i };
    return { ok: true, msg: 'Fábrica montada: soprador → tubo → peneira → ímã → Ferronox no silo, o resto no coletor, resíduo na prensa.', stage: order.length };
  }
}
