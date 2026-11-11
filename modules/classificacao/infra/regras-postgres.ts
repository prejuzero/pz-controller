import { Instant } from '@pz/kernel';

import type { RepositorioDeRegras } from '../application/classificar.js';
import type {
  RepositorioDaCuradoriaDeRegras,
  VersaoDaRegra,
} from '../application/curadoria-das-regras.js';
import type { RegraRapida } from '../domain/regras.js';
import type { Transacao } from '@pz/db';
import type { Uuid } from '@pz/kernel';

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
      FROM regra_classificacao WHERE ativa ORDER BY codigo, versao DESC`;
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

type LinhaDaRegra = Awaited<ReturnType<Transacao['regraClassificacao']['findFirstOrThrow']>>;
const instante = (d: Date | null) => (d === null ? null : Instant.deEpochMs(d.getTime()));
const versaoDa = (l: LinhaDaRegra): VersaoDaRegra => ({
  codigo: l.codigo,
  versao: l.versao,
  tipoAto: l.tipoAto,
  padroes: l.padroes,
  confianca: Number(l.confianca),
  ativa: l.ativa,
  propostaPor: l.propostaPor as Uuid | null,
  ativadaPor: l.ativadaPor as Uuid | null,
  ativadaEm: instante(l.ativadaEm),
  retiradaEm: instante(l.retiradaEm),
  criadaEm: Instant.deEpochMs(l.criadoEm.getTime()),
});

/** Curadoria das regras (PZ-313): a aplicação insere versões e só muda a ativação. */
export class CuradoriaDeRegrasPostgres implements RepositorioDaCuradoriaDeRegras<Transacao> {
  async listar(tx: Transacao): Promise<VersaoDaRegra[]> {
    const linhas = await tx.regraClassificacao.findMany({
      orderBy: [{ codigo: 'asc' }, { versao: 'desc' }],
    });
    return linhas.map(versaoDa);
  }

  async versao(tx: Transacao, codigo: string, versao: number) {
    const l = await tx.regraClassificacao.findUnique({
      where: { codigo_versao: { codigo, versao } },
    });
    return l === null ? undefined : versaoDa(l);
  }

  async proximaVersao(tx: Transacao, codigo: string): Promise<number> {
    const r = await tx.regraClassificacao.aggregate({ where: { codigo }, _max: { versao: true } });
    return (r._max.versao ?? 0) + 1;
  }

  async tipoAtoExiste(tx: Transacao, tipoAto: string): Promise<boolean> {
    return (await tx.tipoAto.count({ where: { codigo: tipoAto } })) > 0;
  }

  async inserir(tx: Transacao, r: VersaoDaRegra): Promise<void> {
    await tx.regraClassificacao.create({
      data: {
        codigo: r.codigo,
        versao: r.versao,
        tipoAto: r.tipoAto,
        padroes: [...r.padroes],
        confianca: r.confianca,
        ativa: false,
        propostaPor: r.propostaPor,
        criadoEm: new Date(r.criadaEm.epochMs),
      },
    });
  }

  async ativar(tx: Transacao, codigo: string, versao: number, por: Uuid, em: Instant) {
    await tx.regraClassificacao.update({
      where: { codigo_versao: { codigo, versao } },
      data: { ativa: true, ativadaPor: por, ativadaEm: new Date(em.epochMs) },
    });
  }

  async retirar(tx: Transacao, codigo: string, em: Instant): Promise<number> {
    const { count } = await tx.regraClassificacao.updateMany({
      where: { codigo, ativa: true },
      data: { ativa: false, retiradaEm: new Date(em.epochMs) },
    });
    return count;
  }
}
