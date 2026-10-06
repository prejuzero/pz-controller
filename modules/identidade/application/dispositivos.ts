import { err, gerarUuidV7, NaoAutenticado, NaoEncontrado, ok } from '@pz/kernel';

import { expiracao } from '../domain/sessao.js';

import type {
  ArmazemDeRenovacoes,
  ArmazemDeSessoes,
  DadosDaRenovacao,
  Dispositivo,
  GeradorDeTokens,
  PublicadorDeEventos,
  RepositorioDeDispositivos,
  TipoCliente,
} from './portas.js';
import type { NoTenant } from './redefinicao.js';
import type { Sessao } from '../domain/sessao.js';
import type { Clock, Instant, Result, Uuid } from '@pz/kernel';

/** Acesso curto limita o estrago de um token vazado; a renovação rotativa mantém o app logado. */
export const VALIDADE_DO_ACESSO_MS = 15 * 60_000;
export const VALIDADE_DA_RENOVACAO_MS = 30 * 24 * 3600 * 1000;

export interface TokensDeDispositivo {
  readonly dispositivoId: Uuid;
  readonly tokenDeAcesso: string;
  readonly acessoExpiraEm: Instant;
  readonly tokenDeRenovacao: string;
  readonly renovacaoExpiraEm: Instant;
}

const renovacaoInvalida = () =>
  new NaoAutenticado('renovacao-invalida', 'Sessão do dispositivo expirada ou revogada.');

/** Emite o par de tokens de um dispositivo (sessão de acesso curta + renovação). */
class EmissorDeTokens {
  constructor(
    private readonly sessoes: ArmazemDeSessoes,
    private readonly renovacoes: ArmazemDeRenovacoes,
    private readonly tokens: GeradorDeTokens,
    private readonly relogio: Clock,
  ) {}

  async emitir(dados: DadosDaRenovacao): Promise<TokensDeDispositivo> {
    const agora = this.relogio.agora();
    const acesso: Sessao = {
      id: gerarUuidV7(this.relogio),
      usuarioId: dados.usuarioId,
      tenantId: dados.tenantId,
      nivel: 'completo',
      segundoFatorAtivo: true,
      criadaEm: agora,
      ultimoUso: agora,
      dispositivoId: dados.dispositivoId,
      expiraAte: agora.maisMs(VALIDADE_DO_ACESSO_MS),
    };
    const [tokenDeAcesso, tokenDeRenovacao] = [this.tokens.novoToken(), this.tokens.novoToken()];
    const renovacaoExpiraEm = agora.maisMs(VALIDADE_DA_RENOVACAO_MS);
    await this.sessoes.gravar(tokenDeAcesso, acesso, expiracao(acesso));
    await this.renovacoes.emitir(tokenDeRenovacao, dados, renovacaoExpiraEm);
    return {
      dispositivoId: dados.dispositivoId,
      tokenDeAcesso,
      acessoExpiraEm: expiracao(acesso),
      tokenDeRenovacao,
      renovacaoExpiraEm,
    };
  }
}

function evento(
  tipo: 'DispositivoRegistrado' | 'SessaoRevogada',
  dados: DadosDaRenovacao,
  payload: Record<string, string>,
  relogio: Clock,
) {
  return {
    id: gerarUuidV7(relogio),
    tipo,
    versao: 1,
    tenantId: dados.tenantId,
    agregadoId: dados.dispositivoId,
    ocorridoEm: relogio.agora(),
    payload: { dispositivoId: dados.dispositivoId, usuarioId: dados.usuarioId, ...payload },
  };
}

/**
 * Registra um dispositivo para a sessão completa (senha + 2FA) e emite os tokens dele. Base do
 * servidor OAuth 2.1 que chega com o primeiro cliente externo (HU49/HU60).
 */
export class RegistrarDispositivo {
  readonly #emissor: EmissorDeTokens;

  constructor(
    private readonly dispositivos: RepositorioDeDispositivos,
    sessoes: ArmazemDeSessoes,
    renovacoes: ArmazemDeRenovacoes,
    tokens: GeradorDeTokens,
    private readonly publicador: PublicadorDeEventos,
    private readonly relogio: Clock,
  ) {
    this.#emissor = new EmissorDeTokens(sessoes, renovacoes, tokens, relogio);
  }

  async executar(
    sessao: Sessao,
    entrada: { readonly tipoCliente: TipoCliente; readonly nome: string },
  ): Promise<TokensDeDispositivo> {
    const agora = this.relogio.agora();
    const dispositivo: Dispositivo = {
      id: gerarUuidV7(this.relogio),
      usuarioId: sessao.usuarioId,
      tenantId: sessao.tenantId,
      tipoCliente: entrada.tipoCliente,
      nome: entrada.nome.trim().slice(0, 100),
      criadoEm: agora,
      ultimoUso: agora,
    };
    await this.dispositivos.registrar(dispositivo);
    const dados = {
      dispositivoId: dispositivo.id,
      usuarioId: sessao.usuarioId,
      tenantId: sessao.tenantId,
    };
    await this.publicador.publicar(sessao.tenantId, [
      evento('DispositivoRegistrado', dados, { tipoCliente: entrada.tipoCliente }, this.relogio),
    ]);
    return this.#emissor.emitir(dados);
  }
}

/** Troca o token de renovação por um par novo; reuso revoga o dispositivo inteiro. */
export class RenovarTokens {
  readonly #emissor: EmissorDeTokens;

  constructor(
    private readonly dispositivos: RepositorioDeDispositivos,
    private readonly sessoes: ArmazemDeSessoes,
    private readonly renovacoes: ArmazemDeRenovacoes,
    tokens: GeradorDeTokens,
    private readonly publicador: PublicadorDeEventos,
    private readonly relogio: Clock,
    private readonly noTenant: NoTenant,
  ) {
    this.#emissor = new EmissorDeTokens(sessoes, renovacoes, tokens, relogio);
  }

  async executar(tokenDeRenovacao: string): Promise<Result<TokensDeDispositivo, NaoAutenticado>> {
    const resultado = await this.renovacoes.consumir(tokenDeRenovacao);
    if (resultado.tipo === 'invalido') return err(renovacaoInvalida());
    const { dados } = resultado;
    if (resultado.tipo === 'reuso') {
      await revogarTudo(
        this.dispositivos,
        this.sessoes,
        this.renovacoes,
        this.relogio,
        dados,
        this.noTenant,
        true,
      );
      await this.publicador.publicar(dados.tenantId, [
        evento('SessaoRevogada', dados, { motivo: 'reuso-de-renovacao' }, this.relogio),
      ]);
      return err(renovacaoInvalida());
    }
    const ativo = await this.noTenant(dados.tenantId, () =>
      this.dispositivos.ativo(dados.dispositivoId, dados.usuarioId),
    );
    if (!ativo) return err(renovacaoInvalida());
    await this.noTenant(dados.tenantId, () =>
      this.dispositivos.registrarUso(dados.dispositivoId, this.relogio.agora()),
    );
    return ok(await this.#emissor.emitir(dados));
  }
}

async function revogarTudo(
  dispositivos: RepositorioDeDispositivos,
  sessoes: ArmazemDeSessoes,
  renovacoes: ArmazemDeRenovacoes,
  relogio: Clock,
  dados: DadosDaRenovacao,
  noTenant: NoTenant,
  /** No reuso os dados vêm do próprio token (confiáveis): limpa mesmo se já estava revogado. */
  mesmoJaRevogado = false,
): Promise<boolean> {
  const revogado = await noTenant(dados.tenantId, () =>
    dispositivos.revogar(dados.dispositivoId, dados.usuarioId, relogio.agora()),
  );
  // Sem isso, um usuário apagaria os tokens do dispositivo de outro só sabendo o ID.
  if (!revogado && !mesmoJaRevogado) return false;
  await sessoes.removerTodasDoDispositivo(dados.dispositivoId);
  await renovacoes.revogarDoDispositivo(dados.dispositivoId);
  return revogado;
}

export class ListarDispositivos {
  constructor(private readonly dispositivos: RepositorioDeDispositivos) {}

  executar(sessao: Sessao): Promise<Dispositivo[]> {
    return this.dispositivos.listar(sessao.usuarioId);
  }
}

/** Revogação remota (Configurações > Segurança): derruba acesso e renovação na hora. */
export class RevogarDispositivo {
  constructor(
    private readonly dispositivos: RepositorioDeDispositivos,
    private readonly sessoes: ArmazemDeSessoes,
    private readonly renovacoes: ArmazemDeRenovacoes,
    private readonly publicador: PublicadorDeEventos,
    private readonly relogio: Clock,
  ) {}

  async executar(sessao: Sessao, dispositivoId: Uuid): Promise<Result<void, NaoEncontrado>> {
    const dados = { dispositivoId, usuarioId: sessao.usuarioId, tenantId: sessao.tenantId };
    const naoTenant: NoTenant = (_tenant, trabalho) => trabalho(); // já no tenant da sessão
    const revogado = await revogarTudo(
      this.dispositivos,
      this.sessoes,
      this.renovacoes,
      this.relogio,
      dados,
      naoTenant,
    );
    if (!revogado)
      return err(new NaoEncontrado('dispositivo-nao-encontrado', 'Dispositivo não encontrado.'));
    await this.publicador.publicar(sessao.tenantId, [
      evento('SessaoRevogada', dados, { motivo: 'usuario' }, this.relogio),
    ]);
    return ok(undefined);
  }
}
