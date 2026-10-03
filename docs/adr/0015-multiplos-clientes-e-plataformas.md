# ADR-015 · Múltiplos clientes e plataformas (web, mobile, assistentes de IA e integradores)

- **Status:** Aceito
- **Data:** 2026-10-03
- **Complementa:** ADR-005, ADR-009

## Contexto

O MVP tem um único cliente (o portal web), mas o produto vai ganhar outros: aplicativo mobile (iOS e Android), assistentes de IA externos via MCP, canais de mensagem (WhatsApp) e integradores (ERPs jurídicos, automações) pela API pública. Se o portal concentrar lógica ou se a autenticação depender de cookie, cada novo cliente exigirá retrabalho na identidade e duplicação de regras.

## Decisão

1. **API como única porta da regra de negócio.** Todo comportamento de negócio é exposto pela API `/v1` (ADR-009). Nenhum cliente (portal, app, servidor MCP, canal de mensagem) contém regra de negócio; o Next.js não é BFF de regras (server actions e route handlers só repassam chamadas à API).
2. **Contratos neutros de plataforma.** `packages/contracts` não contém tipos ou formatos específicos de web. O OpenAPI gerado é a fonte para clientes TypeScript (portal e app) e para geradores de outras linguagens.
3. **Autenticação em dois modos, mesma identidade.**
   - Navegador: sessão opaca em cookie HttpOnly + CSRF.
   - Clientes nativos, MCP e integradores: OAuth 2.1 com Authorization Code + PKCE (apps e assistentes) ou Client Credentials (integradores servidor-a-servidor), com access token de vida curta, refresh token rotativo e revogação por dispositivo/cliente.
   - Os guards da API aceitam os dois modos; o CSRF só se aplica ao modo cookie. Permissões viram escopos OAuth a partir do mesmo catálogo de permissões.
4. **Registro de dispositivos e clientes.** Tabelas de sessões por dispositivo (com revogação remota) e de clientes OAuth registrados; tokens de push vinculados ao dispositivo.
5. **Links estáveis e universais.** Todo link enviado por e-mail, push ou mensagem usa caminhos HTTPS estáveis (ex.: `/ciencia/{token}`, `/prazos/{id}`) que funcionam no navegador e podem ser abertos pelo app (universal links / app links). A confirmação de ciência continua exigindo ação explícita na página ou tela de confirmação (RF72).
6. **Design tokens separados.** Cores, tipografia e espaçamento ficam em `packages/design-tokens`, consumido pelo design system web (`packages/ui`) e pelo app.
7. **Stack recomendada para o app:** React Native com Expo, para reaproveitar TypeScript, contratos e cliente gerado. A decisão final é confirmada quando a história do app for planejada.
8. **Notificações por canal.** Push (FCM/APNs), WhatsApp e SMS entram como adaptadores da porta `CanalNotificacao` (ADR-005), com preferências e consentimento por canal.

## Consequências

- A HU06 implementa os dois modos de autenticação desde o início; a HU07 mapeia permissões em escopos; a HU30 registra dispositivos e consentimento por canal; a HU23 separa os design tokens.
- Novos clientes entram sem alterar domínio, módulos ou contratos existentes.
- O app mobile vive em `apps/mobile`; o servidor MCP em `apps/mcp`, ambos sob as mesmas regras de fronteira e quality gates.
- Sessões e clientes passam a ser dados auditados (criação, renovação, revogação).
