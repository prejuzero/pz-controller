import { z } from 'zod';

import { Instante, Uuid } from './comum.js';
import { definirRota, nomear } from './rota.js';

/** Termos, privacidade e cobertura com aceite versionado (HU38, LGPD). */
const TipoDeDocumento = z.enum(['termos', 'privacidade', 'cobertura']);

export const DocumentoLegal = nomear(
  'DocumentoLegal',
  z.object({
    id: Uuid,
    tipo: TipoDeDocumento,
    versao: z.string(),
    conteudo: z.string(),
    resumoAlteracoes: z.string().nullable().describe('O que mudou em relação à versão anterior.'),
    publicadoEm: Instante,
  }),
);

export const DocumentosPendentes = nomear(
  'DocumentosPendentes',
  z.object({ itens: z.array(DocumentoLegal.esquema) }),
);
export type DocumentosPendentes = z.infer<typeof DocumentosPendentes.esquema>;

export const AceitesDoUsuario = nomear(
  'AceitesDoUsuario',
  z.object({
    itens: z.array(
      z.object({
        documentoId: Uuid,
        tipo: TipoDeDocumento,
        versao: z.string(),
        aceitoEm: Instante,
        ip: z.string(),
        userAgent: z.string(),
      }),
    ),
  }),
);
export type AceitesDoUsuario = z.infer<typeof AceitesDoUsuario.esquema>;

export const listarTermosPendentes = definirRota({
  id: 'listarTermosPendentes',
  metodo: 'get',
  caminho: '/v1/termos/pendentes',
  resumo: 'Documentos legais que o usuário precisa aceitar para continuar usando o sistema.',
  tag: 'termos',
  resposta: { status: 200, corpo: DocumentosPendentes },
});

export const aceitarDocumentoLegal = definirRota({
  id: 'aceitarDocumentoLegal',
  metodo: 'post',
  caminho: '/v1/termos/{id}/aceitar',
  resumo: 'Registra o aceite (com IP e navegador) da versão vigente de um documento.',
  tag: 'termos',
  parametrosDeCaminho: z.object({ id: Uuid }),
  resposta: { status: 204, corpo: null },
  erros: [404],
});

export const listarAceites = definirRota({
  id: 'listarAceites',
  metodo: 'get',
  caminho: '/v1/termos/aceites',
  resumo: 'Histórico de aceites do usuário (exportável).',
  tag: 'termos',
  resposta: { status: 200, corpo: AceitesDoUsuario },
});

export const listarDocumentosVigentes = definirRota({
  id: 'listarDocumentosVigentes',
  metodo: 'get',
  caminho: '/v1/termos/vigentes',
  resumo: 'Versão vigente dos termos de uso, da política de privacidade e do aviso de cobertura.',
  tag: 'termos',
  publica: true,
  resposta: { status: 200, corpo: DocumentosPendentes },
});

/** Nova versão de um documento legal (PZ-303): vale a partir do envio e exige novo aceite. */
export const PedidoDePublicacaoDeDocumento = nomear(
  'PedidoDePublicacaoDeDocumento',
  z.object({
    tipo: TipoDeDocumento,
    versao: z
      .string()
      .regex(/^[0-9]+\.[0-9]+(\.[0-9]+)?$/)
      .describe('Maior que todas as já publicadas deste documento (ex.: 1.1 ou 2.0.1).'),
    conteudo: z.string().min(1).max(200_000).describe('Texto aprovado pelo jurídico.'),
    resumoAlteracoes: z
      .string()
      .max(2_000)
      .optional()
      .describe('O que mudou, mostrado na tela de novo aceite.'),
  }),
);
export type PedidoDePublicacaoDeDocumento = z.infer<typeof PedidoDePublicacaoDeDocumento.esquema>;

export const publicarDocumentoLegal = definirRota({
  id: 'publicarDocumentoLegal',
  metodo: 'post',
  caminho: '/v1/admin/documentos-legais',
  resumo:
    'Publica nova versão de um documento legal; todos os usuários aceitam de novo no próximo login.',
  tag: 'admin',
  corpo: PedidoDePublicacaoDeDocumento,
  resposta: { status: 201, corpo: DocumentoLegal },
});

export const listarVersoesDocumentosLegais = definirRota({
  id: 'listarVersoesDocumentosLegais',
  metodo: 'get',
  caminho: '/v1/admin/documentos-legais',
  resumo: 'Todas as versões publicadas dos documentos legais, da mais recente para a mais antiga.',
  tag: 'admin',
  resposta: { status: 200, corpo: DocumentosPendentes },
});

export const ROTAS_TERMOS = [
  listarTermosPendentes,
  aceitarDocumentoLegal,
  listarAceites,
  listarDocumentosVigentes,
  publicarDocumentoLegal,
  listarVersoesDocumentosLegais,
] as const;
