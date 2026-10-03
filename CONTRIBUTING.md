# Como contribuir

Todo o código deste projeto é escrito por IA sob as regras do [CLAUDE.md](CLAUDE.md). Este guia resume o dia a dia e a configuração inicial.

## Pré-requisitos

- Node.js 24 LTS (versão em [.nvmrc](.nvmrc))
- pnpm 12, ativado pelo Corepack: `corepack enable`

## Primeiros passos

```bash
pnpm install     # instala dependências e ativa os hooks de git (husky)
pnpm verify      # formatação, lint, fronteiras, tipos, testes e build
```

## Fluxo de uma tarefa

1. Pegue o card no quadro pz-controller (Notion) e confira as dependências.
2. Crie a branch: `tipo/PZ-<id>-descricao-curta` (ex.: `feat/PZ-27-motor-regras-rn01`).
3. Implemente seguindo o CLAUDE.md, seção 5.
4. Commits em Conventional Commits, em português: `feat(prazos): calcula prorrogação por indisponibilidade (RN08)`.
5. Rode `pnpm verify` antes de abrir o PR.
6. Abra o PR preenchendo o template (Definição de Pronto) e atualize o card no Notion.

Os hooks locais rodam ESLint e Prettier nos arquivos alterados (pre-commit) e validam a mensagem de commit (commit-msg).

## Scripts

| Comando                             | O que faz                                                    |
| ----------------------------------- | ------------------------------------------------------------ |
| `pnpm verify`                       | Tudo o que o CI de qualidade roda                            |
| `pnpm lint`                         | ESLint em todos os pacotes + fronteiras (dependency-cruiser) |
| `pnpm depcruise`                    | Só as regras de fronteira entre módulos e camadas            |
| `pnpm typecheck`                    | TypeScript em todos os pacotes                               |
| `pnpm test`                         | Testes unitários com cobertura mínima                        |
| `pnpm test:int`                     | Testes de integração (exige Docker)                          |
| `pnpm build`                        | Build de todos os pacotes                                    |
| `pnpm format` / `pnpm format:check` | Prettier                                                     |

## Configuração do repositório no GitHub (uma vez, por um administrador)

Estas regras não podem ser versionadas e precisam ser ativadas em **Settings** do repositório:

1. **Times:** criar `@prejuzero/engenharia` e `@prejuzero/curadoria-juridica` (ou ajustar o [CODEOWNERS](.github/CODEOWNERS) para os times reais).
2. **Branch protection** em `main` (Settings › Branches ou Rulesets):
   - Exigir pull request antes do merge, com **2 aprovações** e **revisão de code owners**.
   - Exigir que os status checks passem: todos os jobs de `CI` e `CodeQL`.
   - Exigir branch atualizada antes do merge; bloquear force push e exclusão.
   - Permitir apenas squash merge.
3. **Code security:** ativar Dependabot alerts, Dependabot security updates, secret scanning e push protection.
