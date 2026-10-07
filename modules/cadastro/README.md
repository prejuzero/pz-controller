# Módulo cadastro (HU11)

Advogado e inscrições na OAB de cada tenant.

- **Domínio:** `Advogado` (agregado), value objects `Cpf`, `NumeroOab`, `Uf` e `Celular`. Eventos `AdvogadoCadastrado`, `OabAdicionada` e `OabRemovida` (a captura monitora as OABs ativas).
- **Casos de uso:** `CadastrarAdvogado` (público), `ConsultarPerfil`, `AtualizarPerfil`, `AdicionarOab` e `RemoverOab`. Toda alteração vai para a trilha de auditoria; o CPF aparece só mascarado.
- **Transação do cadastro:** tenant autônomo, usuário, credencial e perfil (via `CriarConta` da identidade, pela porta `CriadorDeConta`), advogado e OABs. Qualquer conflito (e-mail, CPF, OAB) desfaz tudo.
- **Dados:** `advogado` e `oab` com RLS. CPF e OAB ativa são únicos em toda a base (índices globais, `ON CONFLICT DO NOTHING`). OAB não é apagada, só desativada.
