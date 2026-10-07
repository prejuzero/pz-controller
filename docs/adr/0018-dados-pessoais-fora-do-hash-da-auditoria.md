# ADR-018 · Dados pessoais da auditoria fora do hash da cadeia

- **Status:** Aceito
- **Data:** 2026-10-07
- **Complementa:** ADR-006

## Contexto

A LGPD (HU38) exige que, no encerramento da conta, os dados pessoais deixem de existir, mas a trilha de auditoria tem retenção legal e é uma cadeia de hash imutável (ADR-006): apagar ou trocar um valor quebra a cadeia, e a prova se perde. Decisão do produto (07/10/2026): os registros de auditoria são pseudonimizados, não apagados, sem invalidar a cadeia.

## Decisão

- Dados pessoais da trilha (IP e navegador da origem, e valores que o emissor marca com `dadoPessoal(...)` em `antes`/`depois`) não vão para `evento_auditoria`. Vão para `auditoria_dado_pessoal` (por tenant, RLS), com um compromisso `SHA-256(sal || valor)`; o evento guarda só o identificador dessa linha (`dados_pessoais` e marcadores `{"$dadoPessoal": "<id>"}`), e é esse identificador que entra no hash.
- Pseudonimizar = apagar `valor` e `sal` (só para nulo, por trigger; só o papel sistema). O compromisso fica: a cadeia continua válida e, enquanto o valor existir, é possível provar que ele é o original.
- Vale para os eventos gravados a partir desta versão. Os anteriores (IP e navegador em claro) seguem como estão até o fim da retenção legal.

## Consequências

- Ler a trilha com os dados pessoais exige juntar `auditoria_dado_pessoal`; a cópia WORM leva só os identificadores (minimização).
- Emissores que gravam dado pessoal em `antes`/`depois` devem marcá-lo com `dadoPessoal(...)`; sem marcação, o valor fica no hash e não é pseudonimizável.
