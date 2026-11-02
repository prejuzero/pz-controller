import { Instant, NaoAutenticado, err, ok } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { CienciaController } from './ciencia.controller.js';

import type { RequisicaoAutenticada } from '../http/acesso.js';
import type { ConfirmarCiencia, ConsultarLinkDeCiencia } from '@pz/ciencia';
import type { FastifyRequest } from 'fastify';

// Só a ligação HTTP → módulo ciencia (a regra e a segurança são testadas no módulo).
const PRAZO = '01a10e00-0000-7000-8000-0000000e0101';
const TOKEN = `v1.${'a'.repeat(64)}.${'b'.repeat(43)}`;
const quando = Instant.deIso('2026-11-03T12:00:00.000Z');

describe('CienciaController (HU33)', () => {
  it('consulta, confirma pelo link (com IP e agente) e pela sessão', async () => {
    const chamadas: unknown[] = [];
    const controller = new CienciaController(
      {
        executar: (token: string) =>
          Promise.resolve(
            token === TOKEN
              ? {
                  situacao: 'usado',
                  prazo: {
                    numeroProcesso: 'n',
                    tipoAto: 'a',
                    vencimento: null,
                    prazoId: PRAZO,
                    status: 'pendente',
                  },
                  confirmadaEm: quando,
                }
              : { situacao: 'invalido' },
          ),
      } as unknown as ConsultarLinkDeCiencia<unknown>,
      {
        peloLink: (token: string, contexto: unknown) => {
          chamadas.push(['link', token, contexto]);
          return Promise.resolve(
            token === TOKEN
              ? ok({ prazoId: PRAZO, confirmadaEm: quando, jaConfirmada: false })
              : err(new NaoAutenticado('ciencia-link-invalido', 'x')),
          );
        },
        pelaSessao: (autor: unknown, prazoId: string, contexto: unknown) => {
          chamadas.push(['sessao', autor, prazoId, contexto]);
          return Promise.resolve(ok({ prazoId, confirmadaEm: quando, jaConfirmada: true }));
        },
      } as unknown as ConfirmarCiencia<unknown>,
    );
    expect(await controller.consultarLink({ token: TOKEN })).toEqual({
      situacao: 'usado',
      prazo: { numeroProcesso: 'n', tipoAto: 'a', vencimento: null },
      confirmadaEm: '2026-11-03T12:00:00.000Z',
    });
    expect(await controller.consultarLink({ token: `${TOKEN}x` })).toEqual({
      situacao: 'invalido',
    });
    await expect(controller.consultarLink({})).rejects.toThrow();

    const requisicao = {
      ip: '203.0.113.7',
      headers: { 'user-agent': 'Navegador/1.0' },
    } as unknown as FastifyRequest;
    expect(await controller.confirmarPeloLink(requisicao, { token: TOKEN })).toEqual({
      prazoId: PRAZO,
      confirmadaEm: '2026-11-03T12:00:00.000Z',
      jaConfirmada: false,
    });
    await expect(controller.confirmarPeloLink(requisicao, { token: `${TOKEN}x` })).rejects.toThrow(
      NaoAutenticado,
    );
    const sessao = {
      ip: '203.0.113.8',
      headers: {},
      autenticacao: { sessao: { tenantId: 't', usuarioId: 'u', dispositivoId: 'd' } },
    } as unknown as RequisicaoAutenticada;
    expect(await controller.confirmarPelaSessao(sessao, PRAZO)).toMatchObject({
      jaConfirmada: true,
    });
    await expect(controller.confirmarPelaSessao(sessao, 'nao-uuid')).rejects.toThrow();
    expect(chamadas).toEqual([
      ['link', TOKEN, { ip: '203.0.113.7', userAgent: 'Navegador/1.0' }],
      ['link', `${TOKEN}x`, { ip: '203.0.113.7', userAgent: 'Navegador/1.0' }],
      [
        'sessao',
        { tenantId: 't', usuarioId: 'u', canal: 'app' },
        PRAZO,
        { ip: '203.0.113.8', userAgent: '' },
      ],
    ]);
  });
});
