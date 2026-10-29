# Carga da curadoria V2

Arquivos gerados por `gerar_carga.py` a partir de `../hu14-pendencias-do-curador-v2-revisado.xlsx` (assinada pela curadora em 29/10/2026). Nada entra em vigor por estes arquivos: cada um passa pela importação com prévia e cada item gravado nasce **rascunho**, que só vale depois da aprovação de **outro** curador (quatro olhos, CLAUDE.md, seção 4.3).

| Arquivo                | Onde importar                                | Conteúdo                                                                                                                                             |
| ---------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tabela-de-prazos.csv` | Tabela de prazos → Importar CSV (HU15)       | 83 versões (aba 9, linhas ativas), com contagem, dobro, cálculo, marco, onde o ato é praticado, alerta, fundamento, link (aba 4) e vigência (aba 4). |
| `calendario-01.csv`    | Calendário → Importar eventos por CSV (HU13) | 686 eventos nacionais e de tribunal (aba 5).                                                                                                         |

Para regerar: `python3 docs/curadoria/carga/gerar_carga.py` (requer `openpyxl`). O código do tipo de ato é o nome do ato sem acentos, em kebab-case.

## Correspondências adotadas

- Ramos: cível → `civel`; juizado cível → `juizados`; juizado criminal → `juizado-criminal`.
- Cálculo: "Com data informada pelo advogado" e "encadeado ao vencimento de outra linha" → `data-informada`; "Automático" (inclusive "data informada quando o marco não for a publicação") → `automatico`, com o marco no campo próprio.
- Calendário: "suspensão de prazos" → `portaria`; "expediente reduzido" → `indisponibilidade`, que tem o mesmo efeito no motor (só prorroga início e vencimento, CPC, art. 224, §1º); a descrição mantém o texto da curadora.
- Sigla do tribunal sem hífen (TRT-2 → TRT2), como no cadastro de tribunais do kernel.

## Fora da carga (e por quê)

| Item                                                                 | Quantos | Motivo                                                                                                                              |
| -------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Linhas da tabela sem prazo numérico (aba 9, linhas 45, 76, 90 e 91)  | 4       | "Não calcula": a versão exige quantidade positiva. Sem linha na tabela, o motor deixa "a confirmar".                                |
| Suspensão nacional de 20/12 a 20/01                                  | 6       | Regra do motor por ramo (RN02); no calendário, suspenderia também o penal com exceção do CPP, art. 798-A.                           |
| Feriados estaduais publicados por um tribunal ("AC · TRT-14")        | 70      | **Decisão pendente:** o calendário não tem o nível "tribunal + UF"; como UF, valeriam para todos os tribunais do estado.            |
| Feriados municipais publicados por um tribunal ("São Paulo · TRT-2") | 2.571   | **Decisão pendente:** o calendário não tem o nível "tribunal + município"; como município, valeriam para todos os órgãos da cidade. |
| TRF2, Tribunal (2º grau)                                             | 13      | **Decisão pendente:** o calendário não separa graus do mesmo tribunal (aba 8 pede o 2º grau separado das seções do RJ e do ES).     |
| Linha de exemplo (TJXX)                                              | 1       | Fictícia.                                                                                                                           |
