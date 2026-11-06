# modules/webhooks

Webhooks de saída (HU49, [ADR-023](../../docs/adr/0023-webhooks-de-saida.md)): o escritório assina eventos públicos e recebe um POST assinado (HMAC-SHA256) no endereço dele.

- **Domínio:** catálogo dos eventos públicos (só identificadores no corpo), validação do endereço e desfecho pelo status.
- **Casos de uso:** `RegistrarAssinatura` (o segredo cifrado aparece uma vez), `ListarAssinaturas`, `DesativarAssinatura`, `TestarAssinatura`, `ListarEntregas`, `ReenviarEntrega` (trilha de auditoria na mesma transação), `RegistrarEntregas` (consumidor do worker, idempotente por assinatura e evento) e `EntregarWebhook` (job da fila `integracoes`; `esgotar` marca a falha).
- **Infra:** `AssinaturasDeWebhookPostgres` e `EntregasDeWebhookPostgres` (RLS, sem DELETE), `CriptografiaNode` e os repositórios em memória para os testes das apps.
- O envio HTTP é do adaptador `@pz/adapter-webhook-http` (porta `entregador-webhook`).
