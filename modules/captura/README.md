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
