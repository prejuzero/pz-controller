import { NaoEncontrado, Validacao } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { historicoDoPrazo } from '../prazos/historico.js';

import { HistoricoController } from './historico.controller.js';

import type { RequisicaoAutenticada } from '../http/acesso.js';
import type { EventoDoHistorico, VerificarHistorico } from '@pz/auditoria';
import type { Uuid } from '@pz/kernel';

// Dados FICTÍCIOS: composição do histórico e ligação HTTP (HU35).
const TENANT = '01a10e00-0000-7000-8000-0000000a0001' as Uuid;
const PRAZO = '01a10e00-0000-7000-8000-0000000a0002' as Uuid;
const NOTIFICACAO = '01a10e00-0000-7000-8000-0000000a0003' as Uuid;
const USUARIO = '01a10e00-0000-7000-8000-0000000a0004';
const requisicao = {
  autenticacao: { sessao: { usuarioId: USUARIO, tenantId: TENANT } },
} as unknown as RequisicaoAutenticada;
const evento = (sequencia: number, usuarioId: string | null): EventoDoHistorico => ({
  sequencia,
  tipo: 'prazos.prazo-confirmado',
  entidade: 'prazo',
  entidadeId: PRAZO,
  usuarioId,
  canal: 'portal',
  antes: null,
  depois: { status: 'confirmado' },
  criadoEm: '2026-11-02T13:00:00.000Z',
  hashAnterior: 'a'.repeat(64),
  hash: 'b'.repeat(64),
});

describe('histórico do prazo (HU35)', () => {
  const alvosPedidos: unknown[] = [];
  const historico = historicoDoPrazo({
    prazoExiste: (id) => Promise.resolve(id === PRAZO),
    notificacoesDoPrazo: () => Promise.resolve([NOTIFICACAO]),
    eventos: (_tenant, alvos) => {
      alvosPedidos.push(alvos);
      return Promise.resolve([evento(1, USUARIO), evento(2, null), evento(3, 'sem-nome')]);
    },
    nomes: (ids) =>
      Promise.resolve(new Map(ids.filter((i) => i === USUARIO).map((i) => [i, 'Ana']))),
  });
  const verificar = {
    executar: (codigo: string) =>
      Promise.resolve(
        codigo === 'ok'
          ? { situacao: 'valido', emitidaEm: '2026-11-02T13:00:00.000Z', eventos: [] }
          : { situacao: 'inexistente' },
      ),
  } as unknown as VerificarHistorico<unknown>;
  const controller = new HistoricoController(historico, verificar);

  it('traz o prazo e as notificações dele, com o nome de quem agiu', async () => {
    const { itens } = await controller.consultarHistoricoDoPrazo(requisicao, PRAZO);
    expect(alvosPedidos).toEqual([
      [
        { entidade: 'prazo', entidadeId: PRAZO },
        { entidade: 'notificacao', entidadeId: NOTIFICACAO },
      ],
    ]);
    expect(itens.map((i) => i.usuario)).toEqual([
      { id: USUARIO, nome: 'Ana' },
      null,
      { id: 'sem-nome', nome: null },
    ]);
  });

  it('prazo inexistente ou id inválido falham', async () => {
    await expect(
      controller.consultarHistoricoDoPrazo(requisicao, '01a10e00-0000-7000-8000-0000000a0009'),
    ).rejects.toThrow(NaoEncontrado);
    // O id é validado antes de chegar ao módulo (erro síncrono).
    expect(() => controller.consultarHistoricoDoPrazo(requisicao, 'x')).toThrow(Validacao);
  });

  it('verificação pública devolve o resultado do módulo', async () => {
    await expect(controller.verificarHistorico('ok')).resolves.toMatchObject({
      situacao: 'valido',
    });
    await expect(controller.verificarHistorico('x')).resolves.toEqual({ situacao: 'inexistente' });
  });
});
