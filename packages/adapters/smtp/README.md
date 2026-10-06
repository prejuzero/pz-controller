# @pz/adapter-smtp

Adaptador da porta `ProvedorEmail` por SMTP (ADR-005): Mailpit no ambiente local; qualquer relay SMTP em produção (inclusive o do SES), configurado por ambiente.

- Valida o e-mail contra `EmailCanonico` antes de enviar; envia HTML e texto puro.
- `classificarErroSmtp`: 4xx → `ErroTransitorio`; 421/450/451/452 → `ErroLimiteExcedido`; 535/534/EAUTH → `ErroCredencialInvalida`; 5xx → `ErroPermanente`; rede → `ErroTransitorio`. Retentativa e circuit breaker ficam com o registro.
- Saúde por `verify()` do transporte.

Testes: `pnpm test` (classificação) e `pnpm test:int` (kit `verificarContratoEmail` contra o Mailpit em contêiner).
