import { err, NaoEncontrado, ok } from '@pz/kernel';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { CatalogoDeFerramentas } from './ferramentas.js';

import type { ContextoDaFerramenta, ExecucaoDeFerramenta, Ferramenta } from './ferramentas.js';
import type { Uuid } from '@pz/kernel';

// Dados FICTÍCIOS.
const contexto: ContextoDaFerramenta = {
  tenantId: '01a10e00-0000-7000-8000-0000000ab001' as Uuid,
  usuarioId: '01a10e00-0000-7000-8000-0000000ab002' as Uuid,
  permissoes: new Set(['prazos:ler']),
  canal: 'portal',
};

const eco: Ferramenta<{ texto: string }, { eco: string; tenant: string }> = {
  nome: 'ecoar_texto',
  descricao: 'Devolve o texto (FICTÍCIO).',
  permissao: 'prazos:ler',
  alteraEstado: false,
  entrada: z.object({ texto: z.string().min(1) }).strict(),
  saida: z.object({ eco: z.string(), tenant: z.string() }),
  executar: (entrada, c) =>
    Promise.resolve(
      entrada.texto === 'falhar'
        ? err(new NaoEncontrado('nada', 'nada'))
        : ok({ eco: entrada.texto, tenant: c.tenantId }),
    ),
};

function montar(ferramentas: Ferramenta<never, unknown>[] = [eco as never]) {
  const auditoria: ExecucaoDeFerramenta[] = [];
  const catalogo = new CatalogoDeFerramentas(ferramentas, (_c, e) => {
    auditoria.push(e);
    return Promise.resolve();
  });
  return { catalogo, auditoria };
}

describe('catálogo de ferramentas de IA (HU59)', () => {
  it('executa com o tenant do contexto (nunca do modelo) e audita', async () => {
    const { catalogo, auditoria } = montar();
    const r = await catalogo.executar('ecoar_texto', { texto: 'oi' }, contexto);
    expect(r.ok && r.valor).toEqual({ eco: 'oi', tenant: contexto.tenantId });
    expect(auditoria).toEqual([
      { nome: 'ecoar_texto', argumentos: { texto: 'oi' }, resultado: 'ok' },
    ]);
  });

  it('lista só as permitidas, no formato da porta ProvedorIA', () => {
    const { catalogo } = montar();
    expect(catalogo.disponiveis(contexto)).toEqual([
      {
        nome: 'ecoar_texto',
        descricao: 'Devolve o texto (FICTÍCIO).',
        entrada: expect.objectContaining({ type: 'object' }) as unknown,
      },
    ]);
    expect(catalogo.disponiveis({ permissoes: new Set() })).toEqual([]);
  });

  it('sem permissão, entrada inválida (inclusive tenant como argumento) e erro: auditados', async () => {
    const { catalogo, auditoria } = montar();
    const semPermissao = await catalogo.executar(
      'ecoar_texto',
      { texto: 'x' },
      {
        ...contexto,
        permissoes: new Set(),
      },
    );
    expect(!semPermissao.ok && semPermissao.erro.codigo).toBe('sem-permissao');
    const comTenant = await catalogo.executar(
      'ecoar_texto',
      { texto: 'x', tenantId: 'outro' },
      contexto,
    );
    expect(!comTenant.ok && comTenant.erro.codigo).toBe('validacao');
    const falha = await catalogo.executar('ecoar_texto', { texto: 'falhar' }, contexto);
    expect(!falha.ok && falha.erro.codigo).toBe('nada');
    const inexistente = await catalogo.executar('nao_existe', {}, contexto);
    expect(!inexistente.ok && inexistente.erro.codigo).toBe('ferramenta-inexistente');
    expect(auditoria.map((a) => [a.resultado, a.codigoDoErro])).toEqual([
      ['proibida', undefined],
      ['entrada-invalida', undefined],
      ['erro', 'nada'],
    ]);
  });

  it('recusa no registro: nome inválido, repetido, tenant na entrada e escrita', () => {
    expect(() => montar([{ ...eco, nome: 'Ecoar' } as never])).toThrow('Nome de ferramenta');
    expect(() => montar([eco as never, eco as never])).toThrow('repetida');
    expect(() =>
      montar([{ ...eco, entrada: z.object({ tenantId: z.string() }) } as never]),
    ).toThrow('tenant nunca é argumento');
    expect(() => montar([{ ...eco, alteraEstado: true } as never])).toThrow('altera estado');
  });

  it('saída fora do schema é defeito: lança', async () => {
    const { catalogo } = montar([
      { ...eco, executar: () => Promise.resolve(ok({ outro: 1 })) } as never,
    ]);
    await expect(catalogo.executar('ecoar_texto', { texto: 'x' }, contexto)).rejects.toThrow(
      'fora do schema',
    );
  });
});
