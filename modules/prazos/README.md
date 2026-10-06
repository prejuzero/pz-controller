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
- **Pendente:** endpoint `/v1/admin/tabela-prazos` com a permissão de curador (HU07) e tela do curador (HU15 [FE]).
