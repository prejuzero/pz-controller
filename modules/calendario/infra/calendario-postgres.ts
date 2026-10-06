import { Instant, LocalDate } from '@pz/kernel';

import { EventoGlobal, FeriadoLocal } from '../domain/evento.js';

import type {
  FiltroDoCalendario,
  RepositorioDeEventosGlobais,
  RepositorioDeFeriadosLocais,
} from '../application/portas.js';
import type { ConteudoDoEvento } from '../domain/evento.js';
import type { Transacao } from '@pz/db';
import type { Uuid } from '@pz/kernel';

// Colunas DATE chegam como meia-noite UTC: a data jurídica é lida e gravada em UTC, sem fuso.
const paraData = (data: LocalDate) => new Date(Date.UTC(data.ano, data.mes - 1, data.dia));
const daData = (data: Date) =>
  LocalDate.de(data.getUTCFullYear(), data.getUTCMonth() + 1, data.getUTCDate());
const paraInstante = (instante: Instant) => new Date(instante.epochMs);
const doInstante = (data: Date) => Instant.deEpochMs(data.getTime());

type LinhaGlobal = Awaited<ReturnType<Transacao['eventoCalendario']['findFirstOrThrow']>>;
type LinhaLocal = Awaited<ReturnType<Transacao['feriadoLocal']['findFirstOrThrow']>>;

function conteudoDa(linha: LinhaGlobal | LinhaLocal): ConteudoDoEvento {
  return {
    abrangencia: linha.abrangencia,
    ...(linha.uf === null ? {} : { uf: linha.uf }),
    ...(linha.municipioIbge === null ? {} : { municipioIbge: linha.municipioIbge }),
    ...(linha.tribunal === null ? {} : { tribunal: linha.tribunal }),
    ...(linha.comarca === null ? {} : { comarca: linha.comarca }),
    tipo: linha.tipo,
    inicio: daData(linha.dataInicio),
    fim: daData(linha.dataFim),
    descricao: linha.descricao,
    atoNormativo: linha.atoNormativo,
    urlAto: linha.urlAto,
  };
}

function colunasDo(conteudo: ConteudoDoEvento) {
  return {
    abrangencia: conteudo.abrangencia,
    uf: conteudo.uf ?? null,
    municipioIbge: conteudo.municipioIbge ?? null,
    tribunal: conteudo.tribunal ?? null,
    comarca: conteudo.comarca ?? null,
    tipo: conteudo.tipo,
    dataInicio: paraData(conteudo.inicio),
    dataFim: paraData(conteudo.fim),
    descricao: conteudo.descricao,
    atoNormativo: conteudo.atoNormativo,
    urlAto: conteudo.urlAto,
  };
}

/** Eventos que cruzam o período (inclusivo). */
const noPeriodo = (filtro: FiltroDoCalendario) => ({
  ...(filtro.inicio === undefined ? {} : { dataFim: { gte: paraData(filtro.inicio) } }),
  ...(filtro.fim === undefined ? {} : { dataInicio: { lte: paraData(filtro.fim) } }),
});
const ordem = [{ dataInicio: 'asc' as const }, { id: 'asc' as const }];

function restaurarGlobal(linha: LinhaGlobal): EventoGlobal {
  return EventoGlobal.restaurar({
    ...conteudoDa(linha),
    id: linha.id as Uuid,
    status: linha.status,
    propostoPor: linha.propostoPor as Uuid,
    propostoEm: doInstante(linha.propostoEm),
    ...(linha.aprovadoPor === null ? {} : { aprovadoPor: linha.aprovadoPor as Uuid }),
    ...(linha.aprovadoEm === null ? {} : { aprovadoEm: doInstante(linha.aprovadoEm) }),
    ...(linha.revogadoPor === null ? {} : { revogadoPor: linha.revogadoPor as Uuid }),
    ...(linha.revogadoEm === null ? {} : { revogadoEm: doInstante(linha.revogadoEm) }),
    ...(linha.motivoRevogacao === null ? {} : { motivoRevogacao: linha.motivoRevogacao }),
  });
}

function restaurarLocal(linha: LinhaLocal): FeriadoLocal {
  return FeriadoLocal.restaurar({
    ...conteudoDa(linha),
    id: linha.id as Uuid,
    tenantId: linha.tenantId as Uuid,
    cadastradoPor: linha.cadastradoPor as Uuid,
    cadastradoEm: doInstante(linha.cadastradoEm),
    ...(linha.revogadoPor === null ? {} : { revogadoPor: linha.revogadoPor as Uuid }),
    ...(linha.revogadoEm === null ? {} : { revogadoEm: doInstante(linha.revogadoEm) }),
  });
}

/** Calendário global (sem RLS; aprovação e revogação protegidas por trigger no banco). */
export class EventosGlobaisPostgres implements RepositorioDeEventosGlobais<Transacao> {
  async inserir(transacao: Transacao, evento: EventoGlobal): Promise<void> {
    const e = evento.estado;
    await transacao.eventoCalendario.create({
      data: {
        id: e.id,
        ...colunasDo(e),
        status: e.status,
        propostoPor: e.propostoPor,
        propostoEm: paraInstante(e.propostoEm),
      },
    });
  }

  async buscar(transacao: Transacao, id: Uuid): Promise<EventoGlobal | undefined> {
    const linha = await transacao.eventoCalendario.findUnique({ where: { id } });
    return linha === null ? undefined : restaurarGlobal(linha);
  }

  async registrarAprovacao(transacao: Transacao, evento: EventoGlobal): Promise<boolean> {
    const e = evento.estado;
    if (e.aprovadoPor === undefined || e.aprovadoEm === undefined) {
      throw new Error('registrarAprovacao chamado com evento não aprovado');
    }
    const { count } = await transacao.eventoCalendario.updateMany({
      where: { id: e.id, status: 'rascunho' },
      data: {
        status: 'aprovado',
        aprovadoPor: e.aprovadoPor,
        aprovadoEm: paraInstante(e.aprovadoEm),
      },
    });
    return count === 1;
  }

  async registrarRevogacao(transacao: Transacao, evento: EventoGlobal): Promise<boolean> {
    const e = evento.estado;
    if (e.revogadoPor === undefined || e.revogadoEm === undefined) {
      throw new Error('registrarRevogacao chamado com evento não revogado');
    }
    const { count } = await transacao.eventoCalendario.updateMany({
      where: { id: e.id, status: 'aprovado', revogadoEm: null },
      data: {
        revogadoPor: e.revogadoPor,
        revogadoEm: paraInstante(e.revogadoEm),
        motivoRevogacao: e.motivoRevogacao ?? null,
      },
    });
    return count === 1;
  }

  async listar(transacao: Transacao, filtro: FiltroDoCalendario): Promise<EventoGlobal[]> {
    const linhas = await transacao.eventoCalendario.findMany({
      where: noPeriodo(filtro),
      orderBy: ordem,
    });
    return linhas.map(restaurarGlobal);
  }

  async vigentesNoPeriodo(
    transacao: Transacao,
    inicio: LocalDate,
    fim: LocalDate,
  ): Promise<EventoGlobal[]> {
    const linhas = await transacao.eventoCalendario.findMany({
      where: { ...noPeriodo({ inicio, fim }), status: 'aprovado', revogadoEm: null },
      orderBy: ordem,
    });
    return linhas.map(restaurarGlobal);
  }
}

/** Feriados locais do tenant da transação (RLS; só a revogação altera uma linha). */
export class FeriadosLocaisPostgres implements RepositorioDeFeriadosLocais<Transacao> {
  async inserir(transacao: Transacao, feriado: FeriadoLocal): Promise<void> {
    const e = feriado.estado;
    await transacao.feriadoLocal.create({
      data: {
        id: e.id,
        tenantId: e.tenantId,
        ...colunasDo(e),
        cadastradoPor: e.cadastradoPor,
        cadastradoEm: paraInstante(e.cadastradoEm),
      },
    });
  }

  async buscar(transacao: Transacao, id: Uuid): Promise<FeriadoLocal | undefined> {
    const linha = await transacao.feriadoLocal.findUnique({ where: { id } });
    return linha === null ? undefined : restaurarLocal(linha);
  }

  async registrarRevogacao(transacao: Transacao, feriado: FeriadoLocal): Promise<boolean> {
    const e = feriado.estado;
    if (e.revogadoPor === undefined || e.revogadoEm === undefined) {
      throw new Error('registrarRevogacao chamado com feriado não revogado');
    }
    const { count } = await transacao.feriadoLocal.updateMany({
      where: { id: e.id, revogadoEm: null },
      data: { revogadoPor: e.revogadoPor, revogadoEm: paraInstante(e.revogadoEm) },
    });
    return count === 1;
  }

  async listar(transacao: Transacao, filtro: FiltroDoCalendario): Promise<FeriadoLocal[]> {
    const linhas = await transacao.feriadoLocal.findMany({
      where: noPeriodo(filtro),
      orderBy: ordem,
    });
    return linhas.map(restaurarLocal);
  }

  async vigentesNoPeriodo(
    transacao: Transacao,
    inicio: LocalDate,
    fim: LocalDate,
  ): Promise<FeriadoLocal[]> {
    const linhas = await transacao.feriadoLocal.findMany({
      where: { ...noPeriodo({ inicio, fim }), revogadoEm: null },
      orderBy: ordem,
    });
    return linhas.map(restaurarLocal);
  }
}
