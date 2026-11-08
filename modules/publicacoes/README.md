# modules/publicacoes

Módulo publicacoes, gerado por `pnpm gen:module` no desenho hexagonal (ADR-001).

| Camada         | Conteúdo                                              |
| -------------- | ----------------------------------------------------- |
| `domain/`      | Regras puras; importa só `@pz/kernel`                 |
| `application/` | Casos de uso e portas; sem Prisma, HTTP nem SDKs      |
| `infra/`       | Implementações das portas (repositórios, adaptadores) |
| `index.ts`     | Única API pública do módulo                           |

O exemplo gerado (`Publicacoes`, `CriarPublicacoes`, evento `PublicacoesCriado`) mostra o fluxo agregado → outbox; troque-o pelas regras do card.

## Capturadas pelo nome do escritório (HU42; decisões do usuário em 08/11/2026)

- `CapturaConcluida` do tipo `nome` grava o destinatário com `conferencia = 'pendente'`, sem processo e sem `PublicacaoRecebida`: nada de prazo nem lembrete para um possível homônimo.
- `POST /v1/publicacoes/{id}/conferencia` (`processos:gerir`): `confirmar` cria o processo do número (cadastro) e publica `PublicacaoRecebida`, que leva ao prazo "a confirmar" como qualquer outra; `descartar` tira a publicação de todas as leituras. Ambos com trilha (`publicacoes.publicacao-confirmada` / `-descartada`).
- Se a mesma publicação chega depois por OAB ou processo, a confirmação é automática (sem autor).
- `GET /v1/publicacoes?conferir=true`: só as que esperam conferência; cada publicação traz `conferencia` (`pendente`, `confirmada` ou nulo).
