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

Depois da revisão: a tabela de prazos entra pela tela de aprovação (HU15, quatro olhos), o calendário vira dado versionado do módulo calendário e os casos viram as fixtures assinadas do motor (PZ-135). A planilha revisada volta para esta pasta com a versão no nome.

Gerada por script a partir do conteúdo citado; para mudar, edite a planilha e registre a versão na aba Leia-me.
