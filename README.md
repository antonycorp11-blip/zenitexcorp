# ZENITEX Planetary Resources

Mineração interplanetária, logística industrial e desmontagem progressiva de um planeta inteiro.
2D top-down 3/4, feito em **TypeScript + Canvas 2D + Vite**, sem engine e sem assets externos:
terreno, sprites, retratos, ícones, sons e música são todos gerados proceduralmente.

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

## Controles

| PC | Ação |
|---|---|
| WASD (+Shift) | mover / correr |
| Mouse + botão esquerdo | mirar e usar a ferramenta (minerar, arremessar, colocar) |
| Botão direito / F | pulso de scanner · cancelar construção |
| 1–0 | barra rápida (ferramentas, consumíveis, construções fixadas) |
| E (segurar) | interagir, reparar, catalogar, resgatar |
| Tab · B · U · K · G · Y · J · L · M | inventário/fabricação · construção · melhorias · pesquisa · setores · robôs · contratos · arquivo · mapa |
| R · X · Q | girar · desmontar · sair do modo construção |
| Construção | selecione a peça, mova a prévia com o mouse e clique em CONFIRMAR (ou Enter) |
| Esteiras | clique no início e arraste até o fim (faz curva em L); CONFIRMAR instala a linha inteira |
| Roda | zoom · Espaço pula fala · Esc menu |

Mobile (paisagem): joystick esquerdo move, joystick direito mira e usa a ferramenta. Os botões à direita
servem para interagir e escanear; o menu ☰ à esquerda abre construção, inventário, pesquisa, setores e os
demais painéis. A barra rápida na parte inferior permite selecionar ferramentas e consumíveis.
Para construir, selecione a peça, toque ou arraste a prévia até o local e aperte CONFIRMAR.
Esteiras: toque no início, arraste até o fim e confirme — a linha inteira é instalada já apontando na direção certa.

Logística: perfuradoras mineram sozinhas e despejam na esteira que sai delas; a esteira leva até um armazém
(só na base, até 40 tiles do Centro de Comando) ou passa por separadores para bifurcar até refinarias e trituradores.

## Documentação

- [docs/DESIGN.md](docs/DESIGN.md) — o jogo inteiro: loop, setores, saga de automação, economia, progressão, final.
- [docs/ARQUITETURA.md](docs/ARQUITETURA.md) — módulos, fluxo de dados, performance, save, como expandir.
