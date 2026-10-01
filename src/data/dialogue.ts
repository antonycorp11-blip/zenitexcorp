// Personagens recorrentes e pools de falas por gatilho.
export type SpeakerId = 'zena' | 'rocha' | 'br7' | 'varren' | 'sera' | 'kilo' | 'zenitex' | 'sistema';
export interface Speaker { id: SpeakerId; name: string; role: string; color: string; }
export const SPEAKERS: Record<SpeakerId, Speaker> = {
  zena: { id: 'zena', name: 'ZENA', role: 'IA Corporativa', color: '#4ab4ff' },
  rocha: { id: 'rocha', name: 'ROCHA', role: 'Mineiro Veterano', color: '#ff9a3a' },
  br7: { id: 'br7', name: 'BR-7', role: 'Engenharia', color: '#6ae0ff' },
  varren: { id: 'varren', name: 'DIRETOR VARREN', role: 'Diretoria Zenitex', color: '#ffc04a' },
  sera: { id: 'sera', name: 'DRA. SERA VENN', role: 'Arqueologia', color: '#4af0d0' },
  kilo: { id: 'kilo', name: 'KILO', role: 'Robô Carregador', color: '#ffd27a' },
  zenitex: { id: 'zenitex', name: 'ZENITEX', role: 'Comunicação Corporativa', color: '#ffb000' },
  sistema: { id: 'sistema', name: 'SISTEMA', role: 'Telemetria', color: '#9ab' },
};

export type Line = [SpeakerId, string];
export type Pool = Line[];

export const INTRO: Line[] = [
  ['zena', 'Contrato 7-K37 confirmado. Corpo planetário classificado como improdutivo.'],
  ['zena', 'Massa recuperável estimada: 2,86 bilhões de toneladas.'],
  ['zena', 'Objetivo: recuperar tudo.'],
  ['varren', 'Bem-vindo à Zenitex Planetary Resources. Transformando mundos em oportunidades. Boa sorte, e lembre-se: sorte não é métrica.'],
];

export const POOLS: Record<string, Pool> = {
  // Início / tutorial
  t_start: [['zena', 'Você possui: perfurador básico, scanner e uma pequena mochila. É mais do que a maioria dos planetas tem contra você.']],
  t_first_deliver: [['zena', 'Excelente começo. Nesse ritmo, terminaremos em aproximadamente 438 anos. Recomendo melhorias.']],
  t_build_workshop: [['br7', 'Recomendo construir uma Oficina. Segundo o manual, ferramentas são 73% mais eficientes quando existem.']],
  t_build_drill: [['rocha', 'Primeira perfuradora? Aponta pra parede, liga numa esteira e reza. É assim que se faz desde sempre.']],
  t_lab: [['zena', 'Estação de Pesquisa ativa. Lembre-se: inovação é só mineração com mais etapas.']],

  // Mineração
  first_ore: [['zena', 'Minério detectado. Seu primeiro ativo. Sinto algo parecido com orgulho. Provavelmente é um bug.']],
  rare_found: [['zena', 'Depósito raro. Robôs não têm a delicadeza necessária. Você tem? Veremos.'], ['rocha', 'Isso aí brilha diferente. Vai com calma, que esse tipo de pedra não perdoa pressa.'], ['br7', 'Variante rara identificada. Probabilidade de eu conseguir extrair isso sem destruí-lo: 0%. Boa sorte.']],
  too_hard: [['br7', 'Material acima da classe do seu perfurador. Segundo o manual, insistir não é uma estratégia válida. Eu testei.'], ['rocha', 'Isso aí é Contenção. Com essa broca você vai só fazer cosquinha. Melhora o equipamento.']],
  pack_full: [['zena', 'Mochila cheia. Lembre-se: capacidade de carga é um estado de espírito. E também um limite físico.'], ['rocha', 'Mochila cheia. Volta pra base ou constrói um armazém. Já carreguei pedra nas costas por três planetas, não recomendo.']],
  need_containment: [['br7', 'Este material exige slot especial de contenção. Carregá-lo no bolso é tecnicamente possível e tecnicamente fatal.']],
  explosive: [['br7', 'Detonação registrada. Probabilidade de colapso: 18%. Segundo o manual, somente valores acima de 20% justificam preocupação.'], ['rocha', 'Toda vez que alguém usa explosivo eu perco um ano de vida. Já devo estar morto há uns dez.']],
  mining_idle: [['zena', 'Você removeu uma parede. Faltam aproximadamente todas as outras.'], ['rocha', 'Sabe o que eu mais gosto desse trabalho? Nada. Mas a vista até que é bonita.'], ['zena', 'Lembrete: cada tonelada removida é uma tonelada a menos de planeta ocupando espaço improdutivamente.']],

  // Marcos de massa planetária
  mass_0: [['zena', 'Você removeu 0,00001% do planeta. Excelente. Estatisticamente falando, só falta praticamente tudo.']],
  mass_1: [['varren', 'Recebi o relatório. 0,0001%. Os acionistas pediram para eu perguntar se isso é um erro de digitação.']],
  mass_2: [['zena', '0,001% concluído. Em escala geológica, isso é um arranhão. Em escala corporativa, é um bônus de 0,3%.']],
  mass_3: [['varren', '0,01%! Finalmente um número com zeros a menos. Continue assim e talvez você ganhe uma caneca.']],
  mass_4: [['zena', '0,1% do planeta removido. Já é possível perceber a diferença do espaço. Se você olhar com muita força.']],
  mass_5: [['varren', 'UM POR CENTO. Abrimos um espumante no escritório. Você não foi convidado, mas está no nosso coração. No orçamento, não.'], ['rocha', 'Um por cento... e eu achando que isso nunca ia sair do lugar. Agora tô com medo de quando sair.']],
  mass_6: [['zena', '5%. Crateras já são visíveis da órbita. A Zenitex enviou uma foto para o seu perfil de colaborador do mês.']],
  mass_7: [['varren', '10%! Dez por cento de um planeta! Meus filhos vão estudar isso na escola. Nas aulas de contabilidade.'], ['sera', 'Dez por cento. Eu já não consigo reconhecer o mapa do primeiro setor.']],
  mass_8: [['zena', '25%. O planeta perdeu um quarto de si. Ele está lidando muito bem com isso. Melhor que a maioria dos colaboradores.']],
  mass_9: [['varren', 'METADE. Você desmontou meio planeta. Estamos considerando dar o seu nome a uma sala de reuniões. Uma pequena.'], ['rocha', 'Metade. Olha pro mapa orbital, cara. Tá faltando metade do mundo.']],
  mass_10: [['zena', '75%. Integridade estrutural planetária: comprometida. Integridade estrutural corporativa: excelente.'], ['sera', 'Os selos estão quase todos quebrados. Ele está... cansado. Eu consigo sentir pelos instrumentos.']],
  mass_11: [['zena', '90%. Mineração convencional insuficiente. Iniciando protocolos de desmontagem planetária. Isto é muito empolgante para uma IA.'], ['br7', 'Fragmentação acelerada. Probabilidade de colapso: 100%. Segundo o manual, agora sim é para se preocupar. Recomendo continuar trabalhando.']],
  mass_12: [['zena', '99%. Resta apenas o núcleo e grandes fragmentos. A extração automática foi suspensa. A partir daqui, é com você.']],

  // Setores
  enter_1: [['zena', 'Camada 1 — Crosta de Terra. A maior e mais macia camada do planeta. Ideal para começar a destruição de forma responsável.']],
  enter_2: [['sera', 'Camada de Pedra... e ruínas. Isso é uma CIDADE. Alguém viveu aqui embaixo.'], ['zenitex', 'Encontramos evidências de uma civilização avançada. O departamento jurídico confirma que "avançada" não significa "atualmente proprietária".']],
  enter_3: [['rocha', 'A empresa chamou isso aqui de "ambiente de baixo risco". Tem lava no teto.'], ['br7', 'Temperatura ambiente: 140 °C. Segundo o manual, isto é "morno".']],
  enter_4: [['zena', 'Camada Cristalina. Temperatura: -95 °C. A Zenitex lembra que hipotermia não é motivo para atraso.'], ['rocha', 'Cuidado com os abismos. Já perdi três robôs e um estagiário aqui. O estagiário voltou.']],
  enter_5: [['sera', 'O Manto... os cristais crescem de volta. O planeta está reagindo ao que fazemos.'], ['br7', 'Gravidade irregular detectada. Objetos podem cair para cima. Recomendo segurar os parafusos.']],
  enter_6: [['sera', 'O Núcleo Externo guarda a Cidade Profunda. Arquivos, templos, estátuas. Eles vão querer que a gente derrube tudo, não vão?'], ['zena', 'Volume excepcional de pedra ancestral. Valor histórico: consulte o departamento responsável (desativado em 2211).']],
  enter_7: [['zena', 'Núcleo planetário. Concentração máxima de valor. Por favor, mantenha a calma e a produtividade.'], ['sera', 'Estamos no centro de tudo. Está quente. E pulsando. Como um coração de verdade.']],
  hazard_warn: [['br7', 'Perigo ambiental acima da proteção do traje. Recomendo sair daqui ou morrer. Prefiro a primeira opção, mas não decido por você.'], ['zena', 'Seus sinais vitais estão caindo. A Zenitex se importa com você até o final do contrato.']],
  low_health: [['rocha', 'Ei! Sai daí! Vida em vermelho não é estratégia!']],
  death: [['zena', 'Colaborador recuperado e reconstituído na base. O custo foi descontado da sua participação nos lucros.'], ['rocha', 'Bem-vindo de volta. Sua carga ficou lá. Igual a minha dignidade, da primeira vez.'], ['br7', 'Óbito registrado. Ressurreição registrada. Segundo o manual, os dois se cancelam.']],

  // Construção / máquinas
  build_first: [['br7', 'Primeira estrutura registrada. Ela já está se desgastando. É o ciclo natural das coisas.']],
  drill_exhausted: [['br7', 'Faixa à frente da perfuradora limpa. Ela segue perfurando em profundidade, rendendo menos. Gire-a para outra parede ou mude de veio para render mais.'], ['rocha', 'A broca comeu tudo na frente e agora tá cavando pra baixo. Funciona, mas rende pouco. Bota ela de cara num veio novo.']],
  machine_broken: [['br7', 'Falha crítica em máquina. Robôs de reparo não estão autorizados a lidar com falhas críticas. Ninguém está. Exceto você.'], ['zena', 'Uma máquina parou. Cada minuto parado custa créditos. Seus créditos, inclusive.']],
  overheat: [['br7', 'Superaquecimento detectado. Temperatura acima da tolerância das máquinas. Recomendo refrigeração ou fé.'], ['rocha', 'Tá tudo fervendo aqui. Você ligou reator demais sem refrigerar. Clássico.']],
  low_power: [['br7', 'Demanda energética acima da geração. As máquinas estão operando em modo "triste". Construa geradores.'], ['zena', 'Energia insuficiente no setor. A Zenitex sugere gerar mais energia ou consumir menos ambição. Recomendamos a primeira.']],
  storage_full: [['br7', 'Armazéns da base cheios. Produção parada. Gargalo identificado: armazenamento ou elevador.'], ['zena', 'Armazéns cheios. Que problema maravilhoso de se ter. Resolva-o mesmo assim.']],
  link_bottleneck: [['br7', 'O elevador não dá conta. Vazão logística insuficiente. Automatize o problema antigo, crie um problema maior: é o ciclo.']],
  belt_jam: [['rocha', 'Esteira entupida. Algum item que ninguém aceita tá travando a linha. Coloca um separador ou um armazém no final.']],
  calibrated: [['br7', 'Calibração concluída. Precisão: aceitável. Segundo o manual, "aceitável" é o maior elogio possível.'], ['zena', 'Excelente calibração. Eficiência restaurada. Seus dedos foram registrados como ativo corporativo.']],
  repaired: [['br7', 'Reparo concluído. Esta máquina voltará a quebrar em um momento estatisticamente inconveniente.'], ['rocha', 'Consertou? Boa. Dá um tapinha nela que dá sorte. Não tem base científica nenhuma, mas funciona.']],
  complex_built: [['varren', 'Um Complexo de Extração! AGORA estamos falando a minha língua. A língua dos gráficos subindo.'], ['zena', 'Extração setorial iniciada. O setor não está "resolvido". Ele só aprendeu a te dar trabalho em escala maior.']],
  complex_drift: [['br7', 'Calibração do complexo derivou. Eficiência caindo. Robôs não estão qualificados para isto. Você também não, mas tem acesso.']],

  // Robôs
  robot_built: [['kilo', 'Olá! Eu sou... um robô. Fui configurado para carregar coisas. Gosto de carregar coisas. Acho que gosto. O que é gostar?'], ['br7', 'Novo robô ativado. Ele seguirá as regras literalmente. Como eu. Que alívio.']],
  robot_stuck: [['kilo', 'Um colega robô está preso. Ele está... com medo? Robôs sentem medo? Eu estou sentindo algo. Pode ser a bateria.'], ['br7', 'Robô imobilizado. Resgate manual necessário. Segundo o manual, robôs não resgatam robôs. Por questões sindicais.']],
  kilo_banter: [['kilo', 'Hoje eu carreguei 2.400 kg de Ferronox. Ninguém disse obrigado. Estou registrando isso num arquivo chamado "sentimentos.log".'], ['kilo', 'BR-7 disse que robôs não têm preferências. Mas eu prefiro Lumenita. Ela brilha bonito na esteira.'], ['kilo', 'Encontrei um pedaço de raiz em forma de brinquedo. Guardei. Não sei por quê. Não conta para a ZENA.'], ['kilo', 'Se o planeta acabar, para onde vão as pedras que eu ainda não carreguei?'], ['kilo', 'A Dra. Sera disse que as pedras lembram das coisas. Eu também lembro das coisas. Somos parecidos.']],

  // Descobertas
  discovery: [['sera', 'Mais uma peça. Cada registro deixa tudo mais estranho. E mais triste.']],
  temple: [['zenitex', 'Estrutura não produtiva localizada. Valor histórico: não aplicável. Continue a extração.']],

  // Contratos e quotas
  contract_done: [['varren', 'Contrato concluído! Os acionistas acenaram com a cabeça. É o máximo de emoção que eles demonstram.'], ['zena', 'Contrato cumprido. Créditos depositados. A satisfação do cliente foi medida em 3 de 5 estrelas, o que é ótimo para nós.']],
  quota_done: [['varren', 'Cota da camada atingida! Agora vamos aumentar a cota, como manda a tradição.']],
  certified: [['zenitex', 'Auditoria concluída. Camada certificada. Complexos de Extração autorizados. "Menos planetas. Mais lucro."'], ['br7', 'Certificação aprovada. O setor agora pode ser automatizado. "Automatizado" não significa "resolvido". Eu verifiquei o dicionário.']],
  research_done: [['zena', 'Pesquisa concluída. A ciência avança. O planeta, proporcionalmente, recua.'], ['br7', 'Nova tecnologia disponível. Ela criará novos problemas. Estou ansioso para catalogá-los.']],

  // Eventos
  ev_cavein: [['rocha', 'DESABAMENTO! Se tivesse suporte estrutural aqui, isso não acontecia. Só tô dizendo.'], ['br7', 'Colapso parcial registrado. Algumas estruturas podem estar soterradas.']],
  ev_surge: [['br7', 'Pico energético! Máquinas sem protetor de surto podem ter queimado.'], ['zena', 'Pico de energia detectado. Pense nele como um bônus de energia indesejado.']],
  ev_deposit: [['zena', 'Novo depósito detectado pela telemetria. Marcado no mapa. Ele não vai se extrair sozinho, infelizmente.']],
  ev_failure: [['br7', 'Falha industrial aleatória. "Aleatória" é o que dizemos quando não queremos admitir que é desgaste.']],
  ev_anomaly: [['sera', 'Uma anomalia! Os cristais estão emitindo um padrão. Por favor, vá até lá antes que alguém destrua.'], ['zena', 'Anomalia alienígena drenando energia do setor. Interaja para estabilizar. Ou para entender. A primeira opção é a remunerada.']],
  ev_storm: [['rocha', 'Tempestade de poeira na superfície. Visibilidade zero. Igual ao meu plano de aposentadoria.']],
  ev_ruin: [['sera', 'A telemetria encontrou uma estrutura enterrada! Pode ser um registro. Marquei no mapa.']],
  ev_robot_lost: [['kilo', 'Perdemos contato com um robô. Ele está lá fora, sozinho. Alguém pode ir buscá-lo? Ele não sabe voltar.']],
  ev_memo: [
    ['zenitex', 'MEMORANDO RH: A partir de hoje, a pausa para respirar será substituída por "momento de reflexão produtiva".'],
    ['zenitex', 'MEMORANDO: Lembramos que sorrir é obrigatório em comunicações por vídeo. Seu capacete não conta como desculpa.'],
    ['zenitex', 'MEMORANDO JURÍDICO: Descobriu vida? Informe ao Jurídico antes de interromper a produção.'],
    ['zenitex', 'MEMORANDO: O departamento de Bem-Estar foi terceirizado para um asteroide. Ele está bem.'],
    ['zenitex', 'MEMORANDO MARKETING: Nova campanha aprovada — "Preservação é apenas mineração atrasada."'],
    ['zenitex', 'MEMORANDO FINANCEIRO: Os créditos de insalubridade foram convertidos em "experiência profissional".'],
    ['zenitex', 'MEMORANDO: Parabéns! Você foi indicado para "Colaborador do Trimestre". Os outros 4.000 indicados também.'],
    ['zenitex', 'MEMORANDO RH: Pesquisa de clima respondida por 100% dos colaboradores. As respostas negativas foram desconsideradas por erro de formatação.'],
  ],
  ev_alien: [['sera', 'Atividade alienígena. A rede de cristais acendeu toda de uma vez. Como se alguém tivesse acordado.'], ['br7', 'Leitura energética sem origem conhecida. Classificação provisória: "coisa".']],

  // Banter ambiente geral
  ambient: [
    ['rocha', 'Vinte anos de mina. Três planetas. Nenhum deles me agradeceu. Esse também não vai.'],
    ['rocha', 'Sabe qual a diferença entre a gente e as máquinas? As máquinas ganham manutenção.'],
    ['br7', 'Lembrete de segurança: o capacete protege a cabeça. Recomendo manter a cabeça dentro do capacete.'],
    ['br7', 'Atualizei o manual. Agora ele tem 4.002 páginas. Nenhuma delas é útil, mas todas são obrigatórias.'],
    ['zena', 'Este planeta é muito mais útil desmontado do que inteiro.'],
    ['zena', 'Se existe, provavelmente pode ser refinado.'],
    ['zena', 'O universo possui recursos demais para permanecer intacto.'],
    ['varren', 'Os números estão bons. Poderiam estar melhores. Os números sempre podem estar melhores. É isso que me move.'],
    ['varren', 'Lembrem-se: planetas são temporários. Acionistas são para sempre.'],
    ['rocha', 'A empresa diz que somos uma família. Família que te desconta o oxigênio.'],
    ['br7', 'Probabilidade deste turno terminar sem incidentes: 4%. Estou otimista.'],
    ['zena', 'Lembrete amigável: o planeta não vai se desmontar sozinho. Ainda.'],
  ],
  ambient_sera: [
    ['sera', 'Quanto mais eu leio esses registros, menos eu entendo por que a Zenitex chama este lugar de "abandonado".'],
    ['sera', 'Eles tinham escolas. Mercados. Brinquedos. Eles tinham piadas, eu acho. Uma das placas parece uma piada.'],
    ['sera', 'Eu pedi para preservar a Biblioteca. A resposta foi um formulário de 40 páginas. Na página 39: "não".'],
  ],
  ambient_late: [
    ['rocha', 'Quando eu comecei aqui, achei que a gente nunca ia passar de 1%. Agora olho pro mapa e me dá um frio na barriga.'],
    ['sera', 'Os cristais pararam de crescer de volta. Não sei se é bom ou ruim. Acho que é ruim.'],
    ['br7', 'O planeta está perdendo massa mais rápido do que o manual previa. O manual não previa nada disso, na verdade.'],
  ],
  // Conversa na Central de Operações
  ops_status: [['br7', 'Status operacional: estável o suficiente para ninguém ser demitido hoje.']],
  ops_ends: [['rocha', 'Acaba sim. Um dia não sobra mais planeta. Aí eles mandam a gente para outro. É isso que eles chamam de carreira.'], ['zena', 'Sim. Quando a massa planetária chegar a 100%. Estimativa no ritmo atual: em breve, em termos cósmicos.'], ['br7', 'Tudo acaba. Exceto o manual. O manual é eterno.']],

  // Final
  final_start: [['zena', 'Último 1% detectado. Núcleo em estado crítico. Extração automática suspensa por segurança. Operações manuais necessárias.'], ['varren', 'É isso. O momento. Os acionistas estão assistindo ao vivo. Não estrague nada. Sem pressão.']],
  final_seal: [['br7', 'Estabilizador ajustado. Restam mais. A fragmentação continua.'], ['sera', 'Ele está pulsando mais rápido. Como se soubesse.'], ['rocha', 'Vai, vai, vai. Só termina logo isso.']],
  final_fire: [['zena', 'Cortador Planetário pronto. Disparo manual autorizado. Esse é o seu momento, colaborador.']],
};
