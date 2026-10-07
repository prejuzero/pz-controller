import { Conflito, err, gerarUuidV7, NaoEncontrado, ok, Validacao } from '@pz/kernel';
import { z } from 'zod';

import { Advogado, MAXIMO_DE_EMAILS_ADICIONAIS, MAXIMO_DE_OABS } from '../domain/advogado.js';
import { Celular, Cpf, lerUf, mascararCpf, NumeroOab } from '../domain/valores.js';

import type {
  CriadorDeConta,
  PreparadorDeVerificacao,
  RepositorioDeAdvogados,
  UnidadeNoTenant,
} from './portas.js';
import type { EstadoDoAdvogado, Oab } from '../domain/advogado.js';
import type { Uf } from '../domain/valores.js';
import type { OrigemDaAuditoria, TrilhaDeAuditoria } from '@pz/auditoria';
import type { Clock, Outbox, RegraDeNegocio, Result, UnidadeDeTrabalho, Uuid } from '@pz/kernel';

const Inscricao = z.object({ numero: z.string().max(20), uf: z.string().max(2) }).strict();
const EmailsAdicionais = z.array(z.email().max(254).toLowerCase()).max(MAXIMO_DE_EMAILS_ADICIONAIS);

export const EntradaDoCadastro = z
  .object({
    nome: z.string().trim().min(3).max(200),
    cpf: z.string().max(20),
    email: z.email().max(254),
    senha: z.string().max(256),
    celular: z.string().max(30),
    oabPrincipal: Inscricao,
    oabsSuplementares: z
      .array(Inscricao)
      .max(MAXIMO_DE_OABS - 1)
      .default([]),
    emailsAdicionais: EmailsAdicionais.default([]),
  })
  .strict();

export const EntradaDoPerfil = z
  .object({
    nome: z.string().trim().min(3).max(200).optional(),
    celular: z.string().max(30).optional(),
    emailsAdicionais: EmailsAdicionais.optional(),
  })
  .strict();

const OAB_EM_USO =
  'Esta OAB já está vinculada a outro cadastro. Se ela é sua, fale com o suporte do PrejuZero.';

/** Quem age: o advogado da sessão, e por qual canal (vai para a trilha). */
export interface AutorDoCadastro {
  readonly usuarioId: Uuid;
  readonly canal: OrigemDaAuditoria['canal'];
}

/** Perfil do advogado para a API: CPF só mascarado (LGPD, minimização). */
export interface PerfilListado {
  readonly id: Uuid;
  readonly nome: string;
  readonly cpf: string;
  readonly celular: string;
  readonly emailsAdicionais: readonly string[];
  readonly oabs: readonly OabListada[];
}

export interface OabListada {
  readonly id: Uuid;
  readonly numero: string;
  readonly uf: Uf;
  readonly tipo: Oab['tipo'];
}

function validacao(erro: z.ZodError): Validacao {
  return new Validacao(
    erro.issues.map((problema) => ({ campo: problema.path.join('.'), mensagem: problema.message })),
  );
}

const oabListada = (oab: Oab): OabListada => ({
  id: oab.id,
  numero: oab.numero,
  uf: oab.uf,
  tipo: oab.tipo,
});

export function perfilListado(estado: EstadoDoAdvogado): PerfilListado {
  return {
    id: estado.id,
    nome: estado.nome,
    cpf: mascararCpf(estado.cpf),
    celular: estado.celular,
    emailsAdicionais: estado.emailsAdicionais,
    oabs: estado.oabs.filter((oab) => oab.ativa).map(oabListada),
  };
}

/** Junta os problemas de vários value objects numa só resposta de validação. */
function coletar<T>(resultados: Result<T, Validacao>[]): Result<T[], Validacao> {
  const problemas = resultados.flatMap((r) => (r.ok ? [] : r.erro.problemas));
  if (problemas.length > 0) return err(new Validacao(problemas));
  return ok(resultados.map((r) => (r as { valor: T }).valor));
}

function lerInscricao(
  inscricao: { numero: string; uf: string },
  campo: string,
): Result<{ numero: NumeroOab; uf: Uf }, Validacao> {
  const numero = NumeroOab.de(inscricao.numero, `${campo}.numero`);
  const uf = lerUf(inscricao.uf, `${campo}.uf`);
  if (numero.ok && uf.ok) return ok({ numero: numero.valor, uf: uf.valor });
  return err(
    new Validacao([
      ...(numero.ok ? [] : numero.erro.problemas),
      ...(uf.ok ? [] : uf.erro.problemas),
    ]),
  );
}

/** Erro que desfaz a transação inteira do cadastro e volta como resultado. */
class Desfazer extends Error {
  constructor(readonly erro: Conflito) {
    super(erro.message);
  }
}

/**
 * Cadastro público do advogado (HU11): tenant autônomo, usuário com credencial e perfil, advogado
 * e OABs numa só transação; qualquer falha desfaz tudo (aceite técnico).
 */
export class CadastrarAdvogado<Transacao> {
  constructor(
    private readonly unidade: UnidadeNoTenant<Transacao>,
    private readonly contas: CriadorDeConta<Transacao>,
    private readonly verificacao: PreparadorDeVerificacao,
    private readonly advogados: RepositorioDeAdvogados<Transacao>,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
    private readonly outbox: Outbox<Transacao>,
    private readonly relogio: Clock,
  ) {}

  async executar(
    entrada: unknown,
    origem: Pick<OrigemDaAuditoria, 'ip' | 'userAgent'> = {},
  ): Promise<
    Result<
      { tenantId: Uuid; usuarioId: Uuid; perfil: PerfilListado },
      Validacao | Conflito | RegraDeNegocio
    >
  > {
    const dados = EntradaDoCadastro.safeParse(entrada);
    if (!dados.success) return err(validacao(dados.error));
    const { nome, email, senha, cpf, celular, emailsAdicionais } = dados.data;
    const cpfLido = Cpf.de(cpf);
    const celularLido = Celular.de(celular);
    const inscricoes = coletar([
      lerInscricao(dados.data.oabPrincipal, 'oabPrincipal'),
      ...dados.data.oabsSuplementares.map((oab, i) =>
        lerInscricao(oab, `oabsSuplementares.${String(i)}`),
      ),
    ]);
    const conta = await this.contas.preparar({ nome, email, senha });
    const problemas = [cpfLido, celularLido, inscricoes, conta].flatMap((r) =>
      r.ok ? [] : r.erro.problemas,
    );
    if (problemas.length > 0 || !cpfLido.ok || !celularLido.ok || !inscricoes.ok || !conta.ok)
      return err(new Validacao(problemas));

    const [principal, ...suplementares] = inscricoes.valor;
    if (principal === undefined) throw new Error('OAB principal ausente após a validação');
    const tenantId = gerarUuidV7(this.relogio);
    const usuarioId = gerarUuidV7(this.relogio);
    const cadastro = Advogado.cadastrar(
      {
        tenantId,
        usuarioId,
        nome,
        cpf: cpfLido.valor,
        celular: celularLido.valor,
        emailsAdicionais,
        oabPrincipal: principal,
        oabsSuplementares: suplementares,
      },
      this.relogio,
    );
    if (!cadastro.ok) return cadastro;
    const advogado = cadastro.valor;
    const perfil = perfilListado(advogado.estado);
    // Token guardado antes da transação: se ela desfizer, o token órfão só expira.
    const verificacao = await this.verificacao.preparar({
      usuarioId,
      tenantId,
      email: conta.valor.email,
    });

    try {
      await this.unidade.executar(tenantId, async (transacao) => {
        const gravada = await this.contas.gravar(transacao, {
          ...conta.valor,
          tenantId,
          usuarioId,
          nomeDoTenant: nome,
        });
        if (!gravada.ok) throw new Desfazer(gravada.erro);
        const inserido = await this.advogados.inserir(transacao, advogado);
        if (inserido === 'cpf-em-uso')
          throw new Desfazer(new Conflito('cpf-em-uso', 'Este CPF já tem cadastro no PrejuZero.'));
        if (inserido === 'oab-em-uso') throw new Desfazer(new Conflito('oab-em-uso', OAB_EM_USO));
        await this.trilha.registrar(
          transacao,
          {
            tipo: 'cadastro.advogado-cadastrado',
            entidade: 'advogado',
            entidadeId: advogado.id,
            depois: perfil,
          },
          { canal: 'portal', usuarioId, ...origem },
        );
        await this.outbox.gravar(transacao, [...advogado.retirarEventos(), verificacao]);
      });
    } catch (erro) {
      if (erro instanceof Desfazer) return err(erro.erro);
      throw erro;
    }
    return ok({ tenantId, usuarioId, perfil });
  }
}

const naoCadastrado = () =>
  new NaoEncontrado('advogado-nao-encontrado', 'Cadastro de advogado não encontrado.');

/** Perfil do advogado da sessão (GET /v1/perfil). */
export class ConsultarPerfil<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly advogados: RepositorioDeAdvogados<Transacao>,
  ) {}

  async executar(usuarioId: Uuid): Promise<Result<PerfilListado, NaoEncontrado>> {
    const advogado = await this.unidade.executar((transacao) =>
      this.advogados.buscarPorUsuario(transacao, usuarioId),
    );
    return advogado === undefined ? err(naoCadastrado()) : ok(perfilListado(advogado.estado));
  }
}

/** Nome, celular e e-mails em cópia (PATCH /v1/perfil), com antes e depois na trilha. */
export class AtualizarPerfil<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly advogados: RepositorioDeAdvogados<Transacao>,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
  ) {}

  async executar(
    autor: AutorDoCadastro,
    entrada: unknown,
  ): Promise<Result<PerfilListado, Validacao | NaoEncontrado>> {
    const dados = EntradaDoPerfil.safeParse(entrada);
    if (!dados.success) return err(validacao(dados.error));
    const celular = dados.data.celular === undefined ? undefined : Celular.de(dados.data.celular);
    if (celular !== undefined && !celular.ok) return celular;
    return this.unidade.executar(async (transacao) => {
      const advogado = await this.advogados.buscarPorUsuario(transacao, autor.usuarioId);
      if (advogado === undefined) return err(naoCadastrado());
      const antes = perfilListado(advogado.estado);
      advogado.atualizarPerfil({
        ...(dados.data.nome === undefined ? {} : { nome: dados.data.nome }),
        ...(celular === undefined ? {} : { celular: celular.valor }),
        ...(dados.data.emailsAdicionais === undefined
          ? {}
          : { emailsAdicionais: dados.data.emailsAdicionais }),
      });
      const depois = perfilListado(advogado.estado);
      await this.advogados.salvarPerfil(transacao, advogado);
      await this.trilha.registrar(
        transacao,
        {
          tipo: 'cadastro.perfil-atualizado',
          entidade: 'advogado',
          entidadeId: advogado.id,
          antes,
          depois,
        },
        { canal: autor.canal, usuarioId: autor.usuarioId },
      );
      return ok(depois);
    });
  }
}

/** Nova OAB suplementar (POST /v1/oabs): entra no monitoramento pelo evento OabAdicionada. */
export class AdicionarOab<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly advogados: RepositorioDeAdvogados<Transacao>,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
    private readonly outbox: Outbox<Transacao>,
  ) {}

  async executar(
    autor: AutorDoCadastro,
    entrada: unknown,
  ): Promise<Result<OabListada, Validacao | NaoEncontrado | Conflito | RegraDeNegocio>> {
    const dados = Inscricao.safeParse(entrada);
    if (!dados.success) return err(validacao(dados.error));
    const inscricao = lerInscricao(dados.data, '');
    if (!inscricao.ok) return inscricao;
    return this.unidade.executar(async (transacao) => {
      const advogado = await this.advogados.buscarPorUsuario(transacao, autor.usuarioId);
      if (advogado === undefined) return err(naoCadastrado());
      const adicionada = advogado.adicionarOab(inscricao.valor.numero, inscricao.valor.uf);
      if (!adicionada.ok) return adicionada;
      if (!(await this.advogados.inserirOab(transacao, advogado, adicionada.valor)))
        return err(new Conflito('oab-em-uso', OAB_EM_USO));
      const depois = oabListada(adicionada.valor);
      await this.trilha.registrar(
        transacao,
        { tipo: 'cadastro.oab-adicionada', entidade: 'oab', entidadeId: depois.id, depois },
        { canal: autor.canal, usuarioId: autor.usuarioId },
      );
      await this.outbox.gravar(transacao, advogado.retirarEventos());
      return ok(depois);
    });
  }
}

/** Remove uma OAB suplementar (DELETE /v1/oabs/{id}): desativa, nunca apaga. */
export class RemoverOab<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly advogados: RepositorioDeAdvogados<Transacao>,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
    private readonly outbox: Outbox<Transacao>,
  ) {}

  async executar(
    autor: AutorDoCadastro,
    oabId: Uuid,
  ): Promise<Result<void, NaoEncontrado | RegraDeNegocio>> {
    return this.unidade.executar(async (transacao) => {
      const advogado = await this.advogados.buscarPorUsuario(transacao, autor.usuarioId);
      if (advogado === undefined) return err(naoCadastrado());
      const antes = advogado.estado.oabs.find((oab) => oab.id === oabId);
      const removida = advogado.removerOab(oabId);
      if (!removida.ok) return removida;
      await this.advogados.desativarOab(transacao, removida.valor);
      await this.trilha.registrar(
        transacao,
        {
          tipo: 'cadastro.oab-removida',
          entidade: 'oab',
          entidadeId: oabId,
          ...(antes === undefined ? {} : { antes: oabListada(antes) }),
        },
        { canal: autor.canal, usuarioId: autor.usuarioId },
      );
      await this.outbox.gravar(transacao, advogado.retirarEventos());
      return ok(undefined);
    });
  }
}
