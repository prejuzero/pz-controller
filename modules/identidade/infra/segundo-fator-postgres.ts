import type { DadosSegundoFator, RepositorioDeSegundoFator } from '../application/portas.js';
import type { Banco } from '@pz/db';
import type { Instant, Uuid } from '@pz/kernel';

/** 2FA no PostgreSQL, sempre no tenant do contexto (RLS). */
export class SegundoFatorPostgres implements RepositorioDeSegundoFator {
  constructor(private readonly banco: Banco) {}

  async obter(usuarioId: Uuid): Promise<DadosSegundoFator | undefined> {
    const linha = await this.banco.executar((tx) =>
      tx.usuario.findUnique({
        where: { id: usuarioId },
        select: { email: true, totpSegredoCifrado: true, totpAtivoEm: true, totpUltimoPasso: true },
      }),
    );
    if (linha === null) return undefined;
    return {
      email: linha.email,
      segredoCifrado: linha.totpSegredoCifrado,
      ativo: linha.totpAtivoEm !== null,
      ultimoPasso: linha.totpUltimoPasso === null ? null : Number(linha.totpUltimoPasso),
    };
  }

  async guardarSegredoPendente(usuarioId: Uuid, segredoCifrado: string): Promise<void> {
    await this.banco.executar((tx) =>
      tx.usuario.updateMany({
        where: { id: usuarioId, totpAtivoEm: null },
        data: { totpSegredoCifrado: segredoCifrado },
      }),
    );
  }

  async ativar(
    usuarioId: Uuid,
    passo: number,
    em: Instant,
    hashes: readonly string[],
  ): Promise<void> {
    await this.banco.executar((tx) =>
      tx.usuario.updateMany({
        where: { id: usuarioId, totpAtivoEm: null },
        data: {
          totpAtivoEm: new Date(em.epochMs),
          totpUltimoPasso: BigInt(passo),
          codigosRecuperacao: [...hashes],
        },
      }),
    );
  }

  async registrarPasso(usuarioId: Uuid, passo: number): Promise<boolean> {
    const linhas = await this.banco.executar(
      (tx) => tx.$executeRaw`
      UPDATE usuario SET totp_ultimo_passo = ${BigInt(passo)}
       WHERE id = ${usuarioId}::uuid
         AND (totp_ultimo_passo IS NULL OR totp_ultimo_passo < ${BigInt(passo)})`,
    );
    return linhas === 1;
  }

  async consumirCodigo(usuarioId: Uuid, hash: string): Promise<boolean> {
    const linhas = await this.banco.executar(
      (tx) => tx.$executeRaw`
      UPDATE usuario SET codigos_recuperacao = array_remove(codigos_recuperacao, ${hash})
       WHERE id = ${usuarioId}::uuid AND ${hash} = ANY(codigos_recuperacao)`,
    );
    return linhas === 1;
  }
}
