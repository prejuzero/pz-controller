import { BancoSistema } from '@pz/db';
import { subirBancoDeTeste } from '@pz/db/teste';
import { Instant } from '@pz/kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CandidatosPostgres } from './candidatos-postgres.js';

import type { CasoCandidato } from '../application/curadoria.js';
import type { BancoDeTeste } from '@pz/db/teste';
import type { Uuid } from '@pz/kernel';

// Dados FICTÍCIOS (HU22): o repositório dos casos candidatos no PostgreSQL.
let postgres: BancoDeTeste;
let sistema: BancoSistema;
const repo = new CandidatosPostgres();
const CONTEUDO = '01a10e00-0000-7000-8000-0000000c0001' as Uuid;
const novo = (id: string, dias: number | null): CasoCandidato => ({
  id: id as Uuid,
  conteudoId: CONTEUDO,
  teorAnonimizado: 'FICTÍCIO',
  tipoAtoClassificado: null,
  tipoAtoCorrigido: 'contestacao',
  diasCitados: null,
  diasCorrigidos: dias,
  status: 'pendente',
  motivoDecisao: null,
  decididoPor: null,
  decididoEm: null,
});

beforeAll(async () => {
  postgres = await subirBancoDeTeste();
  await postgres.migrar();
  sistema = new BancoSistema({ url: postgres.url('pz_sistema') });
}, 300_000);

afterAll(async () => {
  await sistema.encerrar();
  await postgres.parar();
});

describe('casos candidatos no PostgreSQL (HU22)', () => {
  it('a mesma correção vira um caso só; decisão uma vez; lista por status', async () => {
    const executar = <T>(t: Parameters<BancoSistema['executarComoSistema']>[1]) =>
      sistema.executarComoSistema('teste', t) as Promise<T>;
    const a = '01a10e00-0000-7000-8000-0000000ca001';
    expect(await executar((tx) => repo.inserir(tx, novo(a, null)))).toBe(true);
    expect(
      await executar((tx) => repo.inserir(tx, novo('01a10e00-0000-7000-8000-0000000ca002', null))),
    ).toBe(false);
    expect(
      await executar((tx) => repo.inserir(tx, novo('01a10e00-0000-7000-8000-0000000ca003', 5))),
    ).toBe(true);
    expect(await executar((tx) => repo.classificacao(tx, CONTEUDO))).toBeUndefined();
    const decidido: CasoCandidato = {
      ...novo(a, null),
      status: 'aceito',
      motivoDecisao: 'motivo fictício',
      decididoPor: CONTEUDO,
      decididoEm: Instant.deIso('2026-10-30T12:00:00.000Z'),
      teorAnonimizado: 'REVISADO',
    };
    expect(await executar((tx) => repo.decidir(tx, decidido))).toBe(true);
    expect(await executar((tx) => repo.decidir(tx, decidido))).toBe(false);
    expect(await executar((tx) => repo.decidir(tx, novo(a, null)))).toBe(false);
    const lido = await executar<CasoCandidato | undefined>((tx) => repo.buscar(tx, a as Uuid));
    expect(lido).toMatchObject({ status: 'aceito', teorAnonimizado: 'REVISADO' });
    const pendentes = await executar<CasoCandidato[]>((tx) =>
      repo.listar(tx, { status: 'pendente', limite: 10 }),
    );
    expect(pendentes.map((c) => c.diasCorrigidos)).toEqual([5]);
    const depois = await executar<CasoCandidato[]>((tx) =>
      repo.listar(tx, { apos: a as Uuid, limite: 10 }),
    );
    expect(depois).toHaveLength(1);
    // Sem DELETE para a aplicação.
    const app = new BancoSistema({ url: postgres.url('pz_app') });
    await expect(
      app.executarComoSistema('teste', (tx) => tx.casoCandidatoCuradoria.deleteMany({})),
    ).rejects.toThrow();
    await app.encerrar();
  });
});
