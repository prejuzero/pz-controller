import { Instant } from '@pz/kernel';

import type {
  Assinatura,
  Entrega,
  RepositorioDeAssinaturas,
  RepositorioDeEntregas,
  SituacaoDaEntrega,
  TentativaDeEntrega,
} from '../application/portas.js';
import type { EventoPublico } from '../domain/eventos-publicos.js';
import type { Transacao } from '@pz/db';
import type { Uuid } from '@pz/kernel';

type LinhaAssinatura = Awaited<ReturnType<Transacao['assinaturaWebhook']['findFirstOrThrow']>>;
type LinhaEntrega = Awaited<ReturnType<Transacao['entregaWebhook']['findFirstOrThrow']>>;
const instante = (d: Date) => Instant.deEpochMs(d.getTime());

const assinatura = (l: LinhaAssinatura): Assinatura => ({
  id: l.id as Uuid,
  tenantId: l.tenantId as Uuid,
  url: l.url,
  descricao: l.descricao,
  eventos: l.eventos as EventoPublico[],
  segredoCifrado: l.segredoCifrado,
  criadoPor: l.criadoPor as Uuid,
  criadoEm: instante(l.criadoEm),
  desativadaEm: l.desativadaEm === null ? null : instante(l.desativadaEm),
});

const entrega = (l: LinhaEntrega): Entrega => ({
  id: l.id as Uuid,
  tenantId: l.tenantId as Uuid,
  assinaturaId: l.assinaturaId as Uuid,
  eventoId: l.eventoId as Uuid,
  tipo: l.tipo,
  ocorridoEm: instante(l.ocorridoEm),
  dados: l.dados as Record<string, string | null>,
  situacao: l.situacao as SituacaoDaEntrega,
  tentativas: l.tentativas,
  ultimoStatus: l.ultimoStatus,
  ultimoErro: l.ultimoErro,
  entregueEm: l.entregueEm === null ? null : instante(l.entregueEm),
  criadoEm: instante(l.criadoEm),
});

/** Assinaturas do tenant da transação (RLS). Sem DELETE: desativar é estado. */
export class AssinaturasDeWebhookPostgres implements RepositorioDeAssinaturas<Transacao> {
  async inserir(tx: Transacao, a: Assinatura): Promise<void> {
    await tx.assinaturaWebhook.create({
      data: {
        id: a.id,
        tenantId: a.tenantId,
        url: a.url,
        descricao: a.descricao,
        eventos: [...a.eventos],
        segredoCifrado: a.segredoCifrado,
        criadoPor: a.criadoPor,
        criadoEm: new Date(a.criadoEm.epochMs),
      },
    });
  }

  async listar(tx: Transacao): Promise<Assinatura[]> {
    const linhas = await tx.assinaturaWebhook.findMany({
      orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
    });
    return linhas.map(assinatura);
  }

  async buscar(tx: Transacao, id: Uuid): Promise<Assinatura | undefined> {
    const l = await tx.assinaturaWebhook.findUnique({ where: { id } });
    return l === null ? undefined : assinatura(l);
  }

  async desativar(tx: Transacao, id: Uuid, agora: Instant): Promise<boolean> {
    const { count } = await tx.assinaturaWebhook.updateMany({
      where: { id, desativadaEm: null },
      data: { desativadaEm: new Date(agora.epochMs) },
    });
    return count > 0;
  }

  async ativasDoEvento(tx: Transacao, tipo: EventoPublico): Promise<Assinatura[]> {
    const linhas = await tx.assinaturaWebhook.findMany({
      where: { desativadaEm: null, eventos: { has: tipo } },
      orderBy: { id: 'asc' },
    });
    return linhas.map(assinatura);
  }
}

/** Entregas do tenant da transação (RLS). Uma por (assinatura, evento). */
export class EntregasDeWebhookPostgres implements RepositorioDeEntregas<Transacao> {
  async inserirSeNova(tx: Transacao, e: Entrega): Promise<boolean> {
    const { count } = await tx.entregaWebhook.createMany({
      data: [
        {
          id: e.id,
          tenantId: e.tenantId,
          assinaturaId: e.assinaturaId,
          eventoId: e.eventoId,
          tipo: e.tipo,
          ocorridoEm: new Date(e.ocorridoEm.epochMs),
          dados: { ...e.dados },
          criadoEm: new Date(e.criadoEm.epochMs),
        },
      ],
      skipDuplicates: true,
    });
    return count > 0;
  }

  async buscar(tx: Transacao, id: Uuid): Promise<Entrega | undefined> {
    const l = await tx.entregaWebhook.findUnique({ where: { id } });
    return l === null ? undefined : entrega(l);
  }

  async registrarTentativa(tx: Transacao, id: Uuid, t: TentativaDeEntrega): Promise<void> {
    await tx.entregaWebhook.update({
      where: { id },
      data: {
        situacao: t.situacao,
        ultimoStatus: t.status,
        ultimoErro: t.erro,
        ...(t.enviou ? { tentativas: { increment: 1 } } : {}),
        ...(t.situacao === 'entregue' ? { entregueEm: new Date(t.agora.epochMs) } : {}),
      },
    });
  }

  async reabrir(tx: Transacao, id: Uuid): Promise<boolean> {
    const { count } = await tx.entregaWebhook.updateMany({
      where: { id, situacao: 'falhou' },
      data: { situacao: 'pendente' },
    });
    return count > 0;
  }

  async listar(
    tx: Transacao,
    filtro: { readonly assinaturaId?: Uuid; readonly limite: number },
  ): Promise<Entrega[]> {
    const linhas = await tx.entregaWebhook.findMany({
      where: filtro.assinaturaId === undefined ? {} : { assinaturaId: filtro.assinaturaId },
      orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
      take: filtro.limite,
    });
    return linhas.map(entrega);
  }
}
