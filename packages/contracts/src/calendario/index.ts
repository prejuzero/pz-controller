import { z } from 'zod';

import { DataCivil, Instante, Uuid } from '../comum.js';
import { definirRota, nomear } from '../rota.js';

const Abrangencia = z.enum(['nacional', 'uf', 'municipio', 'tribunal', 'comarca']);
const TipoDeEvento = z.enum(['feriado', 'recesso', 'portaria', 'indisponibilidade']);
const Jurisdicao = {
  uf: z.string().length(2).optional().describe('Sigla da UF.'),
  municipioIbge: z
    .string()
    .regex(/^\d{7}$/)
    .optional()
    .describe('Código IBGE do município.'),
  tribunal: z.string().min(2).max(20).optional().describe('Sigla do tribunal (ex.: TJSP).'),
  comarca: z.string().min(1).max(200).optional().describe('Comarca, dentro do tribunal.'),
};

export const PedidoDeEventoDoCalendario = nomear(
  'PedidoDeEventoDoCalendario',
  z.object({
    abrangencia: Abrangencia.describe('Os campos de jurisdição exigidos dependem dela.'),
    ...Jurisdicao,
    tipo: TipoDeEvento,
    inicio: DataCivil,
    fim: DataCivil.describe('Inclusivo; igual ao início para um só dia.'),
    descricao: z.string().min(1).max(500),
    atoNormativo: z.string().min(1).max(500).describe('Lei, resolução ou portaria, com artigo.'),
    urlAto: z.url().max(2000).describe('Link HTTPS da fonte oficial.'),
  }),
);
export type PedidoDeEventoDoCalendario = z.infer<typeof PedidoDeEventoDoCalendario.esquema>;

const camposDoEvento = {
  id: Uuid,
  abrangencia: Abrangencia,
  uf: z.string().nullable(),
  municipioIbge: z.string().nullable(),
  tribunal: z.string().nullable(),
  comarca: z.string().nullable(),
  tipo: TipoDeEvento,
  inicio: DataCivil,
  fim: DataCivil,
  descricao: z.string(),
  atoNormativo: z.string(),
  urlAto: z.string(),
  revogadoPor: Uuid.nullable(),
  revogadoEm: Instante.nullable(),
};

export const EventoDoCalendario = nomear(
  'EventoDoCalendario',
  z.object({
    ...camposDoEvento,
    status: z.enum(['rascunho', 'aprovado']).describe('Só aprovado e não revogado vale.'),
    propostoPor: Uuid,
    propostoEm: Instante,
    aprovadoPor: Uuid.nullable(),
    aprovadoEm: Instante.nullable(),
    motivoRevogacao: z.string().nullable(),
  }),
);
export type EventoDoCalendario = z.infer<typeof EventoDoCalendario.esquema>;

export const FeriadoLocal = nomear(
  'FeriadoLocal',
  z.object({ ...camposDoEvento, cadastradoPor: Uuid, cadastradoEm: Instante }),
);
export type FeriadoLocal = z.infer<typeof FeriadoLocal.esquema>;

export const EventosDoCalendario = nomear(
  'EventosDoCalendario',
  z.object({ itens: z.array(EventoDoCalendario.esquema) }),
);
export type EventosDoCalendario = z.infer<typeof EventosDoCalendario.esquema>;
export const FeriadosLocais = nomear(
  'FeriadosLocais',
  z.object({ itens: z.array(FeriadoLocal.esquema) }),
);
export type FeriadosLocais = z.infer<typeof FeriadosLocais.esquema>;

export const PedidoDeRevogacaoDoEvento = nomear(
  'PedidoDeRevogacaoDoEvento',
  z.object({ motivo: z.string().min(10).max(1000).describe('Vai para a auditoria.') }),
);

export const PedidoDeImportacaoDoCalendario = nomear(
  'PedidoDeImportacaoDoCalendario',
  z.object({
    csv: z
      .string()
      .min(1)
      .max(1_000_000)
      .describe(
        'CSV (separador ; ou ,) com o cabeçalho abrangencia;uf;municipioIbge;tribunal;comarca;tipo;inicio;fim;descricao;atoNormativo;urlAto.',
      ),
    somentePrevia: z
      .boolean()
      .default(true)
      .describe('true: só valida; false: grava se tudo for válido.'),
  }),
);

export const ResultadoDaImportacao = nomear(
  'ResultadoDaImportacao',
  z.object({
    linhas: z.array(
      z.object({
        linha: z.number().int(),
        problemas: z.array(z.object({ campo: z.string(), mensagem: z.string() })),
      }),
    ),
    propostos: z
      .array(EventoDoCalendario.esquema)
      .describe('Rascunhos gravados (vazio na prévia).'),
  }),
);
export type ResultadoDaImportacao = z.infer<typeof ResultadoDaImportacao.esquema>;

export const ConsultaDoPeriodo = z.object({
  inicio: DataCivil.optional(),
  fim: DataCivil.optional(),
});

export const DiasNaoUteis = nomear(
  'DiasNaoUteis',
  z.object({
    itens: z.array(
      z.object({
        data: DataCivil,
        tipo: TipoDeEvento,
        motivo: z.string(),
        fonte: z.object({
          origem: z.enum(['global', 'local']),
          eventoId: Uuid,
          atoNormativo: z.string(),
          urlAto: z.string(),
        }),
      }),
    ),
  }),
);
export type DiasNaoUteis = z.infer<typeof DiasNaoUteis.esquema>;

export const DiasNaoUteisDoProcesso = nomear(
  'DiasNaoUteisDoProcesso',
  DiasNaoUteis.esquema.extend({
    jurisdicao: z.object(Jurisdicao).describe('Jurisdição resolvida a partir do processo.'),
    lacunas: z
      .array(z.enum(['tribunal', 'uf', 'municipio', 'comarca']))
      .describe(
        'Níveis que o processo não informa: feriados desses níveis não entram e a tela deve avisar.',
      ),
  }),
);
export type DiasNaoUteisDoProcesso = z.infer<typeof DiasNaoUteisDoProcesso.esquema>;

const comId = z.object({ id: Uuid });

/** Calendário global (HU13): exige `curadoria:calendario` (perfil curador, tenant plataforma). */
export const listarCalendarioGlobal = definirRota({
  id: 'listarCalendarioGlobal',
  metodo: 'get',
  caminho: '/v1/admin/calendario',
  resumo: 'Lista os eventos do calendário global que cruzam o período (rascunhos inclusive).',
  tag: 'calendario',
  consulta: ConsultaDoPeriodo,
  resposta: { status: 200, corpo: EventosDoCalendario },
});

export const proporEventoDoCalendario = definirRota({
  id: 'proporEventoDoCalendario',
  metodo: 'post',
  caminho: '/v1/admin/calendario',
  resumo: 'Propõe um evento global; só vale depois de aprovado por outro curador.',
  tag: 'calendario',
  corpo: PedidoDeEventoDoCalendario,
  resposta: { status: 201, corpo: EventoDoCalendario },
});

export const aprovarEventoDoCalendario = definirRota({
  id: 'aprovarEventoDoCalendario',
  metodo: 'post',
  caminho: '/v1/admin/calendario/{id}/aprovar',
  resumo: 'Aprova um evento proposto por outro curador (quatro olhos).',
  tag: 'calendario',
  parametrosDeCaminho: comId,
  resposta: { status: 200, corpo: EventoDoCalendario },
  erros: [404, 409],
});

export const revogarEventoDoCalendario = definirRota({
  id: 'revogarEventoDoCalendario',
  metodo: 'post',
  caminho: '/v1/admin/calendario/{id}/revogar',
  resumo: 'Revoga um evento aprovado, com motivo auditado.',
  tag: 'calendario',
  parametrosDeCaminho: comId,
  corpo: PedidoDeRevogacaoDoEvento,
  resposta: { status: 200, corpo: EventoDoCalendario },
  erros: [404, 409],
});

export const importarCalendario = definirRota({
  id: 'importarCalendario',
  metodo: 'post',
  caminho: '/v1/admin/calendario/importacao',
  resumo: 'Valida um CSV (prévia) e, se tudo estiver certo, grava os eventos como rascunho.',
  tag: 'calendario',
  corpo: PedidoDeImportacaoDoCalendario,
  resposta: { status: 200, corpo: ResultadoDaImportacao },
});

/** Feriados do próprio escritório (HU13): leitura com `calendario:ler`, escrita com `calendario:gerir`. */
export const listarFeriadosLocais = definirRota({
  id: 'listarFeriadosLocais',
  metodo: 'get',
  caminho: '/v1/calendario/locais',
  resumo: 'Lista os feriados e suspensões cadastrados pelo escritório.',
  tag: 'calendario',
  consulta: ConsultaDoPeriodo,
  resposta: { status: 200, corpo: FeriadosLocais },
});

export const cadastrarFeriadoLocal = definirRota({
  id: 'cadastrarFeriadoLocal',
  metodo: 'post',
  caminho: '/v1/calendario/locais',
  resumo: 'Cadastra um feriado ou suspensão local, com o ato normativo (nunca nacional).',
  tag: 'calendario',
  corpo: PedidoDeEventoDoCalendario,
  resposta: { status: 201, corpo: FeriadoLocal },
});

export const revogarFeriadoLocal = definirRota({
  id: 'revogarFeriadoLocal',
  metodo: 'post',
  caminho: '/v1/calendario/locais/{id}/revogar',
  resumo: 'Revoga um feriado local do escritório.',
  tag: 'calendario',
  parametrosDeCaminho: comId,
  resposta: { status: 200, corpo: FeriadoLocal },
  erros: [404, 409],
});

export const consultarDiasNaoUteis = definirRota({
  id: 'consultarDiasNaoUteis',
  metodo: 'get',
  caminho: '/v1/calendario/dias-nao-uteis',
  resumo: 'Dias sem contagem na jurisdição e no período (até 3 anos), com motivo e fonte.',
  tag: 'calendario',
  consulta: z.object({ ...Jurisdicao, inicio: DataCivil, fim: DataCivil }),
  resposta: { status: 200, corpo: DiasNaoUteis },
});

export const consultarDiasNaoUteisDoProcesso = definirRota({
  id: 'consultarDiasNaoUteisDoProcesso',
  metodo: 'get',
  caminho: '/v1/processos/{id}/dias-nao-uteis',
  resumo: 'Dias sem contagem na jurisdição do processo (tribunal, UF e comarca), com as lacunas.',
  tag: 'calendario',
  parametrosDeCaminho: comId,
  consulta: z.object({ inicio: DataCivil, fim: DataCivil }),
  resposta: { status: 200, corpo: DiasNaoUteisDoProcesso },
  erros: [404],
});

export const ROTAS_CALENDARIO = [
  listarCalendarioGlobal,
  proporEventoDoCalendario,
  aprovarEventoDoCalendario,
  revogarEventoDoCalendario,
  importarCalendario,
  listarFeriadosLocais,
  cadastrarFeriadoLocal,
  revogarFeriadoLocal,
  consultarDiasNaoUteis,
  consultarDiasNaoUteisDoProcesso,
] as const;
