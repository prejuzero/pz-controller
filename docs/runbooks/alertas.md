# Runbook · Alertas

Alertas iniciais do PrejuZero (HU03, ADR-011), definidos como código em [infra/docker/observabilidade](/infra/docker/observabilidade). Todo alerta chega por e-mail (`ALERTAS_EMAIL`, padrão `prejuzero@gmail.com`) e no canal do Discord da equipe, e traz o link para a seção correspondente abaixo.

| Alerta                                   | Dispara quando                                            | Severidade |
| ---------------------------------------- | --------------------------------------------------------- | ---------- |
| API com mais de 1% de erros 5xx          | 5xx acima de 1% das requisições por 5 minutos             | crítica    |
| Fila sem progresso há mais de 15 minutos | job mais antigo aguardando há mais de 15 minutos          | crítica    |
| Fila com jobs na DLQ                     | qualquer job na DLQ                                       | crítica    |
| Adaptador de integração degradado        | circuit breaker aberto por 1 minuto                       | alta       |
| Rejeição de e-mail                       | qualquer rejeição do provedor nos últimos 15 minutos      | alta       |
| Orçamento de IA acima de 80%             | uso mensal de uma tarefa passou de 80% num escritório     | média      |
| Custo diário de IA acima do orçamento    | custo estimado do dia passou de `IA_ORCAMENTO_DIARIO_USD` | média      |
| Salto em saídas inválidas da IA          | mais de 5% das respostas recusadas em 30 minutos          | alta       |
| IA sem modelo disponível                 | todos os modelos de uma tarefa falharam                   | crítica    |
| Trilha de auditoria divergente           | verificação diária achou registro alterado ou apagado     | crítica    |
| Fonte de publicações degradada           | fonte falhando seguidamente (HU19)                        | crítica    |
| Alvo de captura com falhas seguidas      | OAB ou processo atingiu o limite de falhas                | alta       |
| SLO · queima rápida (3 SLOs da API)      | 14,4x o orçamento em 1 h e em 5 min                       | crítica    |
| SLO · queima lenta (3 SLOs da API)       | 6x o orçamento em 6 h e em 30 min                         | alta       |

Os runbooks sem alerta próprio ficam no fim: [banco-degradado](#banco-degradado) e [restauracao-de-backup](#restauracao-de-backup).

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

## captura-fonte-degradada

1. A fonte falhou seguidamente (indisponibilidade, não cota). Nenhum alvo está sendo capturado: é risco direto de prazo perdido.
2. Confirme a indisponibilidade na fonte (ex.: comunicaapi.pje.jus.br) e o alerta `integracao-degradada` do adaptador.
3. Os escritórios afetados recebem `FonteDegradada`. Não é preciso recapturar à mão: no primeiro sucesso a fonte volta a operacional, todos os alvos em recuo são antecipados e cada janela vai do último sucesso até hoje.
4. Se a indisponibilidade passar de 1 dia, oriente os escritórios a conferir o diário/painel do tribunal (transparência de cobertura).

## captura-alvo-falhando

1. Uma OAB ou processo falhou na captura várias vezes seguidas, com a fonte operacional: o problema é do alvo.
2. Procure no log `captura.alvo-falhando` (traz o id do alvo) e o erro do job na DLQ da fila `captura`.
3. Causas comuns: número de OAB ou CNJ mal cadastrado, resposta inválida da fonte para aquele alvo. Corrija o cadastro e reprocesse o job da DLQ.

## email-rejeicao

1. No dashboard **PrejuZero · E-mail**, veja o motivo (bounce ou reclamação).
2. Bounce: confira o endereço do destinatário; reclamação: revise o conteúdo e a frequência.
3. Notificação de prazo não entregue precisa de outro canal até o endereço ser corrigido.
4. **Rejeição em massa** (vários escritórios ou dezenas de endereços em minutos): o problema é do envio, não dos destinatários. Confira a reputação e as cotas do provedor e a configuração do domínio remetente (SPF, DKIM, DMARC). Pause os envios em lote (relatórios e resumos) até achar a causa. Os avisos de prazo continuam e aparecem no portal (faixa de avisos). Avise os escritórios afetados e registre o incidente ([plano de resposta](plano-resposta-incidentes.md)).

## ia-orcamento

1. No dashboard **PrejuZero · IA**, veja a tarefa e o consumo de tokens; no Tempo, filtre os spans `ia <tarefa>` por `pz.tenant_id` para achar o escritório.
2. Uso legítimo (volume de publicações): ajuste `orcamentoMensalTokens` em `packages/ia/configuracao/tarefas.json` por PR. Uso anômalo (laço, reprocessamento): pare o job de origem.
3. Ao esgotar, a tarefa recusa a chamada e a funcionalidade cai no fluxo manual ("a confirmar"): avise o escritório.

## ia-orcamento-diario

1. No portal, área do administrador, ou em `GET /v1/admin/uso-ia`: veja o dia, a tarefa e o modelo que concentram o custo e o custo médio por publicação contra a meta (seção 7.5 da especificação).
2. Fallback frequente para o modelo mais caro (dashboard **PrejuZero · IA**, `pz_ia_fallbacks`) ou reprocessamento em laço: corrija a causa. Volume legítimo: ajuste `IA_ORCAMENTO_DIARIO_USD` no ambiente.
3. O alerta não bloqueia chamadas; o bloqueio é o orçamento mensal por tarefa (`ia-orcamento`).

## ia-saidas-invalidas

1. No dashboard **PrejuZero · IA**, confira a tarefa e o modelo; no Tempo, abra spans com `pz.ia.validacao = saida-invalida` e veja a versão do prompt (`pz.ia.versao_prompt`).
2. Mudou prompt, modelo ou configuração recentemente? Reverta o PR e rode a avaliação.
3. Saídas recusadas vão para revisão manual: nada é aplicado automaticamente. Acompanhe a fila de revisão.

## ia-provedor-indisponivel

1. Veja o dashboard **PrejuZero · Integrações** (circuito do provedor de IA) e a página de status do provedor.
2. Confirme que há fallback configurado para a tarefa em `tarefas.json` (outro modelo ou provedor).
3. Enquanto durar, as publicações ficam sem classificação automática ("a confirmar"): informe os usuários (CLAUDE.md, seção 2, transparência de cobertura).

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

## SLOs da API (HU40)

Os SLOs da página Padrões de engenharia viram alertas de **burn rate** (`prejuzero-slos` em `alertas.yaml`). O orçamento de erro é o que o objetivo permite errar no mês: 0,5% de respostas 5xx (disponibilidade de 99,5%) e 5% de requisições acima do limite de latência (p95). A **queima rápida** (14,4x o orçamento, em 1 h e em 5 min) gasta 2% do orçamento do mês em uma hora: aja na hora. A **queima lenta** (6x, em 6 h e em 30 min) gasta 5% em seis horas: trate no mesmo dia. A janela curta faz o alerta se resolver assim que o problema para.

Com pouco tráfego (madrugada, staging), poucas requisições ruins já passam da fração: confira o volume no dashboard **PrejuZero · API** antes de escalar.

### slo-disponibilidade

1. Mesmo diagnóstico do [api-5xx](#api-5xx): rotas com 5xx no dashboard **PrejuZero · API** e o `trace_id` no Loki.
2. Começou depois de um deploy? Faça o rollback antes de investigar.
3. 5xx vindo do banco ou do Redis: siga o [banco-degradado](#banco-degradado) ou a fila correspondente.

### slo-latencia-leitura

1. No dashboard **PrejuZero · API**, ache as rotas `GET` com p95 acima de 300 ms.
2. No Tempo, abra um trace lento e veja onde o tempo foi gasto (consulta ao banco, integração, serialização).
3. Consulta lenta: rode `EXPLAIN (ANALYZE, BUFFERS)` da query do span no banco de leitura e confira os índices. Busca e dashboard têm metas próprias (busca: p95 < 500 ms).

### slo-latencia-escrita

1. No dashboard **PrejuZero · API**, ache as rotas de escrita com p95 acima de 800 ms.
2. Escrita lenta costuma ser disputa por trava (auditoria por tenant, `SELECT ... FOR UPDATE`) ou transação longa: veja `pg_stat_activity` (`wait_event`) e o trace.
3. Não tire a auditoria da transação para ganhar tempo (CLAUDE.md, seção 3): ache e trate a causa da disputa.

## banco-degradado

Sintomas: 5xx com `PrismaClientKnownRequestError` ou timeout de conexão nos logs, latência alta em todas as rotas, filas acumulando.

1. Conexões: `SELECT state, count(*) FROM pg_stat_activity GROUP BY 1;`. Pool esgotado ou muitas `idle in transaction`: ache a origem pelo `application_name` e pelo trace.
2. Consultas longas: `SELECT pid, now() - query_start AS duracao, wait_event, left(query, 120) FROM pg_stat_activity WHERE state <> 'idle' ORDER BY 2 DESC;`. Cancele com `pg_cancel_backend(pid)` só depois de entender a consulta. Nunca cancele a migração em andamento.
3. Disco, CPU e réplica de leitura: veja no painel do provedor (local: `docker stats`).
4. Enquanto durar, os jobs fazem retentativa com recuo e nada se perde. Acompanhe as filas até zerar o atraso.

## restauracao-de-backup

Objetivo: RPO de 15 min e RTO de 4 h (Padrões de engenharia). Na AWS, a restauração ponto no tempo e o teste periódico ficam no PZ-221 (bloqueado até a infraestrutura AWS, ver [infraestrutura-aws.md](infraestrutura-aws.md)). Localmente, o procedimento é este:

1. Declare o incidente e congele as escritas: pare a API e o worker (`docker compose stop api worker`). Decida o ponto de restauração.
2. Restaure numa base nova, nunca por cima da atual: `createdb -U pz_dev prejuzero_restaurado` e `pg_restore -U pz_dev -d prejuzero_restaurado --no-owner <arquivo.dump>` (o dump vem de `pg_dump -Fc`).
3. Rode as migrações pendentes e confira a trilha de auditoria de cada tenant (job `manutencao.verificar-auditoria`). A cópia WORM em `pz-auditoria-worm` mostra o que foi gravado depois do ponto restaurado.
4. Aponte a aplicação para a base restaurada, suba API e worker e confira os fluxos críticos (entrar, prazos, ciência).
5. Prazos e ciências registrados depois do ponto restaurado se perderam: liste-os pela cópia WORM da auditoria e avise os escritórios afetados (risco de prazo). Registre o incidente ([plano de resposta](plano-resposta-incidentes.md)).
