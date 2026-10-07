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
