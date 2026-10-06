// Regras de dependência entre camadas e módulos (CLAUDE.md, seção 6; ADR-001).
// Qualquer violação falha o `pnpm lint` e o CI.

/** Bibliotecas de infraestrutura que só podem aparecer em `infra/` e `packages/adapters/`. */
const SDKS_DE_INFRA =
  '^(@prisma/client|prisma|@aws-sdk/.+|@anthropic-ai/.+|openai|@google/genai|firebase-admin|ioredis|bullmq|nodemailer|pg|undici|axios|@nestjs/.+)$';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'sem-ciclos',
      severity: 'error',
      comment: 'Dependências circulares impedem a evolução independente dos módulos.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'domain-so-importa-kernel',
      severity: 'error',
      comment: 'domain é puro: só pode importar o próprio domínio e packages/kernel.',
      // Testes são ferramenta (ex.: fast-check, obrigatório nos VOs), não código do domínio.
      from: { path: '^modules/([^/]+)/domain/', pathNot: '\\.test\\.ts$' },
      to: {
        pathNot: ['^modules/$1/domain/', '^packages/kernel/'],
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'application-nao-conhece-infra',
      severity: 'error',
      comment: 'application declara portas; não importa infra nem SDKs.',
      from: { path: '^modules/([^/]+)/application/' },
      to: { path: ['^modules/[^/]+/infra/', '^apps/', '^packages/adapters/'] },
    },
    {
      name: 'sdk-so-em-infra-ou-adaptador',
      severity: 'error',
      comment:
        'Prisma, SDKs de nuvem, IA, filas e HTTP só em infra/ ou packages/adapters/ (ADR-005).',
      from: {
        path: [
          '^modules/[^/]+/(domain|application)/',
          '^packages/(kernel|motor-prazos|contracts|ia|design-tokens|ui)/',
        ],
      },
      to: { path: `node_modules/${SDKS_DE_INFRA.slice(1, -1)}/` },
    },
    {
      name: 'modulo-so-pela-api-publica',
      severity: 'error',
      comment: 'Um módulo usa outro apenas pelo index.ts dele ou por eventos.',
      from: { path: '^modules/([^/]+)/' },
      to: { path: '^modules/([^/]+)/(?!index\\.ts$)', pathNot: '^modules/$1/' },
    },
    {
      name: 'ui-so-apresentacao',
      severity: 'error',
      comment:
        'packages/ui é só apresentação: não conhece módulos, apps nem contratos; regra de negócio fica na API (ADR-015).',
      from: { path: '^packages/ui/src/' },
      to: { path: '^(modules|apps|packages/(?!ui/|design-tokens/))' },
    },
    {
      name: 'portal-so-pela-api',
      severity: 'error',
      comment:
        'O portal fala com o back-end só pela API /v1 e o cliente gerado: nada de módulos nem pacotes de servidor (ADR-015).',
      // Configuração de ferramentas (ESLint, Vitest) não vai para o portal.
      from: { path: '^apps/web/src/' },
      to: { path: '^(modules|apps/(?!web/)|packages/(?!ui/|design-tokens/|contracts/))' },
    },
    {
      name: 'apps-so-pela-api-publica',
      severity: 'error',
      comment: 'apps apenas compõem módulos, pela API pública (index.ts).',
      from: { path: '^apps/' },
      to: { path: '^modules/[^/]+/(domain|application|infra)/' },
    },
    {
      name: 'motor-prazos-so-kernel',
      severity: 'error',
      comment: 'O motor de prazos é puro: só importa a si mesmo e packages/kernel (ADR-007).',
      // Testes e a configuração do Vitest são ferramenta, não código do motor.
      from: { path: '^packages/motor-prazos/', pathNot: '(\\.test\\.ts|/vitest\\.config\\.ts)$' },
      to: {
        pathNot: ['^packages/motor-prazos/', '^packages/kernel/'],
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'kernel-sem-dependencias-internas',
      severity: 'error',
      comment: 'packages/kernel é a base de tudo e não depende de outros pacotes do monorepo.',
      // A configuração do Vitest usa @pz/config; o código do kernel continua isolado.
      from: { path: '^packages/kernel/', pathNot: '/vitest\\.config\\.ts$' },
      to: { path: ['^modules/', '^apps/', '^packages/(?!kernel/)'] },
    },
    {
      name: 'sem-dependencia-nao-declarada',
      severity: 'error',
      comment: 'Todo import de pacote precisa estar declarado no package.json do workspace.',
      from: {},
      to: { dependencyTypes: ['npm-no-pkg', 'npm-unknown'] },
    },
    {
      name: 'sem-import-inexistente',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    // gerado/ e next-env.d.ts: código gerado por ferramentas (Prisma, OpenAPI, Next.js), não editável.
    exclude: {
      path: [
        '(^|/)(dist|coverage|gerado|storybook-static|\\.next|\\.turbo)/',
        'next-env\\.d\\.ts$',
      ],
    },
    tsPreCompilationDeps: true,
    combinedDependencies: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json'],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
