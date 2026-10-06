import { createHash } from 'node:crypto';

import { FixedClock, Instant } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { calcularHash, HASH_GENESE } from '../domain/cadeia.js';

import { ConsultarTrecho, VerificarIntegridade } from './integridade.js';

import type { Checkpoint, RepositorioDaCadeia } from './integridade.js';
import type { RegistroEncadeado } from '../domain/cadeia.js';

const sha256 = (texto: string) => createHash('sha256').update(texto).digest('hex');
const relogio = new FixedClock(Instant.deIso('2026-10-07T05:00:00Z'));

function cadeia(
  tenantId: string,
  tamanho: number,
  inicio: RegistroEncadeado[] = [],
): RegistroEncadeado[] {
  const registros = [...inicio];
  for (let sequencia = registros.length + 1; sequencia <= tamanho; sequencia++) {
    const anterior = registros.at(-1)?.hash ?? HASH_GENESE;
    const base = {
      id: `${tenantId}-${String(sequencia)}`,
      tenantId,
      sequencia,
      tipo: 'identidade.conta-bloqueada',
      entidade: 'usuario',
      entidadeId: sequencia % 2 === 0 ? 'par' : 'impar',
      usuarioId: null,
      usuarioRealId: null,
      canal: 'evento',
      ip: null,
      userAgent: null,
      antes: null,
      depois: null,
      criadoEm: '2026-10-07T04:00:00.000Z',
    };
    registros.push({ ...base, hashAnterior: anterior, hash: calcularHash(anterior, base, sha256) });
  }
  return registros;
}

function em(registros: RegistroEncadeado[], i: number): RegistroEncadeado {
  const registro = registros[i];
  if (registro === undefined) throw new Error('índice fora da cadeia');
  return registro;
}

class Repo implements RepositorioDaCadeia<null> {
  readonly checkpoints = new Map<string, Checkpoint>();
  constructor(readonly dados: Map<string, RegistroEncadeado[]>) {}
  tenants() {
    return Promise.resolve([...this.dados.keys()]);
  }
  ler(_tx: null, tenantId: string, desde: number, limite: number) {
    return Promise.resolve(
      (this.dados.get(tenantId) ?? []).filter((r) => r.sequencia > desde).slice(0, limite),
    );
  }
  ultimaSequencia(_tx: null, tenantId: string) {
    return Promise.resolve(this.dados.get(tenantId)?.at(-1)?.sequencia ?? 0);
  }
  checkpoint(_tx: null, tenantId: string) {
    return Promise.resolve(this.checkpoints.get(tenantId));
  }
  salvar(_tx: null, tenantId: string, c: Checkpoint) {
    this.checkpoints.set(tenantId, c);
    return Promise.resolve();
  }
}

function montar(dados: Map<string, RegistroEncadeado[]>) {
  const repo = new Repo(dados);
  const arquivos: { tenantId: string; caminho: string; conteudo: string }[] = [];
  const worm = {
    gravar: (tenantId: string, caminho: string, conteudo: Uint8Array) => {
      arquivos.push({ tenantId, caminho, conteudo: new TextDecoder().decode(conteudo) });
      return Promise.resolve();
    },
  };
  const unidade = { executar: <R>(t: (tx: null) => Promise<R>) => t(null) };
  return {
    repo,
    arquivos,
    verificar: new VerificarIntegridade(unidade, repo, worm, sha256, relogio),
  };
}

describe('verificador diário da auditoria (PZ-110)', () => {
  it('cadeia íntegra: exporta NDJSON canônico por tenant e avança o checkpoint; no dia seguinte, só o novo', async () => {
    const dados = new Map([
      ['a', cadeia('a', 3)],
      ['b', cadeia('b', 1)],
    ]);
    const { verificar, arquivos, repo } = montar(dados);
    expect(await verificar.executar()).toEqual([
      { tenantId: 'a', situacao: 'integra', exportados: 3 },
      { tenantId: 'b', situacao: 'integra', exportados: 1 },
    ]);
    expect(arquivos[0]).toMatchObject({
      tenantId: 'a',
      caminho: 'auditoria/2026/10/07/1-3.ndjson',
    });
    expect(
      arquivos[0]?.conteudo
        .trim()
        .split('\n')
        .map((l) => (JSON.parse(l) as { sequencia: number }).sequencia),
    ).toEqual([1, 2, 3]);
    expect(repo.checkpoints.get('a')).toMatchObject({ ultimaSequencia: 3, ultimaExportada: 3 });

    dados.set('a', cadeia('a', 5, dados.get('a')));
    expect(await verificar.executar()).toContainEqual({
      tenantId: 'a',
      situacao: 'integra',
      exportados: 2,
    });
    expect(arquivos.at(-1)?.caminho).toBe('auditoria/2026/10/07/4-5.ndjson');
  });

  it('conteúdo alterado: divergência na sequência exata, sem exportar nem avançar', async () => {
    const registros = cadeia('a', 4);
    registros[2] = { ...em(registros, 2), depois: { adulterado: true } };
    const { verificar, arquivos, repo } = montar(new Map([['a', registros]]));
    expect(await verificar.executar()).toEqual([
      {
        tenantId: 'a',
        situacao: 'divergente',
        sequencia: 3,
        motivo: 'conteúdo alterado (hash não confere)',
      },
    ]);
    expect(arquivos).toEqual([]); // lote com defeito não vai para o WORM
    expect(repo.checkpoints.has('a')).toBe(false);
  });

  it('registros apagados do fim: o checkpoint (âncora) revela', async () => {
    const dados = new Map([['a', cadeia('a', 5)]]);
    const { verificar } = montar(dados);
    await verificar.executar();
    dados.set('a', (dados.get('a') ?? []).slice(0, 3));
    expect(await verificar.executar()).toEqual([
      expect.objectContaining({
        tenantId: 'a',
        situacao: 'divergente',
        sequencia: 4,
        motivo: expect.stringContaining('removidos do fim') as unknown,
      }),
    ]);
  });
});

describe('trecho verificável (HU35)', () => {
  it('devolve os registros da entidade e se a cadeia inteira confere', async () => {
    const registros = cadeia('a', 5);
    const consultar = new ConsultarTrecho(new Repo(new Map([['a', registros]])), sha256);
    const trecho = await consultar.executar(null, 'a', 'usuario', 'par');
    expect(trecho.cadeiaIntegra).toBe(true);
    expect(trecho.registros.map((r) => r.sequencia)).toEqual([2, 4]);

    registros[0] = { ...em(registros, 0), tipo: 'alterado' };
    expect((await consultar.executar(null, 'a', 'usuario', 'par')).cadeiaIntegra).toBe(false);
  });
});
