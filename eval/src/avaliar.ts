import {
  ATO_DESCONHECIDO,
  ClassificadorIaPlataforma,
  ClassificarPublicacao,
  RegrasEmMemoria,
  type Classificacao,
  type RepositorioDeClassificacoes,
} from '@pz/classificacao';
import { configuracaoPadrao, PlataformaIa, promptsPadrao } from '@pz/ia';
import { OutboxEmMemoria } from '@pz/kernel';

import { SemGravacao, type Gravacao, type ProvedorDaAvaliacao } from './gravacoes.js';
import { regrasRapidas, tiposDaTaxonomia, type Referencia } from './referencia.js';

import type { CasoDeAvaliacao } from './caso.js';
import type { Clock, TransacaoEmMemoria, Uuid } from '@pz/kernel';

/** Tenant fictício: a avaliação não lê nem grava dado de escritório. */
const TENANT_DA_AVALIACAO = '00000000-0000-7000-8000-000000000000' as Uuid;

export interface ResultadoDoCaso {
  readonly caso: CasoDeAvaliacao;
  /** Ausente quando faltou gravação da IA para o caso. */
  readonly classificacao?: Classificacao;
  readonly semGravacao: boolean;
  /** Chamadas ao modelo feitas pelo caso (latência, tokens e modelo vêm daqui). */
  readonly chamadas: readonly Gravacao[];
}

/** Ato previsto, no vocabulário da anotação: sem ato = "desconhecido". */
export const atoPrevisto = (r: ResultadoDoCaso): string =>
  r.classificacao?.tipoAto ?? ATO_DESCONHECIDO;

class ClassificacoesDaAvaliacao implements RepositorioDeClassificacoes<TransacaoEmMemoria> {
  readonly porConteudo = new Map<Uuid, Classificacao>();

  existe(): Promise<boolean> {
    return Promise.resolve(false);
  }

  gravar(_t: TransacaoEmMemoria, conteudoId: Uuid, c: Classificacao): Promise<boolean> {
    this.porConteudo.set(conteudoId, c);
    return Promise.resolve(true);
  }
}

/**
 * Roda cada caso pelo mesmo caso de uso da produção (HU21): regras rápidas, depois a plataforma
 * de IA com o prompt e a configuração versionados. Só o provedor muda: gravações no CI, a API
 * real com `--gravar`.
 */
export async function avaliar(
  casos: readonly CasoDeAvaliacao[],
  referencia: Referencia,
  provedor: ProvedorDaAvaliacao,
  relogio: Clock,
): Promise<ResultadoDoCaso[]> {
  const configuracao = configuracaoPadrao();
  const nomesDosProvedores = new Set(
    Object.values(configuracao.tarefas).flatMap((t) => t.modelos.map((m) => m.provedor)),
  );
  const plataforma = new PlataformaIa(
    configuracao,
    new Map([...nomesDosProvedores].map((nome) => [nome, provedor])),
  );
  const teores = new Map<Uuid, string>();
  const outbox = new OutboxEmMemoria();
  const classificar = new ClassificarPublicacao<TransacaoEmMemoria>({
    teores: { teor: (_t, id) => Promise.resolve(teores.get(id)) },
    regras: new RegrasEmMemoria(regrasRapidas(referencia)),
    taxonomia: { listar: () => Promise.resolve(tiposDaTaxonomia(referencia)) },
    ia: new ClassificadorIaPlataforma(plataforma, promptsPadrao()),
    classificacoes: new ClassificacoesDaAvaliacao(),
    outbox,
    relogio,
  });
  const resultados: ResultadoDoCaso[] = [];
  for (const [indice, caso] of casos.entries()) {
    const conteudoId = `00000000-0000-7000-8000-${String(indice + 1).padStart(12, '0')}` as Uuid;
    teores.set(conteudoId, caso.teor);
    provedor.casoAtual = caso.id;
    const antes = provedor.chamadas.length;
    try {
      const classificacao = await outbox.executar((t) =>
        classificar.executar(t, { tenantId: TENANT_DA_AVALIACAO, payload: { conteudoId } }),
      );
      const chamadas = provedor.chamadas.slice(antes);
      resultados.push(
        classificacao === undefined
          ? { caso, semGravacao: false, chamadas }
          : { caso, classificacao, semGravacao: false, chamadas },
      );
    } catch (erro) {
      // Só a falta de gravação vira resultado; o resto (rede, credencial) derruba a avaliação.
      if (!(erro instanceof SemGravacao)) throw erro;
      resultados.push({ caso, semGravacao: true, chamadas: provedor.chamadas.slice(antes) });
    }
  }
  return resultados;
}
