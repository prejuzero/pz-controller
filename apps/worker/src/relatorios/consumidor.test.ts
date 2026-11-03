import { describe, expect, it } from 'vitest';

import { ConsumidorDosRelatorios } from './consumidor.js';
import { gerarRelatorioJob } from './jobs.js';

import type { Filas } from '../filas/runtime.js';
import type { EventoDominio } from '@pz/kernel';

// Ids FICTÍCIOS (HU29).
const TENANT = '01a10e00-0000-7000-8000-0000000d9101';
const RELATORIO = '01a10e00-0000-7000-8000-0000000d9102';

describe('ConsumidorDosRelatorios (HU29)', () => {
  it('leva o pedido à fila relatorios com o id como chave (repetir não duplica)', async () => {
    const publicados: unknown[][] = [];
    const filas = {
      publicar: (...args: unknown[]) => {
        publicados.push(args);
        return Promise.resolve();
      },
    } as unknown as Filas;
    const evento = {
      tenantId: TENANT,
      payload: { relatorioId: RELATORIO, usuarioId: TENANT },
    } as unknown as EventoDominio;
    await new ConsumidorDosRelatorios(filas).relatorioSolicitado(undefined, evento);
    expect(publicados).toEqual([
      [
        gerarRelatorioJob,
        { relatorioId: RELATORIO, tenantId: TENANT },
        { tenantId: TENANT },
        RELATORIO,
      ],
    ]);
    expect(gerarRelatorioJob.fila).toBe('relatorios');
  });
});
