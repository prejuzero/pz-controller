import { Instant, LocalDate } from '@pz/kernel';

import { VersaoDaTabela } from '../domain/tabela.js';

import type {
  FiltroDeVersoes,
  RepositorioDaTabela,
  RepositorioDeTiposDeAto,
  TipoDeAto,
} from '../application/portas.js';
import type { Ramo } from '../domain/tabela.js';
import type { Transacao } from '@pz/db';
import type { Uuid } from '@pz/kernel';

// Colunas DATE chegam como meia-noite UTC: a data jurídica é lida e gravada em UTC, sem fuso.
const paraData = (data: LocalDate) => new Date(Date.UTC(data.ano, data.mes - 1, data.dia));
const daData = (data: Date) =>
  LocalDate.de(data.getUTCFullYear(), data.getUTCMonth() + 1, data.getUTCDate());
const paraInstante = (instante: Instant) => new Date(instante.epochMs);

type Linha = Awaited<ReturnType<Transacao['tabelaPrazo']['findFirstOrThrow']>>;

// Enums do banco em snake_case; no domínio, kebab-case (os mesmos valores do motor).
type Snake<T extends string> = T extends `${infer A}-${infer B}` ? `${A}_${Snake<B>}` : T;
type Kebab<T extends string> = T extends `${infer A}_${infer B}` ? `${A}-${Kebab<B>}` : T;
const paraBanco = <T extends string>(valor: T) => valor.replaceAll('-', '_') as Snake<T>;
const doBanco = <T extends string>(valor: T) => valor.replaceAll('_', '-') as Kebab<T>;

function restaurar(linha: Linha): VersaoDaTabela {
  return VersaoDaTabela.restaurar({
    id: linha.id as Uuid,
    tipoAto: linha.tipoAto,
    ramo: doBanco(linha.ramo),
    versao: linha.versao,
    dias: linha.dias,
    unidade: linha.unidade,
    fundamento: linha.fundamento,
    fonteUrl: linha.fonteUrl,
    vigenciaInicio: daData(linha.vigenciaInicio),
    ...(linha.vigenciaFim === null ? {} : { vigenciaFim: daData(linha.vigenciaFim) }),
    contagem: linha.contagem,
    politicaDobro: doBanco(linha.politicaDobro),
    calculo: doBanco(linha.calculo),
    ...(linha.marcoInicial === null ? {} : { marcoInicial: linha.marcoInicial }),
    ...(linha.localDoAto === null ? {} : { localDoAto: doBanco(linha.localDoAto) }),
    ...(linha.alerta === null ? {} : { alerta: linha.alerta }),
    status: linha.status,
    propostoPor: linha.propostoPor as Uuid,
    propostoEm: Instant.deEpochMs(linha.propostoEm.getTime()),
    ...(linha.aprovadoPor === null ? {} : { aprovadoPor: linha.aprovadoPor as Uuid }),
    ...(linha.aprovadoEm === null
      ? {}
      : { aprovadoEm: Instant.deEpochMs(linha.aprovadoEm.getTime()) }),
  });
}

/** Tabela de prazos (global, sem RLS; versão aprovada protegida por trigger no banco). */
export class TabelaPostgres implements RepositorioDaTabela<Transacao> {
  async proximaVersao(transacao: Transacao, tipoAto: string, ramo: Ramo): Promise<number> {
    const { _max } = await transacao.tabelaPrazo.aggregate({
      where: { tipoAto, ramo: paraBanco(ramo) },
      _max: { versao: true },
    });
    return (_max.versao ?? 0) + 1;
  }

  async inserir(transacao: Transacao, versao: VersaoDaTabela): Promise<boolean> {
    const e = versao.estado;
    const { count } = await transacao.tabelaPrazo.createMany({
      data: [
        {
          id: e.id,
          tipoAto: e.tipoAto,
          ramo: paraBanco(e.ramo),
          versao: e.versao,
          dias: e.dias,
          unidade: e.unidade,
          fundamento: e.fundamento,
          fonteUrl: e.fonteUrl,
          vigenciaInicio: paraData(e.vigenciaInicio),
          vigenciaFim: e.vigenciaFim === undefined ? null : paraData(e.vigenciaFim),
          contagem: e.contagem,
          politicaDobro: paraBanco(e.politicaDobro),
          calculo: paraBanco(e.calculo),
          marcoInicial: e.marcoInicial ?? null,
          localDoAto: e.localDoAto === undefined ? null : paraBanco(e.localDoAto),
          alerta: e.alerta ?? null,
          status: e.status,
          propostoPor: e.propostoPor,
          propostoEm: paraInstante(e.propostoEm),
        },
      ],
      skipDuplicates: true,
    });
    return count === 1;
  }

  async buscar(transacao: Transacao, id: Uuid): Promise<VersaoDaTabela | undefined> {
    const linha = await transacao.tabelaPrazo.findUnique({ where: { id } });
    return linha === null ? undefined : restaurar(linha);
  }

  async registrarAprovacao(transacao: Transacao, versao: VersaoDaTabela): Promise<boolean> {
    const e = versao.estado;
    if (e.aprovadoPor === undefined || e.aprovadoEm === undefined) {
      throw new Error('registrarAprovacao chamado com versão não aprovada');
    }
    const { count } = await transacao.tabelaPrazo.updateMany({
      where: { id: e.id, status: 'rascunho' },
      data: {
        status: 'aprovado',
        aprovadoPor: e.aprovadoPor,
        aprovadoEm: paraInstante(e.aprovadoEm),
      },
    });
    return count === 1;
  }

  async listar(transacao: Transacao, filtro: FiltroDeVersoes): Promise<VersaoDaTabela[]> {
    const linhas = await transacao.tabelaPrazo.findMany({
      where: {
        ...(filtro.tipoAto === undefined ? {} : { tipoAto: filtro.tipoAto }),
        ...(filtro.ramo === undefined ? {} : { ramo: paraBanco(filtro.ramo) }),
      },
      orderBy: [{ tipoAto: 'asc' }, { ramo: 'asc' }, { versao: 'asc' }],
    });
    return linhas.map(restaurar);
  }
}

/** Taxonomia de atos (global). */
export class TiposDeAtoPostgres implements RepositorioDeTiposDeAto<Transacao> {
  async existe(transacao: Transacao, codigo: string): Promise<boolean> {
    return (await transacao.tipoAto.count({ where: { codigo } })) === 1;
  }

  async inserir(transacao: Transacao, tipo: TipoDeAto): Promise<boolean> {
    const { count } = await transacao.tipoAto.createMany({
      data: [{ ...tipo, sinonimos: [...tipo.sinonimos] }],
      skipDuplicates: true,
    });
    return count === 1;
  }

  async listar(transacao: Transacao): Promise<TipoDeAto[]> {
    return transacao.tipoAto.findMany({
      select: { codigo: true, nome: true, descricao: true, sinonimos: true },
      orderBy: { codigo: 'asc' },
    });
  }
}
