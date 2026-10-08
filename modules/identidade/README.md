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

## Tenants da plataforma (HU39)

- `GET /v1/admin/tenants` (cursor), `GET /v1/admin/tenants/{id}`, `PATCH .../assinatura`, `POST/DELETE .../suspensao`, todas com `admin:tenants`. Só a linha do tenant (nome, tipo, plano, assinatura, suspensão); dados de negócio só por impersonação.
- No tenant plataforma, a política `plataforma_le_tenants` deixa ler a linha de todos os tenants (só leitura; `pz_plataforma_atual()`). Alterar continua exigindo rodar no tenant alterado.
- Plano e situação da assinatura (`teste`, `ativa`, `inadimplente`, `cancelada`) são manuais no MVP; o gateway futuro entra pela porta `ProvedorCobranca` (`@pz/integracoes`).
- **Suspensão** (decisão do PO, 08/10/2026): só bloqueia o acesso. O login com a senha certa responde `tenant-suspenso` (senha errada continua `credenciais-invalidas`, sem revelar a suspensão), a renovação de tokens do app é recusada e as sessões abertas caem na hora. Captura, cálculo e avisos de prazo continuam. Suspender de novo só derruba as sessões; reativar algo não suspenso não faz nada.
- Toda alteração vai para a trilha no tenant alterado e no plataforma (`identidade.assinatura-alterada`, `identidade.tenant-suspenso`, `identidade.tenant-reativado`), com antes e depois.
