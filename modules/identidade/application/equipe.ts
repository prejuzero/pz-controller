import {
  Conflito,
  err,
  gerarUuidV7,
  NaoAutenticado,
  NaoEncontrado,
  ok,
  Validacao,
} from '@pz/kernel';
import { z } from 'zod';

import { normalizarEmail, validarNovaSenha } from '../domain/credenciais.js';

import type {
  ArmazemDeRenovacoes,
  ArmazemDeSessoes,
  Cifra,
  GeradorDeTokens,
  HasherDeSenha,
  RepositorioDeCredenciais,
  RepositorioDeDispositivos,
} from './portas.js';
import type { NoTenant } from './redefinicao.js';
import type { Email } from '../domain/credenciais.js';
import type { TrilhaDeAuditoria } from '@pz/auditoria';
import type { ProvedorEmail } from '@pz/integracoes';
import type {
  Clock,
  EventoDominio,
  Instant,
  Outbox,
  Result,
  UnidadeDeTrabalho,
  Uuid,
} from '@pz/kernel';

/** Convite vale 7 dias, uma vez (CLAUDE.md, seção 14). */
export const VALIDADE_DO_CONVITE_MS = 7 * 24 * 3600 * 1000;

/** Perfis que o escritório atribui (HU41); os da plataforma e da curadoria ficam de fora. */
export const PERFIS_DA_EQUIPE = ['advogado', 'colaborador', 'admin_escritorio'] as const;
export type PerfilDaEquipe = (typeof PERFIS_DA_EQUIPE)[number];

export interface Membro {
  readonly usuarioId: Uuid;
  readonly nome: string;
  readonly email: string;
  readonly perfis: readonly string[];
  readonly criadoEm: Instant;
  readonly desativadoEm: Instant | null;
}

export interface Convite {
  readonly id: Uuid;
  readonly tenantId: Uuid;
  readonly email: string;
  readonly nome: string;
  readonly perfil: PerfilDaEquipe;
  readonly criadoPor: Uuid;
  readonly criadoEm: Instant;
  readonly expiraEm: Instant;
}

/** O convite achado pelo token, sem tenant (o link chega sem sessão). */
export interface ConviteLocalizado {
  readonly id: Uuid;
  readonly tenantId: Uuid;
  readonly email: string;
  readonly nome: string;
  readonly perfil: PerfilDaEquipe;
  readonly expiraEm: Instant;
  readonly aberto: boolean;
  readonly tenantSuspenso: boolean;
}

/** Equipe do tenant da transação (RLS). O token do convite só existe como hash. */
export interface RepositorioDaEquipe<Transacao> {
  membros(transacao: Transacao): Promise<Membro[]>;
  convitesAbertos(transacao: Transacao, agora: Instant): Promise<Convite[]>;
  /** `false` se já há convite aberto para o e-mail no escritório. */
  inserirConvite(transacao: Transacao, convite: Convite, token: string): Promise<boolean>;
  cancelarConvite(transacao: Transacao, id: Uuid, agora: Instant): Promise<boolean>;
  /** Sem tenant: pela função restrita, pelo hash do token. */
  localizarConvite(token: string): Promise<ConviteLocalizado | undefined>;
  /** Cria o usuário com o perfil e marca o convite como aceito (e o e-mail como verificado). */
  aceitar(
    transacao: Transacao,
    convite: ConviteLocalizado,
    usuario: { readonly id: Uuid; readonly senhaHash: string },
    agora: Instant,
  ): Promise<void>;
  definirPerfis(transacao: Transacao, usuarioId: Uuid, perfis: readonly string[]): Promise<void>;
  desativar(transacao: Transacao, usuarioId: Uuid, agora: Instant): Promise<boolean>;
}

export interface DependenciasDaEquipe<Transacao> {
  readonly unidade: UnidadeDeTrabalho<Transacao>;
  readonly equipe: RepositorioDaEquipe<Transacao>;
  readonly credenciais: RepositorioDeCredenciais;
  readonly trilha: TrilhaDeAuditoria<Transacao>;
  readonly outbox: Outbox<Transacao>;
  readonly tokens: GeradorDeTokens;
  readonly cifra: Cifra;
  readonly relogio: Clock;
}

/** Quem age (administrador do escritório, no portal). */
export interface AutorNaEquipe {
  readonly tenantId: Uuid;
  readonly usuarioId: Uuid;
}

const EntradaDoConvite = z
  .object({
    email: z.string().min(3).max(254),
    nome: z.string().trim().min(1).max(200),
    perfil: z.enum(PERFIS_DA_EQUIPE),
  })
  .strict();

const validacao = (erro: z.ZodError) =>
  new Validacao(erro.issues.map((p) => ({ campo: p.path.join('.'), mensagem: p.message })));

export function convitePublico(c: Convite) {
  return {
    id: c.id,
    email: c.email,
    nome: c.nome,
    perfil: c.perfil,
    criadoEm: c.criadoEm.paraIso(),
    expiraEm: c.expiraEm.paraIso(),
  };
}

export function membroPublico(m: Membro) {
  return {
    usuarioId: m.usuarioId,
    nome: m.nome,
    email: m.email,
    perfis: [...m.perfis],
    criadoEm: m.criadoEm.paraIso(),
    desativadoEm: m.desativadoEm?.paraIso() ?? null,
  };
}

/**
 * Convida para a equipe (HU41): o e-mail é único no sistema (um e-mail = um usuário = um
 * escritório, decisão de 06/10/2026), o token vai cifrado no evento e o worker envia o link.
 */
export class ConvidarMembro<Transacao> {
  constructor(private readonly deps: DependenciasDaEquipe<Transacao>) {}

  async executar(
    autor: AutorNaEquipe,
    entrada: unknown,
  ): Promise<Result<ReturnType<typeof convitePublico>, Validacao | Conflito>> {
    const dados = EntradaDoConvite.safeParse(entrada);
    if (!dados.success) return err(validacao(dados.error));
    const email = normalizarEmail(dados.data.email);
    if (!email.ok) return err(new Validacao([{ campo: 'email', mensagem: 'E-mail inválido.' }]));
    if ((await this.deps.credenciais.localizarPorEmail(email.valor)) !== undefined) {
      return err(new Conflito('email-ja-cadastrado', 'Este e-mail já tem conta no PrejuZero.'));
    }
    const { relogio, tokens, cifra } = this.deps;
    const agora = relogio.agora();
    const convite: Convite = {
      id: gerarUuidV7(relogio),
      tenantId: autor.tenantId,
      email: email.valor,
      nome: dados.data.nome,
      perfil: dados.data.perfil,
      criadoPor: autor.usuarioId,
      criadoEm: agora,
      expiraEm: agora.maisMs(VALIDADE_DO_CONVITE_MS),
    };
    const token = tokens.novoToken();
    return this.deps.unidade.executar(async (tx) => {
      if (!(await this.deps.equipe.inserirConvite(tx, convite, token))) {
        return err(new Conflito('convite-aberto', 'Já há um convite aberto para este e-mail.'));
      }
      await this.deps.trilha.registrar(
        tx,
        {
          tipo: 'identidade.membro-convidado',
          entidade: 'convite_membro',
          entidadeId: convite.id,
          depois: { perfil: convite.perfil },
        },
        { canal: 'portal', usuarioId: autor.usuarioId },
      );
      await this.deps.outbox.gravar(tx, [
        {
          id: gerarUuidV7(relogio),
          tipo: 'ConviteDeMembroEnviado',
          versao: 1,
          tenantId: autor.tenantId,
          agregadoId: convite.id,
          ocorridoEm: agora,
          payload: { conviteId: convite.id, tokenCifrado: cifra.cifrar(token) },
        },
      ]);
      return ok(convitePublico(convite));
    });
  }
}

export class CancelarConvite<Transacao> {
  constructor(private readonly deps: DependenciasDaEquipe<Transacao>) {}

  executar(autor: AutorNaEquipe, id: Uuid): Promise<Result<void, NaoEncontrado>> {
    return this.deps.unidade.executar(async (tx) => {
      if (!(await this.deps.equipe.cancelarConvite(tx, id, this.deps.relogio.agora()))) {
        return err(new NaoEncontrado('convite-nao-encontrado', 'Convite não encontrado.'));
      }
      await this.deps.trilha.registrar(
        tx,
        { tipo: 'identidade.convite-cancelado', entidade: 'convite_membro', entidadeId: id },
        { canal: 'portal', usuarioId: autor.usuarioId },
      );
      return ok(undefined);
    });
  }
}

export class ListarEquipe<Transacao> {
  constructor(private readonly deps: DependenciasDaEquipe<Transacao>) {}

  executar() {
    return this.deps.unidade.executar(async (tx) => ({
      membros: (await this.deps.equipe.membros(tx)).map(membroPublico),
      convites: (await this.deps.equipe.convitesAbertos(tx, this.deps.relogio.agora())).map(
        convitePublico,
      ),
    }));
  }
}

const conviteInvalido = () =>
  new NaoAutenticado('convite-invalido', 'Convite inválido, expirado, cancelado ou já usado.');

async function conviteValido(
  equipe: RepositorioDaEquipe<unknown>,
  token: string,
  agora: Instant,
): Promise<ConviteLocalizado | undefined> {
  const convite = await equipe.localizarConvite(token);
  if (convite === undefined || !convite.aberto || convite.tenantSuspenso) return undefined;
  return agora.ehAntesDe(convite.expiraEm) ? convite : undefined;
}

/** Página do link: para quem é o convite (sem sessão). */
export class DescreverConvite<Transacao> {
  constructor(private readonly deps: DependenciasDaEquipe<Transacao>) {}

  async executar(
    token: string,
  ): Promise<Result<{ nome: string; email: string; perfil: PerfilDaEquipe }, NaoAutenticado>> {
    const convite = await conviteValido(this.deps.equipe, token, this.deps.relogio.agora());
    if (convite === undefined) return err(conviteInvalido());
    return ok({ nome: convite.nome, email: convite.email, perfil: convite.perfil });
  }
}

/**
 * Aceita o convite com a senha nova: cria o usuário no escritório, com o perfil do convite e o
 * e-mail já verificado (o link chegou nele). O 2FA é configurado no primeiro login, como em toda
 * conta (HU06).
 */
export class AceitarConvite<Transacao> {
  constructor(
    private readonly deps: DependenciasDaEquipe<Transacao>,
    private readonly hasher: HasherDeSenha,
    private readonly noTenant: NoTenant,
  ) {}

  async executar(
    token: string,
    senha: string,
  ): Promise<Result<void, NaoAutenticado | Validacao | Conflito>> {
    const senhaValida = validarNovaSenha(senha);
    if (!senhaValida.ok) return senhaValida;
    const agora = this.deps.relogio.agora();
    const convite = await conviteValido(this.deps.equipe, token, agora);
    if (convite === undefined) return err(conviteInvalido());
    if ((await this.deps.credenciais.localizarPorEmail(convite.email as Email)) !== undefined) {
      return err(new Conflito('email-ja-cadastrado', 'Este e-mail já tem conta no PrejuZero.'));
    }
    const usuarioId = gerarUuidV7(this.deps.relogio);
    const senhaHash = await this.hasher.gerar(senha);
    await this.noTenant(convite.tenantId, () =>
      this.deps.unidade.executar(async (tx) => {
        await this.deps.equipe.aceitar(tx, convite, { id: usuarioId, senhaHash }, agora);
        await this.deps.trilha.registrar(
          tx,
          {
            tipo: 'identidade.convite-aceito',
            entidade: 'usuario',
            entidadeId: usuarioId,
            depois: { conviteId: convite.id, perfil: convite.perfil },
          },
          { canal: 'portal', usuarioId },
        );
      }),
    );
    return ok(undefined);
  }
}

const EntradaDosPerfis = z
  .object({ perfis: z.array(z.enum(PERFIS_DA_EQUIPE)).min(1).max(3) })
  .strict();

/** Garante que o escritório não fica sem ninguém ativo que administre a equipe. */
function restaAdministrador(
  membros: readonly Membro[],
  usuarioId: Uuid,
  novosPerfis: readonly string[] | null,
): boolean {
  return membros.some((m) =>
    m.desativadoEm !== null
      ? false
      : m.usuarioId === usuarioId
        ? (novosPerfis ?? []).includes('admin_escritorio')
        : m.perfis.includes('admin_escritorio'),
  );
}

export class AlterarPerfisDoMembro<Transacao> {
  constructor(private readonly deps: DependenciasDaEquipe<Transacao>) {}

  async executar(
    autor: AutorNaEquipe,
    usuarioId: Uuid,
    entrada: unknown,
  ): Promise<Result<void, Validacao | NaoEncontrado | Conflito>> {
    const dados = EntradaDosPerfis.safeParse(entrada);
    if (!dados.success) return err(validacao(dados.error));
    const perfis = [...new Set(dados.data.perfis)];
    return this.deps.unidade.executar(async (tx) => {
      const membros = await this.deps.equipe.membros(tx);
      const membro = membros.find((m) => m.usuarioId === usuarioId);
      if (membro?.desativadoEm !== null) {
        return err(new NaoEncontrado('membro-nao-encontrado', 'Membro não encontrado.'));
      }
      if (!restaAdministrador(membros, usuarioId, perfis)) {
        return err(
          new Conflito(
            'ultimo-administrador',
            'O escritório precisa de ao menos um administrador.',
          ),
        );
      }
      await this.deps.equipe.definirPerfis(tx, usuarioId, perfis);
      await this.deps.trilha.registrar(
        tx,
        {
          tipo: 'identidade.perfis-alterados',
          entidade: 'usuario',
          entidadeId: usuarioId,
          antes: { perfis: [...membro.perfis] },
          depois: { perfis },
        },
        { canal: 'portal', usuarioId: autor.usuarioId },
      );
      return ok(undefined);
    });
  }
}

/**
 * Desativa o membro (HU41): não entra mais, e as sessões, os apps e as renovações dele caem na
 * hora. O histórico continua apontando para ele. Ninguém desativa a si mesmo nem o último
 * administrador.
 */
export class DesativarMembro<Transacao> {
  constructor(
    private readonly deps: DependenciasDaEquipe<Transacao>,
    private readonly sessoes: ArmazemDeSessoes,
    private readonly dispositivos: RepositorioDeDispositivos,
    private readonly renovacoes: ArmazemDeRenovacoes,
  ) {}

  async executar(
    autor: AutorNaEquipe,
    usuarioId: Uuid,
  ): Promise<Result<void, NaoEncontrado | Conflito>> {
    if (usuarioId === autor.usuarioId) {
      return err(new Conflito('desativar-a-si-mesmo', 'Você não pode desativar o próprio acesso.'));
    }
    const agora = this.deps.relogio.agora();
    const r = await this.deps.unidade.executar(async (tx) => {
      const membros = await this.deps.equipe.membros(tx);
      const membro = membros.find((m) => m.usuarioId === usuarioId);
      if (membro?.desativadoEm !== null) {
        return err(new NaoEncontrado('membro-nao-encontrado', 'Membro não encontrado.'));
      }
      if (!restaAdministrador(membros, usuarioId, null)) {
        return err(
          new Conflito(
            'ultimo-administrador',
            'O escritório precisa de ao menos um administrador.',
          ),
        );
      }
      await this.deps.equipe.desativar(tx, usuarioId, agora);
      await this.deps.trilha.registrar(
        tx,
        { tipo: 'identidade.membro-desativado', entidade: 'usuario', entidadeId: usuarioId },
        { canal: 'portal', usuarioId: autor.usuarioId },
      );
      return ok(undefined);
    });
    if (!r.ok) return r;
    await this.sessoes.removerTodasDoUsuario(usuarioId);
    for (const d of await this.dispositivos.listar(usuarioId)) {
      if (d.revogadaEm !== undefined) continue;
      await this.dispositivos.revogar(d.id, usuarioId, agora);
      await this.sessoes.removerTodasDoDispositivo(d.id);
      await this.renovacoes.revogarDoDispositivo(d.id);
    }
    return ok(undefined);
  }
}

/** Nome e e-mail do convidado, lidos na transação do consumidor (tenant do evento). */
export interface DadosDosConvites<Transacao> {
  doConvite(
    transacao: Transacao,
    conviteId: Uuid,
  ): Promise<{ readonly email: string; readonly nome: string } | undefined>;
}

const escapar = (texto: string) =>
  texto.replace(/[&<>"']/g, (c) => `&#${String(c.charCodeAt(0))};`);

/**
 * E-mail do convite (HU41, worker). Sem dados de processos; o token vai no fragmento (#) do
 * link, que o navegador não envia ao servidor. Idempotência pelo ID do evento.
 */
export class EnviarConvite<Transacao> {
  constructor(
    private readonly email: ProvedorEmail,
    private readonly convites: DadosDosConvites<Transacao>,
    private readonly cifra: Cifra,
    private readonly urlDoPortal: string,
  ) {}

  async executar(
    transacao: Transacao,
    evento: EventoDominio<'ConviteDeMembroEnviado', { conviteId: Uuid; tokenCifrado: string }>,
  ): Promise<void> {
    const convite = await this.convites.doConvite(transacao, evento.payload.conviteId);
    if (convite === undefined) return;
    const link = `${this.urlDoPortal}/convite#token=${this.cifra.decifrar(evento.payload.tokenCifrado)}`;
    await this.email.enviar({
      idempotencia: evento.id,
      para: [convite.email],
      assunto: 'Convite para a equipe no PrejuZero',
      texto: `Olá, ${convite.nome}. Você foi convidado para a equipe do escritório no PrejuZero. Para criar a sua senha e entrar, acesse em até 7 dias: ${link}\n\nSe não esperava este convite, ignore esta mensagem.`,
      html: `<p>Olá, ${escapar(convite.nome)}.</p><p>Você foi convidado para a equipe do escritório no PrejuZero.</p><p><a href="${escapar(link)}">Aceitar o convite e criar a minha senha</a> (válido por 7 dias).</p><p>Se não esperava este convite, ignore esta mensagem.</p>`,
    });
  }
}
