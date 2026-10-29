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
