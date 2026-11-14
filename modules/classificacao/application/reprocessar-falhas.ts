import { classificarConteudo, eventoDaClassificacao } from './classificar-publicacao.js';

import type { DependenciasDaClassificacao } from './classificar-publicacao.js';
import type { Classificacao } from '../domain/decisao.js';
import type { Clock, Instant, Outbox, UnidadeDeTrabalho, Uuid } from '@pz/kernel';

/** Classificações por conteúdo de uma vez: cada uma pode chamar a IA duas vezes. */
export const LOTE_DAS_FALHAS = 20;
/** Uma falha que se repete só volta a ser tentada depois deste intervalo (custo da IA). */
export const INTERVALO_ENTRE_TENTATIVAS_MS = 6 * 3_600_000;

/**
 * Porta: classificações que a IA não conseguiu fazer (saída inválida ou recusa do provedor),
 * globais, lidas e trocadas pelo papel sistema. A troca só acontece se a linha ainda for a falha.
 */
export interface RepositorioDeFalhasDaIa<Transacao> {
  /** Falhas da IA não tentadas desde `tentadaAntesDe`, em ordem de conteúdo. */
  pendentes(transacao: Transacao, tentadaAntesDe: Instant, limite: number): Promise<Uuid[]>;
  /** Falso se a linha não é mais uma falha da IA (já trocada ou decidida pela curadoria). */
  substituir(
    transacao: Transacao,
    conteudoId: Uuid,
    classificacao: Classificacao,
  ): Promise<boolean>;
  /** A falha continua: marca a tentativa, para esperar o intervalo. */
  registrarTentativa(transacao: Transacao, conteudoId: Uuid, em: Instant): Promise<void>;
}

export interface DependenciasDoReprocessamento<Transacao> {
  /** Papel sistema (a classificação é global, uma por conteúdo). */
  readonly sistema: UnidadeDeTrabalho<Transacao>;
  /** Leitura do teor, das regras e da taxonomia no tenant de um destinatário. */
  readonly noTenant: <T>(
    tenantId: Uuid,
    trabalho: (transacao: Transacao) => Promise<T>,
  ) => Promise<T>;
  readonly classificacao: Pick<
    DependenciasDaClassificacao<Transacao>,
    'teores' | 'regras' | 'taxonomia' | 'ia'
  >;
  readonly falhas: RepositorioDeFalhasDaIa<Transacao>;
  /** Tenants que receberam o conteúdo (módulo publicacoes). */
  readonly tenantsDoConteudo: (conteudoId: Uuid) => Promise<Uuid[]>;
  readonly outbox: Outbox<Transacao>;
  readonly relogio: Clock;
}

export interface ResultadoDoReprocessamento {
  readonly reclassificadas: number;
  readonly aindaComFalha: number;
  /** Havia mais falhas que o lote: o job chama de novo. */
  readonly haMais: boolean;
}

/**
 * Refaz as classificações que a IA não conseguiu fazer (13/11/2026: a API recusava o schema e
 * toda publicação ia para revisão manual). A nova classificação troca a falha e publica
 * PublicacaoClassificada de novo, na mesma transação: o módulo prazos refaz a sugestão do prazo
 * que ainda não tem data. Sem IA configurada, nada a fazer.
 */
export class ReprocessarFalhasDaIa<Transacao> {
  constructor(private readonly deps: DependenciasDoReprocessamento<Transacao>) {}

  async executar(): Promise<ResultadoDoReprocessamento> {
    const { deps } = this;
    if (deps.classificacao.ia === undefined) {
      return { reclassificadas: 0, aindaComFalha: 0, haMais: false };
    }
    const agora = deps.relogio.agora();
    const ids = await deps.sistema.executar((tx) =>
      deps.falhas.pendentes(tx, agora.maisMs(-INTERVALO_ENTRE_TENTATIVAS_MS), LOTE_DAS_FALHAS),
    );
    let reclassificadas = 0;
    let aindaComFalha = 0;
    for (const conteudoId of ids) {
      const [tenantId] = await deps.tenantsDoConteudo(conteudoId);
      if (tenantId === undefined) {
        // Sem destinatário (conta encerrada): nada a mostrar a ninguém; não volta a tentar logo.
        await deps.sistema.executar((tx) => deps.falhas.registrarTentativa(tx, conteudoId, agora));
        continue;
      }
      const nova = await deps.noTenant(tenantId, (tx) =>
        classificarConteudo(deps.classificacao, tx, conteudoId, tenantId),
      );
      if (nova.motivo === 'saida-invalida') {
        aindaComFalha++;
        await deps.sistema.executar((tx) => deps.falhas.registrarTentativa(tx, conteudoId, agora));
        continue;
      }
      const trocou = await deps.sistema.executar(async (tx) => {
        if (!(await deps.falhas.substituir(tx, conteudoId, nova))) return false;
        await deps.outbox.gravar(tx, [
          eventoDaClassificacao(deps.relogio, tenantId, conteudoId, nova),
        ]);
        return true;
      });
      if (trocou) reclassificadas++;
    }
    return { reclassificadas, aindaComFalha, haMais: ids.length === LOTE_DAS_FALHAS };
  }
}
