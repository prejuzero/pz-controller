# packages/db

Schema Prisma, migrações reversíveis, papéis, RLS e seeds (HU05, ADR-003). **Área de alto risco** (CLAUDE.md, seção 15): mudanças em RLS, papéis ou políticas exigem 2 revisores humanos.

## Comandos

```bash
pnpm db:migrate   # aplica as migrações pendentes (papel pz_migrator, DATABASE_URL_MIGRACAO)
pnpm db:revert    # reverte a última migração (executa o down.sql)
pnpm db:seed      # dados fictícios de desenvolvimento (papel pz_sistema), idempotente
```

`pnpm dev` já roda `db:migrate` e `db:seed` depois de subir a infraestrutura.

## Papéis (ADR-003)

| Papel         | Uso                                      | RLS                                 |
| ------------- | ---------------------------------------- | ----------------------------------- |
| `pz_migrator` | Migrações (DDL); dono das tabelas        | Sujeito (FORCE)                     |
| `pz_app`      | Aplicação (DML)                          | Sujeito; sem BYPASSRLS              |
| `pz_sistema`  | Jobs globais, cadastro de tenants, seeds | BYPASSRLS: uso explícito e auditado |
| `pz_leitura`  | Relatórios e réplica (somente leitura)   | Sujeito                             |

Localmente os papéis vêm de `infra/docker/postgres/init/02-papeis.sql` (só em volume novo: depois de mudar esse arquivo, `pnpm infra:reset`). Na AWS, do Terraform e do Secrets Manager (HU72).

## Multi-tenancy

- Toda tabela com `tenant_id` chama `SELECT pz_habilitar_rls('tabela')` na migração que a cria: RLS ligado e forçado, política `isolamento_tenant` (USING e WITH CHECK) e permissões dos papéis.
- O tenant da transação vem de `set_config('app.tenant_id', <uuid>, true)` (local à transação, compatível com PgBouncer em modo transaction). `pz_tenant_atual()` devolve `NULL` sem contexto: nenhuma linha aparece.
- **Suíte de isolamento** (`src/isolamento.int.test.ts`): descobre pelo catálogo toda tabela com `tenant_id`, gera dados válidos para dois tenants (`src/teste/isolamento.ts`) e confere que um não lê, atualiza, apaga nem insere dados do outro, que sem contexto nada aparece e que o papel de leitura também é isolado. Tabela nova com `tenant_id` entra sozinha; sem RLS, a suíte falha. Tipo de coluna novo sem gerador também faz a suíte falhar, com a instrução do que acrescentar.

## Migrações

Cada pasta em `prisma/migrations` tem `migration.sql` e `down.sql`. O CI aplica, reverte tudo e aplica de novo num PostgreSQL real (Testcontainers).

Para mudar o schema:

1. Edite `prisma/schema.prisma` (convenções no topo do arquivo).
2. Gere o SQL: `pnpm --filter @pz/db exec prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script`.
3. Crie a pasta `prisma/migrations/<AAAAMMDDHHMMSS>_<nome>/` com o `migration.sql` (acrescente `pz_habilitar_rls` para tabelas novas com `tenant_id`) e o `down.sql`.
4. Nunca edite uma migração já aplicada na `main`: crie outra (CLAUDE.md, seção 3).

**Expand/contract** (mudança sem downtime, a aplicação antiga e a nova convivem):

1. _Expand_: acrescente (coluna nova anulável, tabela nova, índice `CONCURRENTLY` numa migração própria). Implante a aplicação que escreve nos dois formatos.
2. _Migrate_: copie os dados antigos para o formato novo (job idempotente, em lotes).
3. _Contract_: numa implantação seguinte, quando nada mais lê o formato antigo, remova-o.

Remover ou renomear coluna, mudar tipo ou tornar `NOT NULL` direto é proibido numa só migração.

## Avisos

- O CLI do Prisma pode terminar com sucesso mesmo quando o motor de migração falha: os testes conferem a mensagem de confirmação, não só o código de saída.
- Prisma fixado em 7.9.1: o `prisma@7.10.0` foi publicado sem atestado de procedência (as versões anteriores e posteriores pelo GitHub Actions têm), e a política da cadeia de suprimentos o recusa. Reavaliar antes de atualizar.
