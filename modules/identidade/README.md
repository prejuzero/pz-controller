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
