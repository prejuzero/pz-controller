import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ConsultaPaginada, DataCivil, Instante, pagina, Problema } from './comum.js';
import { catalogoDeEventos, definirEvento, EVENTOS, SituacaoVerificada } from './eventos/index.js';
import { definirRota, nomear } from './rota.js';
import { consultarSituacao, SituacaoDaApi } from './saude/index.js';

describe('padrões comuns', () => {
  it('paginação por cursor com limite padrão e máximo', () => {
    expect(ConsultaPaginada.parse({})).toEqual({ limite: 20 });
    expect(ConsultaPaginada.parse({ cursor: 'abc', limite: '50' })).toEqual({
      cursor: 'abc',
      limite: 50,
    });
    expect(ConsultaPaginada.safeParse({ limite: '101' }).success).toBe(false);
    expect(ConsultaPaginada.safeParse({ limite: '0' }).success).toBe(false);
    expect(pagina(z.string()).parse({ itens: ['a'], proximoCursor: null })).toEqual({
      itens: ['a'],
      proximoCursor: null,
    });
  });

  it('datas civis e instantes em ISO 8601', () => {
    expect(DataCivil.safeParse('2024-02-29').success).toBe(true);
    expect(DataCivil.safeParse('2026-02-29').success).toBe(false);
    expect(Instante.safeParse('2026-10-05T19:20:00Z').success).toBe(true);
    expect(Instante.safeParse('2026-10-05T16:20:00-03:00').success).toBe(true);
    expect(Instante.safeParse('2026-10-05T19:20:00').success).toBe(false);
  });

  it('Problema segue a RFC 9457 com código estável', () => {
    expect(
      Problema.safeParse({
        type: 'about:blank',
        title: 'Não encontrado',
        status: 404,
        codigo: 'prazo.nao-encontrado',
      }).success,
    ).toBe(true);
    expect(Problema.safeParse({ type: 'x', title: 'y', status: 200, codigo: 'z' }).success).toBe(
      false,
    );
  });
});

describe('definição de rotas', () => {
  const base = {
    id: 'teste',
    metodo: 'get',
    caminho: '/v1/teste',
    resumo: 'r',
    tag: 't',
    resposta: { status: 200, corpo: null },
  } as const;

  it('valida caminho, id, idempotência e parâmetros de caminho', () => {
    expect(definirRota(base)).toBe(base);
    expect(() => definirRota({ ...base, caminho: '/teste' })).toThrow('/v1/');
    expect(() => definirRota({ ...base, id: 'Teste' })).toThrow('camelCase');
    expect(() => definirRota({ ...base, idempotente: true })).toThrow('POST');
    expect(() => definirRota({ ...base, caminho: '/v1/teste/{id}' })).toThrow('parâmetros');
    expect(() =>
      definirRota({
        ...base,
        caminho: '/v1/teste/{id}',
        parametrosDeCaminho: z.object({ outro: z.string() }),
      }),
    ).toThrow('parâmetros');
  });

  it('nomes de schema são PascalCase', () => {
    expect(nomear('Processo', z.string()).nome).toBe('Processo');
    expect(() => nomear('processo', z.string())).toThrow('PascalCase');
  });

  it('o exemplo saude é público e responde a situação', () => {
    expect(consultarSituacao.publica).toBe(true);
    expect(
      SituacaoDaApi.esquema.parse({
        situacao: 'operacional',
        versao: 'abc',
        verificadoEm: '2026-10-05T19:20:00Z',
      }).situacao,
    ).toBe('operacional');
  });
});

describe('eventos', () => {
  const envelope = {
    id: '0199b5e2-0000-7000-8000-000000000001',
    tipo: 'SituacaoVerificada',
    versao: 1,
    tenantId: '0199b5e2-0000-7000-8000-000000000002',
    agregadoId: 'api',
    ocorridoEm: '2026-10-05T19:20:00Z',
    payload: { situacao: 'operacional' },
  };

  it('o envelope valida tipo, versão e payload', () => {
    expect(SituacaoVerificada.envelope.parse(envelope)).toEqual(envelope);
    expect(SituacaoVerificada.envelope.safeParse({ ...envelope, versao: 2 }).success).toBe(false);
    expect(
      SituacaoVerificada.envelope.safeParse({ ...envelope, payload: { situacao: 'x' } }).success,
    ).toBe(false);
    expect(EVENTOS).toContain(SituacaoVerificada);
  });

  it('recusa tipo fora do padrão, versão inválida e duplicata no catálogo', () => {
    expect(() => definirEvento('prazoConfirmado', 1, z.object({}))).toThrow('PascalCase');
    expect(() => definirEvento('PrazoConfirmado', 0, z.object({}))).toThrow('inteiro positivo');
    const v1 = definirEvento('PrazoConfirmado', 1, z.object({}));
    const v2 = definirEvento('PrazoConfirmado', 2, z.object({}));
    expect(catalogoDeEventos(v1, v2)).toHaveLength(2);
    expect(() => catalogoDeEventos(v1, v1)).toThrow('PrazoConfirmado@1');
  });
});
