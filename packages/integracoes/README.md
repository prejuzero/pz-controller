# packages/integracoes

Portas de integração, modelos canônicos, descritores de adaptador e erros classificados (ADR-005). Toda dependência externa do PrejuZero fica atrás de uma destas portas; o domínio compila sem nenhum adaptador instalado.

## Portas

| Porta                    | Interface               | Usada por                                         |
| ------------------------ | ----------------------- | ------------------------------------------------- |
| `fonte-publicacoes`      | `FontePublicacoes`      | captura (DJEN, DataJud, tribunais) — só lê listas |
| `canal-notificacao`      | `CanalNotificacao`      | notificações (e-mail, push, WhatsApp, SMS)        |
| `provedor-email`         | `ProvedorEmail`         | canal de e-mail (SES, SMTP)                       |
| `provedor-ia`            | `ProvedorIA`            | somente `packages/ia`                             |
| `armazenamento-arquivos` | `ArmazenamentoArquivos` | arquivos por tenant (RustFS local, S3)            |

## Regras

- **Modelo canônico com Zod:** o adaptador converte o formato do provedor (camada anticorrupção) e a saída é validada pelo schema da porta. Datas jurídicas são `LocalDate`, instantes são `Instant`.
- **Erros classificados:** o adaptador converte toda falha em `ErroTransitorio`, `ErroPermanente`, `ErroLimiteExcedido` ou `ErroCredencialInvalida`. A classe decide retentativa (`retentavel`) e circuit breaker (`indicaDegradacao`).
- **Descritor:** `definirDescritor({ id, porta, versao, capacidades, limites, requerCredenciais })`. Os limites configuram a resiliência; as capacidades informam o que é coberto automaticamente. Canais declaram `CapacidadesCanal`.
- **Arquivos por tenant:** `chaveDoArquivo(tenant, caminho)` sempre prefixa o tenant e recusa travessia de diretório.
- **Webhooks:** o adaptador implementa `ReceptorWebhook` (assinatura sobre os bytes brutos e ID externo para idempotência); o gateway é único (`/v1/webhooks/{adaptador}`).

Próximos passos da HU09: resiliência, registro de adaptadores e saúde; adaptador S3 com o kit de contrato; gateway de webhooks.
