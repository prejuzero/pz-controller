# modules/prazos

Módulo prazos, gerado por `pnpm gen:module` no desenho hexagonal (ADR-001).

| Camada         | Conteúdo                                              |
| -------------- | ----------------------------------------------------- |
| `domain/`      | Regras puras; importa só `@pz/kernel`                 |
| `application/` | Casos de uso e portas; sem Prisma, HTTP nem SDKs      |
| `infra/`       | Implementações das portas (repositórios, adaptadores) |
| `index.ts`     | Única API pública do módulo                           |

## Tabela de prazos por ato (HU15)

Área de alto risco (CLAUDE.md, seção 15): mudanças exigem 2 revisores humanos e o curador.

- **Taxonomia** (`tipo_ato`, global): código único (`kebab-case`) usado por regras rápidas, IA e portal.
- **Versões** (`tabela_prazo`, global): ato, ramo, dias, unidade, fundamento, link da fonte oficial e vigência. Nascem `rascunho` e só valem `aprovado` por outra pessoa (quatro olhos, também por `CHECK` no banco). Versão aprovada é imutável (trigger); alteração é nova versão.
- **Seleção** pela vigência na data do ato (CPC, art. 14): entre as aprovadas vigentes, o início mais recente; no mesmo início, a versão mais nova.
- **`ResolverPrazoAplicavel`** devolve `{ aplicado, tabela, texto, fundamento, versaoTabela, avisos }`, nunca uma data (datas só no motor, ADR-007). O prazo do texto prevalece e os dois são devolvidos. Sem versão para o ato, usa a versão aprovada de `manifestacao-generica` (CPC, art. 218, §3º) com aviso; sem ela, `aplicado: null` ("a confirmar").
- Propor, aprovar e cadastrar ato rodam na transação do tenant `plataforma` do curador, com auditoria e evento `TabelaPrazoAprovada` na mesma transação (adendo ao ADR-003).
- **Sem conteúdo jurídico no código:** a taxonomia e a tabela reais entram só pelo fluxo de aprovação do curador. Os testes usam dados fictícios marcados (`teste/ficticios.ts`).
- **Campos do motor** em cada versão: contagem (úteis ou corridos; ausente na proposta, a do ramo), política de dobro (`verificar` por padrão), cálculo (`automatico`, `data-informada` ou `nao-calcula`), marco inicial, onde o ato é praticado e alerta ao advogado (curadoria V2, aba 9). Entram no conteúdo imutável da versão aprovada.
- **Importação por CSV** (`ImportarTabelaDePrazos`, `POST /v1/admin/tabela-prazos/importacao`): prévia sem gravar; tudo ou nada; cadastra os tipos de ato que faltam com o nome da linha e propõe cada linha como rascunho, com auditoria. A aprovação continua uma a uma, por outro curador. Arquivo da curadoria V2 em `docs/curadoria/carga/`.

## Agregado Prazo, cálculo e recálculo (HU16)

Área de alto risco (CLAUDE.md, seção 15). Nenhuma data é calculada aqui: todas saem de `@pz/motor-prazos` (ADR-007).

- **Tabela `prazo`** (tenant, RLS, sem DELETE): processo, ato, ramo, dias e unidade, início, vencimento, fim do prazo (24h no fuso do juízo), memória de cálculo, entrada do motor (para o recálculo), fundamento, origem (`djen`, `manual`, `painel`), status (`a_confirmar`, `pendente`, `cumprido`, `vencido`, `cancelado`), ciência, responsável, versões do motor e da tabela, jurisdição e `versao_otimista`. O encerramento de conta (HU38) apaga os prazos do tenant.
- **`CalcularPrazoParaProcesso`** monta a sugestão: o processo (ramo do tribunal, jurisdição e fuso, pela porta `LocalizadorDoProcesso`, composta nas apps pelas APIs do cadastro e do calendario), o prazo aplicável (`ResolverPrazoAplicavel`, pela vigência na data de referência) e o calendário do período. Lê uma janela do calendário e a dobra até cobrir a data mais tardia do cálculo (vencimento e alternativas).
  - Sem ramo informado, só a Justiça do Trabalho é dedutível (`trabalhista`); nos demais, "a confirmar".
  - Linha da tabela com cálculo `data-informada` ou `nao-calcula`: "a confirmar", com o marco no detalhe.
  - Prazo só do texto (sem linha na tabela): contagem do ramo e dobro `verificar` (o motor mostra as duas datas).
  - Tipos do calendário no motor: feriado e recesso → sem expediente; portaria → suspensão de prazos; indisponibilidade → só prorroga (correspondência da carga V2).
  - Fuso do juízo pelo tribunal (`fusoDoJuizo`, módulo calendario, curadoria V2, aba 5); tribunal com unidades em mais de um fuso usa o de fim mais cedo e avisa.
- **`CriarPrazo`** grava só sugestão vinda do cálculo (`SugestaoDePrazo`), sempre "a confirmar", com trilha `prazos.prazo-sugerido` e `PrazoSugerido` na mesma transação.
- **`RecalcularPrazosPorCalendario`** (consumidor de `CalendarioAlterado` no worker, fila `prazos`): um job por tenant alcançado (no global, listados como sistema por `TenantsAfetadosPeloCalendario`), lotes de 500 por id. Recalcula os abertos (`a_confirmar`, `pendente`) calculados pelo motor cuja jurisdição o evento alcança e cujo intervalo (referência até vencimento) cruza o período. Se o vencimento muda: grava, volta a "a confirmar", trilha `prazos.prazo-recalculado` com antes e depois e `PrazoRecalculado`. Idempotente (mesmo calendário, mesmo resultado); concorrência otimista; o calendário é lido sem cache.

## Ciclo de vida do prazo (HU24)

- **Estados** (agregado `Prazo`): `a-confirmar` → `pendente` (confirmar) → `cumprido`; `a-confirmar`/`pendente` → `cancelado` (com motivo) ou `vencido` (job diário, 4h de Brasília). Transição inválida: `Conflito` (409). Versão otimista em todo POST (`versao` lida; outra gravação no meio dá 409).
- **Ajuste** (`AjustarPrazo`, sempre com motivo): ato, ramo ou dias recalculam pelo motor a partir de `parametros`; vencimento informado fica "definido manualmente" (sem fim do prazo calculado e fora do recálculo do calendário). O status não muda: confirmar é outro passo.
- **Geração automática** (`GerarPrazoDaPublicacao`, worker, fila `prazos`): `PublicacaoClassificada` gera um job por tenant destinatário; `PublicacaoRecebida` gera no tenant do evento. Um prazo por publicação no tenant (índice único). Ato desconhecido ou classificação incerta (revisão manual ou confiança < 0,85) geram com `classificacaoIncerta`; não gera só quando o ato é seguro e não há prazo no texto nem na tabela (ex.: mero expediente). Responsável: o advogado da OAB destinatária.
- Trilha e evento em cada transição: `PrazoConfirmado`, `PrazoAjustado`, `PrazoCumprido`, `PrazoCancelado`, `PrazoVencido`.
- API `/v1/prazos`: listar (por vencimento, cursor), detalhe (com memória), `confirmar`, `ajustar`, `cumprir`, `cancelar`.
