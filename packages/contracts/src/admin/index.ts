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

export const ROTAS_ADMIN = [iniciarImpersonacao, encerrarImpersonacao] as const;
