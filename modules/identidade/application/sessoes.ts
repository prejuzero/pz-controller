import { err, gerarUuidV7, NaoAutenticado, ok } from '@pz/kernel';

import { duracaoDoBloqueio } from '../domain/bloqueio.js';
import { normalizarEmail, validarNovaSenha } from '../domain/credenciais.js';
import { estaAtiva, expiracao, registrarUso } from '../domain/sessao.js';

import type {
  Acesso,
  ArmazemDeSessoes,
  ContextoDeAcesso,
  ControleDeTentativas,
  GeradorDeTokens,
  RegistroDeAcessos,
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
 * Porta dos provedores de identidade (HU06, ADR-005): hoje o local (senha + TOTP); OIDC e SAML
 * de escritórios entram na HU57 com a mesma sessão.
 */
export interface ProvedorIdentidade {
  readonly id: string;
  autenticar(
    credenciais: { readonly email: string; readonly senha: string },
    contexto: ContextoDeAcesso,
  ): Promise<Result<SessaoCriada, NaoAutenticado>>;
}

/** Proteção contra força bruta compartilhada pelo login e pelo 2FA (bloqueio + registro). */
export class ProtecaoDeAcesso {
  constructor(
    private readonly tentativas: ControleDeTentativas,
    private readonly acessos: RegistroDeAcessos,
    private readonly relogio: Clock,
  ) {}

  async bloqueado(chave: string): Promise<boolean> {
    const ate = await this.tentativas.bloqueadoAte(chave);
    return ate !== undefined && this.relogio.agora().ehAntesDe(ate);
  }

  /** Conta a falha; na 10ª, 20ª, 30ª... bloqueia (progressivo) e registra o bloqueio. */
  async falhou(chave: string, acesso?: Omit<Acesso, 'sucesso' | 'ocorridoEm'>): Promise<void> {
    const agora = this.relogio.agora();
    const duracao = duracaoDoBloqueio(await this.tentativas.registrarFalha(chave));
    if (duracao !== undefined) await this.tentativas.bloquear(chave, agora.maisMs(duracao));
    if (acesso === undefined) return;
    await this.acessos.registrar({ ...acesso, sucesso: false, ocorridoEm: agora });
    if (duracao !== undefined) {
      await this.acessos.registrar({
        ...acesso,
        tipo: 'bloqueio',
        sucesso: false,
        ocorridoEm: agora,
      });
    }
  }

  async passou(chave: string, acesso: Omit<Acesso, 'sucesso' | 'ocorridoEm'>): Promise<void> {
    await this.tentativas.limpar(chave);
    await this.acessos.registrar({ ...acesso, sucesso: true, ocorridoEm: this.relogio.agora() });
  }

  registrar(acesso: Omit<Acesso, 'ocorridoEm'>): Promise<void> {
    return this.acessos.registrar({ ...acesso, ocorridoEm: this.relogio.agora() });
  }
}

/**
 * Login com e-mail e senha (HU06). Sempre executa a verificação do hash, mesmo sem usuário
 * (contra um hash fictício): o tempo de resposta não revela quais e-mails existem.
 * A sessão nasce no nível `senha`; o 2FA a eleva para `completo`.
 */
export class Autenticar implements ProvedorIdentidade {
  readonly id = 'local';
  #hashFicticio: Promise<string> | undefined;

  constructor(
    private readonly credenciais: RepositorioDeCredenciais,
    private readonly hasher: HasherDeSenha,
    private readonly sessoes: ArmazemDeSessoes,
    private readonly tokens: GeradorDeTokens,
    private readonly relogio: Clock,
    private readonly protecao: ProtecaoDeAcesso,
  ) {}

  autenticar(
    credenciais: { readonly email: string; readonly senha: string },
    contexto: ContextoDeAcesso,
  ): Promise<Result<SessaoCriada, NaoAutenticado>> {
    return this.executar(credenciais, contexto);
  }

  /**
   * Conta bloqueada responde igual a senha errada (não revela o bloqueio a quem tenta) e não
   * entra nem com a senha certa até o bloqueio vencer.
   */
  async executar(
    entrada: { readonly email: string; readonly senha: string },
    contexto: ContextoDeAcesso,
  ): Promise<Result<SessaoCriada, NaoAutenticado>> {
    const email = normalizarEmail(entrada.email);
    const chave = `login:${email.ok ? email.valor : '(invalido)'}`;
    const bloqueado = email.ok && (await this.protecao.bloqueado(chave));
    const credencial = email.ok ? await this.credenciais.localizarPorEmail(email.valor) : undefined;
    this.#hashFicticio ??= this.hasher.gerar(this.tokens.novoToken());
    const hash = credencial?.senhaHash ?? (await this.#hashFicticio);
    const senhaConfere = await this.hasher.verificar(hash, entrada.senha);
    const temSenha = typeof credencial?.senhaHash === 'string';
    const acesso =
      credencial === undefined
        ? undefined
        : {
            usuarioId: credencial.usuarioId,
            tenantId: credencial.tenantId,
            tipo: 'login' as const,
            ...contexto,
          };
    if (credencial === undefined || !temSenha || !senhaConfere || bloqueado) {
      if (bloqueado) {
        if (acesso !== undefined) await this.protecao.registrar({ ...acesso, sucesso: false });
      } else if (email.ok) {
        await this.protecao.falhou(chave, acesso);
      }
      return err(credenciaisInvalidas());
    }
    await this.protecao.passou(chave, {
      ...acesso,
      usuarioId: credencial.usuarioId,
      tenantId: credencial.tenantId,
      tipo: 'login',
      ...contexto,
    });
    const agora = this.relogio.agora();
    const sessao: Sessao = {
      id: gerarUuidV7(this.relogio),
      usuarioId: credencial.usuarioId,
      tenantId: credencial.tenantId,
      nivel: 'senha',
      segundoFatorAtivo: credencial.segundoFatorAtivo,
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

/**
 * Eleva a sessão a `completo` depois do 2FA, trocando o token (o anterior deixa de valer): um
 * token capturado antes do 2FA não herda o acesso completo.
 */
export class ElevarSessao {
  constructor(
    private readonly sessoes: ArmazemDeSessoes,
    private readonly tokens: GeradorDeTokens,
    private readonly relogio: Clock,
  ) {}

  async executar(tokenAtual: string, sessao: Sessao): Promise<SessaoCriada> {
    const elevada: Sessao = {
      ...sessao,
      nivel: 'completo',
      segundoFatorAtivo: true,
      ultimoUso: this.relogio.agora(),
    };
    const token = this.tokens.novoToken();
    await this.sessoes.remover(tokenAtual);
    await this.sessoes.gravar(token, elevada, expiracao(elevada));
    return { token, sessao: elevada };
  }
}

export class EncerrarSessao {
  constructor(
    private readonly sessoes: ArmazemDeSessoes,
    private readonly protecao: ProtecaoDeAcesso,
  ) {}

  async executar(token: string, sessao: Sessao, contexto: ContextoDeAcesso): Promise<void> {
    await this.sessoes.remover(token);
    await this.protecao.registrar({
      usuarioId: sessao.usuarioId,
      tenantId: sessao.tenantId,
      tipo: 'logout',
      sucesso: true,
      ...contexto,
    });
  }
}

/** Últimos acessos do próprio usuário (Configurações > Segurança). */
export class ConsultarAcessos {
  constructor(private readonly acessos: RegistroDeAcessos) {}

  executar(sessao: Sessao): Promise<Acesso[]> {
    return this.acessos.ultimos(sessao.usuarioId, 20);
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
