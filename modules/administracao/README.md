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
