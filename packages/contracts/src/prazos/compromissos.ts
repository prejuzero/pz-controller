import { z } from 'zod';

import { Instante, Uuid } from '../comum.js';
import { definirRota, nomear } from '../rota.js';

/** Compromisso do escritório (HU25): audiência, reunião, com lembretes em minutos antes. */
export const Compromisso = nomear(
  'Compromisso',
  z.object({
    id: Uuid,
    titulo: z.string(),
    dataHora: Instante,
    local: z.string().nullable(),
    processoId: Uuid.nullable(),
    lembretesMinutos: z.array(z.number().int()),
    criadoPor: Uuid,
    canceladoEm: Instante.nullable(),
    motivoCancelamento: z.string().nullable(),
  }),
);
export type Compromisso = z.infer<typeof Compromisso.esquema>;

export const Compromissos = nomear(
  'Compromissos',
  z.object({ itens: z.array(Compromisso.esquema) }),
);
export type Compromissos = z.infer<typeof Compromissos.esquema>;

export const PedidoDeCompromisso = nomear(
  'PedidoDeCompromisso',
  z
    .object({
      titulo: z.string().min(1).max(200),
      dataHora: Instante.describe('Data e hora com fuso (ex.: 2026-11-10T14:00:00-03:00).'),
      local: z.string().max(300).optional(),
      processoId: Uuid.optional(),
      lembretesMinutos: z.array(z.number().int().positive()).max(5).optional(),
    })
    .strict(),
);

/** Resultado do cadastro assistido (HU25): ato, prazo citado e evidência; nunca uma data. */
export const AnaliseDoTexto = nomear(
  'AnaliseDoTexto',
  z.object({
    origem: z.enum(['regra', 'ia', 'nenhuma']),
    situacao: z.enum(['ok', 'a_confirmar', 'revisao_manual']),
    tipoAto: z.string().nullable(),
    confianca: z.number().min(0).max(1).nullable(),
    prazoCitado: z
      .object({ quantidade: z.number().int(), unidade: z.string(), divergente: z.boolean() })
      .nullable(),
    evidencias: z.array(
      z.object({ inicio: z.number().int(), fim: z.number().int(), trecho: z.string() }),
    ),
    motivo: z.string().nullable().describe('Por que ficou sem ato seguro (ex.: ia-desligada).'),
  }),
);
export type AnaliseDoTexto = z.infer<typeof AnaliseDoTexto.esquema>;

export const listarCompromissos = definirRota({
  id: 'listarCompromissos',
  metodo: 'get',
  caminho: '/v1/compromissos',
  resumo: 'Compromissos não cancelados do período, por data e hora.',
  tag: 'prazos',
  consulta: z.object({ de: Instante, ate: Instante, limite: z.string().optional() }),
  resposta: { status: 200, corpo: Compromissos },
});

export const agendarCompromisso = definirRota({
  id: 'agendarCompromisso',
  metodo: 'post',
  caminho: '/v1/compromissos',
  resumo: 'Agenda um compromisso (audiência, reunião) com lembretes.',
  tag: 'prazos',
  corpo: PedidoDeCompromisso,
  resposta: { status: 201, corpo: Compromisso },
  erros: [404],
});

export const cancelarCompromisso = definirRota({
  id: 'cancelarCompromisso',
  metodo: 'post',
  caminho: '/v1/compromissos/{id}/cancelar',
  resumo: 'Cancela o compromisso, com motivo.',
  tag: 'prazos',
  parametrosDeCaminho: z.object({ id: Uuid }),
  corpo: nomear(
    'PedidoDeCancelamentoDeCompromisso',
    z.object({ motivo: z.string().min(10).max(1000) }).strict(),
  ),
  resposta: { status: 200, corpo: Compromisso },
  erros: [404, 409],
});

export const analisarTexto = definirRota({
  id: 'analisarTexto',
  metodo: 'post',
  caminho: '/v1/assistente/analisar',
  resumo: 'Cadastro assistido: sugere ato e prazo citado a partir do texto colado, sem gravar.',
  tag: 'prazos',
  corpo: nomear('PedidoDeAnalise', z.object({ texto: z.string().min(1).max(50_000) }).strict()),
  resposta: { status: 200, corpo: AnaliseDoTexto },
});

export const ROTAS_COMPROMISSOS = [
  listarCompromissos,
  agendarCompromisso,
  cancelarCompromisso,
  analisarTexto,
] as const;
