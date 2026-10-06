import { err, gerarUuidV7, NaoAutenticado, ok } from '@pz/kernel';

import { normalizarEmail, validarNovaSenha } from '../domain/credenciais.js';
import { estaAtiva, expiracao, registrarUso } from '../domain/sessao.js';

import type {
  ArmazemDeSessoes,
  GeradorDeTokens,
  HasherDeSenha,
  RepositorioDeCredenciais,
} from './portas.js';
import type { Sessao } from '../domain/sessao.js';
import type { Clock, Result, Uuid, Validacao } from '@pz/kernel';

/** Mensagem única para qualquer falha de login: não revela se o e-mail existe. */
const credenciaisInvalidas = () =>
  new NaoAutenticado('credenciais-invalidas', 'E-mail ou senha inválidos.');
const sessaoInvalida = () => new NaoAutenticado('sessao-invalida', 'Sessão expirada ou inválida.');

export interface SessaoCriada {
  readonly token: string;
  readonly sessao: Sessao;
}

/**
 * Login com e-mail e senha (HU06). Sempre executa a verificação do hash, mesmo sem usuário
 * (contra um hash fictício): o tempo de resposta não revela quais e-mails existem.
 * A sessão nasce no nível `senha`; o 2FA a eleva para `completo`.
 */
export class Autenticar {
  #hashFicticio: Promise<string> | undefined;

  constructor(
    private readonly credenciais: RepositorioDeCredenciais,
    private readonly hasher: HasherDeSenha,
    private readonly sessoes: ArmazemDeSessoes,
    private readonly tokens: GeradorDeTokens,
    private readonly relogio: Clock,
  ) {}

  async executar(entrada: {
    readonly email: string;
    readonly senha: string;
  }): Promise<Result<SessaoCriada, NaoAutenticado>> {
    const email = normalizarEmail(entrada.email);
    const credencial = email.ok ? await this.credenciais.localizarPorEmail(email.valor) : undefined;
    this.#hashFicticio ??= this.hasher.gerar(this.tokens.novoToken());
    const hash = credencial?.senhaHash ?? (await this.#hashFicticio);
    const senhaConfere = await this.hasher.verificar(hash, entrada.senha);
    const temSenha = typeof credencial?.senhaHash === 'string';
    if (credencial === undefined || !temSenha || !senhaConfere) {
      return err(credenciaisInvalidas());
    }
    const agora = this.relogio.agora();
    const sessao: Sessao = {
      id: gerarUuidV7(this.relogio),
      usuarioId: credencial.usuarioId,
      tenantId: credencial.tenantId,
      nivel: 'senha',
      criadaEm: agora,
      ultimoUso: agora,
    };
    const token = this.tokens.novoToken();
    await this.sessoes.gravar(token, sessao, expiracao(sessao));
    return ok({ token, sessao });
  }
}

/** Valida o token de uma requisição e renova a janela de inatividade. */
export class ValidarSessao {
  constructor(
    private readonly sessoes: ArmazemDeSessoes,
    private readonly relogio: Clock,
  ) {}

  async executar(token: string): Promise<Result<Sessao, NaoAutenticado>> {
    const sessao = await this.sessoes.obter(token);
    if (sessao === undefined) return err(sessaoInvalida());
    const agora = this.relogio.agora();
    if (!estaAtiva(sessao, agora)) {
      await this.sessoes.remover(token);
      return err(sessaoInvalida());
    }
    const usada = registrarUso(sessao, agora);
    await this.sessoes.gravar(token, usada, expiracao(usada));
    return ok(usada);
  }
}

export class EncerrarSessao {
  constructor(private readonly sessoes: ArmazemDeSessoes) {}

  executar(token: string): Promise<void> {
    return this.sessoes.remover(token);
  }
}

/**
 * Define (ou troca) a senha do usuário e revoga todas as sessões dele: quem tinha a senha
 * antiga perde o acesso na hora.
 */
export class RegistrarCredencial {
  constructor(
    private readonly credenciais: RepositorioDeCredenciais,
    private readonly hasher: HasherDeSenha,
    private readonly sessoes: ArmazemDeSessoes,
  ) {}

  async executar(usuarioId: Uuid, senha: string): Promise<Result<void, Validacao>> {
    const valida = validarNovaSenha(senha);
    if (!valida.ok) return valida;
    await this.credenciais.definirSenha(usuarioId, await this.hasher.gerar(valida.valor));
    await this.sessoes.removerTodasDoUsuario(usuarioId);
    return ok(undefined);
  }
}
