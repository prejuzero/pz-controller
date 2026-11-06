import { randomBytes } from 'node:crypto';

import { protecaoDeCampos, ProvedorChavesLocal } from '@pz/integracoes';
import { OutboxEmMemoria } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { RecifrarCamposSensiveis } from '../application/recifra.js';

import type { CampoParaRecifrar, CamposSensiveis } from '../application/recifra.js';
import type { Uuid } from '@pz/kernel';

// Dados FICTÍCIOS (HU37, ADR-021).
const MESTRA = randomBytes(32).toString('base64');
const K1 = randomBytes(32).toString('base64');
const K2 = randomBytes(32).toString('base64');
const T = '01a10e00-0000-7000-8000-0000000dd001' as Uuid;
const id = (n: number) => `01a10e00-0000-7000-8000-${String(n).padStart(12, '0')}` as Uuid;

class CamposEmMemoria implements CamposSensiveis<unknown> {
  constructor(readonly linhas: CampoParaRecifrar[]) {}
  readonly indices = new Map<Uuid, string | null>();
  tenants() {
    return Promise.resolve([T]);
  }
  lote(_tx: unknown, depoisDe: Uuid | null, limite: number) {
    return Promise.resolve(
      this.linhas.filter((l) => depoisDe === null || l.id > depoisDe).slice(0, limite),
    );
  }
  gravar(_tx: unknown, c: CampoParaRecifrar, novo: { cifrado: string; indice: string | null }) {
    const i = this.linhas.findIndex((l) => l.id === c.id);
    this.linhas[i] = { ...c, cifrado: novo.cifrado };
    this.indices.set(c.id, novo.indice);
    return Promise.resolve();
  }
}

const recifrar = (campos: CamposEmMemoria, lista: string) => {
  const unidade = new OutboxEmMemoria();
  return new RecifrarCamposSensiveis(
    unidade,
    (_t, trabalho) => trabalho(),
    unidade,
    campos,
    protecaoDeCampos(new ProvedorChavesLocal(MESTRA, lista)),
  ).executar();
};

describe('recifra dos campos sensíveis (HU37, ADR-021)', () => {
  it('roda a chave em lotes, recalcula o índice do CPF e é idempotente', async () => {
    const k1 = protecaoDeCampos(new ProvedorChavesLocal(MESTRA, `k1:${K1}`));
    const linhas: CampoParaRecifrar[] = [
      { tabela: 'advogado', id: id(1), cifrado: k1.cifrar('52998224725') },
      { tabela: 'cliente', id: id(2), cifrado: k1.cifrar('11222333000181') },
      ...Array.from({ length: 250 }, (_, i) => ({
        tabela: 'advogado' as const,
        id: id(10 + i),
        cifrado: k1.cifrar(`cpf ${String(i)}`),
      })),
    ];
    const campos = new CamposEmMemoria(linhas);
    // Tudo já na chave ativa: nada muda.
    expect(await recifrar(campos, `k1:${K1}`)).toEqual({ escritorios: 1, atualizados: 0 });

    const rodada = await recifrar(campos, `k2:${K2},k1:${K1}`);
    expect(rodada.atualizados).toBe(252);
    const k2 = protecaoDeCampos(new ProvedorChavesLocal(MESTRA, `k2:${K2}`));
    expect(k2.decifrar(campos.linhas.find((l) => l.id === id(2))?.cifrado ?? '')).toBe(
      '11222333000181',
    );
    expect(campos.indices.get(id(1))).toBe(k2.indice('52998224725'));
    expect(campos.indices.get(id(2))).toBeNull();
    expect(await recifrar(campos, `k2:${K2},k1:${K1}`)).toEqual({ escritorios: 1, atualizados: 0 });
  });
});
