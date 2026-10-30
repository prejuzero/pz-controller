import { Instant } from '@pz/kernel';

import type {
  CasoCandidato,
  RepositorioDeCandidatos,
  StatusDoCandidato,
} from '../application/curadoria.js';
import type { Transacao } from '@pz/db';
import type { Uuid } from '@pz/kernel';

type Linha = Awaited<ReturnType<Transacao['casoCandidatoCuradoria']['findFirstOrThrow']>>;

const caso = (l: Linha): CasoCandidato => ({
  id: l.id as Uuid,
  conteudoId: l.conteudoId as Uuid,
  teorAnonimizado: l.teorAnonimizado,
  tipoAtoClassificado: l.tipoAtoClassificado,
  tipoAtoCorrigido: l.tipoAtoCorrigido,
  diasCitados: l.diasCitados,
  diasCorrigidos: l.diasCorrigidos,
  status: l.status,
  motivoDecisao: l.motivoDecisao,
  decididoPor: l.decididoPor as Uuid | null,
  decididoEm: l.decididoEm === null ? null : Instant.deEpochMs(l.decididoEm.getTime()),
});

/** Casos candidatos (tabela global `caso_candidato_curadoria`, sem DELETE). */
export class CandidatosPostgres implements RepositorioDeCandidatos<Transacao> {
  async classificacao(tx: Transacao, conteudoId: Uuid) {
    const l = await tx.classificacao.findUnique({
      where: { conteudoId },
      select: { tipoAto: true, prazoCitado: true },
    });
    if (l === null) return undefined;
    const citado = l.prazoCitado as { quantidade?: number } | null;
    return { tipoAto: l.tipoAto, diasCitados: citado?.quantidade ?? null };
  }

  async inserir(tx: Transacao, c: CasoCandidato): Promise<boolean> {
    // A mesma correção de novo (evento repetido ou outro escritório): fica o primeiro caso.
    const gravados = await tx.$executeRaw`
      INSERT INTO caso_candidato_curadoria (id, conteudo_id, teor_anonimizado, tipo_ato_classificado,
        tipo_ato_corrigido, dias_citados, dias_corrigidos)
      VALUES (${c.id}::uuid, ${c.conteudoId}::uuid, ${c.teorAnonimizado}, ${c.tipoAtoClassificado},
        ${c.tipoAtoCorrigido}, ${c.diasCitados}, ${c.diasCorrigidos})
      ON CONFLICT DO NOTHING`;
    return gravados === 1;
  }

  async buscar(tx: Transacao, id: Uuid): Promise<CasoCandidato | undefined> {
    const l = await tx.casoCandidatoCuradoria.findUnique({ where: { id } });
    return l === null ? undefined : caso(l);
  }

  async decidir(tx: Transacao, c: CasoCandidato): Promise<boolean> {
    if (c.decididoEm === null || c.status === 'pendente') return false;
    const { count } = await tx.casoCandidatoCuradoria.updateMany({
      where: { id: c.id, status: 'pendente' },
      data: {
        status: c.status,
        motivoDecisao: c.motivoDecisao,
        decididoPor: c.decididoPor,
        decididoEm: new Date(c.decididoEm.epochMs),
        teorAnonimizado: c.teorAnonimizado,
      },
    });
    return count === 1;
  }

  async listar(
    tx: Transacao,
    filtro: { readonly status?: StatusDoCandidato; readonly apos?: Uuid; readonly limite: number },
  ): Promise<CasoCandidato[]> {
    const linhas = await tx.casoCandidatoCuradoria.findMany({
      where: {
        ...(filtro.status === undefined ? {} : { status: filtro.status }),
        ...(filtro.apos === undefined ? {} : { id: { gt: filtro.apos } }),
      },
      orderBy: { id: 'asc' },
      take: filtro.limite,
    });
    return linhas.map(caso);
  }
}
