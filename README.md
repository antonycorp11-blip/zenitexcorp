# ZENITEX Planetary Resources

Mineração interplanetária, logística industrial e desmontagem progressiva de um planeta inteiro.
2D em vista lateral, feito em **TypeScript + Canvas 2D + Vite**, sem engine.
Terreno, personagem, máquinas, ícones, sons e música são gerados pelo código; o HUD usa também uma atlas de arte transparente.

> "Este planeta é muito mais útil desmontado do que inteiro." — ZENA, IA Corporativa

## Rodar

```bash
npm install
npm run dev        # http://localhost:5280
npm run build      # typecheck + build de produção em dist/
```

## Publicar no Cloudflare Workers

O projeto já inclui `wrangler.jsonc` para servir o build estático de `dist/`. Esse diretório está
versionado para que o **Deploy command** atual, `npx wrangler deploy`, funcione mesmo sem um
**Build command** no Workers Builds. Ao alterar o código, execute `npm run build` e inclua as
mudanças de `dist/` no commit. Outra opção é configurar **Build command** como `npm run build`;
nesse caso, o Cloudflare recompila a cada publicação. O script `npm run deploy` também compila
antes de chamar o Wrangler.

Modo de teste: `http://localhost:5280/?dev` (atalhos F2–F8) e `?dev&auto=new` (pula título e abertura).

## Como o jogo funciona (versão em camadas)

- O planeta tem **7 camadas** (Terra → Pedra → Basalto → Cristalina → Manto → Núcleo Externo → Núcleo).
  Cada camada é um anel navegável: andar até uma extremidade leva à outra. A circunferência tem 3 vezes a largura anterior.
- A **barra da camada** (canto superior esquerdo) é a meta: tudo que você, as perfuradoras, os drones e os
  Complexos mineram enche a barra. Em 100% aparece **▼ DESCER**: a base é empacotada com 100% de reembolso
  e você recomeça no poço central da camada de baixo. O planeta encolhe.
- **Um só menu** (botão MENU / Tab) com 5 abas: Construir · Melhorias · Mochila · Missões · Mapa.
- **Melhorias** é a árvore única (perfurador, traje e tecnologias); desbloqueio instantâneo, sem estação de pesquisa.
- Sem rede de energia. Robôs são construções: Construir → Drones.
- O cartão de **META** (topo) diz a próxima coisa a fazer; o tutorial fala por ele e um anel destaca o botão certo.

## Controles

| PC | Ação |
|---|---|
| WASD (+Shift) | mover / correr |
| Mouse + botão esquerdo | mirar e usar a ferramenta (minerar, arremessar, colocar) |
| Botão direito / F | pulso de scanner · cancelar construção |
| 1–0 | barra rápida (ferramentas, consumíveis, construções fixadas) |
| E (segurar) | interagir, reparar, catalogar, resgatar |
| Tab · B · U · I · J · M | menu (última aba) · construir · melhorias · mochila · missões · mapa |
| R · X · Q | girar · desmontar · sair do modo construção |
| Construção | selecione a peça, mova a prévia com o mouse e clique em CONFIRMAR (ou Enter) |
| Esteiras | clique no início e arraste à esquerda ou à direita; R/GIRAR inverte o fluxo, inclusive em uma linha pronta; CONFIRMAR instala a linha |
| Elevador de Grãos | arraste uma coluna do fundo ao topo; alimente a peça inferior com esteira e ligue a saída superior a uma esteira ou coletor |
| Tubos de Vácuo | instale no meio de grãos soltos ou arraste uma rota vertical/horizontal; cada tubo aspira grãos próximos e transporta sem limite de distância |
| Roda | zoom · Espaço pula fala · Esc menu |

Mobile (paisagem): joystick esquerdo move, joystick direito mira e usa a ferramenta. Os botões à direita
servem para interagir e escanear; o menu ☰ à esquerda abre construção, inventário, pesquisa, setores e os
demais painéis. A barra rápida na parte inferior permite selecionar ferramentas e consumíveis.
Para construir, selecione a peça, toque ou arraste a prévia até o local e aperte CONFIRMAR.
Esteiras: toque no início, arraste até o fim e confirme — a linha inteira é instalada já apontando na direção do arrasto. GIRAR inverte o fluxo.

Logística: perfuradoras mineram sozinhas e despejam na esteira que sai delas; a esteira leva até um armazém
(só na base, até 40 tiles do Centro de Comando) ou passa por separadores para bifurcar até refinarias e trituradores.
Para levar grãos do fundo à superfície, use uma coluna de Elevadores de Grãos ou uma linha de Tubos de Vácuo alimentada por soprador.

## Documentação

- [docs/DESIGN.md](docs/DESIGN.md) — o jogo inteiro: loop, setores, saga de automação, economia, progressão, final.
- [docs/ARQUITETURA.md](docs/ARQUITETURA.md) — módulos, fluxo de dados, performance, save, como expandir.
