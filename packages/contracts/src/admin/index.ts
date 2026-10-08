import { z } from 'zod';

import { SessaoAtual } from '../auth/index.js';
import { ConsultaPaginada, Instante, pagina, Uuid } from '../comum.js';
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

export const SituacaoAssinatura = nomear(
  'SituacaoAssinatura',
  z
    .enum(['teste', 'ativa', 'inadimplente', 'cancelada'])
    .describe('Situação da assinatura, manual no MVP (gateway de cobrança futuro).'),
);

export const TenantAdministrado = nomear(
  'TenantAdministrado',
  z.object({
    id: Uuid,
    nome: z.string(),
    tipo: z.enum(['autonomo', 'escritorio', 'plataforma']),
    plano: z.string().nullable(),
    situacaoAssinatura: SituacaoAssinatura.esquema,
    suspensao: z
      .object({ em: Instante, motivo: z.string() })
      .nullable()
      .describe('Acesso suspenso: login e renovação recusados; captura e avisos continuam.'),
    encerradoEm: Instante.nullable(),
    criadoEm: Instante,
  }),
);
export type TenantAdministrado = z.infer<typeof TenantAdministrado.esquema>;

export const PaginaDeTenants = nomear('PaginaDeTenants', pagina(TenantAdministrado.esquema));
export type PaginaDeTenants = z.infer<typeof PaginaDeTenants.esquema>;

const tenantNoCaminho = z.object({ tenantId: Uuid });

/**
 * Tenants da plataforma (HU39): exigem `admin:tenants`. Só a linha do tenant (nome, plano,
 * assinatura, suspensão); dados de negócio só por impersonação. Toda alteração é auditada no
 * tenant alterado e no da plataforma.
 */
export const listarTenants = definirRota({
  id: 'listarTenants',
  metodo: 'get',
  caminho: '/v1/admin/tenants',
  resumo: 'Lista os tenants, do mais novo para o mais antigo.',
  tag: 'admin',
  consulta: ConsultaPaginada,
  resposta: { status: 200, corpo: PaginaDeTenants },
});

export const consultarTenant = definirRota({
  id: 'consultarTenant',
  metodo: 'get',
  caminho: '/v1/admin/tenants/{tenantId}',
  resumo: 'Detalha um tenant (plano, assinatura e suspensão).',
  tag: 'admin',
  parametrosDeCaminho: tenantNoCaminho,
  resposta: { status: 200, corpo: TenantAdministrado },
  erros: [404],
});

export const PedidoDeAssinatura = nomear(
  'PedidoDeAssinatura',
  z
    .object({
      plano: z.string().trim().min(1).max(80).nullable().optional(),
      situacaoAssinatura: SituacaoAssinatura.esquema.optional(),
    })
    .refine((p) => p.plano !== undefined || p.situacaoAssinatura !== undefined, {
      message: 'Informe o plano ou a situação da assinatura.',
    }),
);
export type PedidoDeAssinatura = z.infer<typeof PedidoDeAssinatura.esquema>;

export const alterarAssinatura = definirRota({
  id: 'alterarAssinatura',
  metodo: 'patch',
  caminho: '/v1/admin/tenants/{tenantId}/assinatura',
  resumo: 'Altera o plano e a situação da assinatura (manual no MVP).',
  tag: 'admin',
  parametrosDeCaminho: tenantNoCaminho,
  corpo: PedidoDeAssinatura,
  resposta: { status: 200, corpo: TenantAdministrado },
  erros: [404, 409],
});

export const PedidoDeSuspensao = nomear(
  'PedidoDeSuspensao',
  z.object({
    motivo: z
      .string()
      .trim()
      .min(10)
      .max(500)
      .describe('Por que o acesso é suspenso (ex.: número do chamado); vai para a auditoria.'),
  }),
);
export type PedidoDeSuspensao = z.infer<typeof PedidoDeSuspensao.esquema>;

export const suspenderTenant = definirRota({
  id: 'suspenderTenant',
  metodo: 'post',
  caminho: '/v1/admin/tenants/{tenantId}/suspensao',
  resumo: 'Suspende o acesso do tenant e derruba as sessões abertas (idempotente).',
  tag: 'admin',
  parametrosDeCaminho: tenantNoCaminho,
  corpo: PedidoDeSuspensao,
  resposta: { status: 200, corpo: TenantAdministrado },
  erros: [404, 409],
});

export const reativarTenant = definirRota({
  id: 'reativarTenant',
  metodo: 'delete',
  caminho: '/v1/admin/tenants/{tenantId}/suspensao',
  resumo: 'Reativa o acesso do tenant (sem efeito se não estiver suspenso).',
  tag: 'admin',
  parametrosDeCaminho: tenantNoCaminho,
  resposta: { status: 200, corpo: TenantAdministrado },
  erros: [404],
});

export const ROTAS_ADMIN = [
  iniciarImpersonacao,
  encerrarImpersonacao,
  reprocessarJobMorto,
  listarTenants,
  consultarTenant,
  alterarAssinatura,
  suspenderTenant,
  reativarTenant,
] as const;
