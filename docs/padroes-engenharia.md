# Padrões de engenharia

Espelho da página "Padrões de engenharia" do Notion. Em conflito, vale o [CLAUDE.md](../CLAUDE.md).

## Princípios

- Contrato primeiro, domínio puro, testes antes de integrar.
- PRs pequenos (até ~400 linhas), trunk-based, feature flags para o que não está pronto.
- Toda decisão relevante vira ADR em [docs/adr](adr/README.md).

## Padrões de código

- TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`); `any` só com justificativa.
- ESLint (typescript-eslint strict) + Prettier; Conventional Commits verificados por commitlint.
- Nomes de domínio em português (`Prazo`, `Publicacao`, `Ciencia`); termos técnicos consagrados em inglês (`Repository`, `Controller`).
- Erros de domínio tipados (`Result`); exceções só para falhas inesperadas.
- Nenhuma regra de negócio em controllers, processors ou componentes React.

## Estratégia de testes

- **Unitários (Vitest):** domínio e casos de uso; meta ≥ 90% de linhas nos módulos e 100% no motor de prazos.
- **Mutação (Stryker):** motor de prazos com score ≥ 90%.
- **Propriedade (fast-check):** motor, value objects (CPF, CNJ, OAB) e encadeamento da auditoria.
- **Integração (Testcontainers):** repositórios, RLS, filas e outbox com Postgres e Redis reais. Arquivos `*.int.test.ts`.
- **Contrato:** adaptadores (kit de contrato com fixtures gravadas) e API (respostas validadas contra o OpenAPI).
- **E2E (Playwright):** cadastro; captura → prazo → notificação → ciência; busca; exportação.
- **Acessibilidade:** axe em todas as páginas (WCAG 2.1 AA).
- **Desempenho (k6):** antes do fechamento de cada marco a partir do M3.
- **Avaliação de IA:** ≥ 98% de acerto no conjunto anotado.

## Quality gates do CI (bloqueiam o merge)

| Gate                                                             | Onde                                         |
| ---------------------------------------------------------------- | -------------------------------------------- |
| Formatação (Prettier)                                            | `ci.yml` › qualidade                         |
| Lint (ESLint) e fronteiras (dependency-cruiser)                  | `ci.yml` › qualidade                         |
| Tipos (TypeScript)                                               | `ci.yml` › qualidade                         |
| Testes unitários e cobertura mínima                              | `ci.yml` › testes                            |
| Testes de integração                                             | `ci.yml` › integracao                        |
| Build                                                            | `ci.yml` › build                             |
| Conventional Commits                                             | `ci.yml` › commits                           |
| Segredos (gitleaks)                                              | `ci.yml` › segredos                          |
| Vulnerabilidades em dependências (`pnpm audit`, severidade alta) | `ci.yml` › dependencias                      |
| SAST (Semgrep: default, OWASP Top 10, segredos)                  | `ci.yml` › sast                              |
| Quebra de OpenAPI, migrações, Trivy, avaliação de IA             | entram nas histórias HU04, HU05, HU02 e HU22 |

## Definição de Preparado (DoR)

- História com critérios de aceite verificáveis e requisitos de origem.
- Dependências concluídas ou com contrato acordado.
- Telas com protótipo aprovado, quando houver front-end.
- Tarefas estimadas.

## Definição de Pronto (DoD)

Ver [CLAUDE.md, seção 17](../CLAUDE.md) e o template de PR.

## Fluxo de trabalho

- Branch curta a partir de `main` → PR com template de DoD → CI → revisão → squash merge.
- Deploy automático em staging; produção com aprovação manual e rollback automático por healthcheck.
- SemVer nos pacotes publicáveis; API versionada em `/v1`.

## Ambientes

local (Docker Compose) · staging (dados sintéticos) · produção (sa-east-1). Dados reais nunca saem da produção; o conjunto de avaliação é sempre anonimizado.

## SLOs iniciais (propostos, validar com o negócio)

- Disponibilidade do portal e da API ≥ 99,5% ao mês.
- API: p95 < 300 ms em leitura e < 800 ms em escrita.
- Publicação visível no portal em até 30 min após a captura.
- E-mail de nova publicação enviado em até 10 min após a classificação.
- Busca: p95 < 500 ms com 1 milhão de publicações.
- Backups: RPO 15 min, RTO 4 h.
