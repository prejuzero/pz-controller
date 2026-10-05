# modules/saude

Módulo de exemplo da HU04, no desenho que todo módulo segue (ADR-001): situação da plataforma, com rota, caso de uso, evento e consumidor.

| Camada         | Conteúdo                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `domain/`      | `avaliarSituacao` e o agregado `VerificacaoDeSituacao`, que publica `SituacaoVerificada` v1                                           |
| `application/` | `ConsultarSituacao` (porta `VerificadorDeDependencia`), `RegistrarVerificacao` (outbox) e o consumidor `RegistrarHistoricoDeSituacao` |
| `infra/`       | `VerificadorTcp`, `VerificadorHttp` e `HistoricoEmMemoria`                                                                            |
| `index.ts`     | Única API pública                                                                                                                     |

Usado pela api (`GET /v1/saude`, `/health/ready`) e pelo worker (`@Consome('SituacaoVerificada')`). O teste `infra/fluxo.test.ts` percorre verificação → outbox → relay → consumidor.

Os verificadores TCP bastam para a prontidão até a HU05 (banco) e a HU10 (Redis) trazerem verificações no protocolo de cada serviço.
