import { calendarioDeOcorrencias, diasUteisRestantes } from '@pz/motor-prazos';

import { EFEITO_DO_DIA } from './prazos.js';

import type { LocalizadorDoProcesso, ProcessoNoCalendario } from './portas.js';
import type { Prazo } from '../domain/prazo.js';
import type { LocalDate, Uuid } from '@pz/kernel';

/** Só faz sentido contar o que ainda corre. */
const ABERTOS: ReadonlySet<string> = new Set(['a-confirmar', 'pendente']);

/**
 * Dias úteis de `dia` até o vencimento, do motor com o calendário do processo (CLAUDE.md,
 * seção 3: nunca no navegador). `null` quando não se aplica (encerrado, sem data, já passou) ou quando o
 * calendário não permite contar. Um contador por consulta: cada processo é localizado uma vez.
 */
export function contadorDeDiasUteis(
  localizar: LocalizadorDoProcesso,
  dia: LocalDate,
): (prazo: Prazo) => Promise<number | null> {
  const processos = new Map<Uuid, Promise<ProcessoNoCalendario | undefined>>();
  return async (prazo) => {
    const vencimento = prazo.estado.calculo.vencimento;
    // Já passou: não é "vence hoje"; a situação do prazo diz o resto.
    if (vencimento === null || !ABERTOS.has(prazo.estado.status) || vencimento.ehAntesDe(dia))
      return null;
    if (!vencimento.ehDepoisDe(dia)) return 0;
    const id = prazo.estado.processoId;
    let processo = processos.get(id);
    if (processo === undefined) {
      processo = localizar(id);
      processos.set(id, processo);
    }
    const calendarioDoProcesso = await processo;
    if (calendarioDoProcesso === undefined) return null;
    const dias = await calendarioDoProcesso.diasNaoUteis(dia.maisDias(1), vencimento);
    const calendario = calendarioDeOcorrencias(
      dias.map((d) => ({
        data: d.data,
        efeito: EFEITO_DO_DIA[d.tipo],
        motivo: d.motivo,
        atoNormativo: d.atoNormativo,
        urlAto: d.urlAto,
      })),
    );
    const r = diasUteisRestantes(dia, vencimento, calendario);
    return r.ok ? r.valor : null;
  };
}
