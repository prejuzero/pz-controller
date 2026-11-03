import { err, Instant, NaoEncontrado, ok } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { ConferenciasController } from './conferencias.controller.js';

import type { RequisicaoAutenticada } from '../http/acesso.js';
import type { ConsultarConferencias, RegistrarConferencia } from '@pz/cadastro';

// Só a ligação HTTP → módulo cadastro (a regra é testada no módulo). Ids FICTÍCIOS.
const P = '01a10e00-0000-7000-8000-0000000db001';
const requisicao = {
  autenticacao: {
    sessao: { tenantId: 't', usuarioId: 'u', dispositivoId: undefined },
    permissoes: new Set(['prazos:confirmar']),
  },
} as unknown as RequisicaoAutenticada;

describe('ConferenciasController (HU36)', () => {
  it('lista e registra; processo inexistente vira exceção', async () => {
    const autores: unknown[] = [];
    const controller = new ConferenciasController(
      { executar: () => Promise.resolve([]) } as unknown as ConsultarConferencias<unknown>,
      {
        executar: (autor: unknown, id: string) => {
          autores.push(autor);
          return Promise.resolve(
            id === P
              ? ok({
                  id: 'c',
                  processoId: P,
                  usuarioId: 'u',
                  realizadaEm: Instant.deIso('2026-11-12T13:00:00Z'),
                  resultado: 'sem-novidade',
                  observacao: null,
                })
              : err(new NaoEncontrado('processo-nao-encontrado', 'x')),
          );
        },
      } as unknown as RegistrarConferencia<unknown>,
    );
    expect(await controller.listarConferencias()).toEqual({ itens: [] });
    expect(
      await controller.registrarConferencia(requisicao, P, { resultado: 'sem-novidade' }),
    ).toMatchObject({ processoId: P, realizadaEm: '2026-11-12T13:00:00.000Z' });
    expect(autores).toEqual([{ tenantId: 't', usuarioId: 'u', canal: 'portal' }]);
    await expect(
      controller.registrarConferencia(requisicao, '01a10e00-0000-7000-8000-0000000db002', {}),
    ).rejects.toBeInstanceOf(NaoEncontrado);
  });
});
