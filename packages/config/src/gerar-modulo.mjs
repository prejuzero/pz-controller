#!/usr/bin/env node
// Gera um módulo hexagonal novo (CLAUDE.md, seção 6): `pnpm gen:module <nome>`.
// Cria domain/, application/, infra/, index.ts, testes e o pacote do workspace, com um exemplo
// ponta a ponta (agregado → evento no outbox) que já passa em lint, fronteiras e testes.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const nome = process.argv[2] ?? '';

if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(nome)) {
  process.stderr.write(
    'Uso: pnpm gen:module <nome-em-kebab-case>   (ex.: pnpm gen:module prazos)\n',
  );
  process.exit(2);
}
const pasta = join(raiz, 'modules', nome);
if (existsSync(pasta)) {
  process.stderr.write(`O módulo "${nome}" já existe em modules/${nome}.\n`);
  process.exit(2);
}

const pascal = nome.replace(/(^|-)([a-z0-9])/g, (_, __, letra) => letra.toUpperCase());
const evento = `${pascal}Criado`;
const versoes = JSON.parse(
  await import('node:fs').then((fs) =>
    fs.readFileSync(join(raiz, 'modules', 'saude', 'package.json'), 'utf8'),
  ),
);

const arquivos = {
  'package.json': `${JSON.stringify(
    {
      name: `@pz/${nome}`,
      version: '0.0.0',
      private: true,
      description: `Módulo ${nome}.`,
      type: 'module',
      exports: { '.': './index.ts' },
      scripts: versoes.scripts,
      dependencies: versoes.dependencies,
      devDependencies: versoes.devDependencies,
    },
    null,
    2,
  )}\n`,
  'tsconfig.json': `{
  "extends": "@pz/config/tsconfig.base.json",
  "compilerOptions": {
    "types": ["node"],
    "noEmit": true
  },
  "include": ["**/*.ts"],
  "exclude": ["node_modules", "coverage"]
}
`,
  'vitest.config.ts': `import { criarConfigVitest } from '@pz/config/vitest';

export default criarConfigVitest({ layout: 'modulo' });
`,
  'README.md': `# modules/${nome}

Módulo ${nome}, gerado por \`pnpm gen:module\` no desenho hexagonal (ADR-001).

| Camada         | Conteúdo                                              |
| -------------- | ----------------------------------------------------- |
| \`domain/\`      | Regras puras; importa só \`@pz/kernel\`                 |
| \`application/\` | Casos de uso e portas; sem Prisma, HTTP nem SDKs      |
| \`infra/\`       | Implementações das portas (repositórios, adaptadores) |
| \`index.ts\`     | Única API pública do módulo                           |

O exemplo gerado (\`${pascal}\`, \`Criar${pascal}\`, evento \`${evento}\`) mostra o fluxo agregado → outbox; troque-o pelas regras do card.
`,
  [`domain/${nome}.ts`]: `import { AggregateRoot, err, gerarUuidV7, ok, Validacao } from '@pz/kernel';

import type { Clock, EventoDominio, Result, Uuid } from '@pz/kernel';

export type ${evento} = EventoDominio<'${evento}', { descricao: string }>;

/** Exemplo gerado: substitua pelas regras do módulo. */
export class ${pascal} extends AggregateRoot<${evento}> {
  private constructor(
    id: Uuid,
    readonly tenantId: Uuid,
    readonly descricao: string,
  ) {
    super(id);
  }

  static criar(tenantId: Uuid, descricao: string, relogio: Clock): Result<${pascal}, Validacao> {
    const texto = descricao.trim();
    if (texto.length === 0) {
      return err(new Validacao([{ campo: 'descricao', mensagem: 'Informe a descrição.' }]));
    }
    const entidade = new ${pascal}(gerarUuidV7(relogio), tenantId, texto);
    entidade.registrarEvento({
      id: gerarUuidV7(relogio),
      tipo: '${evento}',
      versao: 1,
      tenantId,
      agregadoId: entidade.id,
      ocorridoEm: relogio.agora(),
      payload: { descricao: texto },
    });
    return ok(entidade);
  }
}
`,
  [`domain/${nome}.test.ts`]: `import { FixedClock, gerarUuidV7, Instant } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { ${pascal} } from './${nome}.js';

const relogio = new FixedClock(Instant.deIso('2026-01-01T12:00:00Z'));

describe('${pascal}', () => {
  it('cria e registra o evento ${evento}', () => {
    const resultado = ${pascal}.criar(gerarUuidV7(relogio), '  exemplo  ', relogio);
    if (!resultado.ok) throw resultado.erro;
    expect(resultado.valor.descricao).toBe('exemplo');
    expect(resultado.valor.retirarEventos()).toEqual([
      expect.objectContaining({ tipo: '${evento}', versao: 1, payload: { descricao: 'exemplo' } }),
    ]);
  });

  it('recusa descrição vazia', () => {
    const resultado = ${pascal}.criar(gerarUuidV7(relogio), '   ', relogio);
    expect(!resultado.ok && resultado.erro.codigo).toBe('validacao');
  });
});
`,
  [`application/criar-${nome}.ts`]: `import { err, ok } from '@pz/kernel';

import { ${pascal} } from '../domain/${nome}.js';

import type { Clock, Outbox, Result, UnidadeDeTrabalho, Uuid, Validacao } from '@pz/kernel';

/** Porta: persistência do agregado, na transação do caso de uso. */
export interface Repositorio${pascal}<Transacao> {
  salvar(transacao: Transacao, entidade: ${pascal}): Promise<void>;
}

/** Caso de uso de exemplo: agregado e eventos na mesma transação (ADR-004). */
export class Criar${pascal}<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly repositorio: Repositorio${pascal}<Transacao>,
    private readonly outbox: Outbox<Transacao>,
    private readonly relogio: Clock,
  ) {}

  async executar(tenantId: Uuid, descricao: string): Promise<Result<Uuid, Validacao>> {
    const resultado = ${pascal}.criar(tenantId, descricao, this.relogio);
    if (!resultado.ok) return err(resultado.erro);
    const entidade = resultado.valor;
    await this.unidade.executar(async (transacao) => {
      await this.repositorio.salvar(transacao, entidade);
      await this.outbox.gravar(transacao, entidade.retirarEventos());
    });
    return ok(entidade.id);
  }
}
`,
  [`application/criar-${nome}.test.ts`]: `import { FixedClock, gerarUuidV7, Instant, OutboxEmMemoria } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { Criar${pascal} } from './criar-${nome}.js';

import type { Repositorio${pascal} } from './criar-${nome}.js';
import type { ${pascal} } from '../domain/${nome}.js';
import type { TransacaoEmMemoria } from '@pz/kernel';

const relogio = new FixedClock(Instant.deIso('2026-01-01T12:00:00Z'));

function repositorioFalso() {
  const salvos: ${pascal}[] = [];
  const repositorio: Repositorio${pascal}<TransacaoEmMemoria> = {
    salvar: (transacao, entidade) => {
      transacao.aoConfirmar(() => salvos.push(entidade));
      return Promise.resolve();
    },
  };
  return { repositorio, salvos };
}

describe('Criar${pascal}', () => {
  it('salva o agregado e grava o evento no outbox na mesma transação', async () => {
    const banco = new OutboxEmMemoria();
    const { repositorio, salvos } = repositorioFalso();
    const resultado = await new Criar${pascal}(banco, repositorio, banco, relogio).executar(
      gerarUuidV7(relogio),
      'exemplo',
    );

    expect(resultado.ok).toBe(true);
    expect(salvos).toHaveLength(1);
    expect(banco.pendentes().map((evento) => evento.tipo)).toEqual(['${evento}']);
  });

  it('entrada inválida não grava nada', async () => {
    const banco = new OutboxEmMemoria();
    const { repositorio, salvos } = repositorioFalso();
    const resultado = await new Criar${pascal}(banco, repositorio, banco, relogio).executar(
      gerarUuidV7(relogio),
      '',
    );

    expect(resultado.ok).toBe(false);
    expect(salvos).toEqual([]);
    expect(banco.pendentes()).toEqual([]);
  });
});
`,
  [`infra/repositorio-${nome}-em-memoria.ts`]: `import type { Repositorio${pascal} } from '../application/criar-${nome}.js';
import type { ${pascal} } from '../domain/${nome}.js';
import type { TransacaoEmMemoria } from '@pz/kernel';

/** Repositório em memória, até a persistência no Postgres (HU05). */
export class Repositorio${pascal}EmMemoria implements Repositorio${pascal}<TransacaoEmMemoria> {
  readonly #itens = new Map<string, ${pascal}>();

  salvar(transacao: TransacaoEmMemoria, entidade: ${pascal}): Promise<void> {
    transacao.aoConfirmar(() => this.#itens.set(entidade.id, entidade));
    return Promise.resolve();
  }

  buscar(id: string): ${pascal} | undefined {
    return this.#itens.get(id);
  }
}
`,
  [`infra/repositorio-${nome}-em-memoria.test.ts`]: `import { FixedClock, gerarUuidV7, Instant, OutboxEmMemoria } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { Criar${pascal} } from '../application/criar-${nome}.js';

import { Repositorio${pascal}EmMemoria } from './repositorio-${nome}-em-memoria.js';

describe('Repositorio${pascal}EmMemoria', () => {
  it('guarda o agregado só quando a transação é confirmada', async () => {
    const relogio = new FixedClock(Instant.deIso('2026-01-01T12:00:00Z'));
    const banco = new OutboxEmMemoria();
    const repositorio = new Repositorio${pascal}EmMemoria();

    const resultado = await new Criar${pascal}(banco, repositorio, banco, relogio).executar(
      gerarUuidV7(relogio),
      'exemplo',
    );

    if (!resultado.ok) throw resultado.erro;
    expect(repositorio.buscar(resultado.valor)?.descricao).toBe('exemplo');
  });
});
`,
  'index.ts': `// API pública do módulo ${nome} (CLAUDE.md, seção 6): outros módulos e as apps só usam o que está aqui.
export { Criar${pascal} } from './application/criar-${nome}.js';
export type { Repositorio${pascal} } from './application/criar-${nome}.js';
export { ${pascal} } from './domain/${nome}.js';
export type { ${evento} } from './domain/${nome}.js';
export { Repositorio${pascal}EmMemoria } from './infra/repositorio-${nome}-em-memoria.js';
`,
};

for (const [caminho, conteudo] of Object.entries(arquivos)) {
  const destino = join(pasta, caminho);
  await mkdir(dirname(destino), { recursive: true });
  await writeFile(destino, conteudo);
}

// Nomes longos mudam a quebra de linha: o Prettier deixa o resultado no padrão do repositório.
execFileSync(
  join(raiz, 'node_modules', '.bin', 'prettier'),
  ['--write', '--log-level', 'warn', pasta],
  {
    stdio: 'inherit',
  },
);

process.stdout.write(`Módulo criado em modules/${nome}.

Próximos passos:
  1. pnpm install
  2. pnpm --filter @pz/${nome} test
  3. Substitua o exemplo (${pascal}, Criar${pascal}, ${evento}) pelas regras do card.
  4. Exponha o caso de uso na api: controller em apps/api/src/${nome}/, provedores no AppModule
     e a rota em packages/contracts (ROTAS). Consumidores de eventos: apps/worker com @Consome.\n`);
