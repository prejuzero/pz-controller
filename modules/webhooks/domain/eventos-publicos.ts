import { err, ok, Validacao } from '@pz/kernel';

import type { Result } from '@pz/kernel';

/**
 * Catálogo dos eventos públicos de webhook (HU49, ADR-023): nome estável e versionado, mapeado do
 * evento de domínio. O corpo leva só identificadores: nada de partes, teor ou data de prazo. O
 * integrador consulta o resto pela API, com os escopos dele (CLAUDE.md, seção 10: mínimo de dados).
 */
export const EVENTOS_PUBLICOS = {
  'prazo.sugerido': { origem: 'PrazoSugerido', descricao: 'Prazo novo, ainda a confirmar.' },
  'prazo.recalculado': {
    origem: 'PrazoRecalculado',
    descricao: 'O vencimento mudou (calendário ou comarca) e o prazo voltou a "a confirmar".',
  },
  'prazo.confirmado': { origem: 'PrazoConfirmado', descricao: 'O advogado confirmou a data.' },
  'prazo.ajustado': { origem: 'PrazoAjustado', descricao: 'O advogado ajustou a data.' },
  'prazo.cumprido': { origem: 'PrazoCumprido', descricao: 'Prazo marcado como cumprido.' },
  'prazo.cancelado': { origem: 'PrazoCancelado', descricao: 'Prazo cancelado.' },
  'prazo.vencido': { origem: 'PrazoVencido', descricao: 'Passou o vencimento sem cumprimento.' },
  'publicacao.recebida': {
    origem: 'PublicacaoRecebida',
    descricao: 'Publicação nova para o escritório.',
  },
  'ciencia.confirmada': { origem: 'CienciaConfirmada', descricao: 'Ciência do prazo registrada.' },
} as const;

export type EventoPublico = keyof typeof EVENTOS_PUBLICOS;

/** Enviado só pelo botão "testar" da assinatura. */
export const EVENTO_DE_TESTE = 'webhook.teste';

export const NOMES_DOS_EVENTOS_PUBLICOS = Object.keys(EVENTOS_PUBLICOS) as EventoPublico[];

const POR_ORIGEM = new Map<string, EventoPublico>(
  NOMES_DOS_EVENTOS_PUBLICOS.map((nome) => [EVENTOS_PUBLICOS[nome].origem, nome]),
);

export const ORIGENS_DOS_EVENTOS_PUBLICOS = [...POR_ORIGEM.keys()];

/** Só identificadores, e só os que o payload trouxer. */
const CAMPOS_PUBLICOS = ['prazoId', 'processoId', 'conteudoId'] as const;

export function eventoPublicoDe(
  tipoDoDominio: string,
  payload: Readonly<Record<string, unknown>>,
): { readonly tipo: EventoPublico; readonly dados: Record<string, string | null> } | undefined {
  const tipo = POR_ORIGEM.get(tipoDoDominio);
  if (tipo === undefined) return undefined;
  const dados: Record<string, string | null> = {};
  for (const campo of CAMPOS_PUBLICOS) {
    const valor = payload[campo];
    if (typeof valor === 'string' || valor === null) dados[campo] = valor;
  }
  return { tipo, dados };
}

/** Lista de eventos de uma assinatura: ao menos um, todos do catálogo, sem repetição. */
export function eventosDaAssinatura(
  pedidos: readonly string[],
): Result<EventoPublico[], Validacao> {
  const unicos = [...new Set(pedidos)];
  const desconhecidos = unicos.filter((e) => !Object.hasOwn(EVENTOS_PUBLICOS, e));
  if (unicos.length === 0 || desconhecidos.length > 0) {
    return err(
      new Validacao([
        {
          campo: 'eventos',
          mensagem:
            unicos.length === 0
              ? 'Escolha ao menos um evento.'
              : `Eventos desconhecidos: ${desconhecidos.join(', ')}.`,
        },
      ]),
    );
  }
  return ok(unicos as EventoPublico[]);
}

/**
 * Endereço de entrega: HTTP(S), sem usuário e senha na URL. Fora do ambiente local, só HTTPS
 * (o adaptador também recusa rede interna na conexão).
 */
export function enderecoDaAssinatura(url: string, exigirHttps: boolean): Result<string, Validacao> {
  const problema = (mensagem: string) => err(new Validacao([{ campo: 'url', mensagem }]));
  let endereco: URL;
  try {
    endereco = new URL(url.trim());
  } catch {
    return problema('Endereço inválido.');
  }
  if (endereco.protocol !== 'https:' && !(endereco.protocol === 'http:' && !exigirHttps)) {
    return problema(exigirHttps ? 'Use um endereço HTTPS.' : 'Use um endereço HTTP ou HTTPS.');
  }
  if (endereco.username !== '' || endereco.password !== '') {
    return problema('O endereço não pode ter usuário e senha.');
  }
  return ok(endereco.toString());
}

/**
 * Situação da entrega pelo status recebido: 2xx entregou; 4xx (fora 408 e 429) é recusa do
 * integrador e não adianta repetir; o resto tenta de novo.
 */
export function desfechoDoStatus(status: number): 'entregue' | 'recusada' | 'tentar-de-novo' {
  if (status >= 200 && status < 300) return 'entregue';
  if (status >= 400 && status < 500 && status !== 408 && status !== 429) return 'recusada';
  return 'tentar-de-novo';
}
