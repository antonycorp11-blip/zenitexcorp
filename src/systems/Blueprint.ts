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
    // LINHA DE EXTRAÇÃO (tudo à direita da cápsula, no platô):
    //   tubo do Ímã  ◀══════════════════════╗
    //               tubo Lu ◀══╗ [RESSON.]   [ÍMÃ]   ╔═ tubo
    // [SILO Fe][COLETOR][SILO Lu] [PRENSA] ◀◀◀◀ esteira ◀◀◀◀  ╚[SOPRADOR ◀]  ← cave aqui
    const X = tx0 - 4;
    this.items = [
      // PLATAFORMA ORBITAL: piso de 8 peças onde a cápsula pousa
      { id: 'piso', key: 'piso_orbital', tx: tx0 - 14, tx2: tx0 - 7, ty: gy - 1, dir: 0, label: 'PLATAFORMA ORBITAL' },
      { id: 'esteira', key: 'esteira', tx: X + 17, tx2: X + 8, ty: gy - 1, dir: 2, label: 'ESTEIRA ◀' },
      { id: 'compactador', key: 'compactador', tx: X + 7, ty: gy - 2, dir: 0, label: 'PRENSA' },
      { id: 'soprador', key: 'soprador', tx: X + 19, ty: gy - 1, dir: 2, label: 'SOPRADOR ◀' },
      { id: 'tuboFeed', key: 'tubo', tx: X + 18, ty: gy - 1, tx2: X + 17, ty2: gy - 3, dir: 3, label: 'TUBO' },
      { id: 'ima', key: 'ima', tx: X + 14, ty: gy - 3, dir: 0, label: 'ÍMÃ' },
      { id: 'armazem', key: 'armazem', tx: X + 2, ty: gy - 2, dir: 0, label: 'COLETOR' },
      { id: 'siloFe', key: 'silo', tx: X, ty: gy - 2, dir: 0, label: 'SILO FERRONOX' },
      { id: 'tuboFe', key: 'tubo', tx: X + 14, ty: gy - 4, tx2: X + 2, ty2: gy - 5, dir: 3, label: 'TUBO DO ÍMÃ' },
      { id: 'ressonador', key: 'ressonador', tx: X + 10, ty: gy - 3, dir: 0, label: 'RESSONADOR' },
      { id: 'siloLu', key: 'silo', tx: X + 4, ty: gy - 2, dir: 2, label: 'SILO LUMENITA' },
      { id: 'tuboLu', key: 'tubo', tx: X + 9, ty: gy - 3, tx2: X + 6, ty2: gy - 3, dir: 2, label: 'TUBO DO RESSONADOR' },
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
      ['esteira', 'A esteira vai do soprador até a Prensa, andando para a ESQUERDA.'],
      ['compactador', 'A Prensa vai no fim da esteira (à esquerda).'],
      ['soprador', 'O Soprador vai no quadrado marcado, com o bocal ◀.'],
      ['tuboFeed', 'O tubo sai do Soprador, sobe e solta a terra em cima da esteira.'],
      ['ima', 'O Ímã vai POR CIMA da esteira, com 1 espaço livre embaixo.'],
      ['armazem', 'Falta o Coletor no quadrado marcado.'],
      ['siloFe', 'O Silo do Ferronox vai à esquerda do Coletor.'],
      ['tuboFe', 'O tubo do Ímã sai de cima dele e vai até em cima do Silo do Ferronox.'],
      ['ressonador', 'O Ressonador vai POR CIMA da esteira, com 1 espaço livre embaixo.'],
      ['siloLu', 'O Silo da Lumenita vai à direita do Coletor.'],
      ['tuboLu', 'O tubo do Ressonador sai do lado esquerdo dele até em cima do Silo da Lumenita.'],
    ];
    for (let i = 0; i < order.length; i++) if (!this.placed(order[i][0])) return { ok: false, msg: order[i][1], stage: i };
    return { ok: true, msg: 'Linha montada: soprador → tubo → esteira → Ímã (Ferronox → silo) → Ressonador (Lumenita → silo) → Prensa.', stage: order.length };
  }
}
