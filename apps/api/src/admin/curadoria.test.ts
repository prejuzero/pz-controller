import { Conflito, err, Instant, ok } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { CuradoriaDaClassificacaoController } from './curadoria.controller.js';

import type { RequisicaoAutenticada } from '../http/acesso.js';
import type { DecidirCandidato, ExportarCasosAceitos, ListarCandidatos } from '@pz/classificacao';

// Dados FICTÍCIOS: só a ligação HTTP → casos de uso (HU22).
const ID = '01a10e00-0000-7000-8000-0000000c0001';
const caso = {
  id: ID,
  conteudoId: ID,
  teorAnonimizado: 'FICTÍCIO',
  tipoAtoClassificado: 'citacao',
  tipoAtoCorrigido: 'contestacao',
  diasCitados: 15,
  diasCorrigidos: 15,
  status: 'aceito' as const,
  motivoDecisao: 'motivo fictício',
  decididoPor: ID,
  decididoEm: Instant.deIso('2026-10-30T12:00:00.000Z'),
};

describe('CuradoriaDaClassificacaoController (HU22)', () => {
  it('lista, decide e exporta pelos casos de uso; erro vira exceção', async () => {
    const decisoes: unknown[] = [];
    const controller = new CuradoriaDaClassificacaoController(
      {
        executar: (c: { status?: string }) =>
          Promise.resolve(
            c.status === 'x'
              ? err(new Error('inválido'))
              : ok({ itens: [{ ...caso, decididoEm: null }], proximoCursor: null }),
          ),
      } as unknown as ListarCandidatos<unknown>,
      {
        executar: (autor: unknown, id: string, corpo: unknown) => {
          decisoes.push([autor, id, corpo]);
          return Promise.resolve(
            decisoes.length === 1 ? ok(caso) : err(new Conflito('caso-ja-decidido', 'x')),
          );
        },
      } as unknown as DecidirCandidato<unknown>,
      {
        executar: () => Promise.resolve([{ id: 'correcao-1' }]),
      } as unknown as ExportarCasosAceitos<unknown>,
    );
    expect((await controller.listarCandidatos({})).itens[0]?.decididoEm).toBeNull();
    await expect(controller.listarCandidatos({ status: 'x' })).rejects.toThrow('inválido');
    expect(await controller.exportarAceitos()).toEqual({ casos: [{ id: 'correcao-1' }] });
    const requisicao = {
      autenticacao: { sessao: { usuarioId: ID } },
    } as unknown as RequisicaoAutenticada;
    const r = await controller.decidirCandidato(requisicao, ID, { decisao: 'aceitar' });
    expect(r.decididoEm).toBe('2026-10-30T12:00:00.000Z');
    await expect(controller.decidirCandidato(requisicao, ID, {})).rejects.toThrow(Conflito);
    expect(decisoes[0]).toEqual([{ usuarioId: ID, canal: 'portal' }, ID, { decisao: 'aceitar' }]);
  });
});
