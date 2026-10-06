# packages/design-tokens

Tokens de design (cores, tipografia, espaçamento, raios, sombras e breakpoints) como dados puros, sem dependência de React DOM (ADR-015). Fonte única para o design system web (`packages/ui`) e para o app mobile.

- `src/tokens.ts`: os valores. Cores por **papel semântico** (`fundo`, `texto`, `primaria`, `perigo`, `ia`...) nos temas claro e escuro.
- `gerado/tokens.css`: variáveis `--pz-*`. O tema escuro segue o sistema operacional ou é fixado com `data-tema="escuro"` no `<html>`.
- `gerado/tema-tailwind.css`: `@theme inline` do Tailwind v4 apontando para as variáveis (`bg-primaria`, `text-texto-suave`, `rounded-md`...).
- `temaNativo('claro' | 'escuro')`: formato do React Native (números e `shadow*`).

Uso no portal (CSS global):

```css
@import 'tailwindcss';
@import '@pz/design-tokens/tokens.css';
@import '@pz/design-tokens/tema-tailwind.css';
```

Ao mudar `src/tokens.ts`, rode `pnpm --filter @pz/design-tokens gerar` e versione `gerado/` (o CI confere). Os testes garantem contraste WCAG 2.1 AA nos dois temas: texto ≥ 4,5:1 e componentes/foco ≥ 3:1.
