import { OrcamentoDeIaEsgotado } from '@pz/ia';
import { ErroPermanente } from '@pz/integracoes';
import { z } from 'zod';

import type { ClassificadorIa, TipoDaTaxonomia } from '../application/classificar-publicacao.js';
import type { RespostaDaIa } from '../domain/decisao.js';
import type { PlataformaIa, RegistroDePrompts } from '@pz/ia';
import type { Uuid } from '@pz/kernel';

export const TAREFA = 'classificar-ato';

/**
 * Saída pedida à IA: o código do ato (ou "desconhecido"), a confiança e o trecho literal que a
 * justifica. Sem data e sem fundamento legal (ADR-008); o prazo citado vem do extrator
 * determinístico (HU20), não da IA.
 */
export const SaidaDaClassificacao = z
  .object({
    tipoAto: z.string().min(1).max(80),
    confianca: z.number().min(0).max(1),
    trecho: z.string().max(2000),
  })
  .strict();

const taxonomiaComoTexto = (tipos: readonly TipoDaTaxonomia[]) =>
  tipos
    .map((t) => `${t.codigo}: ${t.nome}${t.descricao === '' ? '' : ` (${t.descricao})`}`)
    .join('\n');

/**
 * Classificação pela plataforma de IA (HU58): prompt versionado, roteamento, fallback, guardrails,
 * orçamento e métricas ficam lá. Saída inválida (fora do schema ou com data) vira "invalida";
 * orçamento esgotado vira "sem-orcamento"; falhas do provedor sobem para o job tentar de novo.
 */
export class ClassificadorIaPlataforma implements ClassificadorIa {
  constructor(
    private readonly plataforma: PlataformaIa,
    private readonly prompts: RegistroDePrompts,
  ) {}

  async classificar(
    entrada: { readonly teor: string; readonly taxonomia: readonly TipoDaTaxonomia[] },
    tenantId: Uuid,
  ): Promise<RespostaDaIa> {
    const { prompt } = this.prompts.montar(TAREFA, {
      taxonomia: taxonomiaComoTexto(entrada.taxonomia),
      publicacao: entrada.teor,
    });
    try {
      const r = await this.plataforma.executarTarefa(TAREFA, prompt, SaidaDaClassificacao, {
        tenantId,
      });
      return { tipo: 'ok', ...r.saida, versaoPrompt: r.versaoDoPrompt, modelo: r.modelo };
    } catch (erro) {
      if (erro instanceof OrcamentoDeIaEsgotado) return { tipo: 'sem-orcamento' };
      // Erro permanente na tarefa = saída inválida (schema, data proibida ou recusa do modelo).
      if (erro instanceof ErroPermanente) return { tipo: 'invalida' };
      throw erro;
    }
  }
}
