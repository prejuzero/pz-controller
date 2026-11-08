import { decidirResumo } from '../domain/resumo.js';

import type { LeitorDeTeor } from './classificar-publicacao.js';
import type { RespostaDoResumo, Resumo } from '../domain/resumo.js';
import type { Uuid } from '@pz/kernel';

/** Porta: quem pede o resumo à IA (plataforma de IA, na composição). */
export interface Resumidor {
  resumir(teor: string, tenantId: Uuid): Promise<RespostaDoResumo>;
}

/** Porta: resumos na tabela global `resumo_publicacao`, um por conteúdo (ADR-014). */
export interface RepositorioDeResumos<Transacao> {
  existe(transacao: Transacao, conteudoId: Uuid): Promise<boolean>;
  /** `false` se outro consumidor gravou antes (o primeiro vale). */
  gravar(transacao: Transacao, conteudoId: Uuid, resumo: Resumo): Promise<boolean>;
  buscar(transacao: Transacao, conteudoId: Uuid): Promise<Resumo | undefined>;
}

export type DesfechoDoResumo = 'gerado' | 'em-revisao' | 'ja-existia' | 'sem-ia' | 'sem-orcamento';

/**
 * Resume a publicação depois de classificada (HU62), uma vez por conteúdo. Sem IA configurada não
 * há resumo (o portal simplesmente não o mostra). Resposta com trecho fora do teor ou inválida vai
 * para revisão e não é exibida.
 */
export class ResumirPublicacao<Transacao> {
  constructor(
    private readonly teores: LeitorDeTeor<Transacao>,
    private readonly resumos: RepositorioDeResumos<Transacao>,
    private readonly resumidor?: Resumidor,
  ) {}

  async executar(
    transacao: Transacao,
    evento: { readonly tenantId: Uuid; readonly payload: { readonly conteudoId: string } },
  ): Promise<DesfechoDoResumo> {
    if (this.resumidor === undefined) return 'sem-ia';
    const conteudoId = evento.payload.conteudoId as Uuid;
    if (await this.resumos.existe(transacao, conteudoId)) return 'ja-existia';
    const teor = await this.teores.teor(transacao, conteudoId);
    // Nada falha em silêncio: conteúdo sumido é defeito (o evento vai para a DLQ com o motivo).
    if (teor === undefined) throw new Error(`Conteúdo ${conteudoId} não encontrado para resumir`);
    const resumo = decidirResumo(teor, await this.resumidor.resumir(teor, evento.tenantId));
    if (resumo === undefined) return 'sem-orcamento';
    if (!(await this.resumos.gravar(transacao, conteudoId, resumo))) return 'ja-existia';
    return resumo.situacao === 'ok' ? 'gerado' : 'em-revisao';
  }
}

/** Resumo exibível (GET /v1/publicacoes/{id}/resumo): só o "ok"; em revisão não aparece. */
export class ConsultarResumo<Transacao> {
  constructor(private readonly resumos: RepositorioDeResumos<Transacao>) {}

  async executar(transacao: Transacao, conteudoId: Uuid): Promise<Resumo | undefined> {
    const resumo = await this.resumos.buscar(transacao, conteudoId);
    return resumo?.situacao === 'ok' ? resumo : undefined;
  }
}
