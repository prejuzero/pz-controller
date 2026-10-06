import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  definirJob,
  EnvelopeJob,
  FILAS,
  filaDlq,
  idDoJob,
  montarEnvelope,
  NOMES_FILAS,
} from './job.js';

const TENANT = '01a10e00-0000-7000-8000-0000000f0002';
const recalcular = definirJob({
  fila: 'prazos',
  tipo: 'prazos.recalcular',
  dados: z.object({ prazoId: z.string() }),
});
const varrer = definirJob({
  fila: 'manutencao',
  tipo: 'manutencao.varrer',
  dados: z.object({}),
  global: true,
});

describe('catálogo de filas', () => {
  it('tem as filas do card, cada uma com retentativa e DLQ própria', () => {
    expect(NOMES_FILAS).toEqual([
      'eventos',
      'captura',
      'ingestao',
      'classificacao',
      'prazos',
      'notificacoes',
      'relatorios',
      'integracoes',
      'manutencao',
    ]);
    for (const fila of NOMES_FILAS) {
      expect(FILAS[fila].tentativas).toBeGreaterThan(1);
      expect(filaDlq(fila)).toBe(`${fila}-dlq`);
    }
  });
});

describe('job base', () => {
  it('monta o envelope com tenant, chave e contexto de trace', () => {
    const envelope = montarEnvelope(recalcular, { prazoId: 'p1' }, { tenantId: TENANT }, 'p1', {
      requestId: 'req-1',
    });
    expect(EnvelopeJob.parse(envelope)).toEqual({
      tipo: 'prazos.recalcular',
      escopo: { tenantId: TENANT },
      chave: 'p1',
      contexto: { requestId: 'req-1' },
      dados: { prazoId: 'p1' },
    });
  });

  it('job de tenant exige tenantId; job global exige marcação explícita com motivo', () => {
    expect(() =>
      montarEnvelope(recalcular, { prazoId: 'p1' }, { global: true, motivo: 'x' }, 'c', {}),
    ).toThrow('exige tenantId');
    expect(() => montarEnvelope(varrer, {}, { tenantId: TENANT }, 'c', {})).toThrow('é global');
    expect(() => montarEnvelope(varrer, {}, { global: true, motivo: 'ab' }, 'c', {})).toThrow();
    expect(
      montarEnvelope(varrer, {}, { global: true, motivo: 'limpeza diária' }, 'c', {}).escopo,
    ).toEqual({
      global: true,
      motivo: 'limpeza diária',
    });
  });

  it('valida os dados pelo schema antes de publicar', () => {
    expect(() =>
      montarEnvelope(
        recalcular,
        { prazoId: 42 } as unknown as { prazoId: string },
        { tenantId: TENANT },
        'c',
        {},
      ),
    ).toThrow();
  });

  it('recusa tenantId que não é UUID e chave vazia', () => {
    expect(() =>
      montarEnvelope(recalcular, { prazoId: 'p' }, { tenantId: 'x' }, 'c', {}),
    ).toThrow();
    expect(() =>
      montarEnvelope(recalcular, { prazoId: 'p' }, { tenantId: TENANT }, '', {}),
    ).toThrow();
  });

  it('o tipo segue o padrão e o ID é determinístico, sem ":"', () => {
    expect(() =>
      definirJob({ fila: 'prazos', tipo: 'Prazos.Recalcular', dados: z.object({}) }),
    ).toThrow('minúsculo');
    expect(recalcular.global).toBe(false);
    expect(idDoJob('prazos.recalcular', 'p1:v2')).toBe('prazos.recalcular-p1_v2');
    expect(idDoJob('prazos.recalcular', 'p1:v2')).toBe(idDoJob('prazos.recalcular', 'p1:v2'));
  });
});
