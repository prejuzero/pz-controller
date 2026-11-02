import { ConsultaDaAgenda, MAXIMO_DIAS_DA_AGENDA } from '@pz/contracts';
import { err, FUSO_PADRAO, Instant, LocalDate, ok, Validacao } from '@pz/kernel';

import type { Buscar } from './buscar.js';
import type { FiltroDeProcessosNaBusca } from '@pz/cadastro';
import type { Agenda } from '@pz/contracts';
import type { Result, Uuid } from '@pz/kernel';
import type { z } from 'zod';

/** Portas da agenda (HU27), compostas nas apps pelas APIs públicas de cadastro, prazos e calendário. */
export interface FontesDaAgenda {
  processos(filtro: FiltroDeProcessosNaBusca): Promise<Result<Uuid[], Validacao>>;
  /** Compromissos não cancelados com data e hora no intervalo de instantes. */
  compromissos(de: Instant, ate: Instant): Promise<Agenda['compromissos']>;
  /** Dias sem contagem cadastrados (nacionais e, com tribunal, os do tribunal). */
  diasNaoUteis(
    jurisdicao: { tribunal?: string },
    de: LocalDate,
    ate: LocalDate,
  ): Promise<Agenda['diasNaoUteis']>;
}

/** Páginas da busca de prazos por consulta: 500 prazos num mês já pedem filtro. */
const PAGINAS = 5;
const POR_PAGINA = 100;

const validacao = (erro: z.ZodError) =>
  new Validacao(erro.issues.map((p) => ({ campo: p.path.join('.'), mensagem: p.message })));
const invalido = (mensagem: string) => new Validacao([{ campo: 'periodo', mensagem }]);

/**
 * Agenda do calendário do portal (HU27, RF42): prazos pelo vencimento (a busca da HU28),
 * compromissos e dias sem expediente do período. Datas civis no fuso de São Paulo: o navegador
 * só desenha, não converte.
 */
export class ConsultarAgenda {
  constructor(
    private readonly buscar: Buscar,
    private readonly fontes: FontesDaAgenda,
  ) {}

  async executar(consulta: unknown): Promise<Result<Agenda, Validacao>> {
    const lido = ConsultaDaAgenda.safeParse(consulta);
    if (!lido.success) return err(validacao(lido.error));
    const f = lido.data;
    const de = data(f.de);
    const ate = data(f.ate);
    if (de.ehDepoisDe(ate)) return err(invalido('A data inicial é posterior à final.'));
    if (de.diasAte(ate) >= MAXIMO_DIAS_DA_AGENDA) {
      return err(invalido(`Período maior que ${String(MAXIMO_DIAS_DA_AGENDA)} dias.`));
    }

    const prazos: Agenda['prazos'] = [];
    let cursor: string | null = null;
    for (let pagina = 0; pagina < PAGINAS; pagina++) {
      const r = await this.buscar.prazos({
        ...(f.responsavelId === undefined ? {} : { responsavelId: f.responsavelId }),
        ...(f.tribunal === undefined ? {} : { tribunal: f.tribunal }),
        ...(f.clienteId === undefined ? {} : { clienteId: f.clienteId }),
        periodo: { de: f.de, ate: f.ate, campoData: 'vencimento' },
        ...(cursor === null ? {} : { cursor }),
        limite: POR_PAGINA,
      });
      if (!r.ok) return r;
      prazos.push(...r.valor.itens);
      cursor = r.valor.proximoCursor;
      if (cursor === null) break;
    }

    const compromissos = await this.#compromissos(f, de, ate);
    if (!compromissos.ok) return compromissos;
    const diasNaoUteis = await this.fontes.diasNaoUteis(
      f.tribunal === undefined ? {} : { tribunal: f.tribunal },
      de,
      ate,
    );
    return ok({
      prazos,
      prazosTruncados: cursor !== null,
      compromissos: compromissos.valor,
      diasNaoUteis,
    });
  }

  /**
   * Compromissos cujo dia em São Paulo cai no período. A janela de instantes tem folga de um dia
   * em cada ponta e o corte é pelo dia civil, sem fixar o deslocamento do fuso. Com tribunal ou
   * cliente, só os ligados a um processo do filtro; o compromisso não tem advogado responsável,
   * então o filtro de advogado não o alcança.
   */
  async #compromissos(
    f: z.output<typeof ConsultaDaAgenda>,
    de: LocalDate,
    ate: LocalDate,
  ): Promise<Result<Agenda['compromissos'], Validacao>> {
    const lista = await this.fontes.compromissos(
      Instant.deIso(`${de.maisDias(-1).paraIso()}T00:00:00.000Z`),
      Instant.deIso(`${ate.maisDias(2).paraIso()}T00:00:00.000Z`),
    );
    const doPeriodo = lista.filter((c) => {
      const dia = LocalDate.doInstante(Instant.deIso(c.dataHora), FUSO_PADRAO);
      return !dia.ehAntesDe(de) && !dia.ehDepoisDe(ate);
    });
    if (f.tribunal === undefined && f.clienteId === undefined) return ok(doPeriodo);
    const processos = await this.fontes.processos({
      ...(f.tribunal === undefined ? {} : { tribunal: f.tribunal }),
      ...(f.clienteId === undefined ? {} : { clienteId: f.clienteId as Uuid }),
    });
    if (!processos.ok) return processos;
    const ids = new Set<string>(processos.valor);
    return ok(doPeriodo.filter((c) => c.processoId !== null && ids.has(c.processoId)));
  }
}

function data(iso: string): LocalDate {
  const r = LocalDate.analisar(iso);
  // O schema já validou a data: falha aqui é defeito, não entrada do cliente.
  if (!r.ok) throw r.erro;
  return r.valor;
}
