import { describe, expect, it } from 'vitest';

import { ConsumidorDosEnvios, enviadorDeEmail, linkDoEnvio, prepararEnvioJob } from './envios.js';

import type { Filas } from '../filas/runtime.js';
import type { EmailCanonico } from '@pz/integracoes';
import type { EventoDominio, Uuid } from '@pz/kernel';

// Ids e e-mails FICTÍCIOS (HU32).
const TENANT = '01a10e00-0000-7000-8000-0000000d9201';
const ENVIO = '01a10e00-0000-7000-8000-0000000d9202';
const PRAZO = '01a10e00-0000-7000-8000-0000000d9203' as Uuid;

describe('ConsumidorDosEnvios (HU32)', () => {
  it('leva o envio à fila relatorios com o id como chave; payload fora do contrato lança', async () => {
    const publicados: unknown[][] = [];
    const filas = {
      publicar: (...args: unknown[]) => {
        publicados.push(args);
        return Promise.resolve();
      },
    } as unknown as Filas;
    const envio = {
      envioId: ENVIO,
      usuarioId: TENANT,
      anexo: { origem: 'prazo', id: PRAZO, formato: 'pdf' },
      destinatarios: ['bia@escritorio.invalid'],
    };
    const evento = { tenantId: TENANT, payload: envio } as unknown as EventoDominio;
    await new ConsumidorDosEnvios(filas).envioSolicitado(undefined, evento);
    expect(publicados).toEqual([
      [prepararEnvioJob, { tenantId: TENANT, envio }, { tenantId: TENANT }, ENVIO],
    ]);
    expect(prepararEnvioJob.fila).toBe('relatorios');
    await expect(
      new ConsumidorDosEnvios(filas).envioSolicitado(undefined, {
        tenantId: TENANT,
        payload: { ...envio, destinatarios: [] },
      } as unknown as EventoDominio),
    ).rejects.toThrow();
  });
});

describe('link e canal de e-mail do envio manual (HU32)', () => {
  it('link estável por recurso, sem barra dupla', () => {
    const portal = 'https://app.exemplo.invalid/';
    expect(linkDoEnvio(portal, { origem: 'prazo', id: PRAZO, formato: 'pdf' })).toBe(
      `https://app.exemplo.invalid/prazos/${PRAZO}`,
    );
    expect(linkDoEnvio(portal, { origem: 'publicacao', id: PRAZO, formato: 'pdf' })).toBe(
      `https://app.exemplo.invalid/publicacoes/${PRAZO}`,
    );
    expect(
      linkDoEnvio(portal, { origem: 'busca', alvo: 'prazos', filtros: {}, formato: 'pdf' }),
    ).toBe('https://app.exemplo.invalid/busca');
    expect(linkDoEnvio(portal, { origem: 'relatorio', id: PRAZO })).toBe(
      'https://app.exemplo.invalid/relatorios',
    );
  });

  it('leva a mensagem e o anexo ao provedor; sem anexo, nada a mais', async () => {
    const enviados: EmailCanonico[] = [];
    const canal = enviadorDeEmail({
      enviar: (email) => {
        enviados.push(email);
        return Promise.resolve({ idExterno: 'x', aceitoEm: undefined as never });
      },
    });
    const mensagem = {
      assunto: 'A',
      html: '<p>B</p>',
      texto: 'B',
      link: 'https://app.exemplo.invalid',
    };
    const anexo = {
      nome: 'a.pdf',
      tipoMime: 'application/pdf' as const,
      conteudo: new Uint8Array([1]),
    };
    await canal.enviar({
      idempotencia: 'i',
      destinatarios: ['a@x.invalid'],
      mensagem,
      anexos: [anexo],
    });
    await canal.enviar({ idempotencia: 'j', destinatarios: ['a@x.invalid'], mensagem });
    expect(enviados).toEqual([
      {
        idempotencia: 'i',
        para: ['a@x.invalid'],
        assunto: 'A',
        html: '<p>B</p>',
        texto: 'B',
        anexos: [anexo],
      },
      { idempotencia: 'j', para: ['a@x.invalid'], assunto: 'A', html: '<p>B</p>', texto: 'B' },
    ]);
  });
});
