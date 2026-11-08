import { OrcamentoDeIaEsgotado } from '@pz/ia';
import { ErroPermanente } from '@pz/integracoes';
import { z } from 'zod';

import type { InstrucaoEmbutida } from './classificador-ia-plataforma.js';
import type { Resumidor } from '../application/resumir-publicacao.js';
import type { RespostaDoResumo } from '../domain/resumo.js';
import type { PlataformaIa, RegistroDePrompts } from '@pz/ia';
import type { Uuid } from '@pz/kernel';

export const TAREFA_DO_RESUMO = 'resumir-publicacao';

/**
 * Saída pedida à IA (HU62): sem datas no resumo e na providência (guardrail da plataforma); os
 * trechos podem tê-las, porque o domínio confere que são cópia literal do teor.
 */
export const SaidaDoResumo = z
  .object({
    resumo: z.string().trim().min(1).max(600),
    providencia: z.string().trim().min(1).max(300).nullable(),
    trechos: z.array(z.string().max(400)).min(1).max(3),
  })
  .strict();

/**
 * Resumo pela plataforma de IA: prompt versionado, roteamento, guardrails, orçamento e métricas
 * ficam lá. Saída inválida (schema, data proibida, recusa) vira "invalida"; orçamento esgotado,
 * "sem-orcamento"; falha do provedor sobe para o job tentar de novo.
 */
export class ResumidorIaPlataforma implements Resumidor {
  constructor(
    private readonly plataforma: PlataformaIa,
    private readonly prompts: RegistroDePrompts,
    private readonly aoDetectarInstrucao: (deteccao: InstrucaoEmbutida) => void = () => undefined,
  ) {}

  async resumir(teor: string, tenantId: Uuid): Promise<RespostaDoResumo> {
    const { prompt, alertas } = this.prompts.montar(TAREFA_DO_RESUMO, { publicacao: teor });
    if (alertas.length > 0)
      this.aoDetectarInstrucao({ tenantId, tarefa: TAREFA_DO_RESUMO, alertas });
    try {
      const r = await this.plataforma.executarTarefa(TAREFA_DO_RESUMO, prompt, SaidaDoResumo, {
        tenantId,
      });
      return { tipo: 'ok', ...r.saida, versaoPrompt: r.versaoDoPrompt, modelo: r.modelo };
    } catch (erro) {
      if (erro instanceof OrcamentoDeIaEsgotado) return { tipo: 'sem-orcamento' };
      if (erro instanceof ErroPermanente) return { tipo: 'invalida' };
      throw erro;
    }
  }
}
