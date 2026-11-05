import { err, Instant, ok, Validacao } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { DocumentosLegaisController } from './termos.controller.js';

import type { RequisicaoAutenticada } from '../http/acesso.js';
import type { ListarVersoesDosDocumentos, PublicarDocumentoLegal } from '@pz/termos';

// Dados FICTÍCIOS: só a ligação HTTP → casos de uso (PZ-303).
const ID = '01a10e00-0000-7000-8000-0000000a0001';
const requisicao = {
  autenticacao: { sessao: { usuarioId: ID, tenantId: ID } },
} as unknown as RequisicaoAutenticada;
const documento = {
  id: ID,
  tipo: 'termos',
  versao: '1.1',
  conteudo: 'Texto FICTÍCIO.',
  publicadoEm: Instant.deIso('2026-11-05T12:00:00.000Z'),
};

describe('DocumentosLegaisController (PZ-303)', () => {
  it('publica com o usuário da sessão e lista as versões; validação vira exceção', async () => {
    const recebidos: unknown[] = [];
    const publicar = {
      executar: (publicador: unknown, nova: unknown) => {
        recebidos.push(publicador, nova);
        return Promise.resolve(ok(documento));
      },
    } as unknown as PublicarDocumentoLegal<unknown>;
    const versoes = {
      executar: () => Promise.resolve([{ ...documento, resumoAlteracoes: 'Ajuste.' }]),
    } as unknown as ListarVersoesDosDocumentos<unknown>;
    const controller = new DocumentosLegaisController(publicar, versoes);

    expect(
      await controller.publicarDocumentoLegal(requisicao, {
        tipo: 'termos',
        versao: '1.1',
        conteudo: 'Texto FICTÍCIO.',
        resumoAlteracoes: 'Ajuste.',
      }),
    ).toMatchObject({
      versao: '1.1',
      resumoAlteracoes: null,
      publicadoEm: '2026-11-05T12:00:00.000Z',
    });
    await controller.publicarDocumentoLegal(requisicao, {
      tipo: 'termos',
      versao: '1.2',
      conteudo: 'Texto FICTÍCIO.',
    });
    expect(recebidos).toEqual([
      { tenantId: ID, usuarioId: ID, canal: 'portal' },
      { tipo: 'termos', versao: '1.1', conteudo: 'Texto FICTÍCIO.', resumoAlteracoes: 'Ajuste.' },
      { tenantId: ID, usuarioId: ID, canal: 'portal' },
      { tipo: 'termos', versao: '1.2', conteudo: 'Texto FICTÍCIO.' },
    ]);
    expect((await controller.listarVersoesDocumentosLegais(requisicao)).itens).toEqual([
      expect.objectContaining({ versao: '1.1', resumoAlteracoes: 'Ajuste.' }),
    ]);

    const recusa = new DocumentosLegaisController(
      {
        executar: () => Promise.resolve(err(new Validacao([]))),
      } as unknown as PublicarDocumentoLegal<unknown>,
      versoes,
    );
    await expect(
      recusa.publicarDocumentoLegal(requisicao, { tipo: 'termos', versao: '9.0', conteudo: 'x' }),
    ).rejects.toThrow(Validacao);
    // Formato inválido nem chega ao caso de uso.
    await expect(
      Promise.resolve().then(() =>
        controller.publicarDocumentoLegal(requisicao, {
          tipo: 'termos',
          versao: 'v1',
          conteudo: 'x',
        }),
      ),
    ).rejects.toThrow(Validacao);
  });
});
