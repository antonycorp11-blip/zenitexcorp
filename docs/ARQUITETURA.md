# Arquitetura

Tudo é modular e orientado a dados. Conteúdo (materiais, máquinas, setores, receitas, pesquisas, diálogos,
lore, contratos, equipamentos) vive em `src/data/` e pode ser expandido sem tocar nos sistemas.

```
src/
  main.ts                 tela de título, boot, loop, NG+, ferramentas de dev
  Game.ts                 orquestrador: cria sistemas, entrada, interação, construção, tutorial, final, save
  core/                   constantes de escala, RNG/hash determinísticos, ruído (value/fBm/ridged/Worley), eventos, math/formatação
  data/                   conteúdo do jogo (ver abaixo)
  world/
    WorldGen.ts           geração determinística por (seed, x, y): Voronoi de setores com bordas deformadas,
                          cavernas, túneis, veios (Worley), líquidos, raízes, ruínas, barreiras de contenção, coração
    World.ts              grade de células (2560²), chunks lazy 64×64, dano, retângulos sujos, névoa, ocupação, save diferencial
  render/
    TerrainRenderer.ts    shading por pixel com jitter (sem grade visível), faces 3/4, pedregulhos com relevo,
                          cristais, decoração e emissores; cache LRU de chunks e re-render parcial por retângulo sujo
    Sprites.ts            fábrica procedural: máquinas, cristais, jogador, robôs, artefatos, ícones de itens, retratos
    Lighting.ts           escuridão em meia resolução + brilho aditivo; luzes estáticas "assadas" por chunk
    Particles.ts          detritos, faíscas, poeira, explosões, números de coleta agrupados
    Renderer.ts           composição: terreno → esteiras → objetos ordenados por y → feixe → luz → névoa → textos
  player/Player.ts        movimento com colisão, vida/energia, módulos de traje, morte com carga no local
  systems/
    Inventory.ts          Estoque Central (com taxa/min) e Mochila (peso + slots de contenção/frio/magnético)
    Mining.ts             feixe manual, remoção central de células (massa, itens, raros, lore, regeneração), explosivos, drops
    Machines.ts           energia e calor por setor, buffers setoriais, elevadores (gargalo), envio orbital,
                          esteiras com lotes, processamento, perfuradoras que comem terreno, bombas, campos,
                          complexos/mega-máquinas, desgaste, falhas, calibração
    Robots.ts             7 tipos, BFS em grade de tiles, zonas, energia/desgaste, travamentos que exigem resgate
    Sectors.ts            saga de 9 fases por setor e estado em tempo real de cada setor
    Planet.ts             MASSA PLANETÁRIA: terreno + crosta/manto por setor, trava de 99%, marcos
    Research.ts · Crafting.ts · Contracts.ts · Dialogue.ts · Lore.ts · Events.ts · Scanner.ts · Hazards.ts · Stats.ts · Save.ts
  audio/Audio.ts          síntese WebAudio: impacto por material, zumbido do perfurador, máquinas, música generativa por humor
  input/                  teclado/mouse e controles de toque (dois joysticks + botões)
  ui/                     HUD, painéis, mapa e visão orbital, minigames, cinemáticas
```

## Fluxo de dados

- **Eventos**: sistemas emitem no `EventBus` (`machine_broken`, `lore_unlocked`, `mass_milestone`…); `Game.wireEvents`
  converte em falas, banners e marcadores. Nenhum sistema conhece a UI diretamente além de chamadas de feedback.
- **Simulação** em passo fixo de 1/30 s; máquinas em sub-passo de 0,1 s; robôs pensam a cada 0,2 s.
- **Máquinas distantes** continuam simuladas (são números); o terreno só é renderizado perto da câmera.
- **Extração profunda** é abstrata (toneladas por minuto contra as reservas do setor), o que permite escala
  planetária sem simular bilhões de células.

## Performance

- Mundo: 6,5 M células em `Uint8Array` (mat + dano), chunks gerados sob demanda.
- Terreno: canvas por chunk (256 px), cache LRU (160); mineração re-renderiza só o retângulo alterado.
- Luzes estáticas (lava, cristais, glifos) são pré-renderizadas em texturas por chunk.
- Névoa de guerra: 1 px por tile, ampliada com suavização (bordas orgânicas como nas referências).
- Renderização em 1× com `image-rendering: pixelated`.

## Save

IndexedDB (fallback localStorage), autosave a cada 60 s, ao ocultar a aba e ao sair. Salva só os chunks modificados
(RLE), névoa (RLE), máquinas, robôs, setores, reservas, pesquisas, contratos, lore, estatísticas, marcadores e flags.
O mundo base é regenerado pela seed.

## Expandir

- Novo minério: `data/materials.ts` + `data/items.ts` + incluir em `ores` de um setor.
- Nova máquina: `data/machines.ts` (comportamento existente) ou novo `Behavior` em `Machines.behave/accept`.
- Novo setor/planeta: `data/sectors.ts` (posição Voronoi, perigos, reservas, fases de estabilização, quota).
- Novas falas: `data/dialogue.ts` (pools por gatilho). Novos registros: `data/lore.ts`.
