import { render } from '@react-email/render';
import { createElement } from 'react';
import { z } from 'zod';

import { destaque, Email, link, lista, paragrafo } from './emails/layout.js';

import type { Acao } from './emails/layout.js';
import type { Canal, TipoDeNotificacao } from '../domain/notificacao.js';
import type { CapacidadesCanal } from '@pz/integracoes';
import type { ReactNode } from 'react';

/**
 * Templates versionados (HU30): e-mail em React Email (HTML e texto) e versão mínima para os
 * outros canais. Os dados são mínimos (número do processo, links, datas já calculadas pelo motor e
 * formatadas por quem pede); nunca partes nem teor (CLAUDE.md, seção 10). Mudar texto ou dados de
 * um template = nova versão; a notificação guarda a versão usada.
 */
const LinkDoPortal = z.url({ protocol: /^https?$/ }).max(2000);
const NumeroDoProcesso = z.string().min(1).max(30);
const Data = z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/);
/** Leva à tela de confirmação; o GET nunca confirma nada (CLAUDE.md, seção 14). */
const LinkDeCiencia = LinkDoPortal.optional();

interface Conteudo {
  readonly assunto: string;
  readonly titulo: string;
  readonly previa: string;
  readonly corpo: readonly ReactNode[];
  readonly acoes: readonly Acao[];
  readonly link: string;
}

interface Minimo {
  readonly assunto: string;
  readonly texto: string;
}

export interface DefinicaoDeTemplate<S extends z.ZodType = z.ZodType> {
  readonly versao: number;
  readonly dados: S;
  // Métodos (não propriedades) para o registro aceitar cada template no tipo genérico.
  email(d: z.output<S>): Conteudo;
  /** Fora do e-mail: só avisa e leva ao portal ou app, sem número do processo (CLAUDE.md, 10). */
  minimo(d: z.output<S>): Minimo;
}

const definir = <S extends z.ZodType>(d: DefinicaoDeTemplate<S>) => d;

/** "Confirmar ciência" e "Ver no portal" quando há prazo; só "Ver no portal" nos demais. */
const acoes = (portal: string, ciencia?: string): Acao[] => [
  ...(ciencia === undefined
    ? []
    : [{ rotulo: 'Confirmar ciência', href: ciencia, principal: true }]),
  { rotulo: 'Ver no portal', href: portal, principal: ciencia === undefined },
];

const plural = (n: number, um: string, varios: string) => `${String(n)} ${n === 1 ? um : varios}`;

export const TEMPLATES = {
  'nova-intimacao': definir({
    versao: 2,
    dados: z
      .object({ numeroProcesso: NumeroDoProcesso, link: LinkDoPortal, linkCiencia: LinkDeCiencia })
      .strict(),
    email: (d) => ({
      assunto: `Nova intimação no processo ${d.numeroProcesso}`,
      titulo: 'Nova intimação',
      previa: `Confira o prazo sugerido para o processo ${d.numeroProcesso}.`,
      corpo: [
        paragrafo('Uma nova intimação foi capturada no processo ', destaque(d.numeroProcesso), '.'),
        paragrafo('O prazo sugerido só vale depois da sua confirmação. Confira no PrejuZero.'),
      ],
      acoes: acoes(d.link, d.linkCiencia),
      link: d.link,
    }),
    minimo: () => ({
      assunto: 'Nova intimação',
      texto: 'Há uma nova intimação para conferir no PrejuZero.',
    }),
  }),
  'lembrete-prazo': definir({
    versao: 2,
    dados: z
      .object({
        numeroProcesso: NumeroDoProcesso,
        vencimento: Data,
        link: LinkDoPortal,
        linkCiencia: LinkDeCiencia,
      })
      .strict(),
    email: (d) => ({
      assunto: `Prazo do processo ${d.numeroProcesso} vence em ${d.vencimento}`,
      titulo: 'Prazo próximo',
      previa: `O prazo vence em ${d.vencimento}.`,
      corpo: [
        paragrafo(
          'O prazo do processo ',
          destaque(d.numeroProcesso),
          ' vence em ',
          destaque(d.vencimento),
          '.',
        ),
      ],
      acoes: acoes(d.link, d.linkCiencia),
      link: d.link,
    }),
    minimo: (d) => ({
      assunto: 'Prazo próximo',
      texto: `Um prazo vence em ${d.vencimento}. Confira no PrejuZero.`,
    }),
  }),
  'resumo-diario': definir({
    versao: 1,
    dados: z
      .object({
        data: Data,
        intimacoes: z
          .array(z.object({ numeroProcesso: NumeroDoProcesso, link: LinkDoPortal }).strict())
          .max(50),
        prazos: z
          .array(
            z
              .object({ numeroProcesso: NumeroDoProcesso, vencimento: Data, link: LinkDoPortal })
              .strict(),
          )
          .max(50),
        link: LinkDoPortal,
      })
      .strict()
      .refine((d) => d.intimacoes.length + d.prazos.length > 0, 'Resumo sem itens'),
    email: (d) => ({
      assunto: `Resumo do dia ${d.data}`,
      titulo: `Resumo de ${d.data}`,
      previa: `${plural(d.intimacoes.length, 'intimação nova', 'intimações novas')} e ${plural(d.prazos.length, 'prazo próximo', 'prazos próximos')}.`,
      corpo: [
        ...(d.intimacoes.length === 0
          ? []
          : [
              paragrafo(destaque('Intimações novas')),
              lista(d.intimacoes.map((i) => link(i.link, `Processo ${i.numeroProcesso}`))),
            ]),
        ...(d.prazos.length === 0
          ? []
          : [
              paragrafo(destaque('Prazos próximos')),
              lista(
                d.prazos.map((p) =>
                  link(p.link, `Processo ${p.numeroProcesso}: vence em ${p.vencimento}`),
                ),
              ),
            ]),
      ],
      acoes: acoes(d.link),
      link: d.link,
    }),
    minimo: (d) => ({
      assunto: 'Resumo do dia',
      texto: `${plural(d.intimacoes.length, 'intimação nova', 'intimações novas')} e ${plural(d.prazos.length, 'prazo próximo', 'prazos próximos')}. Confira no PrejuZero.`,
    }),
  }),
  'prazo-recalculado': definir({
    versao: 1,
    dados: z
      .object({
        numeroProcesso: NumeroDoProcesso,
        vencimentoAnterior: Data,
        vencimento: Data,
        link: LinkDoPortal,
        linkCiencia: LinkDeCiencia,
      })
      .strict(),
    email: (d) => ({
      assunto: `Prazo do processo ${d.numeroProcesso} recalculado`,
      titulo: 'Prazo recalculado',
      previa: `Novo vencimento sugerido: ${d.vencimento}.`,
      corpo: [
        paragrafo(
          'O prazo do processo ',
          destaque(d.numeroProcesso),
          ' foi recalculado. Vencia em ',
          destaque(d.vencimentoAnterior),
          ' e agora vence em ',
          destaque(d.vencimento),
          '.',
        ),
        paragrafo('Confira a memória de cálculo e confirme a nova data no PrejuZero.'),
      ],
      acoes: acoes(d.link, d.linkCiencia),
      link: d.link,
    }),
    minimo: () => ({
      assunto: 'Prazo recalculado',
      texto: 'Um prazo foi recalculado. Confira a nova data no PrejuZero.',
    }),
  }),
  'ciencia-confirmada': definir({
    versao: 1,
    dados: z
      .object({
        numeroProcesso: NumeroDoProcesso,
        /** Horário do servidor, já no fuso do sistema (America/Sao_Paulo): "DD/MM/AAAA HH:MM". */
        confirmadaEm: z.string().regex(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/),
        link: LinkDoPortal,
      })
      .strict(),
    email: (d) => ({
      assunto: `Ciência registrada no processo ${d.numeroProcesso}`,
      titulo: 'Ciência registrada',
      previa: `Registrada em ${d.confirmadaEm}.`,
      corpo: [
        paragrafo(
          'A ciência da intimação no processo ',
          destaque(d.numeroProcesso),
          ' foi registrada em ',
          destaque(`${d.confirmadaEm} (horário de Brasília)`),
          '.',
        ),
        paragrafo('O registro fica na trilha de auditoria e pode ser consultado no PrejuZero.'),
      ],
      acoes: acoes(d.link),
      link: d.link,
    }),
    minimo: (d) => ({
      assunto: 'Ciência registrada',
      texto: `Ciência registrada em ${d.confirmadaEm}. Confira no PrejuZero.`,
    }),
  }),
  'email-rejeitado': definir({
    versao: 1,
    dados: z
      .object({
        endereco: z.email().max(320),
        motivo: z.enum(['bounce', 'spam']),
        link: LinkDoPortal,
      })
      .strict(),
    email: (d) => ({
      assunto: 'Avisos do PrejuZero não estão sendo entregues',
      titulo: 'E-mail não entregue',
      previa: `Os avisos para ${d.endereco} foram recusados.`,
      corpo: [
        paragrafo(
          'Os avisos para ',
          destaque(d.endereco),
          d.motivo === 'bounce'
            ? ' foram recusados pelo servidor de e-mail (endereço inexistente ou caixa bloqueada).'
            : ' foram marcados como spam.',
        ),
        paragrafo(
          'Enquanto o endereço não for corrigido ou liberado, ele não recebe avisos de prazos. Confira no PrejuZero.',
        ),
      ],
      acoes: acoes(d.link),
      link: d.link,
    }),
    minimo: () => ({
      assunto: 'E-mail não entregue',
      texto: 'Um e-mail do escritório não está recebendo os avisos. Confira no PrejuZero.',
    }),
  }),
  'envio-manual': definir({
    versao: 1,
    dados: z
      .object({
        numeroProcesso: NumeroDoProcesso,
        remetente: z.string().trim().min(1).max(120),
        /** Digitada por quem encaminha, que confirmou o envio (CLAUDE.md, seção 14). */
        observacao: z.string().trim().max(1000).optional(),
        link: LinkDoPortal,
        linkCiencia: LinkDeCiencia,
      })
      .strict(),
    email: (d) => ({
      assunto: `${d.remetente} encaminhou a intimação do processo ${d.numeroProcesso}`,
      titulo: 'Intimação encaminhada',
      previa: `${d.remetente} encaminhou uma intimação para você.`,
      corpo: [
        paragrafo(
          destaque(d.remetente),
          ' encaminhou para você a intimação do processo ',
          destaque(d.numeroProcesso),
          '.',
        ),
        ...(d.observacao === undefined || d.observacao === ''
          ? []
          : [paragrafo(`Observação: ${d.observacao}`)]),
      ],
      acoes: acoes(d.link, d.linkCiencia),
      link: d.link,
    }),
    minimo: () => ({
      assunto: 'Intimação encaminhada',
      texto: 'Uma intimação foi encaminhada para você. Confira no PrejuZero.',
    }),
  }),
} as const satisfies Record<TipoDeNotificacao, DefinicaoDeTemplate>;

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
 * Renderiza com os dados já validados na criação da notificação. No e-mail, HTML e texto do mesmo
 * componente; nos outros canais, a versão mínima moldada pelas capacidades do descritor do canal.
 */
export async function renderizar(
  tipo: TipoDeNotificacao,
  dados: unknown,
  canal: Canal = 'email',
  capacidades?: CapacidadesCanal,
): Promise<MensagemRenderizada> {
  const definicao: DefinicaoDeTemplate = TEMPLATES[tipo];
  const validos = definicao.dados.parse(dados);
  const conteudo = definicao.email(validos);
  if (canal === 'email') {
    const elemento = createElement(Email, conteudo);
    const [html, texto] = await Promise.all([
      render(elemento),
      render(elemento, { plainText: true }),
    ]);
    return { assunto: conteudo.assunto, texto, html, link: conteudo.link };
  }
  // Nada falha em silêncio: canal sem descritor não sabe o próprio limite.
  if (capacidades === undefined) throw new Error(`Canal ${canal} sem capacidades declaradas`);
  const { assunto, texto } = definicao.minimo(validos);
  return {
    assunto,
    texto: limitar(texto, capacidades.tamanhoMaximo),
    html: '',
    link: conteudo.link,
    ...(capacidades.exigeTemplateAprovado
      ? {
          template: {
            id: `${tipo}-v${String(definicao.versao)}`,
            variaveis: { link: conteudo.link },
          },
        }
      : {}),
  };
}

const limitar = (texto: string, maximo: number) =>
  texto.length <= maximo ? texto : `${texto.slice(0, Math.max(0, maximo - 1))}…`;
