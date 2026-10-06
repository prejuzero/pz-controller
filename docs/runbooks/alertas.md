# Runbook · Alertas

Alertas iniciais do PrejuZero (HU03, ADR-011), definidos como código em [infra/docker/observabilidade](/infra/docker/observabilidade). Todo alerta chega por e-mail (`ALERTAS_EMAIL`, padrão `prejuzero@gmail.com`) e no canal do Discord da equipe, e traz o link para a seção correspondente abaixo.

| Alerta                                   | Dispara quando                                       | Severidade |
| ---------------------------------------- | ---------------------------------------------------- | ---------- |
| API com mais de 1% de erros 5xx          | 5xx acima de 1% das requisições por 5 minutos        | crítica    |
| Fila sem progresso há mais de 15 minutos | job mais antigo aguardando há mais de 15 minutos     | crítica    |
| Fila com jobs na DLQ                     | qualquer job na DLQ                                  | crítica    |
| Adaptador de integração degradado        | circuit breaker aberto por 1 minuto                  | alta       |
| Rejeição de e-mail                       | qualquer rejeição do provedor nos últimos 15 minutos | alta       |

Primeiro passo em todos: abrir o dashboard da área no Grafana (pasta **PrejuZero**) e o trace de um caso com erro no Tempo, filtrando pelo `requestId` ou `trace_id` dos logs.

## api-5xx

1. No dashboard **PrejuZero · API**, veja quais rotas concentram os 5xx.
2. No Loki, filtre `level="error"` pelo período e siga o `trace_id` até o span com erro.
3. Se começou após um deploy, faça o rollback (runbook de infraestrutura) antes de investigar.
4. Se for dependência (banco, Redis, integração), siga o alerta correspondente.

## fila-parada

1. No dashboard **PrejuZero · Filas**, confirme a fila e se os workers estão processando (jobs por resultado).
2. Workers parados ou reiniciando: veja os logs do worker e o uso de memória.
3. Jobs falhando em sequência: abra o trace de um job com falha e trate a causa.
4. Prazos dependem das filas: se a captura estiver parada, avise a equipe e acompanhe até zerar o atraso.

## fila-dlq

1. Identifique a fila e o erro do job no log (`jobId`).
2. Corrija a causa; só então reprocesse da DLQ (jobs são idempotentes).
3. Nunca descarte job da DLQ sem registrar o motivo: pode ser uma intimação não processada.

## integracao-degradada

1. No dashboard **PrejuZero · Integrações**, veja a taxa de falha e a latência do adaptador.
2. Confirme se a fonte está fora do ar (página de status do provedor, outros clientes).
3. O circuit breaker tenta sozinho (meio-aberto). Enquanto estiver aberto, a cobertura daquela fonte fica comprometida: informe os usuários afetados (CLAUDE.md, seção 2, transparência de cobertura).

## email-rejeicao

1. No dashboard **PrejuZero · E-mail**, veja o motivo (bounce ou reclamação).
2. Bounce: confira o endereço do destinatário; reclamação: revise o conteúdo e a frequência.
3. Notificação de prazo não entregue precisa de outro canal até o endereço ser corrigido.

## Testar os alertas localmente

```bash
pnpm infra:up:obs
pnpm alertas:testar   # injeta pz.fila.dlq=1 e espera o e-mail no Mailpit (http://127.0.0.1:8025)
```

Logo após subir o Grafana, a primeira notificação pode levar alguns minutos; depois disso chega em menos de 1 minuto. O alerta de teste se resolve sozinho quando a métrica deixa de ser enviada (cerca de 5 minutos).

## Alterar alertas e dashboards

Edite `infra/docker/observabilidade/provisionamento/alertas.yaml` ou os JSON em `dashboards/` e rode `pnpm infra:up:obs` de novo. Os nomes das métricas vêm de `NOMES_METRICAS` em `@pz/observability`: mudou lá, muda aqui. Mudanças feitas pela interface do Grafana não são salvas.

## Configurar o Discord

1. No servidor do Discord da equipe: **Configurações do canal → Integrações → Webhooks → Novo webhook**, escolha o canal de alertas e copie a URL.
2. No `.env` da raiz do repositório (não versionado), defina `ALERTAS_DISCORD_WEBHOOK_URL=<url copiada>`.
3. Rode `pnpm infra:up:obs` e depois `pnpm alertas:testar`: a mensagem chega no canal e o e-mail no Mailpit.

A URL do webhook é um segredo: quem a tiver consegue postar no canal. Nunca a coloque no repositório; se vazar, apague o webhook no Discord e crie outro. Sem a variável, o envio ao Discord falha (visível em **Alerting → Contact points** no Grafana) e o e-mail continua funcionando.

No ambiente local o e-mail vai para o Mailpit, não para a caixa real: a entrega em `prejuzero@gmail.com` começa quando houver SMTP de verdade (HU72).

## auditoria-divergente

**Severidade crítica.** A verificação diária (job `manutencao.verificar-auditoria`) encontrou na trilha de um tenant conteúdo alterado, buraco na sequência ou registros apagados do fim (cadeia mais curta que o checkpoint).

1. Não altere nada no banco: preserve a evidência. O log `trilha de auditoria divergente` traz o tenant, a sequência e o motivo; o Sentry tem o erro.
2. Compare com a cópia WORM do bucket `pz-auditoria-worm` (`<tenant>/auditoria/AAAA/MM/DD/<inicio>-<fim>.ndjson`), que não pode ser alterada: ela mostra o conteúdo original até a última exportação.
3. Trate como incidente de segurança (acesso indevido ao banco com privilégio de dono ou superusuário) e comunique o responsável pela LGPD.
