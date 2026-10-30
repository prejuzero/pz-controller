import { Inject, Injectable } from '@nestjs/common';
import { criarLogger } from '@pz/observability';
import { lerAlteracaoDoCalendario, TenantsAfetadosPeloCalendario } from '@pz/prazos';
import { z } from 'zod';

import { Consome } from '../eventos/consome.js';
import { FILAS_RUNTIME, TENANTS_DA_PUBLICACAO } from '../fichas.js';

import { chaveDoLote, gerarPrazoJob, recalcularPrazosJob } from './jobs.js';

import type { DadosDoRecalculo } from './jobs.js';
import type { Filas } from '../filas/runtime.js';
import type { EventoDominio, Uuid } from '@pz/kernel';

const logger = criarLogger('worker.prazos');
const EventoDoConteudo = z.object({ conteudoId: z.uuid() });

/**
 * Liga o recálculo dos prazos ao CalendarioAlterado (HU16): um job por tenant alcançado, na fila
 * prazos. Repetir o evento republica os mesmos jobs (mesma chave), sem duplicar. Sem regra aqui.
 */
@Injectable()
export class ConsumidorDosPrazos {
  constructor(
    @Inject(TenantsAfetadosPeloCalendario)
    private readonly tenants: TenantsAfetadosPeloCalendario<unknown>,
    @Inject(FILAS_RUNTIME) private readonly filas: Filas,
    @Inject(TENANTS_DA_PUBLICACAO)
    private readonly tenantsDaPublicacao: (conteudoId: Uuid) => Promise<Uuid[]>,
  ) {}

  /** Classificada (uma vez por conteúdo): um job por tenant que recebeu a publicação (HU24). */
  @Consome('PublicacaoClassificada', { versao: 1 })
  async publicacaoClassificada(_transacao: unknown, evento: EventoDominio): Promise<void> {
    const conteudoId = EventoDoConteudo.parse(evento.payload).conteudoId as Uuid;
    const tenants = await this.tenantsDaPublicacao(conteudoId);
    for (const tenantId of tenants) await this.#gerar(conteudoId, tenantId);
    logger.info({ conteudoId, tenants: tenants.length }, 'geração de prazos planejada');
  }

  /** Chegou a um tenant depois da classificação: o job gera (ou não faz nada, se não classificada). */
  @Consome('PublicacaoRecebida', { versao: 1 })
  async publicacaoRecebida(_transacao: unknown, evento: EventoDominio): Promise<void> {
    const conteudoId = EventoDoConteudo.parse(evento.payload).conteudoId as Uuid;
    await this.#gerar(conteudoId, evento.tenantId);
  }

  #gerar(conteudoId: Uuid, tenantId: Uuid) {
    return this.filas.publicar(
      gerarPrazoJob,
      { conteudoId, tenantId },
      { tenantId },
      `${conteudoId}-${tenantId}`,
    );
  }

  @Consome('CalendarioAlterado', { versao: 1 })
  async calendarioAlterado(_transacao: unknown, evento: EventoDominio): Promise<void> {
    const alteracao = lerAlteracaoDoCalendario(evento);
    const tenants = await this.tenants.executar(alteracao);
    for (const tenantId of tenants) {
      const dados: DadosDoRecalculo = {
        evento: {
          id: evento.id,
          tenantId: evento.tenantId,
          payload: evento.payload as Record<string, unknown>,
        },
        tenantId,
        depoisDe: null,
      };
      await this.filas.publicar(recalcularPrazosJob, dados, { tenantId }, chaveDoLote(dados));
    }
    logger.info(
      { eventoId: evento.id, origem: alteracao.origem, tenants: tenants.length },
      'recálculo de prazos planejado',
    );
  }
}
