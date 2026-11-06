import { Instant } from '@pz/kernel';

import { hashDoToken } from './tokens.js';

import type {
  Convite,
  ConviteLocalizado,
  Membro,
  PerfilDaEquipe,
  DadosDosConvites,
  RepositorioDaEquipe,
} from '../application/equipe.js';
import type { Banco, Transacao } from '@pz/db';
import type { Uuid } from '@pz/kernel';

const instante = (d: Date) => Instant.deEpochMs(d.getTime());

/**
 * Equipe do escritório no PostgreSQL (HU41), na transação do tenant (RLS). O aceite localiza o
 * convite por `pz_localizar_convite` (função restrita, como o login): a api segue sem BYPASSRLS.
 */
export class EquipePostgres implements RepositorioDaEquipe<Transacao> {
  constructor(private readonly banco: Banco) {}

  async membros(tx: Transacao): Promise<Membro[]> {
    const linhas = await tx.usuario.findMany({
      orderBy: [{ criadoEm: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        nome: true,
        email: true,
        criadoEm: true,
        desativadoEm: true,
        perfis: { select: { perfil: true }, orderBy: { perfil: 'asc' } },
      },
    });
    return linhas.map((l) => ({
      usuarioId: l.id as Uuid,
      nome: l.nome,
      email: l.email,
      perfis: l.perfis.map((p) => p.perfil),
      criadoEm: instante(l.criadoEm),
      desativadoEm: l.desativadoEm === null ? null : instante(l.desativadoEm),
    }));
  }

  async convitesAbertos(tx: Transacao, agora: Instant): Promise<Convite[]> {
    const linhas = await tx.conviteMembro.findMany({
      where: { aceitoEm: null, canceladoEm: null, expiraEm: { gt: new Date(agora.epochMs) } },
      orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
    });
    return linhas.map((l) => ({
      id: l.id as Uuid,
      tenantId: l.tenantId as Uuid,
      email: l.email,
      nome: l.nome,
      perfil: l.perfil as PerfilDaEquipe,
      criadoPor: l.criadoPor as Uuid,
      criadoEm: instante(l.criadoEm),
      expiraEm: instante(l.expiraEm),
    }));
  }

  async inserirConvite(tx: Transacao, c: Convite, token: string): Promise<boolean> {
    // Convite vencido e ainda aberto não bloqueia um novo para o mesmo e-mail.
    await tx.conviteMembro.updateMany({
      where: {
        email: { equals: c.email, mode: 'insensitive' },
        aceitoEm: null,
        canceladoEm: null,
        expiraEm: { lte: new Date(c.criadoEm.epochMs) },
      },
      data: { canceladoEm: new Date(c.criadoEm.epochMs) },
    });
    const { count } = await tx.conviteMembro.createMany({
      data: [
        {
          id: c.id,
          tenantId: c.tenantId,
          email: c.email,
          nome: c.nome,
          perfil: c.perfil,
          tokenHash: hashDoToken(token),
          criadoPor: c.criadoPor,
          expiraEm: new Date(c.expiraEm.epochMs),
          criadoEm: new Date(c.criadoEm.epochMs),
        },
      ],
      skipDuplicates: true,
    });
    return count > 0;
  }

  async cancelarConvite(tx: Transacao, id: Uuid, agora: Instant): Promise<boolean> {
    const { count } = await tx.conviteMembro.updateMany({
      where: { id, aceitoEm: null, canceladoEm: null },
      data: { canceladoEm: new Date(agora.epochMs) },
    });
    return count > 0;
  }

  async localizarConvite(token: string): Promise<ConviteLocalizado | undefined> {
    const [linha] = await this.banco.executarSemTenant(
      'equipe: localizar convite',
      (tx) =>
        tx.$queryRaw<
          {
            id: string;
            tenant_id: string;
            email: string;
            nome: string;
            perfil: string;
            expira_em: Date;
            aberto: boolean;
            tenant_suspenso: boolean;
          }[]
        >`SELECT id, tenant_id, email, nome, perfil, expira_em, aberto, tenant_suspenso FROM pz_localizar_convite(${hashDoToken(token)})`,
    );
    return linha === undefined
      ? undefined
      : {
          id: linha.id as Uuid,
          tenantId: linha.tenant_id as Uuid,
          email: linha.email,
          nome: linha.nome,
          perfil: linha.perfil as PerfilDaEquipe,
          expiraEm: instante(linha.expira_em),
          aberto: linha.aberto,
          tenantSuspenso: linha.tenant_suspenso,
        };
  }

  async aceitar(
    tx: Transacao,
    convite: ConviteLocalizado,
    usuario: { readonly id: Uuid; readonly senhaHash: string },
    agora: Instant,
  ): Promise<void> {
    const em = new Date(agora.epochMs);
    await tx.usuario.create({
      data: {
        id: usuario.id,
        tenantId: convite.tenantId,
        nome: convite.nome,
        email: convite.email,
        senhaHash: usuario.senhaHash,
        emailVerificadoEm: em,
      },
    });
    await tx.usuarioPerfil.create({
      data: { tenantId: convite.tenantId, usuarioId: usuario.id, perfil: convite.perfil },
    });
    await tx.conviteMembro.update({
      where: { id: convite.id },
      data: { aceitoEm: em, usuarioId: usuario.id },
    });
  }

  async definirPerfis(tx: Transacao, usuarioId: Uuid, perfis: readonly string[]): Promise<void> {
    const atuais = await tx.usuarioPerfil.findMany({
      where: { usuarioId },
      select: { perfil: true },
    });
    const remover = atuais.map((a) => a.perfil).filter((p) => !perfis.includes(p));
    if (remover.length > 0) {
      await tx.usuarioPerfil.deleteMany({ where: { usuarioId, perfil: { in: remover } } });
    }
    const tenant = await tx.usuario.findUniqueOrThrow({
      where: { id: usuarioId },
      select: { tenantId: true },
    });
    await tx.usuarioPerfil.createMany({
      data: perfis.map((perfil) => ({ tenantId: tenant.tenantId, usuarioId, perfil })),
      skipDuplicates: true,
    });
  }

  async desativar(tx: Transacao, usuarioId: Uuid, agora: Instant): Promise<boolean> {
    const { count } = await tx.usuario.updateMany({
      where: { id: usuarioId, desativadoEm: null },
      data: { desativadoEm: new Date(agora.epochMs) },
    });
    return count > 0;
  }
}

/** Nome e e-mail do convite, no tenant do evento (worker). */
export class DadosDosConvitesPostgres implements DadosDosConvites<Transacao> {
  async doConvite(tx: Transacao, conviteId: Uuid) {
    const linha = await tx.conviteMembro.findUnique({
      where: { id: conviteId },
      select: { email: true, nome: true, aceitoEm: true, canceladoEm: true },
    });
    // Cancelado ou já aceito antes do envio: não manda o link.
    if (linha?.aceitoEm !== null || linha.canceladoEm !== null) return undefined;
    return { email: linha.email, nome: linha.nome };
  }
}
