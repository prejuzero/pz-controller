# modules/publicacoes

Módulo publicacoes, gerado por `pnpm gen:module` no desenho hexagonal (ADR-001).

| Camada         | Conteúdo                                              |
| -------------- | ----------------------------------------------------- |
| `domain/`      | Regras puras; importa só `@pz/kernel`                 |
| `application/` | Casos de uso e portas; sem Prisma, HTTP nem SDKs      |
| `infra/`       | Implementações das portas (repositórios, adaptadores) |
| `index.ts`     | Única API pública do módulo                           |

O exemplo gerado (`Publicacoes`, `CriarPublicacoes`, evento `PublicacoesCriado`) mostra o fluxo agregado → outbox; troque-o pelas regras do card.
