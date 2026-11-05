import { OutboxEmMemoria } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { RecifrarSegredosDoSegundoFator } from '../application/recifra.js';

import type { CifraComRotacao, SegredosParaRecifrar } from '../application/recifra.js';
import type { TransacaoEmMemoria, Uuid } from '@pz/kernel';

// Dados FICTÍCIOS. Cifra de brinquedo: "<chave>:<texto>"; a ativa é k2.
const cifra: CifraComRotacao = {
  cifrar: (texto) => `k2:${texto}`,
  decifrar: (cifrado) => cifrado.slice(cifrado.indexOf(':') + 1),
  precisaRecifrar: (cifrado) => !cifrado.startsWith('k2:'),
};
const TENANT_A = '01a10e00-0000-7000-8000-0000000a0001' as Uuid;
const TENANT_B = '01a10e00-0000-7000-8000-0000000b0001' as Uuid;
const usuario = (n: number) => `01a10e00-0000-7000-8000-0000000c000${String(n)}` as Uuid;

function segredosFalsos(linhas: Map<Uuid, { tenant: Uuid; cifrado: string }>) {
  let tenantAtual: Uuid | undefined;
  const repositorio: SegredosParaRecifrar<TransacaoEmMemoria> = {
    tenants: () => Promise.resolve([...new Set([...linhas.values()].map((l) => l.tenant))]),
    lote: (_tx, depoisDe, limite) =>
      Promise.resolve(
        [...linhas.entries()]
          .filter(([id, l]) => l.tenant === tenantAtual && (depoisDe === null || id > depoisDe))
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(0, limite)
          .map(([usuarioId, l]) => ({ usuarioId, cifrado: l.cifrado })),
      ),
    trocar: (_tx, usuarioId, antigo, novo) => {
      const linha = linhas.get(usuarioId);
      if (linha?.cifrado !== antigo) return Promise.resolve(false);
      linhas.set(usuarioId, { ...linha, cifrado: novo });
      return Promise.resolve(true);
    },
  };
  const noTenant = async <T>(tenantId: Uuid, trabalho: () => Promise<T>) => {
    tenantAtual = tenantId;
    try {
      return await trabalho();
    } finally {
      tenantAtual = undefined;
    }
  };
  return { repositorio, noTenant };
}

describe('recifra dos segredos do 2FA (PZ-359)', () => {
  it('recifra os de chave antiga em cada tenant, mantém os da ativa e é idempotente', async () => {
    const linhas = new Map([
      [usuario(1), { tenant: TENANT_A, cifrado: 'k1:SEGREDOFICTICIOA' }],
      [usuario(2), { tenant: TENANT_A, cifrado: 'k2:SEGREDOFICTICIOB' }],
      [usuario(3), { tenant: TENANT_B, cifrado: 'k1:SEGREDOFICTICIOC' }],
    ]);
    const { repositorio, noTenant } = segredosFalsos(linhas);
    const unidade = new OutboxEmMemoria();
    const recifrar = new RecifrarSegredosDoSegundoFator(
      unidade,
      noTenant,
      unidade,
      repositorio,
      cifra,
    );
    expect(await recifrar.executar()).toEqual({ escritorios: 2, recifrados: 2 });
    expect([...linhas.values()].map((l) => l.cifrado)).toEqual([
      'k2:SEGREDOFICTICIOA',
      'k2:SEGREDOFICTICIOB',
      'k2:SEGREDOFICTICIOC',
    ]);
    expect(await recifrar.executar()).toEqual({ escritorios: 2, recifrados: 0 });
  });

  it('pagina em lotes pelo id do usuário', async () => {
    const linhas = new Map(
      Array.from({ length: 201 }, (_, i) => [
        `01a10e00-0000-7000-8000-${String(i).padStart(12, '0')}` as Uuid,
        { tenant: TENANT_A, cifrado: `k1:SEGREDOFICTICIO${String(i)}` },
      ]),
    );
    const { repositorio, noTenant } = segredosFalsos(linhas);
    const unidade = new OutboxEmMemoria();
    const r = await new RecifrarSegredosDoSegundoFator(
      unidade,
      noTenant,
      unidade,
      repositorio,
      cifra,
    ).executar();
    expect(r).toEqual({ escritorios: 1, recifrados: 201 });
  });

  it('2FA reconfigurado no meio não é sobrescrito', async () => {
    const linhas = new Map([[usuario(1), { tenant: TENANT_A, cifrado: 'k1:SEGREDOFICTICIOA' }]]);
    const { repositorio, noTenant } = segredosFalsos(linhas);
    const trocar = repositorio.trocar.bind(repositorio);
    repositorio.trocar = (tx, id, _antigo, novo) => trocar(tx, id, 'k1:OUTRO', novo);
    const unidade = new OutboxEmMemoria();
    const r = await new RecifrarSegredosDoSegundoFator(
      unidade,
      noTenant,
      unidade,
      repositorio,
      cifra,
    ).executar();
    expect(r.recifrados).toBe(0);
    expect(linhas.get(usuario(1))?.cifrado).toBe('k1:SEGREDOFICTICIOA');
  });
});
