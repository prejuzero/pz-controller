import { err, gerarUuidV7, NaoAutenticado, ok } from '@pz/kernel';

import type { Cifra, GeradorDeTokens } from './portas.js';
import type { ArmazemDeRedefinicoes, NoTenant, PedidoDeRedefinicao } from './redefinicao.js';
import type { TrilhaDeAuditoria } from '@pz/auditoria';
import type { Clock, EventoDominio, Instant, Result, UnidadeDeTrabalho, Uuid } from '@pz/kernel';

/** Link de verificação do e-mail: uso único, 24 h (HU11). */
export const VALIDADE_DA_VERIFICACAO_MS = 24 * 60 * 60_000;

export type VerificacaoDeEmailSolicitada = EventoDominio<
  'VerificacaoDeEmailSolicitada',
  { usuarioId: Uuid; tokenCifrado: string }
>;

/** Porta: marca o e-mail do usuário como verificado, na transação (tenant corrente, RLS). */
export interface RepositorioDeVerificacaoDeEmail<Transacao> {
  marcarVerificado(transacao: Transacao, usuarioId: Uuid, em: Instant): Promise<void>;
}

/**
 * Prepara a verificação do e-mail (HU11): guarda o hash do token e devolve o evento com o token
 * cifrado, para quem chama gravar no outbox na mesma transação da criação da conta. O worker
 * envia o e-mail com o link.
 */
export class SolicitarVerificacaoDeEmail {
  constructor(
    private readonly verificacoes: ArmazemDeRedefinicoes,
    private readonly tokens: GeradorDeTokens,
    private readonly cifra: Cifra,
    private readonly relogio: Clock,
  ) {}

  async preparar(conta: PedidoDeRedefinicao): Promise<VerificacaoDeEmailSolicitada> {
    const token = this.tokens.novoToken();
    const agora = this.relogio.agora();
    await this.verificacoes.guardar(token, conta, agora.maisMs(VALIDADE_DA_VERIFICACAO_MS));
    return {
      id: gerarUuidV7(this.relogio),
      tipo: 'VerificacaoDeEmailSolicitada',
      versao: 1,
      tenantId: conta.tenantId,
      agregadoId: conta.usuarioId,
      ocorridoEm: agora,
      payload: { usuarioId: conta.usuarioId, tokenCifrado: this.cifra.cifrar(token) },
    };
  }
}

/** Confirma o e-mail com o token do link (POST /v1/email/verificar). */
export class VerificarEmail<Transacao> {
  constructor(
    private readonly verificacoes: ArmazemDeRedefinicoes,
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly usuarios: RepositorioDeVerificacaoDeEmail<Transacao>,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
    private readonly noTenant: NoTenant,
    private readonly relogio: Clock,
  ) {}

  async executar(token: string): Promise<Result<void, NaoAutenticado>> {
    const pedido = await this.verificacoes.consumir(token);
    if (pedido === undefined) {
      return err(
        new NaoAutenticado('verificacao-invalida', 'Link de verificação inválido ou expirado.'),
      );
    }
    const agora = this.relogio.agora();
    await this.noTenant(pedido.tenantId, () =>
      this.unidade.executar(async (transacao) => {
        await this.usuarios.marcarVerificado(transacao, pedido.usuarioId, agora);
        await this.trilha.registrar(
          transacao,
          {
            tipo: 'identidade.email-verificado',
            entidade: 'usuario',
            entidadeId: pedido.usuarioId,
            depois: { emailVerificadoEm: agora.toString() },
          },
          { canal: 'portal', usuarioId: pedido.usuarioId },
        );
      }),
    );
    return ok(undefined);
  }
}
