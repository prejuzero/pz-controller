import { z } from 'zod';

import { DataCivil, Instante, Uuid } from '../comum.js';
import { definirRota, nomear } from '../rota.js';

/** Tabela de prazos por ato (HU15): dado jurídico mantido só pelo curador (CLAUDE.md, seção 4). */
const RamoDaTabela = z.enum(['civel', 'juizados', 'trabalhista', 'penal', 'juizado-criminal']);
const ContagemDoPrazo = z
  .enum(['uteis', 'corridos'])
  .describe('Ausente na proposta: a do ramo (corridos no penal e no juizado criminal).');
const PoliticaDeDobro = z
  .enum(['entes-cpc', 'so-defensoria', 'fazenda-para-recorrer', 'nao-dobra', 'verificar'])
  .describe('Quem tem prazo em dobro neste ato; "verificar" sugere o simples e mostra o dobro.');
const CalculoDoPrazo = z
  .enum(['automatico', 'data-informada', 'nao-calcula'])
  .describe(
    'Automático pela publicação ou ciência, pela data informada pelo advogado, ou não calcula.',
  );
const LocalDoAto = z
  .enum([
    'orgao-do-processo',
    'juizo-de-origem',
    'tribunal-de-segundo-grau',
    'orgao-da-decisao',
    'tribunal-superior',
    'nao-se-aplica',
  ])
  .describe('Órgão cujo calendário vale para o ato.');
const UnidadeDoPrazo = z
  .enum(['dias', 'horas', 'meses', 'anos'])
  .describe('Fora de dias, só há cálculo com regra específica cadastrada.');
const CodigoDeAto = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  .max(80)
  .describe('Código da taxonomia única (kebab-case).');

export const TipoDeAto = nomear(
  'TipoDeAto',
  z.object({
    codigo: CodigoDeAto,
    nome: z.string().min(1).max(200),
    descricao: z.string().max(2000),
    sinonimos: z.array(z.string().min(1).max(200)).max(50),
  }),
);
export type TipoDeAto = z.infer<typeof TipoDeAto.esquema>;

export const PedidoDeTipoDeAto = nomear(
  'PedidoDeTipoDeAto',
  TipoDeAto.esquema.extend({
    sinonimos: TipoDeAto.esquema.shape.sinonimos.optional(),
  }),
);

export const TiposDeAto = nomear('TiposDeAto', z.object({ itens: z.array(TipoDeAto.esquema) }));
export type TiposDeAto = z.infer<typeof TiposDeAto.esquema>;

export const PedidoDeVersaoDaTabela = nomear(
  'PedidoDeVersaoDaTabela',
  z.object({
    tipoAto: CodigoDeAto,
    ramo: RamoDaTabela,
    dias: z.number().int().positive().max(10_000).describe('Quantidade, na unidade indicada.'),
    unidade: UnidadeDoPrazo,
    fundamento: z.string().min(1).max(500).describe('Dispositivo legal (lei, artigo, parágrafo).'),
    fonteUrl: z.url().max(2000).describe('Link HTTPS da fonte oficial.'),
    vigenciaInicio: DataCivil,
    vigenciaFim: DataCivil.optional(),
    contagem: ContagemDoPrazo.optional(),
    politicaDobro: PoliticaDeDobro.optional().describe('Ausente: "verificar".'),
    calculo: CalculoDoPrazo.optional().describe('Ausente: "automatico".'),
    marcoInicial: z.string().min(1).max(500).optional().describe('Quando não é a publicação.'),
    localDoAto: LocalDoAto.optional(),
    alerta: z.string().min(1).max(1000).optional().describe('Repassado ao advogado como aviso.'),
  }),
);
export type PedidoDeVersaoDaTabela = z.infer<typeof PedidoDeVersaoDaTabela.esquema>;

export const VersaoDaTabela = nomear(
  'VersaoDaTabela',
  z.object({
    id: Uuid,
    tipoAto: CodigoDeAto,
    ramo: RamoDaTabela,
    versao: z.number().int().positive(),
    dias: z.number().int().positive(),
    unidade: UnidadeDoPrazo,
    fundamento: z.string(),
    fonteUrl: z.string(),
    vigenciaInicio: DataCivil,
    vigenciaFim: DataCivil.nullable(),
    contagem: ContagemDoPrazo,
    politicaDobro: PoliticaDeDobro,
    calculo: CalculoDoPrazo,
    marcoInicial: z.string().nullable(),
    localDoAto: LocalDoAto.nullable(),
    alerta: z.string().nullable(),
    status: z.enum(['rascunho', 'aprovado']).describe('Só a aprovada entra no cálculo.'),
    propostoPor: Uuid,
    propostoEm: Instante,
    aprovadoPor: Uuid.nullable(),
    aprovadoEm: Instante.nullable(),
  }),
);
export type VersaoDaTabela = z.infer<typeof VersaoDaTabela.esquema>;

export const VersoesDaTabela = nomear(
  'VersoesDaTabela',
  z.object({ itens: z.array(VersaoDaTabela.esquema) }),
);
export type VersoesDaTabela = z.infer<typeof VersoesDaTabela.esquema>;

export const PedidoDeImportacaoDaTabela = nomear(
  'PedidoDeImportacaoDaTabela',
  z.object({
    csv: z
      .string()
      .min(1)
      .max(1_000_000)
      .describe(
        'CSV (separador ; ou ,) com o cabeçalho tipoAto;nomeDoAto;ramo;dias;unidade;contagem;politicaDobro;calculo;marcoInicial;localDoAto;alerta;fundamento;fonteUrl;vigenciaInicio;vigenciaFim.',
      ),
    somentePrevia: z
      .boolean()
      .default(true)
      .describe('true: só valida; false: grava se tudo for válido.'),
  }),
);

export const ResultadoDaImportacaoDaTabela = nomear(
  'ResultadoDaImportacaoDaTabela',
  z.object({
    linhas: z.array(
      z.object({
        linha: z.number().int(),
        problemas: z.array(z.object({ campo: z.string(), mensagem: z.string() })),
      }),
    ),
    tiposNovos: z
      .array(CodigoDeAto)
      .describe('Tipos de ato cadastrados (ou a cadastrar, na prévia).'),
    propostos: z
      .array(VersaoDaTabela.esquema)
      .describe('Rascunhos gravados (vazio na prévia); cada um ainda exige aprovação.'),
  }),
);
export type ResultadoDaImportacaoDaTabela = z.infer<typeof ResultadoDaImportacaoDaTabela.esquema>;

export const importarTabelaDePrazos = definirRota({
  id: 'importarTabelaDePrazos',
  metodo: 'post',
  caminho: '/v1/admin/tabela-prazos/importacao',
  resumo: 'Valida um CSV (prévia) e, se tudo estiver certo, grava as versões como rascunho.',
  tag: 'tabela-prazos',
  corpo: PedidoDeImportacaoDaTabela,
  resposta: { status: 200, corpo: ResultadoDaImportacaoDaTabela },
});

export const listarTiposDeAto = definirRota({
  id: 'listarTiposDeAto',
  metodo: 'get',
  caminho: '/v1/admin/tabela-prazos/tipos-de-ato',
  resumo: 'Taxonomia única de tipos de ato.',
  tag: 'tabela-prazos',
  resposta: { status: 200, corpo: TiposDeAto },
});

export const cadastrarTipoDeAto = definirRota({
  id: 'cadastrarTipoDeAto',
  metodo: 'post',
  caminho: '/v1/admin/tabela-prazos/tipos-de-ato',
  resumo: 'Cadastra um tipo de ato na taxonomia.',
  tag: 'tabela-prazos',
  corpo: PedidoDeTipoDeAto,
  resposta: { status: 201, corpo: TipoDeAto },
  erros: [409],
});

export const listarVersoesDaTabela = definirRota({
  id: 'listarVersoesDaTabela',
  metodo: 'get',
  caminho: '/v1/admin/tabela-prazos',
  resumo: 'Versões da tabela (rascunhos e aprovadas), por ato e ramo.',
  tag: 'tabela-prazos',
  consulta: z.object({ tipoAto: CodigoDeAto.optional(), ramo: RamoDaTabela.optional() }),
  resposta: { status: 200, corpo: VersoesDaTabela },
});

export const proporVersaoDaTabela = definirRota({
  id: 'proporVersaoDaTabela',
  metodo: 'post',
  caminho: '/v1/admin/tabela-prazos',
  resumo: 'Propõe uma versão; só vale depois de aprovada por outro curador.',
  tag: 'tabela-prazos',
  corpo: PedidoDeVersaoDaTabela,
  resposta: { status: 201, corpo: VersaoDaTabela },
  erros: [409],
});

export const aprovarVersaoDaTabela = definirRota({
  id: 'aprovarVersaoDaTabela',
  metodo: 'post',
  caminho: '/v1/admin/tabela-prazos/{id}/aprovar',
  resumo: 'Aprova uma versão proposta por outro curador (quatro olhos).',
  tag: 'tabela-prazos',
  parametrosDeCaminho: z.object({ id: Uuid }),
  resposta: { status: 200, corpo: VersaoDaTabela },
  erros: [404, 409],
});

export const ROTAS_TABELA_PRAZOS = [
  listarTiposDeAto,
  cadastrarTipoDeAto,
  listarVersoesDaTabela,
  proporVersaoDaTabela,
  aprovarVersaoDaTabela,
  importarTabelaDePrazos,
] as const;
