# modules/identidade

Módulo identidade, gerado por `pnpm gen:module` no desenho hexagonal (ADR-001).

| Camada         | Conteúdo                                              |
| -------------- | ----------------------------------------------------- |
| `domain/`      | Regras puras; importa só `@pz/kernel`                 |
| `application/` | Casos de uso e portas; sem Prisma, HTTP nem SDKs      |
| `infra/`       | Implementações das portas (repositórios, adaptadores) |
| `index.ts`     | Única API pública do módulo                           |

O exemplo gerado (`Identidade`, `CriarIdentidade`, evento `IdentidadeCriado`) mostra o fluxo agregado → outbox; troque-o pelas regras do card.

## Autorização (HU07)

- **Catálogo de permissões** em `domain/permissoes.ts`: fonte única (`recurso:acao`, ex.: `prazos:ler`). O mesmo nome é o escopo OAuth (`escoposOAuth()`) e a permissão das ferramentas de IA. Permissão nova entra aqui primeiro.
- **Perfis** no banco (`perfil`, `perfil_permissao`, globais; mudam só por migração) e atribuídos por tenant em `usuario_perfil` (RLS). `domain/perfis.ts` espelha a migração para os testes; o teste de integração impede divergência. `admin_plataforma` só existe no tenant `plataforma` (trigger).
- **Na API**: toda rota declara `@Publico()`, `@PermiteSessaoParcial()` ou `@RequerPermissao(...)`; a varredura em `apps/api/src/http/autorizacao.test.ts` falha se faltar, e a matriz endpoint × perfil é gerada das rotas reais. As permissões são lidas a cada requisição (`ConsultarPermissoes`): mudar o perfil vale na hora.
- **Regras por recurso** (ex.: responsável do prazo): `Politica<Recurso>` e `autorizar()` do `@pz/kernel`, no domínio do módulo dono do recurso.
- **Impersonação** (`POST/DELETE /v1/admin/impersonacao`, `admin:impersonar`): o administrador da plataforma acessa um tenant com motivo (10 a 500 caracteres), por no máximo 60 min, só pelo portal (token de dispositivo não impersona). Fica na própria sessão: o tenant de origem não muda; o efetivo da requisição (RLS) passa a ser o acessado (`tenantEfetivo`). Valem só as permissões de leitura do catálogo, mais `admin:impersonar` para encerrar; perder essa permissão no perfil corta tudo na hora. Início e encerramento vão para a trilha no tenant acessado e no plataforma, antes de a sessão mudar (sem rastro, sem acesso). Ao vencer, cai sozinha no próximo uso da sessão (o início já registrou até quando valia). Os logs de cada requisição levam `userId` (o administrador), `tenantId` (o acessado) e `impersonacaoId`.

## Equipe do escritório (HU41)

- **Titular:** quem cria a conta recebe `advogado` e `admin_escritorio` (contas antigas, pela migração `20261124000000_equipe`).
- **Convite** (`POST /v1/equipe/convites`, `usuarios:gerir`): e-mail único no sistema, perfil `advogado`, `colaborador` ou `admin_escritorio`, link de uso único por 7 dias (só o hash do token no banco; o token vai cifrado no evento `ConviteDeMembroEnviado` e o worker envia o e-mail). O aceite (`/convite#token=…` no portal) cria o usuário no escritório com a senha e o e-mail já verificado; o 2FA é configurado no primeiro login. O aceite acha o convite pela função restrita `pz_localizar_convite`, sem BYPASSRLS.
- **Perfis e desativação:** o escritório mantém ao menos um administrador ativo; ninguém desativa a si mesmo. Desativar barra o login (só depois da senha certa, como no escritório suspenso), a redefinição de senha, e derruba sessões, apps e renovações na hora. Tudo vai para a trilha na mesma transação.

## Clientes OAuth de integradores (HU49)

- **Client Credentials** (OAuth 2.1, RFC 6749 seção 4.4): quem tem `integracoes:gerir` registra um cliente (`POST /v1/integracoes/clientes`) e recebe o `client_secret` uma única vez; só o SHA-256 dele fica no banco (`cliente_oauth`, RLS). `POST /v1/oauth/token` (público, formulário ou JSON, segredo no corpo ou em `Authorization: Basic`) devolve um token Bearer de 15 min, sem renovação.
- **O cliente age em nome de quem o registrou**: o token é uma sessão desse usuário com `escopos`; as permissões efetivas são os escopos que ele ainda tiver (`ConsultarPermissoes`). Só escopos de **leitura** do catálogo: integração não confirma prazo, não ajusta data nem dá ciência.
- **Revogar** (`DELETE /v1/integracoes/clientes/{id}`) derruba na hora os tokens emitidos. Registro e revogação vão para a trilha (`identidade.cliente-oauth-registrado` e `-revogado`). Escritório suspenso não recebe token. Limite de 120 requisições/min por cliente, dentro do limite do escritório.
- **Apps públicos (Authorization Code + PKCE):** `POST /v1/integracoes/apps` registra o app sem segredo, com endereços de retorno (HTTPS, ou HTTP no loopback), comparados por igualdade exata. A tela `/oauth/autorizar` do portal confere o pedido (`GET /v1/oauth/autorizacao`) e, ao permitir (`POST`, só com a sessão do navegador e o CSRF), emite um código de uso único (60 s, só o hash no Redis). `authorization_code` confere cliente, retorno e PKCE S256, abre uma sessão de dispositivo ligada ao app e devolve acesso (15 min) e renovação rotativa. `refresh_token` só renova para o mesmo cliente. Revogar o app revoga as sessões abertas por ele. A autorização vai para a trilha (`identidade.cliente-oauth-autorizado`).
- O endpoint de token localiza o cliente pela função restrita `pz_localizar_cliente_oauth` (papel `pz_credencial`, como o login): a api segue sem BYPASSRLS.

## App oficial (HU65)

- O app entra por Authorization Code + PKCE (S256) com o `client_id` fixo `CLIENTE_OAUTH_DO_APP` (`@pz/contracts`), um registro global marcado `app_oficial` criado pela migração `20261203000000_app_oficial_oauth`. Ele reaproveita o fluxo do registro dinâmico: na primeira autorização, o escritório ganha um cliente público ligado ao registro.
- Escopos: os de leitura e `prazos:confirmar` (decisão de 11/11/2026), sempre dentro das permissões de quem autoriza. Nada de ajustar, distribuir ou administrar. Os outros registros dinâmicos seguem só na leitura.
- Endereços de retorno: `APP_OAUTH_REDIRECT_URIS` na api (padrão `br.com.prejuzero.app:/oauth/retorno`, esquema do app em domínio reverso, RFC 8252), com comparação exata.
- A troca do código abre uma sessão de dispositivo `mobile`. A renovação é rotativa, e reapresentar uma renovação já usada revoga a sessão inteira.

## Tenants da plataforma (HU39)

- `GET /v1/admin/tenants` (cursor), `GET /v1/admin/tenants/{id}`, `PATCH .../assinatura`, `POST/DELETE .../suspensao`, todas com `admin:tenants`. Só a linha do tenant (nome, tipo, plano, assinatura, suspensão); dados de negócio só por impersonação.
- No tenant plataforma, a política `plataforma_le_tenants` deixa ler a linha de todos os tenants (só leitura; `pz_plataforma_atual()`). Alterar continua exigindo rodar no tenant alterado.
- Plano e situação da assinatura (`teste`, `ativa`, `inadimplente`, `cancelada`) são manuais no MVP; o gateway futuro entra pela porta `ProvedorCobranca` (`@pz/integracoes`).
- **Suspensão** (decisão do PO, 08/10/2026): só bloqueia o acesso. O login com a senha certa responde `tenant-suspenso` (senha errada continua `credenciais-invalidas`, sem revelar a suspensão), a renovação de tokens do app é recusada e as sessões abertas caem na hora. Captura, cálculo e avisos de prazo continuam. Suspender de novo só derruba as sessões; reativar algo não suspenso não faz nada.
- Toda alteração vai para a trilha no tenant alterado e no plataforma (`identidade.assinatura-alterada`, `identidade.tenant-suspenso`, `identidade.tenant-reativado`), com antes e depois.
