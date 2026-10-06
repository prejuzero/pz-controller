import { executarNoTenant } from '@pz/db';
import { gerarUuidV7, Instant } from '@pz/kernel';

import type { Acesso, RegistroDeAcessos, TipoAcesso } from '../application/portas.js';
import type { Banco } from '@pz/db';
import type { Uuid } from '@pz/kernel';

// O enum do Prisma não aceita hífen no nome: `segundo_fator` no código, 'segundo-fator' no banco.
const PARA_BANCO = {
  login: 'login',
  'segundo-fator': 'segundo_fator',
  logout: 'logout',
  bloqueio: 'bloqueio',
} as const;
const DO_BANCO: Record<string, TipoAcesso> = {
  login: 'login',
  segundo_fator: 'segundo-fator',
  logout: 'logout',
  bloqueio: 'bloqueio',
};

/** Registro de acessos (tabela `acesso`, com RLS por tenant). */
export class AcessosPostgres implements RegistroDeAcessos {
  constructor(private readonly banco: Banco) {}

  async registrar(acesso: Acesso): Promise<void> {
    await executarNoTenant(acesso.tenantId, () =>
      this.banco.executar((tx) =>
        tx.acesso.create({
          data: {
            id: gerarUuidV7(),
            tenantId: acesso.tenantId,
            usuarioId: acesso.usuarioId,
            tipo: PARA_BANCO[acesso.tipo],
            sucesso: acesso.sucesso,
            ip: acesso.ip.slice(0, 64),
            userAgent: acesso.userAgent.slice(0, 500),
            ocorridoEm: new Date(acesso.ocorridoEm.epochMs),
          },
        }),
      ),
    );
  }

  async ultimos(usuarioId: Uuid, limite: number): Promise<Acesso[]> {
    const linhas = await this.banco.executar((tx) =>
      tx.acesso.findMany({
        where: { usuarioId },
        orderBy: [{ ocorridoEm: 'desc' }, { id: 'desc' }],
        take: limite,
      }),
    );
    return linhas.map((linha) => ({
      usuarioId: linha.usuarioId as Uuid,
      tenantId: linha.tenantId as Uuid,
      tipo: DO_BANCO[linha.tipo] ?? 'login',
      sucesso: linha.sucesso,
      ip: linha.ip,
      userAgent: linha.userAgent,
      ocorridoEm: Instant.deEpochMs(linha.ocorridoEm.getTime()),
    }));
  }
}
