import { z } from 'zod';

import { definirJob } from '../filas/job.js';

/**
 * Recifra dos campos sensíveis (HU37, ADR-021): cifra os legados em claro e passa os de chave
 * antiga para a ativa. Global (lista os tenants como sistema, grava em cada um); idempotente.
 */
export const recifrarCamposJob = definirJob({
  fila: 'manutencao',
  tipo: 'cadastro.recifrar-campos',
  dados: z.object({}).strict(),
  global: true,
});
