// Escalas fundamentais do mundo. Todo o resto deriva daqui.
export const CELL = 4;                 // px de mundo por célula de terreno
export const CHUNK = 64;               // células por lado de chunk
export const CHUNK_PX = CELL * CHUNK;  // 256 px
export const WORLD_CHUNKS = 40;        // chunks por lado
export const WORLD_CELLS = CHUNK * WORLD_CHUNKS; // 2560 células
export const WORLD_PX = WORLD_CELLS * CELL;      // 10240 px
export const TILE = 16;                // grade de construção (px)
export const TILE_CELLS = TILE / CELL; // 4 células
export const WORLD_TILES = WORLD_PX / TILE;      // 640
export const PLANET_MASS_T = 2_860_000_000;      // massa recuperável do planeta (t)
export const PLANET_RADIUS_M = 3200;             // usado para "profundidade" exibida
export const SIM_DT = 1 / 30;                    // passo fixo de simulação
