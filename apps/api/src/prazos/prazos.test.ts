import { Conflito, err, ok } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { PrazosController } from './prazos.controller.js';

import type { RequisicaoAutenticada } from '../http/acesso.js';
import type {
  AjustarPrazo,
  CancelarPrazo,
  ConfirmarPrazo,
  ConsultarPrazo,
  CumprirPrazo,
  ListarPrazos,
} from '@pz/prazos';

// Dados FICTÍCIOS: só a ligação HTTP → casos de uso (a regra é testada no módulo prazos).
const ID = '01a10e00-0000-7000-8000-0000000a0001';
const USUARIO = '01a10e00-0000-7000-8000-0000000a0002';
const requisicao = (dispositivoId?: string) =>
  ({
    autenticacao: { sessao: { usuarioId: USUARIO, ...(dispositivoId ? { dispositivoId } : {}) } },
  }) as unknown as RequisicaoAutenticada;

describe('PrazosController (HU24)', () => {
  it('repassa autor (canal pela sessão), id e corpo; erro do caso de uso vira exceção', async () => {
    const chamadas: unknown[] = [];
    const acao = (nome: string) => ({
      simular: (autor: unknown, id: string, corpo: unknown) => {
        chamadas.push([`${nome}:simular`, autor, id, corpo]);
        return Promise.resolve(ok({ id }));
      },
      executar: (autor: unknown, id: string, corpo: unknown) => {
        chamadas.push([nome, autor, id, corpo]);
        return Promise.resolve(
          nome === 'cancelar' ? err(new Conflito('transicao-invalida', 'x')) : ok({ id }),
        );
      },
    });
    const controller = new PrazosController(
      {
        executar: () => Promise.resolve(ok({ itens: [], proximoCursor: null })),
      } as unknown as ListarPrazos<unknown>,
      {
        executar: (id: string) =>
          Promise.resolve(id === ID ? ok({ id }) : err(new Error('não encontrado'))),
      } as unknown as ConsultarPrazo<unknown>,
      acao('confirmar') as unknown as ConfirmarPrazo<unknown>,
      acao('ajustar') as unknown as AjustarPrazo<unknown>,
      acao('cumprir') as unknown as CumprirPrazo<unknown>,
      acao('cancelar') as unknown as CancelarPrazo<unknown>,
    );
    expect(await controller.listarPrazos({})).toEqual({ itens: [], proximoCursor: null });
    expect(await controller.consultarPrazo(ID)).toEqual({ id: ID });
    await expect(controller.consultarPrazo(USUARIO)).rejects.toThrow('não encontrado');
    expect(await controller.confirmarPrazo(requisicao(), ID, { versao: 1 })).toEqual({ id: ID });
    await controller.ajustarPrazo(requisicao('disp'), ID, { versao: 2 });
    await controller.simularAjustePrazo(requisicao(), ID, { versao: 2 });
    await controller.cumprirPrazo(requisicao(), ID, { versao: 3 });
    await expect(controller.cancelarPrazo(requisicao(), ID, {})).rejects.toThrow(Conflito);
    expect(chamadas).toEqual([
      ['confirmar', { usuarioId: USUARIO, canal: 'portal' }, ID, { versao: 1 }],
      ['ajustar', { usuarioId: USUARIO, canal: 'app' }, ID, { versao: 2 }],
      ['ajustar:simular', { usuarioId: USUARIO, canal: 'portal' }, ID, { versao: 2 }],
      ['cumprir', { usuarioId: USUARIO, canal: 'portal' }, ID, { versao: 3 }],
      ['cancelar', { usuarioId: USUARIO, canal: 'portal' }, ID, {}],
    ]);
    await expect(controller.confirmarPrazo(requisicao(), 'nao-uuid', {})).rejects.toThrow();
  });
});
