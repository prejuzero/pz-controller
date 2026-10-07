import { z } from 'zod';

import type { TipoDeNotificacao } from '../domain/notificacao.js';

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
  },
} as const satisfies Record<TipoDeNotificacao, unknown>;

export interface MensagemRenderizada {
  readonly assunto: string;
  readonly texto: string;
  readonly html: string;
}

/** Renderiza com os dados já validados na criação da notificação. */
export function renderizar(tipo: TipoDeNotificacao, dados: unknown): MensagemRenderizada {
  switch (tipo) {
    case 'nova-intimacao':
      return TEMPLATES[tipo].renderizar(TEMPLATES[tipo].dados.parse(dados));
    case 'lembrete-prazo':
      return TEMPLATES[tipo].renderizar(TEMPLATES[tipo].dados.parse(dados));
  }
}
