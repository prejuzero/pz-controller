import { LocalDate } from '@pz/kernel';

import type {
  AlvoDevido,
  AlvoParaEntrega,
  RepositorioDaCaptura,
  RepositorioDeAssinaturas,
} from '../application/portas.js';
import type { JanelaDaCaptura, TipoDeAlvo } from '../domain/alvo.js';
import type { Transacao } from '@pz/db';
import type { Instant, Uuid } from '@pz/kernel';

const paraData = (data: LocalDate) => new Date(Date.UTC(data.ano, data.mes - 1, data.dia));
const deData = (data: Date) =>
  LocalDate.de(data.getUTCFullYear(), data.getUTCMonth() + 1, data.getUTCDate());

/** Assinaturas no tenant da transação (RLS); o alvo, global, é criado sob demanda. */
export class AssinaturasPostgres implements RepositorioDeAssinaturas<Transacao> {
  async obterOuCriarAlvo(
    tx: Transacao,
    tipo: TipoDeAlvo,
    valor: string,
    idNovo: Uuid,
  ): Promise<Uuid> {
    // ON CONFLICT: dois tenants assinando a mesma OAB ao mesmo tempo ficam com o mesmo alvo.
    const [linha] = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO alvo_monitoramento (id, tipo, valor) VALUES (${idNovo}::uuid, ${tipo}::tipo_alvo, ${valor})
      ON CONFLICT (tipo, valor) DO UPDATE SET valor = EXCLUDED.valor
      RETURNING id`;
    if (linha === undefined) throw new Error('alvo_monitoramento sem id após o upsert');
    return linha.id as Uuid;
  }

  async assinar(tx: Transacao, alvoId: Uuid, tenantId: Uuid, referencia: Uuid): Promise<void> {
    await tx.alvoAssinante.createMany({
      data: [{ alvoId, tenantId, referencia }],
      skipDuplicates: true,
    });
  }

  async desassinar(
    tx: Transacao,
    tipo: TipoDeAlvo,
    valor: string,
    tenantId: Uuid,
    referencia: Uuid,
  ): Promise<void> {
    await tx.alvoAssinante.deleteMany({ where: { tenantId, referencia, alvo: { tipo, valor } } });
  }
}

/** Planejamento e entrega, na transação do papel sistema (atravessa tenants). */
export class CapturaPostgres implements RepositorioDaCaptura<Transacao> {
  async devidos(tx: Transacao, agora: Instant): Promise<AlvoDevido[]> {
    const linhas = await tx.alvoMonitoramento.findMany({
      where: {
        ativo: true,
        assinantes: { some: {} },
        OR: [{ proximaExecucao: null }, { proximaExecucao: { lte: new Date(agora.epochMs) } }],
      },
      select: { id: true, tipo: true, valor: true, ultimaJanelaFim: true },
      orderBy: { id: 'asc' },
    });
    return linhas.map((l) => ({
      id: l.id as Uuid,
      tipo: l.tipo,
      valor: l.valor,
      ...(l.ultimaJanelaFim === null ? {} : { ultimaJanelaFim: deData(l.ultimaJanelaFim) }),
    }));
  }

  async travar(tx: Transacao, alvoId: Uuid): Promise<AlvoParaEntrega | undefined> {
    const [alvo] = await tx.$queryRaw<
      {
        id: string;
        tipo: TipoDeAlvo;
        valor: string;
        ultima_chave: string | null;
        falhas_consecutivas: number;
      }[]
    >`SELECT id, tipo::text AS tipo, valor, ultima_chave, falhas_consecutivas
      FROM alvo_monitoramento WHERE id = ${alvoId}::uuid FOR UPDATE`;
    if (alvo === undefined) return undefined;
    const assinaturas = await tx.alvoAssinante.findMany({
      where: { alvoId },
      select: { tenantId: true, referencia: true },
      orderBy: [{ tenantId: 'asc' }, { referencia: 'asc' }],
    });
    const porTenant = new Map<Uuid, Uuid[]>();
    for (const { tenantId, referencia } of assinaturas) {
      porTenant.set(tenantId as Uuid, [
        ...(porTenant.get(tenantId as Uuid) ?? []),
        referencia as Uuid,
      ]);
    }
    return {
      id: alvo.id as Uuid,
      tipo: alvo.tipo,
      valor: alvo.valor,
      ...(alvo.ultima_chave === null ? {} : { ultimaChave: alvo.ultima_chave }),
      falhasConsecutivas: alvo.falhas_consecutivas,
      assinantes: [...porTenant].map(([tenantId, referencias]) => ({ tenantId, referencias })),
    };
  }

  async registrarSucesso(
    tx: Transacao,
    alvoId: Uuid,
    em: Instant,
    janela: JanelaDaCaptura,
    chave: string,
  ): Promise<void> {
    await tx.alvoMonitoramento.update({
      where: { id: alvoId },
      data: {
        ultimoSucesso: new Date(em.epochMs),
        ultimaJanelaFim: paraData(janela.fim),
        ultimaChave: chave,
        falhasConsecutivas: 0,
        proximaExecucao: null,
      },
    });
  }

  async registrarFalha(
    tx: Transacao,
    alvoId: Uuid,
    falhas: number,
    proximaExecucao: Instant,
  ): Promise<void> {
    await tx.alvoMonitoramento.update({
      where: { id: alvoId },
      data: { falhasConsecutivas: falhas, proximaExecucao: new Date(proximaExecucao.epochMs) },
    });
  }
}
