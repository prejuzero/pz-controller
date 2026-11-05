import { z } from 'zod';

import { definirJob } from '../filas/job.js';

/** Gera um relatório pedido (HU29) na fila própria; a chave é o id do relatório (idempotente). */
export const gerarRelatorioJob = definirJob({
  fila: 'relatorios',
  tipo: 'relatorios.gerar',
  dados: z.object({ relatorioId: z.uuid(), tenantId: z.uuid() }).strict(),
});

/** Apaga os arquivos de relatórios com o link vencido, de todos os escritórios (PZ-353). */
export const removerArquivosExpiradosJob = definirJob({
  fila: 'manutencao',
  tipo: 'relatorios.remover-expirados',
  dados: z.object({}).strict(),
  global: true,
});
