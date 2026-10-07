import type { Transacao } from '@pz/db';

type Valor = string | number | boolean | null | readonly string[];
interface Secao {
  readonly nome: string;
  readonly linhas: readonly Readonly<Record<string, Valor>>[];
}
const iso = (data: Date | null) => data?.toISOString() ?? null;

/**
 * Dados da identidade para a exportação (HU38, LGPD): conta, perfis, acessos e dispositivos.
 * Nunca exporta hash de senha, segredo TOTP, códigos de recuperação nem tokens.
 */
export class ExportacaoDaIdentidadePostgres {
  async titular(tx: Transacao, usuarioId: string): Promise<Secao[]> {
    const usuario = await tx.usuario.findUnique({
      where: { id: usuarioId },
      select: {
        id: true,
        nome: true,
        email: true,
        emailVerificadoEm: true,
        totpAtivoEm: true,
        criadoEm: true,
      },
    });
    const [perfis, acessos, dispositivos] = await Promise.all([
      tx.usuarioPerfil.findMany({ where: { usuarioId }, select: { perfil: true, criadoEm: true } }),
      tx.acesso.findMany({ where: { usuarioId }, orderBy: { ocorridoEm: 'asc' } }),
      tx.sessaoDispositivo.findMany({ where: { usuarioId }, orderBy: { criadoEm: 'asc' } }),
    ]);
    return [
      {
        nome: 'conta',
        linhas:
          usuario === null
            ? []
            : [
                {
                  id: usuario.id,
                  nome: usuario.nome,
                  email: usuario.email,
                  emailVerificadoEm: iso(usuario.emailVerificadoEm),
                  segundoFatorAtivoDesde: iso(usuario.totpAtivoEm),
                  criadoEm: iso(usuario.criadoEm),
                },
              ],
      },
      { nome: 'perfis', linhas: perfis.map((p) => ({ perfil: p.perfil, desde: iso(p.criadoEm) })) },
      {
        nome: 'acessos',
        linhas: acessos.map((a) => ({
          tipo: a.tipo,
          sucesso: a.sucesso,
          ip: a.ip,
          navegador: a.userAgent,
          ocorridoEm: iso(a.ocorridoEm),
        })),
      },
      {
        nome: 'dispositivos',
        linhas: dispositivos.map((d) => ({
          tipo: d.tipoCliente,
          nome: d.nomeDispositivo,
          criadoEm: iso(d.criadoEm),
          ultimoUso: iso(d.ultimoUso),
          revogadoEm: iso(d.revogadaEm),
        })),
      },
    ];
  }

  async escritorio(tx: Transacao): Promise<Secao[]> {
    const usuarios = await tx.usuario.findMany({
      select: {
        id: true,
        nome: true,
        email: true,
        criadoEm: true,
        perfis: { select: { perfil: true } },
      },
      orderBy: { criadoEm: 'asc' },
    });
    return [
      {
        nome: 'usuarios',
        linhas: usuarios.map((u) => ({
          id: u.id,
          nome: u.nome,
          email: u.email,
          perfis: u.perfis.map((p) => p.perfil),
          criadoEm: iso(u.criadoEm),
        })),
      },
    ];
  }
}
