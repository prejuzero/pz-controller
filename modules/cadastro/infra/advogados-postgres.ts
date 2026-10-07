import { Instant } from '@pz/kernel';

import { Advogado } from '../domain/advogado.js';

import type { RepositorioDeAdvogados } from '../application/portas.js';
import type { Oab } from '../domain/advogado.js';
import type { Uf } from '../domain/valores.js';
import type { Transacao } from '@pz/db';
import type { Clock, Uuid } from '@pz/kernel';

const colunasDaOab = (tenantId: Uuid, advogadoId: Uuid, oab: Oab) => ({
  id: oab.id,
  tenantId,
  advogadoId,
  numero: oab.numero,
  uf: oab.uf,
  tipo: oab.tipo,
  ativa: oab.ativa,
});

/**
 * Advogados e OABs no PostgreSQL (HU11), no tenant da transação (RLS). `skipDuplicates` vira
 * `ON CONFLICT DO NOTHING`: um CPF ou uma OAB ativa de outro tenant não aborta a transação.
 */
export class AdvogadosPostgres implements RepositorioDeAdvogados<Transacao> {
  constructor(private readonly relogio: Clock) {}

  async inserir(tx: Transacao, advogado: Advogado): Promise<'ok' | 'cpf-em-uso' | 'oab-em-uso'> {
    const e = advogado.estado;
    const { count } = await tx.advogado.createMany({
      data: [
        {
          id: e.id,
          tenantId: e.tenantId,
          usuarioId: e.usuarioId,
          nome: e.nome,
          cpf: e.cpf,
          celular: e.celular,
          emailsAdicionais: [...e.emailsAdicionais],
        },
      ],
      skipDuplicates: true,
    });
    if (count === 0) return 'cpf-em-uso';
    const oabs = await tx.oab.createMany({
      data: e.oabs.map((oab) => colunasDaOab(e.tenantId, e.id, oab)),
      skipDuplicates: true,
    });
    return oabs.count === e.oabs.length ? 'ok' : 'oab-em-uso';
  }

  async buscarPorUsuario(tx: Transacao, usuarioId: Uuid): Promise<Advogado | undefined> {
    const linha = await tx.advogado.findUnique({
      where: { usuarioId },
      include: { oabs: { orderBy: [{ criadoEm: 'asc' }, { id: 'asc' }] } },
    });
    if (linha === null) return undefined;
    return Advogado.restaurar(
      {
        id: linha.id as Uuid,
        tenantId: linha.tenantId as Uuid,
        usuarioId: linha.usuarioId as Uuid,
        nome: linha.nome,
        cpf: linha.cpf,
        celular: linha.celular,
        emailsAdicionais: linha.emailsAdicionais,
        oabs: linha.oabs.map((oab) => ({
          id: oab.id as Uuid,
          numero: oab.numero,
          uf: oab.uf as Uf,
          tipo: oab.tipo,
          ativa: oab.ativa,
          ...(oab.removidaEm === null
            ? {}
            : { removidaEm: Instant.deEpochMs(oab.removidaEm.getTime()) }),
        })),
      },
      this.relogio,
    );
  }

  async salvarPerfil(tx: Transacao, advogado: Advogado): Promise<void> {
    const { id, nome, celular, emailsAdicionais } = advogado.estado;
    await tx.advogado.update({
      where: { id },
      data: { nome, celular, emailsAdicionais: [...emailsAdicionais] },
    });
  }

  async inserirOab(tx: Transacao, advogado: Advogado, oab: Oab): Promise<boolean> {
    const { count } = await tx.oab.createMany({
      data: [colunasDaOab(advogado.estado.tenantId, advogado.id, oab)],
      skipDuplicates: true,
    });
    return count === 1;
  }

  async desativarOab(tx: Transacao, oab: Oab): Promise<void> {
    await tx.oab.update({
      where: { id: oab.id },
      data: {
        ativa: false,
        removidaEm: new Date((oab.removidaEm ?? this.relogio.agora()).epochMs),
      },
    });
  }
}
