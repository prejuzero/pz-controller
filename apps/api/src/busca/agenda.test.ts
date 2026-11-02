import { err, ok, Validacao } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { AgendaController } from './agenda.controller.js';

import type { ConsultarAgenda } from '@pz/busca';

// Só a ligação HTTP → módulo busca (a regra é testada no módulo).
describe('AgendaController (HU27)', () => {
  it('repassa a consulta e transforma erro de validação em exceção', async () => {
    const vazia = { prazos: [], prazosTruncados: false, compromissos: [], diasNaoUteis: [] };
    const controller = new AgendaController({
      executar: (consulta: { de?: string }) =>
        Promise.resolve(consulta.de === undefined ? err(new Validacao([])) : ok(vazia)),
    } as unknown as ConsultarAgenda);
    expect(await controller.consultarAgenda({ de: '2026-11-01', ate: '2026-11-30' })).toEqual(
      vazia,
    );
    await expect(controller.consultarAgenda({})).rejects.toBeInstanceOf(Validacao);
  });
});
