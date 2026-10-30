import { FiltrosBusca, PedidoDeBuscaRapida } from '@pz/contracts';
import {
  err,
  formatarNumeroCnj,
  hoje,
  lerNumeroCnj,
  LocalDate,
  NumeroCnj,
  ok,
  Validacao,
} from '@pz/kernel';
import { z } from 'zod';

import { resolverAtalho } from '../domain/periodo.js';

import type { FiltroDeProcessosNaBusca } from '@pz/cadastro';
import type { Clock, Result, Uuid } from '@pz/kernel';
import type { FiltroDaBuscaDePrazos, PaginaDaBuscaDePrazos } from '@pz/prazos';
import type { FiltroDaBuscaDePublicacoes, PublicacaoDoTenant } from '@pz/publicacoes';

/**
 * Portas da busca (HU28), compostas nas apps pelas APIs públicas de cadastro, prazos e
 * publicações. A busca não tem tabelas: resolve os filtros de cada módulo e repassa os ids.
 */
export interface FontesDaBusca {
  processos(filtro: FiltroDeProcessosNaBusca): Promise<Result<Uuid[], Validacao>>;
  oabs(texto: string): Promise<Result<{ oabIds: Uuid[]; usuarioIds: Uuid[] }, Validacao>>;
  /** `undefined`: o texto aparece em conteúdos demais para filtrar prazos (o advogado refina). */
  conteudosComTexto(texto: string): Promise<Uuid[] | undefined>;
  prazos(filtro: FiltroDaBuscaDePrazos): Promise<Result<PaginaDaBuscaDePrazos, Validacao>>;
  publicacoes(filtro: FiltroDaBuscaDePublicacoes): Promise<{
    itens: PublicacaoDoTenant[];
    ultimo: { data: string; id: string } | null;
    totalAproximado: number;
    totalLimitado: boolean;
  }>;
  /** Busca rápida: processos pelo número (dígitos, parcial), até `limite`. */
  processosPorNumero(
    digitos: string,
    limite: number,
  ): Promise<{ id: Uuid; numeroCnj: string; tribunal: string | null }[]>;
}

type Filtros = z.output<typeof FiltrosBusca.esquema>;

const SUGESTOES = 8;
const TRECHO = 120;
/** Filtros que só existem no prazo: a busca de publicações recusa em vez de ignorar. */
const SO_DE_PRAZO = [
  'tiposAto',
  'statusPrazo',
  'statusCiencia',
  'responsavelId',
  'ramo',
  'origem',
] as const;

const invalido = (campo: string, mensagem: string) => new Validacao([{ campo, mensagem }]);
const validacao = (erro: z.ZodError) =>
  new Validacao(erro.issues.map((p) => ({ campo: p.path.join('.'), mensagem: p.message })));

const Cursor = z.object({ d: z.iso.date().nullable(), id: z.uuid() });
function lerCursor(
  cursor: string | undefined,
): Result<z.infer<typeof Cursor> | undefined, Validacao> {
  if (cursor === undefined) return ok(undefined);
  let lido: unknown;
  try {
    lido = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    // Cursor que não é JSON é entrada inválida do cliente: vira 400, não exceção.
    lido = undefined;
  }
  const c = Cursor.safeParse(lido);
  return c.success ? ok(c.data) : err(invalido('cursor', 'Cursor inválido.'));
}
const escreverCursor = (u: { data: string | null; id: string } | null) =>
  u === null ? null : Buffer.from(JSON.stringify({ d: u.data, id: u.id })).toString('base64url');

/** Busca avançada e busca rápida (HU28): filtros combinados com E, no tenant da sessão. */
export class Buscar {
  constructor(
    private readonly fontes: FontesDaBusca,
    private readonly relogio: Clock,
  ) {}

  async prazos(corpo: unknown) {
    const lido = FiltrosBusca.esquema.safeParse(corpo);
    if (!lido.success) return err(validacao(lido.error));
    const f = lido.data;
    const campoData = f.periodo?.campoData ?? 'vencimento';
    if (campoData === 'publicacao') {
      return err(invalido('periodo.campoData', 'Nos prazos, use vencimento ou início.'));
    }
    const comuns = await this.#comuns(f);
    if (!comuns.ok) return comuns;
    const { processoIds, intervalo, cursor } = comuns.valor;

    let conteudoIds: Uuid[] | undefined;
    const textos = [f.palavraChave, f.partes].filter((t) => t !== undefined);
    if (textos.length > 0) {
      conteudoIds = await this.fontes.conteudosComTexto(textos.join(' '));
      if (conteudoIds === undefined) {
        return err(invalido('palavraChave', 'Texto muito comum: combine com outros filtros.'));
      }
    }
    let responsavelIds = f.responsavelId === undefined ? undefined : [f.responsavelId as Uuid];
    if (f.oab !== undefined) {
      const oab = await this.fontes.oabs(f.oab);
      if (!oab.ok) return oab;
      responsavelIds =
        responsavelIds === undefined
          ? oab.valor.usuarioIds
          : responsavelIds.filter((id) => oab.valor.usuarioIds.includes(id));
    }
    // "Vencidos" (RF45) é o prazo que passou sem ser cumprido nem cancelado.
    const status =
      f.statusPrazo ??
      (f.periodo?.atalho === 'vencidos'
        ? (['a-confirmar', 'pendente', 'vencido'] as const)
        : undefined);

    const r = await this.fontes.prazos({
      ...(processoIds === undefined ? {} : { processoIds }),
      ...(conteudoIds === undefined ? {} : { conteudoIds }),
      ...(responsavelIds === undefined ? {} : { responsavelIds }),
      ...(f.tiposAto === undefined ? {} : { tiposAto: f.tiposAto }),
      ...(status === undefined ? {} : { status }),
      ...(f.statusCiencia === undefined ? {} : { statusCiencia: f.statusCiencia }),
      ...(f.ramo === undefined ? {} : { ramo: f.ramo }),
      ...(f.origem === undefined ? {} : { origem: f.origem }),
      campoData,
      ...intervalo,
      ordem: f.ordem ?? 'asc',
      ...(cursor === undefined ? {} : { depoisDe: cursor.id as Uuid }),
      limite: f.limite,
    });
    if (!r.ok) return r;
    return ok({
      itens: r.valor.itens,
      proximoCursor: escreverCursor(r.valor.ultimo),
      totalAproximado: r.valor.totalAproximado,
      totalLimitado: r.valor.totalLimitado,
    });
  }

  async publicacoes(corpo: unknown) {
    const lido = FiltrosBusca.esquema.safeParse(corpo);
    if (!lido.success) return err(validacao(lido.error));
    const f = lido.data;
    const indevido = SO_DE_PRAZO.find((campo) => f[campo] !== undefined);
    if (indevido !== undefined) {
      return err(invalido(indevido, 'Filtro de prazo: use a busca de prazos.'));
    }
    if ((f.periodo?.campoData ?? 'publicacao') !== 'publicacao') {
      return err(invalido('periodo.campoData', 'Nas publicações, a data é a de publicação.'));
    }
    const comuns = await this.#comuns(f);
    if (!comuns.ok) return comuns;
    const { processoIds, intervalo, cursor } = comuns.valor;
    if (cursor?.d === null) return err(invalido('cursor', 'Cursor inválido.'));
    let oabIds: Uuid[] | undefined;
    if (f.oab !== undefined) {
      const oab = await this.fontes.oabs(f.oab);
      if (!oab.ok) return oab;
      oabIds = oab.valor.oabIds;
    }
    const textos = [f.palavraChave, f.partes].filter((t) => t !== undefined);
    const r = await this.fontes.publicacoes({
      ...(processoIds === undefined ? {} : { processoIds }),
      ...(oabIds === undefined ? {} : { oabIds }),
      ...(textos.length === 0 ? {} : { textos }),
      ...(intervalo.de === undefined ? {} : { de: intervalo.de.paraIso() }),
      ...(intervalo.ate === undefined ? {} : { ate: intervalo.ate.paraIso() }),
      ordem: f.ordem ?? 'desc',
      ...(cursor === undefined ? {} : { depoisDe: { data: cursor.d, id: cursor.id as Uuid } }),
      limite: f.limite,
    });
    return ok({
      itens: r.itens,
      proximoCursor: escreverCursor(r.ultimo),
      totalAproximado: r.totalAproximado,
      totalLimitado: r.totalLimitado,
    });
  }

  /** Busca rápida (RF49): número CNJ completo vai direto ao processo; senão, sugestões. */
  async rapida(corpo: unknown) {
    const lido = PedidoDeBuscaRapida.esquema.safeParse(corpo);
    if (!lido.success) return err(validacao(lido.error));
    const texto = lido.data.texto;
    const digitos = texto.replace(/\D/g, '');
    const pareceNumero = /^[\d.\-\s]+$/.test(texto) && digitos.length >= 4;
    if (pareceNumero) {
      const achados = await this.fontes.processosPorNumero(digitos, SUGESTOES);
      const exato = NumeroCnj.de(digitos).ok
        ? achados.find((p) => p.numeroCnj === digitos)
        : undefined;
      return ok({
        processoExato: exato?.id ?? null,
        itens: achados.map((p) => ({
          tipo: 'processo' as const,
          id: p.id,
          titulo: formatado(p.numeroCnj),
          detalhe: p.tribunal ?? '',
        })),
      });
    }
    const r = await this.fontes.publicacoes({ textos: [texto], ordem: 'desc', limite: SUGESTOES });
    return ok({
      processoExato: null,
      itens: r.itens.map((p) => ({
        tipo: 'publicacao' as const,
        id: p.id,
        titulo: p.numeroCnj === null ? p.dataDisponibilizacao : formatado(p.numeroCnj),
        detalhe: p.teor.length > TRECHO ? `${p.teor.slice(0, TRECHO)}…` : p.teor,
      })),
    });
  }

  /** Filtros de processo, período e cursor, iguais nas duas buscas. */
  async #comuns(f: Filtros): Promise<
    Result<
      {
        processoIds: Uuid[] | undefined;
        intervalo: { de?: LocalDate; ate?: LocalDate };
        cursor: z.infer<typeof Cursor> | undefined;
      },
      Validacao
    >
  > {
    const cursor = lerCursor(f.cursor);
    if (!cursor.ok) return cursor;
    const intervalo = this.#intervalo(f);
    if (!intervalo.ok) return intervalo;
    const numero = f.numeroCnj?.replace(/\D/g, '');
    if (numero === '') return err(invalido('numeroCnj', 'Informe ao menos um dígito.'));
    const doProcesso: FiltroDeProcessosNaBusca = {
      ...(numero === undefined ? {} : { numeroCnj: numero }),
      ...(f.clienteId === undefined ? {} : { clienteId: f.clienteId as Uuid }),
      ...(f.tribunal === undefined ? {} : { tribunal: f.tribunal }),
      ...(f.orgao === undefined ? {} : { orgao: f.orgao }),
      ...(f.comarca === undefined ? {} : { comarca: f.comarca }),
    };
    let processoIds: Uuid[] | undefined;
    if (Object.keys(doProcesso).length > 0) {
      const r = await this.fontes.processos(doProcesso);
      if (!r.ok) return r;
      processoIds = r.valor;
    }
    return ok({ processoIds, intervalo: intervalo.valor, cursor: cursor.valor });
  }

  #intervalo(f: Filtros): Result<{ de?: LocalDate; ate?: LocalDate }, Validacao> {
    const p = f.periodo;
    if (p === undefined) return ok({});
    if (p.atalho !== undefined) return ok(resolverAtalho(p.atalho, hoje(this.relogio)));
    const de = p.de === undefined ? undefined : paraData(p.de);
    const ate = p.ate === undefined ? undefined : paraData(p.ate);
    if (de !== undefined && ate !== undefined && de.ehDepoisDe(ate)) {
      return err(invalido('periodo', 'A data inicial é posterior à final.'));
    }
    return ok({ ...(de === undefined ? {} : { de }), ...(ate === undefined ? {} : { ate }) });
  }
}

function paraData(iso: string): LocalDate {
  const r = LocalDate.analisar(iso);
  // O schema já validou a data (z.iso.date): falha aqui é defeito, não entrada do cliente.
  if (!r.ok) throw r.erro;
  return r.valor;
}

function formatado(digitos: string): string {
  const partes = lerNumeroCnj(digitos);
  return partes === undefined ? digitos : formatarNumeroCnj(partes);
}
