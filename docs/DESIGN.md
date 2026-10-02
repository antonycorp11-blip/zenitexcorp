# Design — ZENITEX Planetary Resources

## Fantasia central
Você é um minerador contratado pela Zenitex para desmontar o planeta K-37. Começa quebrando pedra à mão,
monta perfuradoras e esteiras, e termina operando máquinas planetárias até o planeta deixar de existir.

## Estrutura: 7 camadas
Terra → Pedra → Basalto → Cristalina → Manto → Núcleo Externo → Núcleo. Cada camada é um mapa (disco visto de cima),
menor e mais duro que o anterior. A **barra da camada** é a meta principal; em 100% aparece **DESCER**:
a base é empacotada com 100% de reembolso e o jogo continua no poço central da camada de baixo.
Para descer é preciso um perfurador portátil da classe da próxima camada (evita ficar preso).

| Camada | Classe | Meta (unidades) | Minérios principais | Raro | Perigo |
|---|---|---|---|---|---|
| 1 Crosta de Terra | 1 | 8.000 | Ferronox, Lumenita | Lumenita Pura | — |
| 2 Pedra | 2 | 20.000 | Ferronox, Nexolita | Nexolita Condensada | toxicidade |
| 3 Basalto | 3 | 45.000 | Pyroxis, Ferronox Denso | Pyroxis Volátil | calor, lava |
| 4 Cristalina | 4 | 90.000 | Crysalis, Lumenita | Lumenita Instável | frio, abismos |
| 5 Manto | 5 | 160.000 | Umbrium, Necrocristal | Nexolita Condensada | gravidade, radiação |
| 6 Núcleo Externo | 5 | 260.000 | Solvex, Ferronox Denso | Lumenita Pura | calor, anomalia, pressão |
| 7 Núcleo | 6 | 400.000 | Umbrium, Necrocristal | Fragmento de Núcleo | tudo |

Unidade de extração: 1 célula minerada à mão = 1; perfuradoras rendem 4 por célula; Complexos rendem por minuto.
Ritmo-alvo: Terra em ~15–20 min com 2–3 perfuradoras ligadas por esteira (medido: 22,6% em 5 min com duas).

## Metas curtas (3 por camada)
Em sequência, cada uma paga créditos e aparece no cartão de META. Ex.: Terra — instalar 3 perfuradoras;
levar 500 kg à base; melhorar para P-02. A última meta de cada camada costuma ser o perfurador exigido pela próxima.

## Economia enxuta
- Minério → **1 barra por minério** (Refinaria 2:1 automática ou à mão 3:1): Placa de Ferronox, Célula de Lumenita,
  Chip de Nexolita, Pyroxis Estabilizado, Barra Densa, Gel Criogênico, Matriz de Umbrium, Cristal de Memória, Solvex Refinado.
- Componentes intermediários não existem mais nos custos (expandidos em `data/economy.ts`).
- **Créditos**: pagos automaticamente pelo minério que chega à base (valor × 0,5). Raros minerados à mão pagam bônus na hora.
  O Terminal Orbital é opcional: vende excedente pelo valor cheio.
- Melhorias (perfurador, traje, tecnologias) são desbloqueio instantâneo com créditos + barras/minério.

## Logística e gargalos
Perfuradora → esteira (desenhada arrastando, em L, desvia de obstáculos, a ponta aponta para o armazém) → armazém
(só na base) → Estoque Central (Centro de Comando 1.200 kg/min, +1.500 por Elevador de Carga).
O cartão da camada diagnostica em linguagem de jogador o que trava a produção: máquina quebrada ou soterrada,
perfuradora parada com saída cheia, esteira travada/sem destino/uma contra a outra, armazém cheio, base no limite,
drone precisando de ajuda.

## Nunca existe automação total
Máquinas quebram e são consertadas à mão; perfuradoras esgotam a faixa à frente (e seguem perfurando em profundidade,
rendendo menos); Complexos perdem calibração; drones travam; desabamentos soterram; anomalias drenam; o último 1% é manual.

## Recompensa e surpresa
- Tela de melhoria com antes → depois; feixe muda de cor/largura por classe.
- Baús de Khelos (26–54 por camada, um terço enterrados): créditos, minério, suprimentos ou tesouro. O scanner os revela.
- Eventos com escolha: bolsão instável, carga extraviada, oferta relâmpago.
- Resumo ao esgotar a camada com recorde pessoal.

## Interface (celular primeiro)
HUD: cartão da camada (barra, DESCER, aviso de gargalo), MENU, META, recursos, minimapa, vitais, barra de ferramentas
rotulada. Menu único com 5 abas: Construir · Melhorias · Mochila · Missões · Mapa. Tutorial de 9 passos pelo cartão de META,
com anel no botão exato.

## Khelos, personagens, final
41 registros em 7 categorias; escolhas em templos (demolir/preservar). ZENA, Rocha, BR-7, Varren, Sera e KILO.
Final: Cortador Planetário + estabilizadores manuais → 100% → relatório → novo contrato (NG+).
