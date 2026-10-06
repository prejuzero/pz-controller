import { PERFIS_PADRAO } from '../domain/perfis.js';

import type { RepositorioDePerfis } from '../application/autorizacao.js';
import type { RepositorioDeTenants } from '../application/impersonacao.js';
import type {
  ArmazemDeRenovacoes,
  DadosDaRenovacao,
  Dispositivo,
  RepositorioDeDispositivos,
  ResultadoDaRenovacao,
  Acesso,
  ControleDeTentativas,
  RegistroDeAcessos,
  ArmazemDeSessoes,
  CredencialArmazenada,
  DadosSegundoFator,
  RepositorioDeCredenciais,
  RepositorioDeSegundoFator,
} from '../application/portas.js';
import type { PedidoDeRedefinicao } from '../application/redefinicao.js';
import type { Email } from '../domain/credenciais.js';
import type { CodigoPerfil } from '../domain/perfis.js';
import type { Sessao } from '../domain/sessao.js';
import type { EventoDominio, Instant, Uuid } from '@pz/kernel';

/** Credenciais em memória, para testes das apps (sem PostgreSQL). */
export class CredenciaisEmMemoria implements RepositorioDeCredenciais {
  readonly #porEmail = new Map<string, CredencialArmazenada>();

  cadastrar(email: Email, credencial: CredencialArmazenada): void {
    this.#porEmail.set(email, credencial);
  }

  localizarPorEmail(email: Email): Promise<CredencialArmazenada | undefined> {
    return Promise.resolve(this.#porEmail.get(email));
  }

  definirSenha(usuarioId: Uuid, senhaHash: string): Promise<void> {
    for (const [email, credencial] of this.#porEmail) {
      if (credencial.usuarioId === usuarioId)
        this.#porEmail.set(email, { ...credencial, senhaHash });
    }
    return Promise.resolve();
  }
}

/** Sessões em memória, para testes das apps (sem Redis). */
export class SessoesEmMemoria implements ArmazemDeSessoes {
  readonly #sessoes = new Map<string, Sessao>();

  gravar(token: string, sessao: Sessao): Promise<void> {
    this.#sessoes.set(token, sessao);
    return Promise.resolve();
  }

  obter(token: string): Promise<Sessao | undefined> {
    return Promise.resolve(this.#sessoes.get(token));
  }

  remover(token: string): Promise<void> {
    this.#sessoes.delete(token);
    return Promise.resolve();
  }

  removerTodasDoUsuario(usuarioId: Uuid): Promise<void> {
    for (const [token, sessao] of this.#sessoes) {
      if (sessao.usuarioId === usuarioId) this.#sessoes.delete(token);
    }
    return Promise.resolve();
  }

  removerTodasDoDispositivo(dispositivoId: Uuid): Promise<void> {
    for (const [token, sessao] of this.#sessoes) {
      if (sessao.dispositivoId === dispositivoId) this.#sessoes.delete(token);
    }
    return Promise.resolve();
  }
}

/** 2FA em memória, para testes das apps (sem PostgreSQL). */
export class SegundoFatorEmMemoria implements RepositorioDeSegundoFator {
  readonly #dados = new Map<string, DadosSegundoFator & { codigos: string[] }>();

  cadastrar(usuarioId: Uuid, email: string): void {
    this.#dados.set(usuarioId, {
      email,
      segredoCifrado: null,
      ativo: false,
      ultimoPasso: null,
      codigos: [],
    });
  }

  obter(usuarioId: Uuid): Promise<DadosSegundoFator | undefined> {
    return Promise.resolve(this.#dados.get(usuarioId));
  }

  guardarSegredoPendente(usuarioId: Uuid, segredoCifrado: string): Promise<void> {
    const dados = this.#dados.get(usuarioId);
    if (dados !== undefined && !dados.ativo)
      this.#dados.set(usuarioId, { ...dados, segredoCifrado });
    return Promise.resolve();
  }

  ativar(usuarioId: Uuid, passo: number, _em: Instant, hashes: readonly string[]): Promise<void> {
    const dados = this.#dados.get(usuarioId);
    if (dados !== undefined)
      this.#dados.set(usuarioId, {
        ...dados,
        ativo: true,
        ultimoPasso: passo,
        codigos: [...hashes],
      });
    return Promise.resolve();
  }

  registrarPasso(usuarioId: Uuid, passo: number): Promise<boolean> {
    const dados = this.#dados.get(usuarioId);
    if (dados === undefined || (dados.ultimoPasso !== null && passo <= dados.ultimoPasso))
      return Promise.resolve(false);
    this.#dados.set(usuarioId, { ...dados, ultimoPasso: passo });
    return Promise.resolve(true);
  }

  consumirCodigo(usuarioId: Uuid, hash: string): Promise<boolean> {
    const dados = this.#dados.get(usuarioId);
    if (dados?.codigos.includes(hash) !== true) return Promise.resolve(false);
    this.#dados.set(usuarioId, { ...dados, codigos: dados.codigos.filter((c) => c !== hash) });
    return Promise.resolve(true);
  }
}

/** Tentativas em memória (relógio injetado nos testes pelo `agora`). */
export class TentativasEmMemoria implements ControleDeTentativas {
  readonly #falhas = new Map<string, number>();
  readonly #bloqueios = new Map<string, Instant>();

  bloqueadoAte(chave: string): Promise<Instant | undefined> {
    return Promise.resolve(this.#bloqueios.get(chave));
  }

  registrarFalha(chave: string): Promise<number> {
    const falhas = (this.#falhas.get(chave) ?? 0) + 1;
    this.#falhas.set(chave, falhas);
    return Promise.resolve(falhas);
  }

  bloquear(chave: string, ate: Instant): Promise<void> {
    this.#bloqueios.set(chave, ate);
    return Promise.resolve();
  }

  limpar(chave: string): Promise<void> {
    this.#falhas.delete(chave);
    this.#bloqueios.delete(chave);
    return Promise.resolve();
  }
}

export class AcessosEmMemoria implements RegistroDeAcessos {
  readonly registrados: Acesso[] = [];

  registrar(acesso: Acesso): Promise<void> {
    this.registrados.push(acesso);
    return Promise.resolve();
  }

  ultimos(usuarioId: Uuid, limite: number): Promise<Acesso[]> {
    return Promise.resolve(
      this.registrados
        .filter((a) => a.usuarioId === usuarioId)
        .reverse()
        .slice(0, limite),
    );
  }
}

export class RedefinicoesEmMemoria {
  readonly #pedidos = new Map<string, PedidoDeRedefinicao>();

  guardar(token: string, pedido: PedidoDeRedefinicao): Promise<void> {
    for (const [chave, existente] of this.#pedidos)
      if (existente.usuarioId === pedido.usuarioId) this.#pedidos.delete(chave);
    this.#pedidos.set(token, pedido);
    return Promise.resolve();
  }

  consumir(token: string): Promise<PedidoDeRedefinicao | undefined> {
    const pedido = this.#pedidos.get(token);
    this.#pedidos.delete(token);
    return Promise.resolve(pedido);
  }
}

export class PublicadorEmMemoria {
  readonly publicados: EventoDominio[] = [];

  publicar(_tenantId: Uuid, eventos: readonly EventoDominio[]): Promise<void> {
    this.publicados.push(...eventos);
    return Promise.resolve();
  }
}

export class DispositivosEmMemoria implements RepositorioDeDispositivos {
  readonly #dispositivos = new Map<string, Dispositivo>();

  registrar(d: Dispositivo): Promise<void> {
    this.#dispositivos.set(d.id, d);
    return Promise.resolve();
  }

  listar(usuarioId: Uuid): Promise<Dispositivo[]> {
    return Promise.resolve(
      [...this.#dispositivos.values()].filter((d) => d.usuarioId === usuarioId),
    );
  }

  ativo(id: Uuid, usuarioId: Uuid): Promise<boolean> {
    const d = this.#dispositivos.get(id);
    return Promise.resolve(d?.usuarioId === usuarioId && d.revogadaEm === undefined);
  }

  registrarUso(id: Uuid, em: Instant): Promise<void> {
    const d = this.#dispositivos.get(id);
    if (d !== undefined) this.#dispositivos.set(id, { ...d, ultimoUso: em });
    return Promise.resolve();
  }

  revogar(id: Uuid, usuarioId: Uuid, em: Instant): Promise<boolean> {
    const d = this.#dispositivos.get(id);
    if (d?.usuarioId !== usuarioId || d.revogadaEm !== undefined) return Promise.resolve(false);
    this.#dispositivos.set(id, { ...d, revogadaEm: em });
    return Promise.resolve(true);
  }
}

export class RenovacoesEmMemoria implements ArmazemDeRenovacoes {
  readonly #validos = new Map<string, DadosDaRenovacao>();
  readonly #usados = new Map<string, DadosDaRenovacao>();

  emitir(token: string, dados: DadosDaRenovacao): Promise<void> {
    this.#validos.set(token, dados);
    return Promise.resolve();
  }

  consumir(token: string): Promise<ResultadoDaRenovacao> {
    const dados = this.#validos.get(token);
    if (dados !== undefined) {
      this.#validos.delete(token);
      this.#usados.set(token, dados);
      return Promise.resolve({ tipo: 'valido', dados });
    }
    const usado = this.#usados.get(token);
    return Promise.resolve(
      usado === undefined ? { tipo: 'invalido' } : { tipo: 'reuso', dados: usado },
    );
  }

  revogarDoDispositivo(dispositivoId: Uuid): Promise<void> {
    for (const [token, dados] of this.#validos)
      if (dados.dispositivoId === dispositivoId) this.#validos.delete(token);
    return Promise.resolve();
  }
}

/** Perfis dos usuários com as permissões padrão da migração (testes sem banco). */
export class PerfisEmMemoria implements RepositorioDePerfis {
  readonly #atribuicoes = new Map<Uuid, Set<CodigoPerfil>>();

  atribuir(usuarioId: Uuid, perfil: CodigoPerfil): void {
    const perfis = this.#atribuicoes.get(usuarioId) ?? new Set();
    perfis.add(perfil);
    this.#atribuicoes.set(usuarioId, perfis);
  }

  permissoesDoUsuario(_tenantId: Uuid, usuarioId: Uuid): Promise<readonly string[]> {
    const perfis = [...(this.#atribuicoes.get(usuarioId) ?? [])];
    return Promise.resolve([...new Set(perfis.flatMap((perfil) => PERFIS_PADRAO[perfil]))]);
  }
}

/** Tipos de tenant para os testes sem banco (no Postgres, o RLS limita ao tenant da transação). */
export class TenantsEmMemoria implements RepositorioDeTenants<unknown> {
  readonly #tipos = new Map<Uuid, string>();

  cadastrar(tenantId: Uuid, tipo: 'autonomo' | 'escritorio' | 'plataforma'): void {
    this.#tipos.set(tenantId, tipo);
  }

  tipo(_transacao: unknown, tenantId: Uuid): Promise<string | undefined> {
    return Promise.resolve(this.#tipos.get(tenantId));
  }
}
