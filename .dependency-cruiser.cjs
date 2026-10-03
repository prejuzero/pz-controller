// Regras de dependência entre camadas e módulos (CLAUDE.md, seção 6; ADR-001).
// Qualquer violação falha o `pnpm lint` e o CI.

/** Bibliotecas de infraestrutura que só podem aparecer em `infra/` e `packages/adapters/`. */
const SDKS_DE_INFRA =
  '^(@prisma/client|prisma|@aws-sdk/.+|@anthropic-ai/.+|ioredis|bullmq|nodemailer|pg|undici|axios|@nestjs/.+)$';

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
      from: { path: '^modules/([^/]+)/domain/' },
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
          '^packages/(kernel|motor-prazos|contracts)/',
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
      from: { path: '^packages/motor-prazos/', pathNot: '\\.test\\.ts$' },
      to: {
        pathNot: ['^packages/motor-prazos/', '^packages/kernel/'],
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'kernel-sem-dependencias-internas',
      severity: 'error',
      comment: 'packages/kernel é a base de tudo e não depende de outros pacotes do monorepo.',
      from: { path: '^packages/kernel/' },
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
    exclude: { path: '(^|/)(dist|coverage|\\.next|\\.turbo)/' },
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
