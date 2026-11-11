# apps/mobile

Aplicativo iOS e Android em React Native/Expo (ADR-015). Cliente da API /v1 pelo cliente gerado do OpenAPI, autenticação OAuth 2.1 + PKCE, push notifications e links universais. Nenhuma regra de negócio aqui.

Arquitetura detalhada: [docs/arquitetura/mobile.md](/docs/arquitetura/mobile.md).

Implementado em: marco M6 · Mobile (pós go-live), a partir da HU63. Siga o [CLAUDE.md](/CLAUDE.md) e os ADRs citados. Esqueleto do projeto (Expo managed, expo-router) na HU63 [MOBILE] (PZ-259); login na HU65, painel e prazos na HU66, ciência na HU68.

## Rodar

```
pnpm --filter @pz/mobile dev   # Expo; EXPO_PUBLIC_API_URL aponta para a API (padrão do perfil development: http://localhost:3001)
```

Build nativo, EAS e lojas são externos e estão adiados até a validação do produto.

## Padrões

- Rotas em `app/` (espelham o portal); lógica em `src/` (`api`, `i18n`, `tema`, `components`).
- Toda chamada à API passa por `src/api/cliente.ts`, que envia `X-Cliente: mobile/<versão>` (versão mínima por plataforma, HU63); `fetch` manual é barrado pelo lint.
- Textos só pelo catálogo `src/i18n/pt-BR.json` (`t('grupo.chave')`, chave tipada); visual só pelos tokens de `@pz/design-tokens` (`src/tema.ts`).
- Fronteiras (`mobile-so-pela-api` no dependency-cruiser): só `@pz/contracts` e `@pz/design-tokens`; nunca `modules/*`, `packages/motor-prazos`, `packages/ui` nem outros apps.
- Testes: lógica em `src/**/*.test.ts` com Vitest. Testes de componente esperam a decisão do runner (ADR-017).
