# Runbook · Teste de carga (k6)

Teste de carga do portal (HU40, PZ-231): massa sintética FICTÍCIA de escritórios, sessões prontas e o cenário k6 com os SLOs (Padrões de engenharia) como limites. Uma execução que passa de qualquer limite termina com erro.

## Rodar

```bash
LIMITE_POR_IP_POR_MINUTO=10000000 pnpm infra:up:apps   # o k6 sai de um IP só
pnpm db:migrate
pnpm carga                                              # 1.000 escritórios, 500 usuários, 3 min
CARGA_TENANTS=100 CARGA_VUS=50 CARGA_DURACAO=30s pnpm carga   # rodada curta
```

- `infra/k6/massa.sql`: por escritório, 1 advogado, 5 OABs, 20 processos, 40 prazos e 75 publicações do dia. Com 1.000 escritórios, são 5.000 OABs e 75 mil publicações por dia. A massa é idempotente (ids fixos no formato UUIDv7). Os vencimentos são valores de teste para encher as telas, não prazos calculados.
- **Sessões:** `carga.sh` grava uma sessão por escritório no Redis, no formato do `SessoesRedis`, e o k6 usa `Authorization: Bearer`. O login com 2FA não entra na medição.
- `infra/k6/portal.js`: cada usuário virtual abre o dashboard (resumo, próximos prazos, linha do tempo), a lista de prazos, as publicações novas e uma busca, com pausas de 1 a 5 s. Subida de 1 min, patamar de 3 min e descida.
- **Limites:** 5xx e falhas < 0,5%; leitura com p95 < 300 ms; busca com p95 < 500 ms.
- **Saída:** resumo no terminal e em `infra/k6/.relatorio/resumo.json` (fora do git).

A massa roda com o superusuário do ambiente local (`pz_dev`), porque grava em tabelas de vários módulos e escritórios. **Nunca rode `massa.sql` nem `carga.sh` fora do ambiente local.** Para limpar a massa, use `pnpm infra:reset`. Limpe antes de rodar o `pnpm e2e`: os 1.000 escritórios da massa empurram os dados da semente para fora das listas paginadas (o E2E do painel do administrador falha). O conteúdo de publicação é imutável (ADR-014) e não sai com `DELETE`.

## Resultado de referência (04/11/2026)

Ambiente local, um processo de cada app no Docker Desktop (MacBook, 8 GB para os containers), 1.000 escritórios, 500 usuários virtuais:

| Medida                    | Resultado            | SLO      |
| ------------------------- | -------------------- | -------- |
| Requisições               | 86.784 (324/s)       | —        |
| Falhas                    | 0%                   | < 0,5%   |
| Leitura: p95              | 175 ms (máx. 470 ms) | < 300 ms |
| Busca de publicações: p95 | 172 ms (máx. 380 ms) | < 500 ms |

Leitura: com essa massa, um processo da api atende 500 usuários com folga. O valor vale como referência relativa, não como capacidade de produção: o banco é local e pequeno (sem 1 milhão de publicações) e a rede é do próprio host.

## O que este teste ainda não cobre

Ficaram como pendências da HU40 no Notion:

- **Ingestão de 75 mil publicações por dia e picos de captura simultânea:** passam pelo pipeline captura → ingestão → classificação no worker, não pela API. Ver a pendência já aberta de desempenho da ingestão.
- **Recálculo em massa por portaria nacional:** ver a pendência "medir 100 mil em 10 min" (HU16).
- **Custo de infraestrutura por escritório:** depende da AWS (staging com a mesma topologia de produção).
- **Busca com 1 milhão de publicações:** coberta pelo `pnpm test:int:desempenho` de publicações (HU28), não pelo k6.
- **Repetir em staging na AWS**, com várias instâncias e banco gerenciado, antes do go-live.
