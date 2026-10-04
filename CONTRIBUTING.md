# Como contribuir

Todo o código deste projeto é escrito por IA sob as regras do [CLAUDE.md](CLAUDE.md). Este guia resume o dia a dia e a configuração inicial.

## Pré-requisitos

- Node.js 24 LTS (versão em [.nvmrc](.nvmrc))
- pnpm 12, ativado pelo Corepack: `corepack enable`
- Runtime de containers com Docker Compose v2 (OrbStack ou Docker Desktop). Detalhes em [docs/runbooks/ambiente-local.md](docs/runbooks/ambiente-local.md)

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
| `pnpm infra:up` / `pnpm infra:down` | Sobe/derruba Postgres, Redis, S3 local e Mailpit (Docker)    |
| `pnpm infra:reset`                  | Recria o ambiente local do zero (apaga volumes)              |
| `pnpm dev`                          | Infraestrutura local + apps em modo watch                    |

## Configuração do repositório no GitHub

O repositório está na conta pessoal `prejuzero`, privado, no plano gratuito. Nessa combinação:

- **Proteção da branch `main` e rulesets não estão disponíveis.** O GitHub não impede o merge com o CI vermelho. Regra do projeto até mudar o plano: **nenhum PR é mergeado sem todos os checks verdes**, inclusive os do Dependabot.
- **Code scanning (CodeQL) não está disponível.** A análise estática de segurança roda com o Semgrep, dentro do CI (job `sast`).
- **Não há times.** O CODEOWNERS aponta para `@prejuzero`.

Para ter os gates realmente bloqueantes, escolha uma opção:

1. **GitHub Pro** na conta pessoal: libera proteção de branch em repositório privado.
2. **Organização no plano Team**: libera proteção de branch, times no CODEOWNERS e revisores obrigatórios.

Depois, em **Settings › Branches** (ou Rulesets) para `main`:

- Exigir pull request antes do merge, com revisão de code owners (2 aprovações quando houver mais de um revisor).
- Exigir os status checks de todos os jobs do workflow `CI`.
- Exigir branch atualizada; bloquear force push e exclusão; permitir apenas squash merge.

Já ativo: exclusão automática da branch após o merge.
