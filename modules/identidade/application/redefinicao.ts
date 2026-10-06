import { err, gerarUuidV7, NaoAutenticado, ok } from '@pz/kernel';

import { normalizarEmail, validarNovaSenha } from '../domain/credenciais.js';

import type {
  Cifra,
  ControleDeTentativas,
  PublicadorDeEventos,
  GeradorDeTokens,
  RepositorioDeCredenciais,
} from './portas.js';
import type { RegistrarCredencial } from './sessoes.js';
import type { Email } from '../domain/credenciais.js';
import type { Clock, Instant, Result, Uuid, Validacao } from '@pz/kernel';

/** Token de redefinição: uso único, 30 min (HU06). */
export const VALIDADE_DA_REDEFINICAO_MS = 30 * 60_000;

export interface PedidoDeRedefinicao {
  readonly usuarioId: Uuid;
  readonly tenantId: Uuid;
  readonly email: Email;
}

/** Só o hash do token é guardado; um pedido novo invalida o anterior do mesmo usuário. */
export interface ArmazemDeRedefinicoes {
  guardar(token: string, pedido: PedidoDeRedefinicao, expiraEm: Instant): Promise<void>;
  /** Consome o token (uso único); undefined se não existe, expirou ou já foi usado. */
  consumir(token: string): Promise<PedidoDeRedefinicao | undefined>;
}

/** Executa um trabalho no tenant (RLS); a infra liga ao contexto do banco. */
export type NoTenant = <Resultado>(
  tenantId: Uuid,
  trabalho: () => Promise<Resultado>,
) => Promise<Resultado>;

/**
 * "Esqueci a senha": se o e-mail existe, gera o token, guarda o hash e publica o evento com o
 * token cifrado (o worker envia o e-mail). A resposta é sempre a mesma: não revela contas.
 */
export class SolicitarRedefinicaoDeSenha {
  constructor(
    private readonly credenciais: RepositorioDeCredenciais,
    private readonly redefinicoes: ArmazemDeRedefinicoes,
    private readonly tokens: GeradorDeTokens,
    private readonly cifra: Cifra,
    private readonly publicador: PublicadorDeEventos,
    private readonly relogio: Clock,
  ) {}

  async executar(emailInformado: string): Promise<void> {
    const email = normalizarEmail(emailInformado);
    if (!email.ok) return;
    const credencial = await this.credenciais.localizarPorEmail(email.valor);
    if (credencial === undefined) return;
    const token = this.tokens.novoToken();
    const agora = this.relogio.agora();
    await this.redefinicoes.guardar(
      token,
      { usuarioId: credencial.usuarioId, tenantId: credencial.tenantId, email: email.valor },
      agora.maisMs(VALIDADE_DA_REDEFINICAO_MS),
    );
    await this.publicador.publicar(credencial.tenantId, [
      {
        id: gerarUuidV7(this.relogio),
        tipo: 'RedefinicaoDeSenhaSolicitada',
        versao: 1,
        tenantId: credencial.tenantId,
        agregadoId: credencial.usuarioId,
        ocorridoEm: agora,
        payload: { usuarioId: credencial.usuarioId, tokenCifrado: this.cifra.cifrar(token) },
      },
    ]);
  }
}

/**
 * Redefine a senha com o token do e-mail: valida a política antes de gastar o token, troca a
 * senha (revoga todas as sessões) e desbloqueia o login, já que o titular provou o e-mail.
 */
export class RedefinirSenha {
  constructor(
    private readonly redefinicoes: ArmazemDeRedefinicoes,
    private readonly registrar: RegistrarCredencial,
    private readonly tentativas: ControleDeTentativas,
    private readonly noTenant: NoTenant,
  ) {}

  async executar(
    token: string,
    novaSenha: string,
  ): Promise<Result<void, NaoAutenticado | Validacao>> {
    const politica = validarNovaSenha(novaSenha);
    if (!politica.ok) return politica;
    const pedido = await this.redefinicoes.consumir(token);
    if (pedido === undefined) {
      return err(
        new NaoAutenticado('redefinicao-invalida', 'Link de redefinição inválido ou expirado.'),
      );
    }
    const resultado = await this.noTenant(pedido.tenantId, () =>
      this.registrar.executar(pedido.usuarioId, novaSenha),
    );
    if (!resultado.ok) return resultado;
    await this.tentativas.limpar(`login:${pedido.email}`);
    return ok(undefined);
  }
}

export type { PublicadorDeEventos } from './portas.js';
