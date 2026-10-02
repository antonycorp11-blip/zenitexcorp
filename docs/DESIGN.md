# Design — ZENITEX Planetary Resources

## Fantasia central
A Zenitex compra **mundos mortos** — núcleo resfriado, sem tectônica, sem magnetosfera, sem biosfera, sem valor de
colonização — classificados como RECURSO PLANETÁRIO RECUPERÁVEL. Você é um minerador contratado pela Zenitex para desmontar o planeta K-37. Começa quebrando pedra à mão,
monta perfuradoras e esteiras, e termina operando máquinas planetárias até o planeta deixar de existir.

## Vista lateral com areia (referência: Sandustry)
Cada camada é um **corte vertical** do planeta: céu (ou o vazio já escavado) em cima, chão com um platô para a base
e, abaixo, rocha com estratos, cavernas, veios ricos, bolsões de líquido e ruínas de Khelos.
- Células de 4 px. Terreno fixo é minerável; **grãos soltos** caem e escorregam (areia), **blocos** só caem,
  **líquidos** escorrem e assentam. Só chunks com algo se movendo são simulados (`World.simulate`).
- O feixe do jogador solta o chão em grãos do material bruto da camada (o teor do lugar viaja no grão);
  o aspirador do traje puxa os grãos soltos para a mochila. Jogador anda, sobe degraus de areia e voa de jetpack.
- Máquinas são físicas: grãos que caem em cima entram pelo funil (se a máquina aceitar; senão empilham),
  a saída sai pela lateral (o Separador solta minerais de um lado e resíduo do outro), esteiras horizontais
  empurram os grãos apoiados nelas, e o Elevador de Grãos sobe o material do fundo dos buracos.

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

Unidade de extração: 1 célula minerada à mão = 1 unidade = 2 kg de material bruto; perfuradoras rendem 4 por célula.
A barra da camada mede massa **REMOVIDA** (minerais separados + resíduo exportado em blocos), não massa escavada
(a parte listrada da barra). Os Complexos escavam bruto; as megamáquinas (Broca Tectônica, Extrator de Manto,
Coletor, Canhão) têm processamento integrado e removem direto.

## Massa planetária bruta (o loop principal)
Minerar produz o **material bruto** da camada — Solo K-37, Rocha Bruta, Basalto Bruto, Matriz Cristalina,
Rocha de Manto, Matriz Profunda, Matéria de Núcleo — com **teor** que varia por região (campo procedural em
`data/composition.ts`; veios visíveis ×2,2). Ninguém sabe o que tem dentro até processar:
100 kg de Solo K-37 ≈ 8–15% Ferronox, 4–10% Lumenita, chance de Lumenita Pura, ~80% **resíduo**.

Cadeia: perfuradora → esteira → (preparo) → separação → minerais + resíduo → Compactador → Blocos de Massa
Planetária (100 kg) → Terminal Orbital (3.000 kg/min de blocos). Refinaria continua: mineral 2:1 → barra.

| Camada | Processamento |
|---|---|
| Terra | Processador de Solo (ressonância) |
| Pedra | Triturador → Separador Mineral |
| Basalto | Triturador Pesado → Separador (térmico) |
| Cristalina | Fragmentador Controlado → Separador (o Triturador destrói 45% do conteúdo) |
| Manto / Núcleo Externo | Descompressor → Separador / Separador Industrial |
| Núcleo | Desintegrador → Separador Industrial |

- **Analisador de Matriz** (manual, fixo na base): escolhe o bruto, um toque de frequência (72–98% de eficiência),
  centrífuga e relatório do que existia dentro. Primeira experiência de processamento do jogo.
- **Na base**, máquinas de processamento puxam o insumo do estoque e devolvem a saída nele; no campo, só por esteira.
- **Pátio de resíduo**: 2.000 kg + 1.000 por armazém. Cheio → armazéns recusam resíduo → esteiras travam →
  processadores param → perfuradoras param. Nada some: perdas de eficiência viram resíduo, e o painel de cada
  máquina mostra ENTRADA, PROCESSANDO, SAÍDA, CAPACIDADE/MIN, EFICIÊNCIA e GARGALO.
- Gargalos em cascata, com capacidades próximas: perfuradora ~360 kg/min < Processador 600 < Compactador 900
  (resíduo) < Terminal 3.000 (blocos).
- **Scanner**: nível 0 mostra o material; 1, a concentração; 2+, a composição aproximada (faixas de %),
  e sempre aponta a região de teor mais alto ao alcance.
- A Zenitex não compra bruto nem resíduo solto: só minerais, barras e blocos saem pelo terminal.

## Metas curtas
Em sequência, cada uma paga créditos e aparece no cartão de META. A Terra ensina a cadeia inteira:
processar 60 kg no Analisador → 2 perfuradoras → Processador de Solo → Compactador → exportar 2.000 kg em blocos → P-02.
Cada camada seguinte apresenta a máquina de processamento do seu material; a última meta costuma ser o perfurador
exigido pela próxima camada.

## Economia enxuta
- Mineral → **1 barra por mineral** (Refinaria 2:1 automática ou à mão 3:1): Placa de Ferronox, Célula de Lumenita,
  Chip de Nexolita, Pyroxis Estabilizado, Barra Densa, Gel Criogênico, Matriz de Umbrium, Cristal de Memória, Solvex Refinado.
- Componentes intermediários não existem mais nos custos (expandidos em `data/economy.ts`).
- **Créditos**: pagos automaticamente pelo mineral que chega à base (valor × 0,5). Raros minerados à mão pagam bônus na hora.
  Blocos exportados pagam pouco; o Terminal também vende excedente pelo valor cheio.
- Melhorias (perfurador, traje, tecnologias) são desbloqueio instantâneo com créditos + barras/minerais.

## Logística e gargalos
Perfuradora → esteira (desenhada arrastando, em L, desvia de obstáculos) → armazém (só na base) ou máquina de
processamento → Estoque Central (Centro de Comando 1.200 kg/min, +1.500 por Elevador de Carga). Lotes de 10 kg
carregam o teor; minerais e resíduo se revezam nas saídas das máquinas. O cartão da camada diagnostica o gargalo
mais adiante na linha: pátio cheio, blocos sem terminal, processador travado, máquina errada para o material,
bruto parado sem processador, perfuradora parada, esteira travada, armazém cheio, drone precisando de ajuda.

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
