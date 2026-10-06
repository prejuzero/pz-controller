import { z } from 'zod';

import { SessaoAtual } from '../auth/index.js';
import { Uuid } from '../comum.js';
import { definirRota, nomear } from '../rota.js';

export const PedidoDeImpersonacao = nomear(
  'PedidoDeImpersonacao',
  z.object({
    tenantId: Uuid.describe('Tenant a acessar (nunca o da plataforma).'),
    motivo: z
      .string()
      .min(10)
      .max(500)
      .describe('Por que o acesso é necessário (ex.: número do chamado); vai para a auditoria.'),
  }),
);
export type PedidoDeImpersonacao = z.infer<typeof PedidoDeImpersonacao.esquema>;

/**
 * Impersonação auditada (HU07): exige `admin:impersonar`, só pelo portal; vale 60 min, só para
 * leitura, e registra auditoria no tenant acessado e no da plataforma.
 */
export const iniciarImpersonacao = definirRota({
  id: 'iniciarImpersonacao',
  metodo: 'post',
  caminho: '/v1/admin/impersonacao',
  resumo: 'Acessa um tenant por até 60 minutos, só para leitura, com motivo auditado.',
  tag: 'admin',
  corpo: PedidoDeImpersonacao,
  resposta: { status: 201, corpo: SessaoAtual },
  erros: [404, 409],
});

export const encerrarImpersonacao = definirRota({
  id: 'encerrarImpersonacao',
  metodo: 'delete',
  caminho: '/v1/admin/impersonacao',
  resumo: 'Encerra a impersonação em curso (sem efeito se não houver).',
  tag: 'admin',
  resposta: { status: 204, corpo: null },
});

export const PedidoDeReprocessamento = nomear(
  'PedidoDeReprocessamento',
  z.object({
    motivo: z
      .string()
      .min(10)
      .max(500)
      .describe('Por que o job pode voltar à fila (ex.: causa corrigida); vai para a auditoria.'),
  }),
);
export type PedidoDeReprocessamento = z.infer<typeof PedidoDeReprocessamento.esquema>;

/**
 * Reprocessamento auditado da DLQ (HU07, herdado da HU10): exige `admin:filas`. O job original
 * volta à fila de origem com as tentativas zeradas; o painel em `/admin/filas` só lê.
 */
export const reprocessarJobMorto = definirRota({
  id: 'reprocessarJobMorto',
  metodo: 'post',
  caminho: '/v1/admin/filas/{fila}/dlq/{jobId}/reprocessar',
  resumo: 'Devolve um job da DLQ à fila de origem, com motivo auditado.',
  tag: 'admin',
  parametrosDeCaminho: z.object({
    // Fila fora do catálogo responde 404 (o catálogo fica no back-end, @pz/integracoes).
    fila: z.string().regex(/^[a-z]{1,40}$/),
    jobId: z.string().min(1).max(300),
  }),
  corpo: PedidoDeReprocessamento,
  resposta: { status: 204, corpo: null },
  erros: [404, 409],
});

export const ROTAS_ADMIN = [
  iniciarImpersonacao,
  encerrarImpersonacao,
  reprocessarJobMorto,
] as const;
