import { gerarUuidV7 } from '@pz/kernel';
import { obterContexto } from '@pz/observability';
import { describe, expect, it } from 'vitest';

import { Banco, BancoSistema } from './banco.js';
import { executarNoTenant, SemTenant, tenantAtual } from './tenant.js';

import type { Uuid } from '@pz/kernel';

// URL que nunca é usada: as recusas acontecem antes de qualquer conexão.
const URL_INALCANCAVEL = 'postgresql://ninguem:nada@127.0.0.1:1/nada';

describe('contexto de tenant', () => {
  it('fora de executarNoTenant não há tenant', () => {
    expect(tenantAtual()).toBeUndefined();
  });

  it('define o tenant (também na correlação dos logs) e isola execuções concorrentes', async () => {
    const [a, b] = [gerarUuidV7(), gerarUuidV7()];
    const ler = (tenant: Uuid) =>
      executarNoTenant(tenant, async () => {
        await new Promise((resolver) => setTimeout(resolver, 5));
        return [tenantAtual(), obterContexto().tenantId];
      });

    expect(await Promise.all([ler(a), ler(b)])).toEqual([
      [a, a],
      [b, b],
    ]);
  });

  it('recusa tenant que não é UUID', () => {
    expect(() => executarNoTenant('nao-e-uuid' as Uuid, () => 1)).toThrow(RangeError);
  });
});

describe('recusas antes de tocar no banco', () => {
  it('Banco sem tenant no contexto rejeita com SemTenant', async () => {
    const banco = new Banco({ url: URL_INALCANCAVEL });
    const erro = await banco.executar(() => Promise.resolve()).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(SemTenant);
    expect((erro as Error).message).toContain('executarNoTenant');
    await banco.encerrar();
  });

  it('BancoSistema sem motivo rejeita', async () => {
    const sistema = new BancoSistema({ url: URL_INALCANCAVEL, maxConexoes: 1 });
    expect(() => sistema.unidade('')).toThrow('motivo');
    await expect(sistema.executarComoSistema(' ', () => Promise.resolve())).rejects.toThrow(
      'motivo',
    );
    await sistema.encerrar();
  });
});
