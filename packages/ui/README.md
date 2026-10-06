# packages/ui

Design system do portal (HU23): componentes React sobre shadcn/ui (Radix), estilizados só com os tokens de [`@pz/design-tokens`](../design-tokens/README.md). Tema claro e escuro trocam pelas variáveis CSS (`data-tema` no `<html>` ou o tema do sistema), sem classes `dark:`. Só apresentação: nenhuma regra de negócio aqui (ADR-015), e o dependency-cruiser bloqueia imports de módulos, apps e contratos.

## Uso no portal

```css
/* CSS global do app */
@import '@pz/ui/estilos.css';
```

```tsx
import { Botao, SeloStatus, avisar } from '@pz/ui';
```

Componentes: `Botao`, `Campo`, `Selecao`, `SeletorData` (pt-BR; valor `AAAA-MM-DD`, só exibe e escolhe datas, nunca calcula prazo), `TabelaDados` (TanStack Table, ordenação e paginação), `CardIndicador`, `SeloStatus` (tom `ia` para sugestões da IA), `EtiquetaRemovivel`, `Dialogo`, `Avisos` + `avisar` (toast), `Esqueleto` e os estados abaixo. Textos padrão vêm de `src/mensagens.ts`; o portal sobrescreve pelas props.

## Padrões de estado

Toda tela que busca dados mostra exatamente um destes (story "Padrões/Estados"):

| Estado        | Componente           | Regra                                                          |
| ------------- | -------------------- | -------------------------------------------------------------- |
| Carregando    | `EstadoCarregando`   | Esqueletos no formato do conteúdo; anúncio único (`status`).   |
| Vazio         | `EstadoVazio`        | Diz por que não há nada e oferece o próximo passo.             |
| Erro          | `EstadoErro`         | Anunciado (`alert`), com "Tentar novamente". Nada em silêncio. |
| Sem permissão | `EstadoSemPermissao` | Resposta 403: explica a quem pedir acesso.                     |

## Storybook e testes

```
pnpm --filter @pz/ui storybook               # http://localhost:6006 (painel de acessibilidade incluso)
pnpm --filter @pz/ui test                    # cada story, nos dois temas: play (teclado) + axe WCAG 2.1 AA
pnpm --filter @pz/ui test:visual             # captura por story e tema, no container do Playwright
pnpm --filter @pz/ui test:visual:atualizar   # regrava as referências (revise o diff das imagens)
```

- Os testes rodam num Chromium real (Vitest browser). Na primeira vez: `pnpm --filter @pz/ui exec playwright install chromium`.
- Toda story vira teste automaticamente: a play function cobre o uso por teclado e o axe roda após a interação, em claro e escuro.
- Os testes visuais rodam em `infra/docker/ui-visual.Dockerfile` (exige Docker), localmente e no CI, porque fontes e antialiasing mudam com o SO. As referências ficam em `src/__screenshots__/`; as diferenças de uma falha vão para `.vitest/`.
