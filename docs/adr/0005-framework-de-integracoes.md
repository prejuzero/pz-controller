# ADR-005 · Framework de integrações

- **Status:** Aceito
- **Data:** 2026-10-03

## Contexto

O produto depende de fontes e canais que vão mudar (DJEN, e-mail, IA, armazenamento; depois DataJud, tribunais, Domicílio, WhatsApp, SSO, cobrança). Trocar fornecedor não pode exigir mudança de regra de negócio.

## Decisão

Toda dependência externa fica atrás de uma porta tipada em `packages/integracoes`. Cada provedor é um adaptador com descritor (id, versão, capacidades, limites), envolto por resiliência padrão (timeout, retentativa com backoff e jitter, circuit breaker, bulkhead, rate limit distribuído) e telemetria. Portas iniciais: FontePublicacoes, CanalNotificacao, ProvedorEmail, ProvedorIA, ArmazenamentoArquivos. Previstas: CofreSegredos, ProvedorIdentidade, ProvedorCobranca, ExtratorTexto.

## Consequências

Adaptadores convertem para modelos canônicos (camada anticorrupção); todo adaptador passa no kit de testes de contrato; webhooks de entrada passam por um gateway único com verificação de assinatura e persistência bruta; a saúde de cada adaptador é visível e gera alerta.
