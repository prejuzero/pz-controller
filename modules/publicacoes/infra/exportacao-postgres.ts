import type { Transacao } from '@pz/db';

type Valor = string | number | boolean | null;
interface Secao {
  readonly nome: string;
  readonly linhas: readonly Readonly<Record<string, Valor>>[];
}

/** Publicações recebidas pelo escritório para a exportação (HU38). Só pela view do tenant. */
export class ExportacaoDasPublicacoesPostgres {
  titular(): Promise<Secao[]> {
    // Publicações são do escritório, não dados pessoais do usuário.
    return Promise.resolve([]);
  }

  async escritorio(tx: Transacao): Promise<Secao[]> {
    const linhas = await tx.$queryRaw<
      {
        conteudo_id: string;
        fonte: string;
        id_externo: string;
        numero_cnj: string | null;
        data_disponibilizacao: Date;
        processo_id: string | null;
        recebida_em: Date;
        lida_em: Date | null;
        url_fonte: string;
        teor: string;
      }[]
    >`SELECT conteudo_id, fonte, id_externo, numero_cnj, data_disponibilizacao, processo_id,
             recebida_em, lida_em, url_fonte, teor
        FROM publicacao_do_tenant ORDER BY recebida_em`;
    return [
      {
        nome: 'publicacoes',
        linhas: linhas.map((l) => ({
          id: l.conteudo_id,
          fonte: l.fonte,
          idExterno: l.id_externo,
          numeroCnj: l.numero_cnj,
          dataDisponibilizacao: l.data_disponibilizacao.toISOString().slice(0, 10),
          processoId: l.processo_id,
          recebidaEm: l.recebida_em.toISOString(),
          lidaEm: l.lida_em?.toISOString() ?? null,
          urlFonte: l.url_fonte,
          teor: l.teor,
        })),
      },
    ];
  }
}
