import type { RepositorioDeRegras } from '../application/classificar.js';
import type { RegraRapida } from '../domain/regras.js';
import type { Transacao } from '@pz/db';

/** Regras vigentes: a maior versão de cada código, se estiver ativa. Global, só leitura. */
export class RegrasPostgres implements RepositorioDeRegras<Transacao> {
  async vigentes(tx: Transacao): Promise<RegraRapida[]> {
    const linhas = await tx.$queryRaw<
      {
        codigo: string;
        versao: number;
        tipo_ato: string;
        padroes: string[];
        confianca: string;
        ativa: boolean;
      }[]
    >`SELECT DISTINCT ON (codigo) codigo, versao, tipo_ato, padroes, confianca::text AS confianca, ativa
      FROM regra_classificacao ORDER BY codigo, versao DESC`;
    return linhas
      .filter((l) => l.ativa)
      .map((l) => ({
        codigo: l.codigo,
        versao: l.versao,
        tipoAto: l.tipo_ato,
        padroes: l.padroes,
        confianca: Number(l.confianca),
      }));
  }
}
