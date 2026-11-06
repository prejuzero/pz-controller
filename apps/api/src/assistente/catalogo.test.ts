import { err, NaoEncontrado, ok } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { catalogoDeFerramentas, comoNoHttp } from './catalogo.js';

import type { DependenciasDoCatalogo } from './catalogo.js';
import type { EntradaDeAuditoria, OrigemDaAuditoria } from '@pz/auditoria';
import type { Uuid } from '@pz/kernel';

// Dados FICTÍCIOS: só a ligação entre os módulos.
const TENANT = '01a10e00-0000-7000-8000-0000000ad001' as Uuid;
const USUARIO = '01a10e00-0000-7000-8000-0000000ad002' as Uuid;
const vazio = { itens: [], proximoCursor: null, totalAproximado: 0, totalLimitado: false };

describe('catálogo de ferramentas composto na api (HU59)', () => {
  it('roda cada fonte no tenant do contexto e audita ia.ferramenta-executada na trilha dele', async () => {
    const tenants: string[] = [];
    const auditados: { entrada: EntradaDeAuditoria; origem: OrigemDaAuditoria; tenant: string }[] =
      [];
    let tenantAtual = '';
    const simulados: unknown[] = [];
    const d = {
      buscar: {
        prazos: () => Promise.resolve(ok(vazio)),
        publicacoes: () => Promise.resolve(ok(vazio)),
      },
      consultarProcesso: { executar: () => Promise.resolve(ok({})) },
      cadastrarPrazo: {
        simular: (autor: unknown, pedido: unknown) => {
          simulados.push({ autor, pedido });
          return Promise.resolve(ok({}));
        },
      },
      consultarPrazo: { executar: () => Promise.resolve(ok({})) },
      unidade: { executar: <T>(t: (tx: null) => Promise<T>) => t(null) },
      trilha: {
        registrar: (_tx: unknown, entrada: EntradaDeAuditoria, origem: OrigemDaAuditoria) => {
          auditados.push({ entrada, origem, tenant: tenantAtual });
          return Promise.resolve();
        },
      },
      noTenant: async <T>(tenantId: Uuid, trabalho: () => Promise<T>) => {
        tenants.push(tenantId);
        tenantAtual = tenantId;
        return trabalho();
      },
    } as unknown as DependenciasDoCatalogo;
    const catalogo = catalogoDeFerramentas(d);
    const contexto = {
      tenantId: TENANT,
      usuarioId: USUARIO,
      permissoes: new Set(['prazos:ler']),
      canal: 'mcp' as const,
    };
    expect((await catalogo.executar('buscar_prazos', { tribunal: 'TJXA' }, contexto)).ok).toBe(
      true,
    );
    const todas = {
      ...contexto,
      permissoes: new Set(['prazos:ler', 'publicacoes:ler', 'processos:ler']),
    };
    expect((await catalogo.executar('buscar_publicacoes', {}, todas)).ok).toBe(true);
    // Dublês devolvem `{}`: fora do contrato, a saída não chega ao modelo.
    for (const [nome, args] of [
      ['consultar_processo', { id: TENANT }],
      ['explicar_memoria_calculo', { id: TENANT }],
    ] as const) {
      await expect(catalogo.executar(nome, args, todas)).rejects.toThrow('fora do schema');
    }
    // O dublê devolve `{}`: a saída fora do contrato da API não chega ao modelo.
    await expect(
      catalogo.executar(
        'simular_prazo',
        {
          processoId: TENANT,
          tipoAto: 'ato-ficticio',
          meio: 'djen',
          dataDeReferencia: '2027-03-01',
        },
        contexto,
      ),
    ).rejects.toThrow('fora do schema');
    expect(tenants.every((t) => t === TENANT)).toBe(true);
    expect(simulados[0]).toMatchObject({
      autor: { tenantId: TENANT, usuarioId: USUARIO, canal: 'mcp' },
      pedido: { origem: 'manual' },
    });
    expect(auditados[0]).toEqual({
      entrada: {
        tipo: 'ia.ferramenta-executada',
        entidade: 'ferramenta-ia',
        entidadeId: 'buscar_prazos',
        depois: { argumentos: { tribunal: 'TJXA', limite: 20 }, resultado: 'ok' },
      },
      origem: { canal: 'mcp', usuarioId: USUARIO },
      tenant: TENANT,
    });
  });

  it('saída como no HTTP: Date vira string ISO; erro passa direto', () => {
    const r = comoNoHttp(ok({ recebidaEm: new Date('2027-03-01T12:00:00.000Z'), n: 1 }));
    expect(r.ok && r.valor).toEqual({ recebidaEm: '2027-03-01T12:00:00.000Z', n: 1 });
    const erro = err(new NaoEncontrado('x', 'x'));
    expect(comoNoHttp(erro)).toBe(erro);
  });
});
