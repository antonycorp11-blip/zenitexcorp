# Design — ZENITEX Planetary Resources

## Fantasia central
Começar minerando pedras alienígenas → administrar uma operação → industrializar setores → desmontar continentes →
perceber que destruiu um planeta inteiro. A HUD mostra desde o primeiro segundo **MASSA PLANETÁRIA EXTRAÍDA**
(e a restante, 99,99…%).

## Regra absoluta: nunca existe automação total
Cada automação resolve o problema antigo e cria um maior. O jogador sempre tem trabalho manual:

| Fonte de trabalho manual | Onde |
|---|---|
| Máquinas quebram (desgaste, falhas aleatórias, picos de energia, explosões) — robôs não consertam falhas críticas | `Machines.wear`, `Events` |
| Perfuradoras esgotam o veio e precisam ser realocadas/giradas | `Machines.drill` |
| Complexos e mega-máquinas perdem calibração (piso de 25%) — só o minigame manual restaura | `Machines.deep`, `Minigames.calibration` |
| Superaquecimento de setor (reatores Pyroxis) → máquinas param até calibrar | `Machines.wear` |
| Desabamentos soterram máquinas e prendem robôs (suportes previnem) | `Events.caveIn` |
| Robôs ficam presos, quebram ou ficam sem energia | `Robots` |
| Variantes raras só saem na mão; automação destrói artefatos expostos | `Mining`, `Lore` |
| Anomalias drenam energia até serem estabilizadas no local | `Events` |
| Auditoria Z-77 (formulário burocrático), quotas, contratos com prazo | `Sectors`, `Contracts` |
| Canhão de Matéria é disparado à mão e recarregado no local; o último 1% é uma operação manual | `Panels`, `Game.startFinal` |

## Escala (cadeia de problemas)
Mochila → depósito → perfuradora + esteiras → gargalo da esteira → refinaria → energia → reator Pyroxis →
superaquecimento → refrigeração → buffer setorial cheio → elevadores → envio orbital → complexos →
calibração → manto → brocas tectônicas → plataformas orbitais → canhão → cortador planetário.

## Setores (12)
| # | Setor | Classe | Perigos | Estabilização (fase 4) |
|---|---|---|---|---|
| 01 | Planalto de Khelos | 1 | — | 2 suportes |
| 02 | Bosque Verdânio | 1 | toxicidade leve | 2 filtros de ar |
| 03 | Campos Pyrox | 2 | calor, lava | 3 refrigeradores |
| 04 | Abismo Crysalis | 2 | frio, abismos | 2 aquecedores + 4 plataformas |
| 05 | Pântano Nexolítico | 3 | toxicidade, corrosão, ácido | 2 bombas + 2 filtros |
| 06 | Ruínas de Var-Ka | 3 | anomalias | 3 suportes |
| 07 | Mar Subterrâneo | 3 | pressão, água | 3 bombas + 6 plataformas |
| 08 | Campo Gravítico | 4 | gravidade (deriva) | 3 estabilizadores |
| 09 | Necrocristais | 4 | radiação, anomalia, regeneração | 3 inibidores |
| 10 | Cinturão do Núcleo | 5 | calor, pressão | 3 refrigeradores + 4 suportes |
| 11 | Cidade Profunda | 5 | anomalia, radiação | 3 escudos de radiação |
| 12 | Coração Planetário | 6 | tudo | estabilizador + escudo + refrigeração |

A classe é o nível de perfurador necessário para atravessar a **Rocha de Contenção** entre setores e minerar a rocha local.

## Saga de automação (9 fases por setor)
1 Reconhecimento (explorar 10% + 3 varreduras) · 2 Infraestrutura (gerador, armazém, elevador) ·
3 Extração experimental (perfuradora, 5 esteiras, 200 kg, 1 robô) · 4 Estabilização (tabela acima) ·
5 Logística (kg transferidos ao Estoque Central) · 6 Quota corporativa (envio orbital) ·
7 Calibração manual (3 minigames) · 8 Certificação (nada abaixo de 50%, energia 100%, formulário Z-77) ·
9 Automação setorial (Complexo de Extração Profunda). Depois disso o setor continua gerando problemas.

## Economia
- Itens em kg. Minério → (Triturador: britado ×2) → Refinaria → refinados → Fundidor Alienígena (pares complementares:
  Lumenita+Nexolita = Núcleo Sináptico, Pyroxis+Ferronox = Liga Termorresistente, Crysalis+Verdânio = Refrigerante
  Biológico, Umbrium+Lumenita = Célula Negra, Solvex+Ferronox = Polímero, Ferronox Denso+Cristal de Memória = Liga Ancestral)
  → componentes (Oficina manual ou Sintetizador automático).
- Buffer do setor (armazéns/elevadores) sobe ao Estoque Central na vazão dos elevadores (600 → 6.000 → 40.000 → 300.000 kg/min).
- Créditos vêm do envio orbital (fila de prioridade configurável), contratos, fases e descobertas; gastos em pesquisa.

## Massa planetária (2,86 bilhões de t)
- Terreno explorável: massa real por célula (perfuradoras contam ×20 — perfuram uma coluna).
- Reserva profunda por setor (2% a 25% do planeta): 65% crosta (Complexos Mk I–V: 400 → 3.000 → 20.000 → 120.000 → 600.000 t/min),
  35% manto (Broca Tectônica 1,8 Mt/min, Extrator de Manto 5 Mt/min, +50% por Uplink Orbital, Coletor a partir de 50%,
  Canhão de Matéria 30 Mt por disparo manual).
- A extração automática para em **99%**; o último 1% exige o Cortador Planetário e 4 estabilizadores ajustados à mão.
- Curva-alvo: ~0,001% nas primeiras horas, 0,1% → 1% → 10% com aceleração exponencial; manto domina após ~65%.

## Civilização de Khelos
41 registros em 7 categorias (História, Tecnologia, Religião, Biologia, Sociedade, Planeta, Últimos Dias), revelados
em ordem por setor. Cinco teorias de Sera (praga, êxodo, guerra, transcendência, semente). Templos pedem uma escolha:
demolir (créditos) ou preservar (registrado como "atraso operacional"). O relatório final conta preservados, demolidos
e destruídos pela automação.

## Personagens
ZENA (IA corporativa, educada e indiferente), Rocha (veterano sarcástico), BR-7 (engenheiro literal),
Diretor Varren (produtividade), Dra. Sera Venn (arqueóloga cada vez mais fascinada), KILO (o primeiro robô carregador,
que desenvolve personalidade). Falas curtas e não bloqueantes, centenas por gatilho.

## Final e NG+
99% → alarmes → estabilizadores → disparo → "PLANETARY EXTRACTION: 100%" → "ASSET DEPLETED." → mensagem Zenitex →
relatório completo → **Novo contrato planetário**: nova seed, massa ×1,5, pesquisas corporativas mantidas.
