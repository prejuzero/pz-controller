import { z } from 'zod';

import type { Canal, TipoDeNotificacao } from '../domain/notificacao.js';
import type { CapacidadesCanal } from '@pz/integracoes';

/**
 * Templates versionados (HU30): HTML e texto. Os dados são mínimos (número do processo, link,
 * datas já calculadas pelo motor); nunca partes nem teor (CLAUDE.md, seção 10). Mudar o texto de
 * um template = nova versão; a notificação guarda a versão usada.
 */
const LinkDoPortal = z.url({ protocol: /^https?$/ }).max(2000);
const NumeroDoProcesso = z.string().min(1).max(30);

const escapar = (texto: string) =>
  texto.replace(/[&<>"']/g, (c) => `&#${String(c.charCodeAt(0))};`);
const rodape =
  'Você recebe este aviso porque monitora processos no PrejuZero. Ajuste as notificações em Configurações.';

export const TEMPLATES = {
  'nova-intimacao': {
    versao: 1,
    dados: z.object({ numeroProcesso: NumeroDoProcesso, link: LinkDoPortal }).strict(),
    renderizar: (d: { numeroProcesso: string; link: string }) => ({
      assunto: `Nova intimação no processo ${d.numeroProcesso}`,
      texto: `Uma nova intimação foi capturada no processo ${d.numeroProcesso}. Confira o prazo sugerido e confirme no PrejuZero: ${d.link}\n\n${rodape}`,
      html: `<p>Uma nova intimação foi capturada no processo <strong>${escapar(d.numeroProcesso)}</strong>.</p><p><a href="${escapar(d.link)}">Conferir e confirmar o prazo</a></p><p><small>${rodape}</small></p>`,
    }),
    // Fora do e-mail: só avisa e leva ao portal ou app, sem número do processo (CLAUDE.md, 10).
    minimo: () => ({
      assunto: 'Nova intimação',
      texto: 'Há uma nova intimação para conferir no PrejuZero.',
    }),
  },
  'lembrete-prazo': {
    versao: 1,
    dados: z
      .object({
        numeroProcesso: NumeroDoProcesso,
        vencimento: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/),
        link: LinkDoPortal,
      })
      .strict(),
    renderizar: (d: { numeroProcesso: string; vencimento: string; link: string }) => ({
      assunto: `Prazo do processo ${d.numeroProcesso} vence em ${d.vencimento}`,
      texto: `O prazo do processo ${d.numeroProcesso} vence em ${d.vencimento}. Veja os detalhes no PrejuZero: ${d.link}\n\n${rodape}`,
      html: `<p>O prazo do processo <strong>${escapar(d.numeroProcesso)}</strong> vence em <strong>${escapar(d.vencimento)}</strong>.</p><p><a href="${escapar(d.link)}">Ver no PrejuZero</a></p><p><small>${rodape}</small></p>`,
    }),
    minimo: (d: { vencimento: string }) => ({
      assunto: 'Prazo próximo',
      texto: `Um prazo vence em ${d.vencimento}. Confira no PrejuZero.`,
    }),
  },
} as const satisfies Record<TipoDeNotificacao, unknown>;

export interface MensagemRenderizada {
  readonly assunto: string;
  readonly texto: string;
  /** Vazio fora do e-mail. */
  readonly html: string;
  /** Para onde o aviso leva (portal ou app). */
  readonly link: string;
  /** Template aprovado no provedor, quando o canal exige (ex.: WhatsApp). */
  readonly template?: { readonly id: string; readonly variaveis: Readonly<Record<string, string>> };
}

/**
 * Renderiza com os dados já validados na criação da notificação. No e-mail, a mensagem completa;
 * nos outros canais, a versão mínima moldada pelas capacidades do descritor do canal.
 */
export function renderizar(
  tipo: TipoDeNotificacao,
  dados: unknown,
  canal: Canal = 'email',
  capacidades?: CapacidadesCanal,
): MensagemRenderizada {
  const completa = renderizarCompleta(tipo, dados);
  if (canal === 'email') return completa;
  // Nada falha em silêncio: canal sem descritor não sabe o próprio limite.
  if (capacidades === undefined) throw new Error(`Canal ${canal} sem capacidades declaradas`);
  const { assunto, texto } = renderizarMinima(tipo, dados);
  return {
    assunto,
    texto: limitar(texto, capacidades.tamanhoMaximo),
    html: '',
    link: completa.link,
    ...(capacidades.exigeTemplateAprovado
      ? {
          template: {
            id: `${tipo}-v${String(TEMPLATES[tipo].versao)}`,
            variaveis: { link: completa.link },
          },
        }
      : {}),
  };
}

function renderizarCompleta(tipo: TipoDeNotificacao, dados: unknown): MensagemRenderizada {
  switch (tipo) {
    case 'nova-intimacao': {
      const d = TEMPLATES[tipo].dados.parse(dados);
      return { ...TEMPLATES[tipo].renderizar(d), link: d.link };
    }
    case 'lembrete-prazo': {
      const d = TEMPLATES[tipo].dados.parse(dados);
      return { ...TEMPLATES[tipo].renderizar(d), link: d.link };
    }
  }
}

function renderizarMinima(tipo: TipoDeNotificacao, dados: unknown) {
  switch (tipo) {
    case 'nova-intimacao':
      return TEMPLATES[tipo].minimo();
    case 'lembrete-prazo':
      return TEMPLATES[tipo].minimo(TEMPLATES[tipo].dados.parse(dados));
  }
}

const limitar = (texto: string, maximo: number) =>
  texto.length <= maximo ? texto : `${texto.slice(0, Math.max(0, maximo - 1))}…`;
