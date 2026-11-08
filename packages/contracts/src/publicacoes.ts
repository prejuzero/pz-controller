import { z } from 'zod';

import { ConsultaPaginada, DataCivil, Instante, pagina, Uuid } from './comum.js';
import { definirRota, nomear } from './rota.js';

/** Publicações recebidas pelo escritório (HU18, ADR-014). */
export const PublicacaoDoTenant = nomear(
  'PublicacaoDoTenant',
  z.object({
    id: Uuid,
    fonte: z.string().describe('Adaptador de origem (ex.: djen).'),
    idExterno: z.string(),
    numeroCnj: z.string().nullable().describe('20 dígitos, quando a fonte informa.'),
    dataDisponibilizacao: DataCivil,
    teor: z.string().describe('Teor integral, normalizado.'),
    urlFonte: z.string().describe('Certidão pública na fonte (não abre o expediente no tribunal).'),
    processoId: Uuid.nullable(),
    siglaTribunal: z.string().nullable(),
    tipoComunicacao: z.string().nullable(),
    recebidaEm: Instante,
    capturadoEm: Instante.describe('Instante da captura, gravado pelo banco (prova).'),
    lidaEm: Instante.nullable().describe('Primeira leitura no escritório: indício, não ciência.'),
    conferencia: z
      .enum(['pendente', 'confirmada'])
      .nullable()
      .describe(
        'Só nas capturadas pelo nome do escritório (HU42): pendente até o advogado confirmar que é do escritório (pode ser homônimo); sem processo nem prazo enquanto pendente.',
      ),
  }),
);
export type PublicacaoDoTenant = z.infer<typeof PublicacaoDoTenant.esquema>;

export const PaginaDePublicacoes = nomear(
  'PaginaDePublicacoes',
  pagina(PublicacaoDoTenant.esquema),
);
export type PaginaDePublicacoes = z.infer<typeof PaginaDePublicacoes.esquema>;

export const listarPublicacoes = definirRota({
  id: 'listarPublicacoes',
  metodo: 'get',
  caminho: '/v1/publicacoes',
  resumo: 'Publicações do escritório, da mais nova para a mais antiga.',
  tag: 'publicacoes',
  consulta: ConsultaPaginada.extend({
    novas: z.enum(['true', 'false']).optional().describe('true: só as não lidas.'),
    de: DataCivil.optional().describe('Disponibilização a partir de.'),
    ate: DataCivil.optional().describe('Disponibilização até.'),
    processoId: Uuid.optional(),
    conferir: z
      .enum(['true', 'false'])
      .optional()
      .describe('true: só as capturadas pelo nome que esperam conferência (HU42).'),
  }),
  resposta: { status: 200, corpo: PaginaDePublicacoes },
});

export const consultarPublicacao = definirRota({
  id: 'consultarPublicacao',
  metodo: 'get',
  caminho: '/v1/publicacoes/{id}',
  resumo: 'Detalhe da publicação com o teor integral.',
  tag: 'publicacoes',
  parametrosDeCaminho: z.object({ id: Uuid }),
  resposta: { status: 200, corpo: PublicacaoDoTenant },
  erros: [404],
});

/**
 * Resumo da publicação por IA (HU62): sugestão identificada como IA, com os trechos literais do
 * teor que a comprovam. Sem datas no resumo e na providência; confira sempre o teor integral.
 */
export const ResumoDaPublicacao = nomear(
  'ResumoDaPublicacao',
  z.object({
    resumo: z
      .object({
        texto: z.string(),
        providencia: z.string().nullable(),
        trechos: z.array(z.string()).min(1),
        geradoPorIa: z.literal(true),
        modelo: z.string().nullable(),
        versaoPrompt: z.string().nullable(),
      })
      .nullable()
      .describe('null: ainda sem resumo, sem IA configurada ou em revisão.'),
  }),
);
export type ResumoDaPublicacao = z.infer<typeof ResumoDaPublicacao.esquema>;

export const consultarResumoDaPublicacao = definirRota({
  id: 'consultarResumoDaPublicacao',
  metodo: 'get',
  caminho: '/v1/publicacoes/{id}/resumo',
  resumo: 'Resumo da publicação gerado por IA (HU62), com trechos de evidência.',
  tag: 'publicacoes',
  parametrosDeCaminho: z.object({ id: Uuid }),
  resposta: { status: 200, corpo: ResumoDaPublicacao },
  erros: [404],
});

export const marcarPublicacaoLida = definirRota({
  id: 'marcarPublicacaoLida',
  metodo: 'post',
  caminho: '/v1/publicacoes/{id}/lida',
  resumo: 'Registra a leitura (indício de conhecimento, não ciência). Idempotente.',
  tag: 'publicacoes',
  parametrosDeCaminho: z.object({ id: Uuid }),
  resposta: { status: 204, corpo: null },
  erros: [404],
});

export const PedidoDeConferenciaDaPublicacao = nomear(
  'PedidoDeConferenciaDaPublicacao',
  z.object({
    decisao: z
      .enum(['confirmar', 'descartar'])
      .describe(
        'confirmar: é do escritório (cria o processo e segue para o prazo); descartar: homônimo, sai da lista.',
      ),
  }),
);

export const conferirPublicacao = definirRota({
  id: 'conferirPublicacao',
  metodo: 'post',
  caminho: '/v1/publicacoes/{id}/conferencia',
  resumo: 'Confirma ou descarta uma publicação capturada só pelo nome do escritório (HU42).',
  tag: 'publicacoes',
  parametrosDeCaminho: z.object({ id: Uuid }),
  corpo: PedidoDeConferenciaDaPublicacao,
  resposta: { status: 204, corpo: null },
  erros: [404, 409],
});

export const ROTAS_PUBLICACOES = [
  listarPublicacoes,
  consultarPublicacao,
  marcarPublicacaoLida,
  consultarResumoDaPublicacao,
  conferirPublicacao,
] as const;
