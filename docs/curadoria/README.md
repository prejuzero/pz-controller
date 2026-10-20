# Curadoria jurídica

Material de revisão para o advogado curador (CLAUDE.md, seções 4 e 15). Nada aqui é regra em vigor: só vale depois de aprovado e convertido em dados versionados e casos de teste.

## HU14 · Motor de prazos: [hu14-pacote-do-curador.xlsx](hu14-pacote-do-curador.xlsx)

| Aba              | O que o curador faz                                                                                               |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| Leia-me          | Instruções, fontes admitidas e assinatura                                                                         |
| Regras do motor  | Aprova ou corrige RN01–RN08, o fim do prazo pelo fuso do juízo e o prazo do ato judicial                          |
| Questões         | Responde 12 pontos que a Especificação deixa em aberto e que mudam o cálculo                                      |
| Tabela de prazos | Confere os 6 exemplos da Especificação e acrescenta os atos do lançamento (dispositivo, link, vigência)           |
| Calendário       | Define tribunais e comarcas da fase inicial e os atos de feriados, recessos e suspensões                          |
| Casos de teste   | Para 27 cenários (cada RN, recesso, feriados, fuso, bissexto, vigência), escolhe datas reais e calcula o esperado |

Células amarelas são do curador. A equipe preencheu só o que está na Especificação (seção 3) e no CLAUDE.md (seção 4.5), sempre marcado "a conferir"; datas esperadas ficam em branco para o curador calcular.

### Revisões

| Versão          | Arquivo                                                                            | Situação                                                                                                                                                                                                                               |
| --------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1 (08/10/2026) | [hu14-pacote-do-curador-v1-revisado.xlsx](hu14-pacote-do-curador-v1-revisado.xlsx) | Assinada pela curadora. Aprovou RN01, RN03–RN08 e o fim do prazo pelo fuso do juízo; respondeu às 12 questões; tabela com ~100 atos sem link e vigência; calendário e casos de teste em branco.                                        |
| V2 (pendências) | [hu14-pendencias-do-curador-v2.xlsx](hu14-pendencias-do-curador-v2.xlsx)           | Só o que falta: 4 contradições (penal, prazo do texto x tabela, suspensão penal, fundamento da ciência pelo portal), 6 questões novas, links e vigência das regras, pendências por linha da tabela, calendário e os 27 casos de teste. |

Enquanto a V2 não volta, o motor é implementado para as regras aprovadas na V1, com testes sobre calendários fictícios. Nenhuma regra vai para produção sem os casos de teste assinados (aba 6 da V2) e sem link e vigência (abas 3 e 4).

Depois da revisão: a tabela de prazos entra pela tela de aprovação (HU15, quatro olhos), o calendário vira dado versionado do módulo calendário e os casos viram as fixtures assinadas do motor (PZ-135). A planilha revisada volta para esta pasta com a versão no nome.

Gerada por script a partir do conteúdo citado; para mudar, edite a planilha e registre a versão na aba Leia-me.
