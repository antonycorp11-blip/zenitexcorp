/**
 * Integração com o portal ATHG (SDK carregado no index.html).
 * - Dentro do portal: o save vai para a conta do jogador (nuvem), com o mapa comprimido (limite de 512 KB).
 * - Fora do portal (link direto): o jogo é TRAVADO e redireciona para a página dele no ATHG;
 *   antes, se houver um save local, ele é enviado para a fila de transferência do ATHG (para não perder o progresso).
 */
export const ATHG_URL = 'https://athg.antonycorp11.workers.dev';
export const PLAY_URL = ATHG_URL + '/play/zenitex';
const SUPABASE_URL = 'https://kdcgdkzdjdkebadnupgu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ANUtklosjEqev3UXEFeEwA_WANBDrcW';   // chave publicável (a segurança é o RLS)

interface AthgSdk {
  ready(): void;
  gameStarted(): void;
  save(data: unknown, slot?: string): Promise<unknown>;
  load(slot?: string): Promise<unknown>;
  ownExitButton?(): void;
  exit?(): void;
}
const sdk = (): AthgSdk | undefined => (window as unknown as { ATHG?: AthgSdk }).ATHG;

export function inPortal(): boolean {
  try { return window.self !== window.top; } catch { return true; }
}
export function isLocalHost(): boolean {
  const h = location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h.endsWith('.local') || /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(h);
}

function post(type: string) { try { window.parent.postMessage({ source: 'athg-game', version: 1, type }, '*'); } catch { /* sem portal */ } }
export function athgReady() { sdk()?.ready(); }
export function athgGameStarted() { sdk()?.gameStarted(); }
/** o jogo tem o próprio botão de sair (no MENU): o portal esconde o X que cobria o HUD */
export function athgOwnExit() { if (!inPortal()) return; const A = sdk(); if (A?.ownExitButton) A.ownExitButton(); else post('OWN_EXIT_BUTTON'); }
export function athgExit() { const A = sdk(); if (A?.exit) A.exit(); else if (inPortal()) post('EXIT_REQUEST'); else location.href = PLAY_URL; }

// ---------------- compressão do mapa ----------------
async function gz(text: string): Promise<string> {
  const cs = new CompressionStream('gzip');
  const w = cs.writable.getWriter(); void w.write(new TextEncoder().encode(text)); void w.close();
  const buf = new Uint8Array(await new Response(cs.readable).arrayBuffer());
  let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}
async function gunzip(b64: string): Promise<string> {
  const bin = atob(b64), buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  const ds = new DecompressionStream('gzip');
  const w = ds.writable.getWriter(); void w.write(buf); void w.close();
  return await new Response(ds.readable).text();
}
/** save → formato da nuvem (mapa e área explorada comprimidos) */
export async function packSave(s: any): Promise<any> {
  if (typeof CompressionStream === 'undefined') return s;
  const { chunks, explored, ...rest } = s;
  return { ...rest, packed: 1, gz: await gz(JSON.stringify({ chunks, explored })) };
}
export async function unpackSave(d: any): Promise<any> {
  if (!d || !d.packed) return d ?? null;
  const { gz: data, packed, ...rest } = d; void packed;
  const inner = JSON.parse(await gunzip(data));
  return { ...rest, chunks: inner.chunks, explored: inner.explored };
}

// ---------------- save na nuvem ----------------
let timer = 0, pending: any = null;
/** envia o save para a conta ATHG no máximo a cada 15 s (o jogo salva com frequência) */
export function cloudSave(s: any) {
  const A = sdk();
  if (!A || !inPortal()) return;
  pending = s;
  if (timer) return;
  timer = window.setTimeout(async () => {
    timer = 0;
    const data = pending; pending = null;
    if (!data) return;
    try { await A.save(await packSave(data)); } catch { /* tenta de novo no próximo save */ }
  }, 15000);
}
export async function cloudLoad(): Promise<any | null> {
  const A = sdk();
  if (!A || !inPortal()) return null;
  try { return await unpackSave(await A.load()); } catch { return null; }
}

/** link direto com save local: manda o save para a fila de transferência do ATHG (uma vez) */
export async function transferLocalSave(s: any): Promise<boolean> {
  try {
    const key = 'zx_transferred_' + Math.round(s.time ?? 0);
    if (localStorage.getItem(key)) return true;
    const data = await packSave(s);
    const r = await fetch(`${SUPABASE_URL}/rest/v1/save_transfers`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ game_slug: 'zenitex', data, user_agent: navigator.userAgent.slice(0, 300) }),
    });
    if (r.ok) localStorage.setItem(key, '1');
    return r.ok;
  } catch { return false; }
}
