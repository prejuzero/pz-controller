# Carga da curadoria V2

Arquivos gerados por `gerar_carga.py` a partir de `../hu14-pendencias-do-curador-v2-revisado.xlsx` (assinada pela curadora em 29/10/2026). Nada entra em vigor por estes arquivos: cada um passa pela importação com prévia (pela tela ou por `pnpm piloto:carga`) e cada item gravado nasce **rascunho**, que só vale depois da aprovação da curadoria (CLAUDE.md, seção 4.3; a própria curadora pode aprovar, decisão de 11/11/2026).

| Arquivo                                                           | Onde importar                                | Conteúdo                                                                                                                                             |
| ----------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tabela-de-prazos.csv`                                            | Tabela de prazos → Importar CSV (HU15)       | 83 versões (aba 9, linhas ativas), com contagem, dobro, cálculo, marco, onde o ato é praticado, alerta, fundamento, link (aba 4) e vigência (aba 4). |
| `calendario-0N.csv`                                               | Calendário → Importar eventos por CSV (HU13) | 3.327 eventos (aba 5): 686 nacionais e de tribunal e 2.641 feriados estaduais e municipais publicados por um tribunal (só valem nos processos dele). |
| `../../../modules/calendario/domain/municipios-das-comarcas.json` | (código)                                     | Município (IBGE) de cada comarca e dos feriados municipais, para achar o município do processo pelo nome da comarca.                                 |
| `../../../modules/calendario/domain/fusos-dos-municipios.json`    | (código)                                     | Fuso do juízo de cada município das comarcas dos TJs (coluna "Fuso do juízo"; vazia = Brasília), para o fim do prazo no fuso da unidade.             |

Para regerar: `python3 docs/curadoria/carga/gerar_carga.py` (requer `openpyxl`). O código do tipo de ato é o nome do ato sem acentos, em kebab-case.

## Correspondências adotadas

- Ramos: cível → `civel`; juizado cível → `juizados`; juizado criminal → `juizado-criminal`.
- Cálculo: "Com data informada pelo advogado" e "encadeado ao vencimento de outra linha" → `data-informada`; "Automático" (inclusive "data informada quando o marco não for a publicação") → `automatico`, com o marco no campo próprio.
- Calendário: "suspensão de prazos" → `portaria`; "expediente reduzido" → `indisponibilidade`, que tem o mesmo efeito no motor (só prorroga início e vencimento, CPC, art. 224, §1º); a descrição mantém o texto da curadora.
- Sigla do tribunal sem hífen (TRT-2 → TRT2), como no cadastro de tribunais do kernel.

## Fora da carga (e por quê)

| Item                                                                | Quantos | Motivo                                                                                                    |
| ------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------- |
| Linhas da tabela sem prazo numérico (aba 9, linhas 45, 76, 90 e 91) | 4       | "Não calcula": a versão exige quantidade positiva. Sem linha na tabela, o motor deixa "a confirmar".      |
| Suspensão nacional de 20/12 a 20/01                                 | 6       | Regra do motor por ramo (RN02); no calendário, suspenderia também o penal com exceção do CPP, art. 798-A. |
| TRF2, Tribunal (2º grau)                                            | 13      | O processo não informa o grau: o calendário não separa o 2º grau das seções do RJ e do ES (aba 8).        |
| Linha de exemplo (TJXX)                                             | 1       | Fictícia.                                                                                                 |
