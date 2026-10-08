# modules/administracao

Administração da plataforma (HU07, herdado da HU10): reprocessamento auditado da DLQ das filas.

| Camada         | Conteúdo                                                                  |
| -------------- | ------------------------------------------------------------------------- |
| `domain/`      | `JobMorto` e o resumo que vai para a trilha (sem os dados do job)         |
| `application/` | `ReprocessarJobMorto` e a porta `FilaDeMortos`                            |
| `infra/`       | `FilaDeMortosBullMq` (DLQs no Redis; também entrega as filas ao painel) e |
|                | `FilaDeMortosEmMemoria` (testes)                                          |
| `index.ts`     | Única API pública do módulo                                               |

- O painel (Bull Board) em `/admin/filas` só lê: mostra as filas e as DLQs a quem tem `admin:filas`
  (só `admin_plataforma`; a impersonação não concede). As ações do painel ficam desligadas.
- Reprocessar é pela rota `POST /v1/admin/filas/{fila}/dlq/{jobId}/reprocessar`, com motivo: a
  auditoria (`administracao.job-morto-reprocessado`, no tenant plataforma) e a volta do job à fila
  acontecem na mesma transação. O job original volta com as tentativas zeradas e sai da DLQ.
- Sem o job original na fila (a fila apaga os falhos após 30 dias), a rota responde 409.

## Painel do administrador (HU39)

- `GET /v1/admin/integracoes` (`admin:filas`): cada instância do worker grava a cada 30 s um retrato da saúde dos seus adaptadores (`PublicarSituacaoDasIntegracoes`, hash `pz:admin:integracoes` no Redis); o painel junta os retratos dos últimos 2 minutos (pior estado, último sucesso e falha) e mostra as últimas 50 falhas (lista limitada a 100). É telemetria, não fonte de verdade: Redis vazio só deixa o painel vazio.
- `GET /v1/admin/filas` (`admin:filas`): contagem por fila do catálogo (aguardando, ativos, atrasados, falhos) e os mortos da DLQ. Reprocessar continua pela rota auditada.
- `GET /v1/admin/rejeicoes-email` (`admin:tenants`): vem do módulo notificacoes (`ListarSupressoes`), dono da tabela global `supressao`.
