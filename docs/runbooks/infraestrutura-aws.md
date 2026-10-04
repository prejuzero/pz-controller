# Runbook · Infraestrutura na AWS (Terraform)

Infraestrutura como código em [infra/terraform](../../infra/terraform) (ADR-010). Região: `sa-east-1`.

## Estrutura

| Pasta                                     | Conteúdo                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `modulos/rede`                            | VPC, sub-redes públicas e privadas, NAT e flow logs                                              |
| `modulos/segredos`                        | Chave KMS com rotação e segredo de configuração das apps                                         |
| `modulos/armazenamento`                   | Buckets de arquivos, relatórios e auditoria (object lock), criptografados, privados e só com TLS |
| `modulos/banco`                           | RDS PostgreSQL 16 privado, criptografado, TLS obrigatório, PITR, Multi-AZ opcional               |
| `modulos/cache`                           | ElastiCache Redis privado, criptografado, TLS obrigatório, failover opcional                     |
| `modulos/computacao`                      | ECR, ECS Fargate (ARM64), balanceador HTTPS e serviços com rollback automático                   |
| `modulos/plataforma`                      | Compõe todos os módulos de um ambiente                                                           |
| `ambientes/staging`, `ambientes/producao` | Escolhem tamanhos e opções de cada ambiente                                                      |
| `bootstrap`                               | Bucket do estado remoto do Terraform (aplicado uma vez por conta)                                |

## Primeira vez (por conta AWS)

1. **Pré-requisitos:** conta AWS dedicada ao PrejuZero, AWS CLI com SSO configurado, Terraform 1.16+, domínio e certificado ACM em `sa-east-1`.
2. **Estado remoto:** `terraform -chdir=infra/terraform/bootstrap init && terraform -chdir=infra/terraform/bootstrap apply`. Anote o bucket gerado.
3. **Ambiente:** em `ambientes/staging`, copie `backend.hcl.example` para `backend.hcl` e `terraform.tfvars.example` para `terraform.tfvars` (nenhum dos dois é versionado) e preencha.
4. `terraform -chdir=infra/terraform/ambientes/staging init -backend-config=backend.hcl`
5. `terraform -chdir=infra/terraform/ambientes/staging plan`, revise e então `apply`.
6. Grave os valores sensíveis das apps no segredo `pz-staging/configuracao-apps` (Secrets Manager), nunca no repositório nem no estado.

## Deploy contínuo

O workflow [deploy.yml](../../.github/workflows/deploy.yml) roda depois do CI verde na `main` e só é ativado quando tudo abaixo existir:

- Papel IAM com OIDC do GitHub para o repositório, com permissão de ECR, ECS e Terraform do ambiente (variável `AWS_ROLE_DEPLOY`).
- Variáveis do repositório: `DEPLOY_HABILITADO=true`, `APPS_DEPLOY` (ex.: `["api","worker"]`) e `URL_STAGING`.
- Segredos do repositório: `TF_BACKEND_STAGING` (conteúdo do `backend.hcl`) e `TF_VARS_STAGING` (conteúdo do `terraform.tfvars`).
- Apps com `/health/live` e `/health/ready` e serviços declarados na variável `servicos` do ambiente (HU04 e HU23).

Fluxo: constrói a imagem de cada app → varre com Trivy (falha em HIGH/CRITICAL) → publica no ECR com a tag do commit → `terraform apply` com a nova versão → espera os serviços estabilizarem → smoke test em `/health/ready`.

**Rollback automático:** o ECS volta sozinho para a versão anterior se as novas tarefas não ficarem saudáveis (deployment circuit breaker). **Rollback manual:** rode o workflow com `workflow_dispatch` a partir do commit anterior, ou `terraform apply -var versao_imagem=<sha anterior>`.

**Migrações de banco** entram no pipeline na HU05, como tarefa ECS executada antes da atualização dos serviços, com o papel `pz_migrator`.

**Produção:** mesmo fluxo, disparado manualmente. A aprovação obrigatória por ambiente do GitHub exige plano pago em repositório privado; até lá, a aprovação é feita por quem dispara o workflow.

## Portabilidade (rodar fora da AWS)

O código não depende da AWS (ADR-010). Para outra plataforma de containers:

| Peça          | AWS hoje        | Alternativas                                                                                                                                       |
| ------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Containers    | ECS Fargate     | Kubernetes (EKS, GKE, AKS, on-premises), Fly.io, Render, Railway                                                                                   |
| PostgreSQL 16 | RDS             | Cloud SQL, Azure Database, Neon, Crunchy, autogerenciado (com pg_trgm, unaccent e pg_partman)                                                      |
| Redis         | ElastiCache     | Memorystore, Azure Cache, Upstash, Redis/Valkey autogerenciado                                                                                     |
| S3            | Amazon S3       | Cloudflare R2, Google Cloud Storage (interoperabilidade S3), RustFS/SeaweedFS autogerenciado; object lock é obrigatório para o bucket de auditoria |
| Segredos      | Secrets Manager | Vault, GCP Secret Manager, Azure Key Vault, segredos do Kubernetes com criptografia                                                                |
| E-mail        | SES             | Qualquer provedor SMTP ou adaptador novo (ADR-005)                                                                                                 |

Passos: substituir só a camada de infraestrutura (Terraform ou manifestos da nova plataforma), usar as mesmas imagens do [node-app.Dockerfile](../../infra/docker/node-app.Dockerfile) e as mesmas variáveis de ambiente validadas pelo `@pz/config/env`. Nenhuma mudança em `modules/` ou `packages/`.
