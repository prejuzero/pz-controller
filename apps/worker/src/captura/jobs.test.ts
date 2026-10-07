import { describe, expect, it } from 'vitest';

import { esquemaWorker } from '../ambiente.js';

import { agendamentoDaCaptura, executarCapturaJob, planejarCapturaJob } from './jobs.js';

describe('jobs da captura (HU17)', () => {
  it('planejamento recorrente global na fila captura, com o cron configurado', () => {
    expect(agendamentoDaCaptura('0 8 * * *')).toMatchObject({
      id: 'captura.planejar',
      cron: '0 8 * * *',
      job: { fila: 'captura', global: true },
    });
    expect(planejarCapturaJob.global && executarCapturaJob.global).toBe(true);
  });

  it('execução só aceita alvo, tipo e janela válidos', () => {
    const dados = {
      alvoId: '01a10e00-0000-7000-8000-000000000001',
      tipo: 'oab',
      valor: '123456/SP',
      inicio: '2026-10-01',
      fim: '2026-10-07',
    };
    expect(executarCapturaJob.dados.parse(dados)).toEqual(dados);
    expect(() => executarCapturaJob.dados.parse({ ...dados, tipo: 'nome' })).toThrow();
    expect(() => executarCapturaJob.dados.parse({ ...dados, chave: 'x' })).toThrow();
  });

  it('padrões do ambiente: 6 vezes ao dia, 7 dias iniciais, DJEN', () => {
    const forma = esquemaWorker.shape;
    expect(forma.CAPTURA_CRON.parse(undefined)).toBe('0 7,9,11,13,15,17 * * *');
    expect(forma.CAPTURA_DIAS_INICIAIS.parse(undefined)).toBe(7);
    expect(forma.CAPTURA_FONTE.parse(undefined)).toBe('djen');
  });
});
