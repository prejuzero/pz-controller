# packages/observability

Logs, traces, métricas e captura de erros padronizados (ADR-011, HU03). Nenhuma app configura observabilidade por conta própria: tudo passa por este pacote.

## Uso

```ts
// Primeira coisa no boot da app (antes de importar o restante, para as instrumentações valerem).
const telemetria = iniciarTelemetria({
  servico: 'pz-api',
  versao: process.env.VERSAO ?? 'dev',
  ambiente: env.NODE_ENV,
  ...(env.OTEL_EXPORTER_OTLP_ENDPOINT && { endpointOtlp: env.OTEL_EXPORTER_OTLP_ENDPOINT }),
});
const captura = iniciarCapturaDeErros({
  ...(env.SENTRY_DSN && { dsn: env.SENTRY_DSN }),
  ambiente: env.NODE_ENV,
  release: process.env.VERSAO ?? 'dev',
});

// Em qualquer módulo: uma linha.
const logger = criarLogger('prazos');
logger.info({ prazoId }, 'prazo calculado');

// Erro inesperado: log + métrica pz.erros + span marcado + Sentry, com a correlação.
registrarErro(logger, erro, 'falha ao consultar o DJEN', 'captura');

// No shutdown gracioso.
await Promise.all([telemetria.encerrar(), captura.encerrar()]);
```

| Função                                                     | Para quê                                                                               |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `criarLogger(modulo)`                                      | Logger pino JSON com redação de dados sensíveis e correlação                           |
| `executarComContexto({ requestId, tenantId, userId }, fn)` | Define a correlação de uma execução (middleware HTTP, consumidor de fila)              |
| `capturarContextoPropagavel()`                             | Grava o trace e a correlação junto do evento (outbox) ou do job                        |
| `executarJob({ fila, jobId, tenantId, contexto }, fn)`     | Processa o job no trace de origem, com span de consumo e métricas de duração/resultado |
| `registrarChamadaIntegracao`, `registrarEstadoCircuito`    | Métricas dos adaptadores de integração                                                 |
| `registrarSituacaoDasFilas(consultar)`                     | Profundidade, idade do job mais antigo e DLQ, lidas a cada coleta                      |
| `registrarRejeicaoEmail(motivo)`                           | Rejeições do provedor de e-mail                                                        |

Os nomes das métricas ficam em `NOMES_METRICAS`. Os dashboards e alertas dependem deles: mudar um nome exige atualizar os dashboards.

## Regras

- **Redação:** campos com nome sensível (`cpf`, `senha`, `password`, `token`, `segredo`, `secret`, `authorization`, `cookie`, `apiKey`, `otp`, `credencial`...) saem como `[REMOVIDO]` em qualquer profundidade. CPF, JWT e `Bearer ...` também são removidos de textos livres. Um segredo sem padrão reconhecível escrito no meio de uma mensagem **não** é detectável: nunca interpole segredo em mensagem, passe-o (se precisar) num campo nomeado.
- **Sem dado pessoal na correlação:** o contexto leva só identificadores (`requestId`, `tenantId`, `userId`, `jobId`).
- **Sentry desligado sem `SENTRY_DSN`:** nada sai da máquina. Quando ligado, só as integrações de erro (sem coleta de usuário, cookies, cabeçalhos ou corpos HTTP) e todo evento passa pela mesma redação dos logs. Traces ficam no OpenTelemetry.
- **Falhas internas do OpenTelemetry** (exportação recusada, por exemplo) viram log de `warn`/`error`, nunca silêncio.
- **Local:** `pnpm infra:up:obs` sobe Grafana, Tempo, Loki e Prometheus; use `OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318` e abra http://127.0.0.1:3001.

## Instrumentações

Padrão: HTTP, `fetch`/undici e ioredis. A instrumentação oficial do NestJS só suporta até a versão 11; com o NestJS 12, a api informa a rota de cada requisição com `registrarRotaHttp` (vira `http.route` no span e nas métricas). Prisma (HU05) e BullMQ (HU10) entram pelo parâmetro `instrumentacoes` quando essas bibliotecas chegarem ao projeto.

Como o monorepo é ESM, as instrumentações automáticas só se aplicam a módulos carregados depois do registro dos ganchos de importação. As apps (HU04) devem iniciar a telemetria num arquivo carregado com `node --import` antes do `main`.
