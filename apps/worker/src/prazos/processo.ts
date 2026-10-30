import { fusoDoJuizo, jurisdicaoDoProcesso } from '@pz/calendario';

import type { ConsultarProcesso } from '@pz/cadastro';
import type { ConsultarDiasNaoUteis } from '@pz/calendario';
import type { LocalizadorDoProcesso } from '@pz/prazos';

/**
 * O processo visto pelo cálculo de prazos, montado pelas APIs públicas do cadastro e do
 * calendario (CLAUDE.md, seção 6). Sem regra aqui: só composição.
 */
export function processoNoCalendario(
  processos: Pick<ConsultarProcesso<unknown>, 'executar'>,
  dias: Pick<ConsultarDiasNaoUteis<unknown>, 'diasNaoUteis'>,
): LocalizadorDoProcesso {
  return async (processoId) => {
    const r = await processos.executar(processoId);
    if (!r.ok) return undefined;
    const { tribunal, comarca, ramo } = r.valor;
    const { jurisdicao, lacunas } = jurisdicaoDoProcesso({ tribunal, comarca });
    return {
      ramoDoTribunal: ramo,
      jurisdicao,
      lacunas,
      fuso: fusoDoJuizo(tribunal),
      diasNaoUteis: async (inicio, fim) =>
        (await dias.diasNaoUteis(jurisdicao, inicio, fim)).map((dia) => ({
          data: dia.data,
          tipo: dia.tipo,
          motivo: dia.motivo,
          atoNormativo: dia.fonte.atoNormativo,
          urlAto: dia.fonte.urlAto,
        })),
    };
  };
}
