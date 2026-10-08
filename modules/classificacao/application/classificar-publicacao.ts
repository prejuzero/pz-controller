import { gerarUuidV7 } from '@pz/kernel';

import { decidir } from '../domain/decisao.js';
import { classificarPorRegras } from '../domain/regras.js';

import { regrasValidas } from './classificar.js';

import type { RepositorioDeRegras } from './classificar.js';
import type { Classificacao, RespostaDaIa } from '../domain/decisao.js';
import type { Clock, EventoDominio, Outbox, Uuid } from '@pz/kernel';

/** Porta: teor do conteúdo visível na transação (módulo publicacoes). */
export interface LeitorDeTeor<Transacao> {
  teor(transacao: Transacao, conteudoId: Uuid): Promise<string | undefined>;
}

export interface TipoDaTaxonomia {
  readonly codigo: string;
  readonly nome: string;
  readonly descricao: string;
}

/** Porta: taxonomia única de atos (módulo prazos, HU15). */
export interface Taxonomia<Transacao> {
  listar(transacao: Transacao): Promise<TipoDaTaxonomia[]>;
}

/**
 * Porta: classificação por IA (plataforma de IA, tarefa `classificar-ato`). Saída fora do schema
 * vira `{ tipo: 'invalida' }`; falha passageira do provedor lança (o job tenta de novo).
 */
export interface ClassificadorIa {
  classificar(
    entrada: { readonly teor: string; readonly taxonomia: readonly TipoDaTaxonomia[] },
    tenantId: Uuid,
  ): Promise<RespostaDaIa>;
}

/** Porta: classificações gravadas, uma por conteúdo. */
export interface RepositorioDeClassificacoes<Transacao> {
  existe(transacao: Transacao, conteudoId: Uuid): Promise<boolean>;
  /** Falso se outro processo gravou antes (a primeira vale). */
  gravar(transacao: Transacao, conteudoId: Uuid, classificacao: Classificacao): Promise<boolean>;
}

export interface DependenciasDaClassificacao<Transacao> {
  readonly teores: LeitorDeTeor<Transacao>;
  readonly regras: RepositorioDeRegras<Transacao>;
  readonly taxonomia: Taxonomia<Transacao>;
  /** Ausente: IA desligada (sem chave configurada). */
  readonly ia?: ClassificadorIa;
  readonly classificacoes: RepositorioDeClassificacoes<Transacao>;
  readonly outbox: Outbox<Transacao>;
  readonly relogio: Clock;
}

/**
 * Consumidor de PublicacaoNova (HU21): regras rápidas primeiro; a IA só quando elas não
 * decidem. Saída inválida tem uma nova tentativa; repetida, vai para revisão manual. Grava uma
 * classificação por conteúdo e publica PublicacaoClassificada uma vez, na mesma transação.
 */
export class ClassificarPublicacao<Transacao> {
  constructor(private readonly deps: DependenciasDaClassificacao<Transacao>) {}

  async executar(
    transacao: Transacao,
    evento: { readonly tenantId: Uuid; readonly payload: { readonly conteudoId: string } },
  ): Promise<Classificacao | undefined> {
    const conteudoId = evento.payload.conteudoId as Uuid;
    const { deps } = this;
    if (await deps.classificacoes.existe(transacao, conteudoId)) return undefined;
    const teor = await deps.teores.teor(transacao, conteudoId);
    // Nada falha em silêncio: conteúdo sumido é defeito (o evento vai para a DLQ com o motivo).
    if (teor === undefined)
      throw new Error(`Conteúdo ${conteudoId} não encontrado para classificar`);
    const regras = classificarPorRegras(teor, regrasValidas(await deps.regras.vigentes(transacao)));
    const tipos = await deps.taxonomia.listar(transacao);
    const entrada = { teor, taxonomia: tipos.map((t) => t.codigo), regras };
    const classificacao =
      decidir(entrada) ??
      decidir({ ...entrada, ia: await this.#consultarIa(teor, tipos, evento.tenantId) });
    if (await deps.classificacoes.gravar(transacao, conteudoId, classificacao)) {
      await deps.outbox.gravar(transacao, [
        this.#evento(evento.tenantId, conteudoId, classificacao),
      ]);
    }
    return classificacao;
  }

  async #consultarIa(
    teor: string,
    taxonomia: readonly TipoDaTaxonomia[],
    tenantId: Uuid,
  ): Promise<RespostaDaIa> {
    const { ia } = this.deps;
    if (ia === undefined) return { tipo: 'desligada' };
    const primeira = await ia.classificar({ teor, taxonomia }, tenantId);
    return primeira.tipo === 'invalida' ? ia.classificar({ teor, taxonomia }, tenantId) : primeira;
  }

  #evento(tenantId: Uuid, conteudoId: Uuid, c: Classificacao): EventoDominio {
    return {
      id: gerarUuidV7(this.deps.relogio),
      tipo: 'PublicacaoClassificada',
      versao: 1,
      tenantId,
      agregadoId: conteudoId,
      ocorridoEm: this.deps.relogio.agora(),
      payload: {
        conteudoId,
        origem: c.origem,
        situacao: c.situacao,
        tipoAto: c.tipoAto,
        confianca: c.confianca,
        prazoCitado:
          c.prazoCitado === null
            ? null
            : {
                quantidade: c.prazoCitado.quantidade,
                unidade: c.prazoCitado.unidade,
                unidadeImplicita: c.prazoCitado.unidadeImplicita,
                divergente: c.prazoCitado.divergente,
              },
      },
    };
  }
}
