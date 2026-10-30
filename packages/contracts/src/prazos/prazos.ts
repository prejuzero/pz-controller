import { z } from 'zod';

import { ConsultaPaginada, DataCivil, Instante, pagina, Uuid } from '../comum.js';
import { definirRota, nomear } from '../rota.js';

const StatusDoPrazo = z.enum(['a-confirmar', 'pendente', 'cumprido', 'vencido', 'cancelado']);
const Ramo = z.enum(['civel', 'juizados', 'trabalhista', 'penal', 'juizado-criminal']);
const Unidade = z.enum(['dias', 'horas', 'meses', 'anos']);
const Versao = z.number().int().positive().describe('Versão lida: outra gravação no meio dá 409.');
const Motivo = z.string().min(10).max(1000);

/** Prazo do escritório (HU24): sugerido pelo motor, só vale depois de confirmado. */
export const Prazo = nomear(
  'Prazo',
  z.object({
    id: Uuid,
    processoId: Uuid,
    publicacaoConteudoId: Uuid.nullable(),
    tipoAto: z.string(),
    ramo: Ramo.nullable(),
    situacao: z.enum(['calculado', 'a-confirmar']).describe('"a-confirmar": sem data sugerida.'),
    dias: z.number().int().nullable(),
    unidade: Unidade.nullable(),
    inicio: DataCivil.nullable(),
    vencimento: DataCivil.nullable(),
    fimDoPrazo: Instante.nullable().describe('24h do vencimento no fuso do juízo (exclusive).'),
    fusoDoJuizo: z.string().nullable(),
    fundamento: z.string().nullable(),
    versaoMotor: z.string(),
    versaoTabela: z.number().int().nullable(),
    vencimentoManual: z
      .boolean()
      .describe('Data informada pelo advogado ("definida manualmente").'),
    origem: z.enum(['djen', 'manual', 'painel']),
    status: StatusDoPrazo,
    statusCiencia: z.enum(['pendente', 'confirmada']),
    responsavelId: Uuid.nullable(),
    jurisdicao: z.object({
      tribunal: z.string().optional(),
      uf: z.string().optional(),
      comarca: z.string().optional(),
      lacunas: z.array(z.string()).readonly(),
    }),
    classificacaoIncerta: z
      .boolean()
      .describe('Classificação de confiança baixa ou revisão manual.'),
    motivoAjuste: z.string().nullable(),
    versao: z.number().int().positive(),
  }),
);
export type Prazo = z.infer<typeof Prazo.esquema>;

export const DetalheDoPrazo = nomear(
  'DetalheDoPrazo',
  Prazo.esquema.extend({
    memoria: z.unknown().describe('Memória de cálculo do motor (CLAUDE.md, seção 4.4).'),
    parametros: z.unknown().describe('Entrada do cálculo (ato, meio, referência, condições).'),
  }),
);
export type DetalheDoPrazo = z.infer<typeof DetalheDoPrazo.esquema>;

export const PaginaDePrazos = nomear('PaginaDePrazos', pagina(Prazo.esquema));
export type PaginaDePrazos = z.infer<typeof PaginaDePrazos.esquema>;

export const PedidoComVersao = nomear('PedidoComVersao', z.object({ versao: Versao }).strict());
export const PedidoDeCancelamento = nomear(
  'PedidoDeCancelamento',
  z.object({ versao: Versao, motivo: Motivo }).strict(),
);
export const PedidoDeAjuste = nomear(
  'PedidoDeAjuste',
  z
    .object({
      versao: Versao,
      motivo: Motivo,
      tipoAto: z.string().optional(),
      ramo: Ramo.optional(),
      dias: z.number().int().positive().optional(),
      unidade: Unidade.optional(),
      vencimento: DataCivil.optional().describe('Data informada: fica "definida manualmente".'),
    })
    .strict(),
);

const caminho = (acao: string) => `/v1/prazos/{id}/${acao}`;
const acao = (id: string, acaoDoPrazo: string, resumo: string, corpo = PedidoComVersao) =>
  definirRota({
    id,
    metodo: 'post',
    caminho: caminho(acaoDoPrazo),
    resumo,
    tag: 'prazos',
    parametrosDeCaminho: z.object({ id: Uuid }),
    corpo,
    resposta: { status: 200, corpo: Prazo },
    erros: [404, 409],
  });

export const listarPrazos = definirRota({
  id: 'listarPrazos',
  metodo: 'get',
  caminho: '/v1/prazos',
  resumo:
    'Prazos do escritório, do vencimento mais próximo ao mais distante (sem data por último).',
  tag: 'prazos',
  consulta: ConsultaPaginada.extend({
    status: StatusDoPrazo.optional(),
    processoId: Uuid.optional(),
    responsavelId: Uuid.optional(),
    recorte: z
      .enum(['vence-hoje', 'proximos-7-dias', 'vencidos', 'sem-ciencia'])
      .optional()
      .describe('Card do dashboard (HU26): mesmo critério da contagem; "hoje" é o do servidor.'),
  }),
  resposta: { status: 200, corpo: PaginaDePrazos },
});

export const consultarPrazo = definirRota({
  id: 'consultarPrazo',
  metodo: 'get',
  caminho: '/v1/prazos/{id}',
  resumo: 'Detalhe do prazo com a memória de cálculo.',
  tag: 'prazos',
  parametrosDeCaminho: z.object({ id: Uuid }),
  resposta: { status: 200, corpo: DetalheDoPrazo },
  erros: [404],
});

export const confirmarPrazo = acao('confirmarPrazo', 'confirmar', 'O advogado confirma a data.');
export const ajustarPrazo = acao(
  'ajustarPrazo',
  'ajustar',
  'Ajusta ato, ramo ou dias (recalcula pelo motor) ou informa o vencimento; sempre com motivo.',
  PedidoDeAjuste,
);
export const simularAjustePrazo = acao(
  'simularAjustePrazo',
  'simular-ajuste',
  'Prévia do ajuste: o novo cálculo do motor, sem gravar.',
  PedidoDeAjuste,
);
export const cumprirPrazo = acao(
  'cumprirPrazo',
  'cumprir',
  'Marca o prazo pendente como cumprido.',
);
export const cancelarPrazo = acao(
  'cancelarPrazo',
  'cancelar',
  'Cancela o prazo, com motivo.',
  PedidoDeCancelamento,
);

export const PedidoDePrazoManual = nomear(
  'PedidoDePrazoManual',
  z
    .object({
      processoId: Uuid,
      tipoAto: z.string().min(1).max(80),
      ramo: Ramo.optional(),
      dias: z.number().int().positive().optional().describe('Prazo fixado no ato (prevalece).'),
      unidade: Unidade.optional(),
      meio: z.enum(['djen', 'portal', 'manual']).describe('Como o ato chegou ao advogado.'),
      dataDeReferencia: DataCivil.describe('Disponibilização, envio ou ciência, conforme o meio.'),
      origem: z.enum(['djen', 'manual', 'painel']),
      observacao: z.string().max(1000).optional(),
      documento: z
        .string()
        .optional()
        .describe('`arquivoId` do PDF analisado (cadastro assistido).'),
      vencimentoConfirmado: DataCivil.optional().describe(
        'Vencimento visto na prévia: o prazo nasce pendente; outra data dá 409.',
      ),
    })
    .strict(),
);

export const AtoDaTaxonomia = nomear(
  'AtoDaTaxonomia',
  z.object({ codigo: z.string(), nome: z.string() }),
);
export const AtosDaTaxonomia = nomear(
  'AtosDaTaxonomia',
  z.object({ itens: z.array(AtoDaTaxonomia.esquema) }),
);
export type AtosDaTaxonomia = z.infer<typeof AtosDaTaxonomia.esquema>;

export const cadastrarPrazo = definirRota({
  id: 'cadastrarPrazo',
  metodo: 'post',
  caminho: '/v1/prazos',
  resumo: 'Cadastra um prazo manual; a data é calculada pelo motor.',
  tag: 'prazos',
  corpo: PedidoDePrazoManual,
  resposta: { status: 201, corpo: Prazo },
  erros: [404, 409],
});

export const simularPrazo = definirRota({
  id: 'simularPrazo',
  metodo: 'post',
  caminho: '/v1/prazos/simular',
  resumo: 'Prévia do prazo manual pelo motor, sem gravar.',
  tag: 'prazos',
  corpo: PedidoDePrazoManual,
  resposta: { status: 200, corpo: Prazo },
  erros: [404],
});

export const listarAtosDaTaxonomia = definirRota({
  id: 'listarAtosDaTaxonomia',
  metodo: 'get',
  caminho: '/v1/tipos-de-ato',
  resumo: 'Tipos de ato da taxonomia aprovada, para o cadastro de prazos.',
  tag: 'prazos',
  resposta: { status: 200, corpo: AtosDaTaxonomia },
});

export const ROTAS_PRAZOS = [
  listarPrazos,
  cadastrarPrazo,
  simularPrazo,
  listarAtosDaTaxonomia,
  consultarPrazo,
  confirmarPrazo,
  ajustarPrazo,
  simularAjustePrazo,
  cumprirPrazo,
  cancelarPrazo,
] as const;
