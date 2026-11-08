# Módulo cadastro (HU11, HU12)

Advogado e inscrições na OAB de cada tenant; processos e clientes do escritório.

- **Domínio:** `Advogado` (agregado), value objects `Cpf`, `NumeroOab`, `Uf` e `Celular`. Eventos `AdvogadoCadastrado`, `OabAdicionada` e `OabRemovida` (a captura monitora as OABs ativas).
- **Casos de uso:** `CadastrarAdvogado` (público), `ConsultarPerfil`, `AtualizarPerfil`, `AdicionarOab` e `RemoverOab`. Toda alteração vai para a trilha de auditoria; o CPF aparece só mascarado.
- **Transação do cadastro:** tenant autônomo, usuário, credencial e perfil (via `CriarConta` da identidade, pela porta `CriadorDeConta`), advogado e OABs. Qualquer conflito (e-mail, CPF, OAB) desfaz tudo.
- **Dados:** `advogado` e `oab` com RLS. CPF e OAB ativa são únicos em toda a base (índices globais, `ON CONFLICT DO NOTHING`). OAB não é apagada, só desativada.

## Processos e clientes (HU12)

- **Domínio:** `Processo` (agregado) pelo `NumeroCnj` do kernel, com tribunal e ramo deduzidos do número; sigilo e cobertura (`automatica`, `parcial`, `manual`; fora da automática, com motivo, RF91). `Cliente` com `Documento` opcional (CPF ou CNPJ, inclusive alfanumérico). Eventos `ProcessoMonitorado` e `CoberturaAlterada`.
- **Casos de uso:** `CadastrarProcesso`, `ConsultarProcesso`, `ListarProcessos` (filtros e cursor), `AtualizarProcesso`, `AlterarCobertura` e o CRUD de clientes. `ObterOuCriarProcesso` é a API interna da ingestão: idempotente sob concorrência (`ON CONFLICT DO NOTHING` e nova busca).
- **Dados:** `processo` (único por `tenant_id, numero_cnj`; não é apagado) e `cliente` com RLS. A FK composta `(tenant_id, cliente_id)` impede vincular cliente de outro tenant. Permissões `processos:ler` e `processos:gerir`.

## Importação de processos por CSV (HU42, RF04)

Decisões do usuário em 08/11/2026: só CSV, com prévia e gravação em segundo plano.

- `POST /v1/processos/importacoes` (`processos:gerir`): até 1.000 linhas; cabeçalho com `numeroCnj` (obrigatória) e, em qualquer ordem, `orgao`, `comarca` e `sigiloso` (sim/não). Com `somentePrevia: true` (padrão) só valida: cada linha sai `valida`, `ja-cadastrado` (será ignorada) ou `invalida` com os problemas. Com `false` e nenhuma linha inválida, grava o pedido (`importacao_processo`, RLS), a trilha `cadastro.importacao-solicitada` e o evento `ImportacaoDeProcessosSolicitada`.
- O worker (`ConsumidorDoCadastro`) cadastra os processos na transação do consumo, cada um com `cadastro.processo-cadastrado` e `ProcessoMonitorado` (a captura passa a monitorá-los), e conclui com `cadastro.importacao-concluida`. Repetir o evento não refaz nada; processo cadastrado por outro caminho depois da prévia conta como "já existia".
- `GET /v1/processos/importacoes/{id}`: andamento; o portal consulta a cada 2 s até concluir.
