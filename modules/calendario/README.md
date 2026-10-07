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
- Pelo processo: `ConsultarDiasNaoUteisDoProcesso` (`GET /v1/processos/{id}/dias-nao-uteis`) resolve
  a jurisdição com `jurisdicaoDoProcesso`: tribunal e comarca do cadastro, UF só quando o tribunal
  tem uma única UF na tabela do kernel. O que falta (município, UF de tribunal regional, comarca)
  volta em `lacunas`, para a tela avisar; nada é suposto.
- Cache Redis (`CacheDeDiasNaoUteisRedis`) por (tenant, jurisdição, ano), com validade de 24 h.
  O consumidor de `CalendarioAlterado` no worker incrementa a geração do ano (global ou do tenant)
  e as entradas antigas deixam de valer. Redis fora: a consulta segue pelo banco e o erro é
  registrado. Entre a gravação e a entrega do evento pelo outbox há uma janela curta com o cache
  antigo; o recálculo de prazos disparado pelo mesmo evento deve considerar isso.

Nenhum feriado real é cadastrado pelo código: a carga entra pelo curador. Os testes usam dados
fictícios (`teste/ficticios.ts`).

| Camada         | Conteúdo                                               |
| -------------- | ------------------------------------------------------ |
| `domain/`      | `EventoGlobal`, `FeriadoLocal`, `diasNaoUteis` (puros) |
| `application/` | Casos de uso e portas                                  |
| `infra/`       | Repositórios PostgreSQL e em memória                   |
| `index.ts`     | Única API pública do módulo                            |
