// Escalas fundamentais do mundo (vista lateral: um corte da camada do planeta). Todo o resto deriva daqui.
export const CELL = 4;                 // px de mundo por célula (um "grão")
export const CHUNK = 64;               // células por lado de chunk
export const CHUNK_PX = CELL * CHUNK;  // 256 px
export const WORLD_CW = 12;            // chunks na horizontal
export const WORLD_CH = 10;            // chunks na vertical
export const WORLD_W = CHUNK * WORLD_CW;   // 768 células
export const WORLD_H = CHUNK * WORLD_CH;   // 640 células
export const WORLD_PX_W = WORLD_W * CELL;  // 3072 px
export const WORLD_PX_H = WORLD_H * CELL;  // 2560 px
export const TILE = 16;                // grade de construção (px)
export const TILE_CELLS = TILE / CELL; // 4 células
export const WORLD_TW = WORLD_PX_W / TILE;  // 192 tiles
export const WORLD_TH = WORLD_PX_H / TILE;  // 160 tiles
export const SURFACE_Y = 152;          // linha média do chão (células); acima é céu / vazio escavado
export const PLANET_MASS_T = 2_860_000_000;      // massa recuperável do planeta (t)
export const PLANET_RADIUS_M = 3200;             // usado para "profundidade" exibida
export const SIM_DT = 1 / 30;                    // passo fixo de simulação
