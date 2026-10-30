import { err, ok, Validacao } from '@pz/kernel';

import { NumeroOab, UFS } from '../domain/valores.js';

import type {
  FiltroDeProcessosNaBusca,
  RepositorioDeAdvogados,
  RepositorioDeProcessos,
} from './portas.js';
import type { Result, UnidadeDeTrabalho, Uuid } from '@pz/kernel';

/**
 * Teto de processos que um filtro pode trazer para a busca: acima disso a lista de ids fica cara
 * de repassar; o advogado refina (ex.: número ou órgão).
 */
export const MAXIMO_DE_PROCESSOS_NA_BUSCA = 10_000;

/** Processos do tenant que atendem aos filtros de processo da busca (composta pelo módulo busca). */
export class ProcessosParaBusca<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly processos: RepositorioDeProcessos<Transacao>,
  ) {}

  async executar(filtro: FiltroDeProcessosNaBusca): Promise<Result<Uuid[], Validacao>> {
    const ids = await this.unidade.executar((tx) =>
      this.processos.idsNoFiltro(tx, filtro, MAXIMO_DE_PROCESSOS_NA_BUSCA + 1),
    );
    if (ids.length > MAXIMO_DE_PROCESSOS_NA_BUSCA) {
      return err(
        new Validacao([
          {
            campo: 'tribunal',
            mensagem: `Mais de ${String(MAXIMO_DE_PROCESSOS_NA_BUSCA)} processos: refine pelo número, órgão ou cliente.`,
          },
        ]),
      );
    }
    return ok(ids);
  }
}

/** OAB digitada na busca (UF + número) → inscrições do tenant e usuários dos advogados. */
export class OabsParaBusca<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly advogados: RepositorioDeAdvogados<Transacao>,
  ) {}

  async executar(
    texto: string,
  ): Promise<Result<{ oabIds: Uuid[]; usuarioIds: Uuid[] }, Validacao>> {
    const limpo = texto.trim().toUpperCase();
    const uf = UFS.find((u) => u === limpo.slice(0, 2));
    const numero = NumeroOab.de(limpo.slice(2), 'oab');
    if (uf === undefined) return err(new Validacao([{ campo: 'oab', mensagem: 'UF inválida.' }]));
    if (!numero.ok) return numero;
    const achadas = await this.unidade.executar((tx) =>
      this.advogados.oabsDoNumero(tx, uf, numero.valor.valor),
    );
    return ok({
      oabIds: achadas.map((a) => a.oabId),
      usuarioIds: [...new Set(achadas.map((a) => a.usuarioId))],
    });
  }
}
