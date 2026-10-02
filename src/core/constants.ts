// Escalas fundamentais do mundo (vista lateral: um corte da camada do planeta). Todo o resto deriva daqui.
export const CELL = 2;                 // px de mundo por célula (um "grão") — grãos finos, como areia
export const CHUNK = 64;               // células por lado de chunk
export const CHUNK_PX = CELL * CHUNK;  // 128 px
export const WORLD_CW = 48;            // circunferência navegável da camada (antes: 16)
export const WORLD_CH = 14;            // chunks na vertical
export const WORLD_W = CHUNK * WORLD_CW;   // 3072 células
export const WORLD_H = CHUNK * WORLD_CH;   // 896 células
export const WORLD_PX_W = WORLD_W * CELL;  // 6144 px
export const WORLD_PX_H = WORLD_H * CELL;  // 1792 px
export const TILE = 16;                // grade de construção (px)
export const TILE_CELLS = TILE / CELL; // 8 células
export const WORLD_TW = WORLD_PX_W / TILE;  // 384 tiles
export const WORLD_TH = WORLD_PX_H / TILE;  // 112 tiles
export const LEGACY_WORLD_W = CHUNK * 16;
export const wrapX = (x: number, width: number) => ((x % width) + width) % width;
export const nearestX = (x: number, reference: number, width = WORLD_PX_W) => x + Math.round((reference - x) / width) * width;
export const SURFACE_Y = 192;          // linha média do chão (células); acima é céu / vazio escavado
export const PLANET_MASS_T = 2_860_000_000;      // massa recuperável do planeta (t)
export const PLANET_RADIUS_M = 3200;             // usado para "profundidade" exibida
export const SIM_DT = 1 / 30;                    // passo fixo de simulação
