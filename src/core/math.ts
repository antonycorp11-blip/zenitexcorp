export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
export const DIRS: readonly [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // 0=L 1=S 2=O 3=N
export const DIR_NAMES = ['→', '↓', '←', '↑'];

export function rgb(c: readonly number[], a = 1) { return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`; }
export function mix(a: readonly number[], b: readonly number[], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Formatação pt-BR */
const nf = new Intl.NumberFormat('pt-BR');
export function fmtInt(n: number) { return nf.format(Math.floor(n)); }
export function fmtShort(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(2).replace('.', ',') + 'B';
  if (a >= 1e6) return (n / 1e6).toFixed(2).replace('.', ',') + 'M';
  if (a >= 1e3) return (n / 1e3).toFixed(1).replace('.', ',') + 'K';
  return String(Math.floor(n));
}
export function fmtPct(p: number, digits = 7) {
  // p em 0..100
  return p.toFixed(digits).replace('.', ',') + '%';
}
export function fmtTime(sec: number) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h) return `${h}h ${String(m).padStart(2, '0')}min`;
  if (m) return `${m}min ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}
export function fmtMass(t: number) {
  if (t < 1) return `${fmtInt(t * 1000)} kg`;
  return `${fmtInt(t)} t`;
}
