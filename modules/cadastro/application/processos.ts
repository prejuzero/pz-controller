import {
  Conflito,
  err,
  formatarNumeroCnj,
  lerNumeroCnj,
  NaoEncontrado,
  NumeroCnj,
  ok,
} from '@pz/kernel';
import { z } from 'zod';

import { COBERTURAS, Processo } from '../domain/processo.js';

import { ConsultaPaginada, lerCursor, origemDe, paginar, validacao } from './paginacao.js';

import type { AutorNoTenant, Pagina } from './paginacao.js';
import type { RepositorioDeClientes, RepositorioDeProcessos, UnidadeNoTenant } from './portas.js';
import type { Cobertura, EstadoDoProcesso } from '../domain/processo.js';
import type { TrilhaDeAuditoria } from '@pz/auditoria';
import type {
  Clock,
  Outbox,
  Ramo,
  RegraDeNegocio,
  Result,
  UnidadeDeTrabalho,
  Uuid,
  Validacao,
} from '@pz/kernel';

const Texto = z.string().trim().min(1).max(200).nullable();
const Motivo = z.string().trim().min(3).max(500).nullable();
const ClienteId = z.uuid().nullable();

export const EntradaDoProcesso = z
  .object({
    numeroCnj: z.string().max(40),
    orgao: Texto.optional(),
    comarca: Texto.optional(),
    sigiloso: z.boolean().optional(),
    cobertura: z.enum(COBERTURAS).optional(),
    motivoCobertura: Motivo.optional(),
    clienteId: ClienteId.optional(),
  })
  .strict();

export const AlteracaoDoProcesso = z
  .object({
    orgao: Texto.optional(),
    comarca: Texto.optional(),
    sigiloso: z.boolean().optional(),
    clienteId: ClienteId.optional(),
  })
  .strict();

export const EntradaDaCobertura = z
  .object({ cobertura: z.enum(COBERTURAS), motivo: Motivo.optional() })
  .strict();

export const FiltroDaListagem = ConsultaPaginada.extend({
  numero: z
    .string()
    .max(40)
    .transform((texto) => texto.replace(/\D/g, ''))
    .optional(),
  clienteId: z.uuid().optional(),
  tribunal: z.string().trim().toUpperCase().max(20).optional(),
  cobertura: z.enum(COBERTURAS).optional(),
  sigiloso: z
    .enum(['true', 'false'])
    .transform((texto) => texto === 'true')
    .optional(),
});

/** Processo para a API: número com a máscara do CNJ. */
export interface ProcessoListado {
  readonly id: Uuid;
  readonly numeroCnj: string;
  readonly tribunal: string | null;
  readonly ramo: Ramo | null;
  readonly orgao: string | null;
  readonly comarca: string | null;
  readonly sigiloso: boolean;
  readonly cobertura: Cobertura;
  readonly motivoCobertura: string | null;
  readonly clienteId: Uuid | null;
}

export function processoListado(estado: EstadoDoProcesso): ProcessoListado {
  const partes = lerNumeroCnj(estado.numeroCnj);
  return {
    id: estado.id,
    numeroCnj: partes === undefined ? estado.numeroCnj : formatarNumeroCnj(partes),
    tribunal: estado.tribunal,
    ramo: estado.ramo,
    orgao: estado.orgao,
    comarca: estado.comarca,
    sigiloso: estado.sigiloso,
    cobertura: estado.cobertura,
    motivoCobertura: estado.motivoCobertura,
    clienteId: estado.clienteId,
  };
}

const naoEncontrado = () =>
  new NaoEncontrado('processo-nao-encontrado', 'Processo não encontrado.');
const clienteNaoEncontrado = () =>
  new NaoEncontrado('cliente-nao-encontrado', 'Cliente não encontrado.');

/** O cliente vinculado precisa ser do mesmo tenant (o RLS esconde os dos outros). */
async function clienteExiste<Transacao>(
  clientes: RepositorioDeClientes<Transacao>,
  transacao: Transacao,
  clienteId: string | null | undefined,
): Promise<boolean> {
  if (clienteId === undefined || clienteId === null) return true;
  return (await clientes.buscar(transacao, clienteId as Uuid)) !== undefined;
}

/** Cadastro manual pelo número CNJ (POST /v1/processos): tribunal deduzido do número. */
export class CadastrarProcesso<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly processos: RepositorioDeProcessos<Transacao>,
    private readonly clientes: RepositorioDeClientes<Transacao>,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
    private readonly outbox: Outbox<Transacao>,
    private readonly relogio: Clock,
  ) {}

  async executar(
    autor: AutorNoTenant,
    entrada: unknown,
  ): Promise<Result<ProcessoListado, Validacao | NaoEncontrado | Conflito | RegraDeNegocio>> {
    const dados = EntradaDoProcesso.safeParse(entrada);
    if (!dados.success) return err(validacao(dados.error));
    const { numeroCnj, clienteId, ...resto } = dados.data;
    const numero = NumeroCnj.de(numeroCnj);
    if (!numero.ok) return numero;
    const criado = Processo.monitorar(
      {
        ...resto,
        tenantId: autor.tenantId,
        numero: numero.valor,
        clienteId: (clienteId ?? null) as Uuid | null,
        origem: 'manual',
      },
      this.relogio,
    );
    if (!criado.ok) return criado;
    const processo = criado.valor;
    return this.unidade.executar(async (transacao) => {
      if (!(await clienteExiste(this.clientes, transacao, clienteId)))
        return err(clienteNaoEncontrado());
      if (!(await this.processos.inserir(transacao, processo)))
        return err(
          new Conflito('processo-ja-cadastrado', 'Este processo já está no seu monitoramento.'),
        );
      const depois = processoListado(processo.estado);
      await this.trilha.registrar(
        transacao,
        {
          tipo: 'cadastro.processo-cadastrado',
          entidade: 'processo',
          entidadeId: processo.id,
          depois,
        },
        origemDe(autor),
      );
      await this.outbox.gravar(transacao, processo.retirarEventos());
      return ok(depois);
    });
  }
}

/** Dados que a fonte (DJEN) traz junto com o número. */
export interface DadosDaFonte {
  readonly orgao?: string;
  readonly comarca?: string;
}

/**
 * API interna da ingestão (HU12, RF08): devolve o processo do número no tenant, criando-o se
 * ainda não existe. Idempotente sob concorrência: o INSERT com ON CONFLICT DO NOTHING espera a
 * transação concorrente e, se ela criou o processo, a busca seguinte o encontra.
 */
export class ObterOuCriarProcesso<Transacao> {
  constructor(
    private readonly unidade: UnidadeNoTenant<Transacao>,
    private readonly processos: RepositorioDeProcessos<Transacao>,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
    private readonly outbox: Outbox<Transacao>,
    private readonly relogio: Clock,
  ) {}

  async executar(
    tenantId: Uuid,
    numeroCnj: string,
    dadosDaFonte: DadosDaFonte = {},
  ): Promise<Result<{ processoId: Uuid; criado: boolean }, Validacao>> {
    const numero = NumeroCnj.de(numeroCnj);
    if (!numero.ok) return numero;
    const fonte = z
      .object({ orgao: Texto.optional(), comarca: Texto.optional() })
      .safeParse(dadosDaFonte);
    if (!fonte.success) return err(validacao(fonte.error));
    return this.unidade.executar(tenantId, async (transacao) => {
      const existente = await this.processos.buscarPorNumero(transacao, numero.valor.valor);
      if (existente !== undefined) return ok({ processoId: existente.id, criado: false });
      const criado = Processo.monitorar(
        { ...fonte.data, tenantId, numero: numero.valor, origem: 'captura' },
        this.relogio,
      );
      // Cobertura automática não exige motivo: monitorar não falha aqui.
      if (!criado.ok) throw criado.erro;
      const processo = criado.valor;
      if (!(await this.processos.inserir(transacao, processo))) {
        const concorrente = await this.processos.buscarPorNumero(transacao, numero.valor.valor);
        if (concorrente === undefined)
          throw new Error('Processo em conflito de número não encontrado no tenant.');
        return ok({ processoId: concorrente.id, criado: false });
      }
      await this.trilha.registrar(
        transacao,
        {
          tipo: 'cadastro.processo-cadastrado',
          entidade: 'processo',
          entidadeId: processo.id,
          depois: processoListado(processo.estado),
        },
        { canal: 'sistema' },
      );
      await this.outbox.gravar(transacao, processo.retirarEventos());
      return ok({ processoId: processo.id, criado: true });
    });
  }
}

/** GET /v1/processos/{id}. */
export class ConsultarProcesso<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly processos: RepositorioDeProcessos<Transacao>,
  ) {}

  async executar(id: Uuid): Promise<Result<ProcessoListado, NaoEncontrado>> {
    const processo = await this.unidade.executar((tx) => this.processos.buscar(tx, id));
    return processo === undefined ? err(naoEncontrado()) : ok(processoListado(processo.estado));
  }
}

/** GET /v1/processos: filtros por número (parcial), cliente, tribunal, cobertura e sigilo. */
export class ListarProcessos<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly processos: RepositorioDeProcessos<Transacao>,
  ) {}

  async executar(consulta: unknown): Promise<Result<Pagina<ProcessoListado>, Validacao>> {
    const dados = FiltroDaListagem.safeParse(consulta);
    if (!dados.success) return err(validacao(dados.error));
    const { cursor, limite, numero, clienteId, ...filtro } = dados.data;
    const apos = lerCursor(cursor);
    if (!apos.ok) return apos;
    const linhas = await this.unidade.executar((tx) =>
      this.processos.listar(
        tx,
        {
          ...filtro,
          ...(numero === undefined || numero === '' ? {} : { numero }),
          ...(clienteId === undefined ? {} : { clienteId: clienteId as Uuid }),
        },
        { limite: limite + 1, ...(apos.valor === undefined ? {} : { apos: apos.valor }) },
      ),
    );
    return ok(paginar(linhas, limite, processoListado));
  }
}

/** PATCH /v1/processos/{id}: órgão, comarca, cliente e sigilo, com antes e depois na trilha. */
export class AtualizarProcesso<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly processos: RepositorioDeProcessos<Transacao>,
    private readonly clientes: RepositorioDeClientes<Transacao>,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
  ) {}

  async executar(
    autor: AutorNoTenant,
    id: Uuid,
    entrada: unknown,
  ): Promise<Result<ProcessoListado, Validacao | NaoEncontrado>> {
    const dados = AlteracaoDoProcesso.safeParse(entrada);
    if (!dados.success) return err(validacao(dados.error));
    const { clienteId, ...resto } = dados.data;
    return this.unidade.executar(async (transacao) => {
      const processo = await this.processos.buscar(transacao, id);
      if (processo === undefined) return err(naoEncontrado());
      if (!(await clienteExiste(this.clientes, transacao, clienteId)))
        return err(clienteNaoEncontrado());
      const antes = processoListado(processo.estado);
      processo.atualizar({
        ...resto,
        ...(clienteId === undefined ? {} : { clienteId: clienteId as Uuid | null }),
      });
      const depois = processoListado(processo.estado);
      await this.processos.salvar(transacao, processo);
      await this.trilha.registrar(
        transacao,
        {
          // Sigilo tem tipo próprio: muda o que a captura e as notificações podem expor.
          tipo:
            antes.sigiloso === depois.sigiloso
              ? 'cadastro.processo-atualizado'
              : 'cadastro.sigilo-alterado',
          entidade: 'processo',
          entidadeId: id,
          antes,
          depois,
        },
        origemDe(autor),
      );
      return ok(depois);
    });
  }
}

/** PUT /v1/processos/{id}/cobertura (RF91): motivo obrigatório fora da automática. */
export class AlterarCobertura<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly processos: RepositorioDeProcessos<Transacao>,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
    private readonly outbox: Outbox<Transacao>,
  ) {}

  async executar(
    autor: AutorNoTenant,
    id: Uuid,
    entrada: unknown,
  ): Promise<Result<ProcessoListado, Validacao | NaoEncontrado | RegraDeNegocio>> {
    const dados = EntradaDaCobertura.safeParse(entrada);
    if (!dados.success) return err(validacao(dados.error));
    return this.unidade.executar(async (transacao) => {
      const processo = await this.processos.buscar(transacao, id);
      if (processo === undefined) return err(naoEncontrado());
      const antes = processoListado(processo.estado);
      const alterada = processo.alterarCobertura(dados.data.cobertura, dados.data.motivo ?? null);
      if (!alterada.ok) return alterada;
      const depois = processoListado(processo.estado);
      await this.processos.salvar(transacao, processo);
      await this.trilha.registrar(
        transacao,
        {
          tipo: 'cadastro.cobertura-alterada',
          entidade: 'processo',
          entidadeId: id,
          antes,
          depois,
        },
        origemDe(autor),
      );
      await this.outbox.gravar(transacao, processo.retirarEventos());
      return ok(depois);
    });
  }
}
