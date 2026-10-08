import { z } from 'zod';

import { SessaoAtual } from '../auth/index.js';
import { ConsultaPaginada, DataCivil, Instante, pagina, Uuid } from '../comum.js';
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

const EstadoDaIntegracao = z.enum(['operacional', 'degradado', 'indisponivel']);

export const PainelDeIntegracoes = nomear(
  'PainelDeIntegracoes',
  z.object({
    adaptadores: z
      .array(
        z.object({
          adaptador: z.string(),
          estado: EstadoDaIntegracao.describe('Pior estado entre as instâncias do worker.'),
          instancias: z.number().int().min(1),
          ultimoSucesso: Instante.nullable(),
          ultimaFalha: Instante.nullable(),
          erro: z.string().nullable().describe('Mensagem da última falha, sem dados do processo.'),
        }),
      )
      .describe('Só adaptadores de instâncias que informaram nos últimos 2 minutos.'),
    falhas: z
      .array(
        z.object({ adaptador: z.string(), instancia: z.string(), em: Instante, erro: z.string() }),
      )
      .describe('Falhas mais recentes primeiro (até 50).'),
  }),
);
export type PainelDeIntegracoes = z.infer<typeof PainelDeIntegracoes.esquema>;

/** Saúde das integrações (HU39, ADR-005): exige `admin:filas` (operação da plataforma). */
export const consultarIntegracoes = definirRota({
  id: 'consultarIntegracoes',
  metodo: 'get',
  caminho: '/v1/admin/integracoes',
  resumo: 'Estado de cada adaptador e o histórico recente de falhas.',
  tag: 'admin',
  resposta: { status: 200, corpo: PainelDeIntegracoes },
});

export const ResumoDasFilas = nomear(
  'ResumoDasFilas',
  z.object({
    filas: z.array(
      z.object({
        fila: z.string(),
        aguardando: z.number().int().nonnegative(),
        ativos: z.number().int().nonnegative(),
        atrasados: z.number().int().nonnegative(),
        falhos: z.number().int().nonnegative(),
        mortos: z.number().int().nonnegative().describe('Jobs na DLQ da fila.'),
      }),
    ),
  }),
);
export type ResumoDasFilas = z.infer<typeof ResumoDasFilas.esquema>;

/** Resumo das filas (HU39): exige `admin:filas`. Reprocessar a DLQ é pela rota auditada. */
export const resumirFilas = definirRota({
  id: 'resumirFilas',
  metodo: 'get',
  caminho: '/v1/admin/filas',
  resumo: 'Contagem de jobs por fila do catálogo, com a DLQ.',
  tag: 'admin',
  resposta: { status: 200, corpo: ResumoDasFilas },
});

export const RejeicaoDeEmail = nomear(
  'RejeicaoDeEmail',
  z.object({
    email: z.string(),
    motivo: z.enum(['bounce', 'spam']),
    criadaEm: Instante,
  }),
);

export const PaginaDeRejeicoes = nomear('PaginaDeRejeicoes', pagina(RejeicaoDeEmail.esquema));
export type PaginaDeRejeicoes = z.infer<typeof PaginaDeRejeicoes.esquema>;

/** E-mails suprimidos por rejeição (HU30/HU39): exige `admin:tenants`. Lista global. */
export const listarRejeicoesDeEmail = definirRota({
  id: 'listarRejeicoesDeEmail',
  metodo: 'get',
  caminho: '/v1/admin/rejeicoes-email',
  resumo: 'Lista os e-mails que não recebem mais envios (bounce ou spam), por e-mail.',
  tag: 'admin',
  consulta: ConsultaPaginada,
  resposta: { status: 200, corpo: PaginaDeRejeicoes },
});

export const ConsultaDeUsoDeIa = z.object({
  dias: z.coerce
    .number()
    .int()
    .min(1)
    .max(90)
    .default(30)
    .describe('Dias até hoje (fuso de Brasília), inclusive.'),
});

export const PainelDeUsoDeIa = nomear(
  'PainelDeUsoDeIa',
  z.object({
    de: DataCivil,
    ate: DataCivil,
    /** Custos estimados em US$ pelo preço de tabela do provedor (não é a fatura). */
    custoTotalUsd: z.number().nonnegative(),
    classificacao: z.object({
      chamadas: z.number().int().nonnegative(),
      custoMedioUsd: z.number().nonnegative().nullable(),
      metaUsd: z.number().positive(),
    }),
    dias: z.array(
      z.object({
        dia: DataCivil,
        tarefa: z.string(),
        modelo: z.string(),
        chamadas: z.number().int().nonnegative(),
        tokensEntrada: z.number().int().nonnegative(),
        tokensSaida: z.number().int().nonnegative(),
        tokensCacheLidos: z.number().int().nonnegative(),
        custoUsd: z.number().nonnegative(),
      }),
    ),
  }),
);
export type PainelDeUsoDeIa = z.infer<typeof PainelDeUsoDeIa.esquema>;

/**
 * Custo diário de IA por tarefa e modelo (HU21): exige `admin:filas` (operação da plataforma).
 * O custo médio por publicação classificada é comparado à meta da especificação (seção 7.5).
 */
export const consultarUsoDeIa = definirRota({
  id: 'consultarUsoDeIa',
  metodo: 'get',
  caminho: '/v1/admin/uso-ia',
  resumo: 'Chamadas, tokens e custo estimado de IA por dia, tarefa e modelo.',
  tag: 'admin',
  consulta: ConsultaDeUsoDeIa,
  resposta: { status: 200, corpo: PainelDeUsoDeIa },
});

export const ConsultaDaRevisaoManual = ConsultaPaginada.extend({ cursor: Uuid.optional() });

export const ItemDaRevisaoManual = nomear(
  'ItemDaRevisaoManual',
  z.object({
    conteudoId: Uuid,
    origem: z.enum(['regra', 'ia', 'nenhuma']),
    /** Por que caiu na revisão: saída da IA inválida, IA desligada ou orçamento diário esgotado. */
    motivo: z.enum(['saida-invalida', 'ia-desligada', 'sem-orcamento']).nullable(),
    tipoAto: z.string().nullable(),
    confianca: z.number().min(0).max(1).nullable(),
    /** Trechos do teor; nunca uma data (ADR-008). */
    evidencias: z.array(
      z.object({ inicio: z.number().int(), fim: z.number().int(), trecho: z.string() }),
    ),
    versaoPrompt: z.string().nullable(),
    modelo: z.string().nullable(),
    criadaEm: Instante,
  }),
);

export const PaginaDaRevisaoManual = nomear(
  'PaginaDaRevisaoManual',
  pagina(ItemDaRevisaoManual.esquema),
);
export type PaginaDaRevisaoManual = z.infer<typeof PaginaDaRevisaoManual.esquema>;

/**
 * Fila de revisão manual do curador (HU21): exige `curadoria:classificacao`. Classificações
 * globais (uma por conteúdo) que nem as regras nem a IA resolveram, da mais antiga à mais nova.
 */
export const listarRevisaoManual = definirRota({
  id: 'listarRevisaoManual',
  metodo: 'get',
  caminho: '/v1/admin/classificacoes/revisao-manual',
  resumo: 'Lista as publicações cuja classificação aguarda revisão do curador.',
  tag: 'admin',
  consulta: ConsultaDaRevisaoManual,
  resposta: { status: 200, corpo: PaginaDaRevisaoManual },
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
  consultarIntegracoes,
  resumirFilas,
  listarRejeicoesDeEmail,
  consultarUsoDeIa,
  listarRevisaoManual,
] as const;
