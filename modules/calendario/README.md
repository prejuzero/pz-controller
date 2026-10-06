# modules/calendario

Calendário forense (HU13): feriados, recessos, portarias e indisponibilidades em cinco níveis
(nacional, UF, município, tribunal e comarca), sempre com o ato normativo e o link oficial.

- **Global** (`evento_calendario`, sem tenant): o curador propõe no tenant plataforma e outro curador
  aprova (quatro olhos, CLAUDE.md 4.3). Só aprovado e não revogado entra no cálculo. Revogar exige
  motivo e fica na trilha.
- **Local** (`feriado_local`, com RLS): o escritório cadastra para o próprio tenant; nunca no nível
  nacional. Só pode ser revogado.
- Toda inclusão ou revogação vigente grava auditoria e publica `CalendarioAlterado` pelo outbox.
- Porta do motor: `ConsultarDiasNaoUteis.diasNaoUteis(jurisdicao, inicio, fim)` devolve um item por
  dia e evento, com motivo e fonte. Sábados e domingos são regra do motor (CPC, art. 216).

Nenhum feriado real é cadastrado pelo código: a carga entra pelo curador. Os testes usam dados
fictícios (`teste/ficticios.ts`).

| Camada         | Conteúdo                                               |
| -------------- | ------------------------------------------------------ |
| `domain/`      | `EventoGlobal`, `FeriadoLocal`, `diasNaoUteis` (puros) |
| `application/` | Casos de uso e portas                                  |
| `infra/`       | Repositórios PostgreSQL e em memória                   |
| `index.ts`     | Única API pública do módulo                            |
