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

export const ROTAS_TERMOS = [listarTermosPendentes, aceitarDocumentoLegal, listarAceites] as const;
