# Módulo captura

Alvos de monitoramento e execução da captura de publicações (HU17, ADR-014).

- **Alvo** (`alvo_monitoramento`, global): OAB (`"número/UF"`) ou processo (20 dígitos). A mesma OAB em N escritórios é um alvo só, consultado uma vez por execução.
- **Assinatura** (`alvo_assinante`, por tenant, RLS): mantida pelos consumidores de `OabAdicionada`, `OabRemovida` e `ProcessoMonitorado` (`ManterAssinaturas`).
- **Planejamento** (`PlanejarCaptura`): alvos ativos com assinante e fora do recuo de falhas; janela do dia anterior ao último fim capturado até hoje (alvo novo: `CAPTURA_DIAS_INICIAIS`). O job `captura.planejar` (cron `CAPTURA_CRON`, padrão 6 vezes ao dia) enfileira um `captura.executar` por alvo com jitter (`CAPTURA_JITTER_MS`) e chave alvo + janela.
- **Execução** (`ExecutarCaptura`): uma consulta à `FontePublicacoes` (`CAPTURA_FONTE`, padrão DJEN). Numa transação do papel sistema, trava o alvo, grava um `CapturaConcluida` por tenant assinante e o checkpoint; a mesma chave não entrega duas vezes. Falha da fonte registra o recuo (30 min dobrando até 6 h) e relança para a retentativa e a DLQ.

O `CapturaConcluida` leva as publicações no modelo canônico; a persistência deduplicada é da HU18.

## Monitoramento por nome do escritório (HU42, RF05)

- **Alvo `nome`**: forma canônica (`nomeMonitoradoCanonico`, kernel: espaços simples e maiúsculas), de 5 a 150 caracteres. Assinado pelos consumidores de `NomeMonitoradoAdicionado` e `NomeMonitoradoRemovido` (cadastro).
- **Fonte**: `FontePublicacoes.buscarPorNome` (DJEN: parâmetro `nomeParte`, conferido na API pública em 08/11/2026; a busca acha o nome dentro do nome do destinatário e não diferencia maiúsculas nem acentos). Por isso o resultado pode trazer homônimos: a ingestão (módulo publicacoes) o trata como "a conferir".

## Buscar agora e próxima rodada (HU17)

- `SolicitarBuscaAgora` (API, `POST /v1/captura/oabs/{id}/buscar-agora`): a OAB vem pela assinatura do tenant (RLS); o alvo, global, é travado e aceita um pedido a cada 5 minutos (`INTERVALO_DA_BUSCA_AGORA_MS`), valendo para todos os escritórios da OAB. Grava `captura.busca-solicitada` na trilha e `BuscaAgoraSolicitada` no outbox, na mesma transação.
- `PlanejarBuscaAgora` (consumidor no worker): planeja a janela desde a última captura, com `agora-<id do evento>` como rodada, e enfileira a execução sem jitter.
- A chave da execução é alvo + janela + rodada: a retentativa do mesmo job não entrega de novo, mas outra rodada do mesmo dia entrega (antes, a partir da 3ª rodada do dia a janela se repetia e nada era entregue). A ingestão deduplica as publicações.
- `RegistrarProximaRodada`: o worker grava em `fonte_captura.proxima_rodada` o próximo horário do agendador (no boot e a cada rodada); o status mostra ao escritório.
