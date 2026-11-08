import { z } from 'zod';

import { Instante } from './comum.js';
import { definirRota, nomear } from './rota.js';

/**
 * Origem de uma sugestão de IA (HU58, ADR-016): acompanha toda resposta persistida para a
 * interface mostrar "sugerido por IA" e para saber qual modelo e qual prompt a geraram.
 */
export const OrigemIa = nomear(
  'OrigemIa',
  z.object({
    modelo: z.string().min(1),
    provedor: z.string().min(1),
    /** `tarefa@x.y.z` do registro de prompts. */
    versaoPrompt: z.string().regex(/^[a-z][a-z0-9-]*@\d+\.\d+\.\d+$/),
    versaoConfiguracao: z.string().min(1),
    confianca: z.number().min(0).max(1).nullable(),
    geradoEm: Instante,
  }),
);
export type OrigemIa = z.infer<typeof OrigemIa.esquema>;

/**
 * Aviso que acompanha toda resposta de ferramenta a assistentes externos (HU60, CLAUDE.md seção
 * 2): as datas vêm do motor de prazos e só valem depois da confirmação do advogado.
 */
export const AVISO_DAS_FERRAMENTAS =
  'Datas de prazo vêm do motor de prazos do PrejuZero (nunca da IA) e só valem depois que o advogado as confirma no portal.';

/** Ferramenta do catálogo (HU59) que o usuário pode usar, com o JSON Schema da entrada. */
export const FerramentaDeIa = nomear(
  'FerramentaDeIa',
  z.object({
    nome: z.string().regex(/^[a-z][a-z0-9_]*$/),
    descricao: z.string(),
    entrada: z.record(z.string(), z.unknown()).describe('JSON Schema dos argumentos.'),
  }),
);

export const FerramentasDeIa = nomear(
  'FerramentasDeIa',
  z.object({ itens: z.array(FerramentaDeIa.esquema), aviso: z.string() }),
);
export type FerramentasDeIa = z.infer<typeof FerramentasDeIa.esquema>;

export const PedidoDeFerramentaDeIa = nomear(
  'PedidoDeFerramentaDeIa',
  z.object({
    argumentos: z
      .record(z.string(), z.unknown())
      .describe('Argumentos validados pelo schema da ferramenta; o escritório nunca vem daqui.'),
  }),
);

export const ResultadoDeFerramentaDeIa = nomear(
  'ResultadoDeFerramentaDeIa',
  z.object({
    resultado: z.unknown().describe('Saída da ferramenta, no formato do endpoint correspondente.'),
    aviso: z.string(),
  }),
);
export type ResultadoDeFerramentaDeIa = z.infer<typeof ResultadoDeFerramentaDeIa.esquema>;

export const listarFerramentasDeIa = definirRota({
  id: 'listarFerramentasDeIa',
  metodo: 'get',
  caminho: '/v1/ia/ferramentas',
  resumo:
    'Ferramentas de IA (só leitura) que o usuário pode usar, para assistentes externos como o servidor MCP (HU60).',
  tag: 'ia',
  resposta: { status: 200, corpo: FerramentasDeIa },
});

export const executarFerramentaDeIa = definirRota({
  id: 'executarFerramentaDeIa',
  metodo: 'post',
  caminho: '/v1/ia/ferramentas/{nome}',
  resumo: 'Executa uma ferramenta de leitura do catálogo, no escritório do usuário, com auditoria.',
  tag: 'ia',
  parametrosDeCaminho: z.object({ nome: z.string().regex(/^[a-z][a-z0-9_]*$/) }),
  corpo: PedidoDeFerramentaDeIa,
  resposta: { status: 200, corpo: ResultadoDeFerramentaDeIa },
  erros: [404, 429],
});

export const ROTAS_IA = [listarFerramentasDeIa, executarFerramentaDeIa] as const;
