import { err, NaoEncontrado, ok, RegraDeNegocio } from '@pz/kernel';
import { z } from 'zod';

import { novoCliente } from '../domain/cliente.js';
import { Documento, mascararDocumento } from '../domain/valores.js';

import { ConsultaPaginada, lerCursor, origemDe, paginar, validacao } from './paginacao.js';

import type { AutorNoTenant, Pagina } from './paginacao.js';
import type { RepositorioDeClientes } from './portas.js';
import type { Cliente } from '../domain/cliente.js';
import type { TrilhaDeAuditoria } from '@pz/auditoria';
import type { Clock, Result, UnidadeDeTrabalho, Uuid, Validacao } from '@pz/kernel';

const Nome = z.string().trim().min(2).max(200);
const TextoDoDocumento = z.string().max(30).nullable();

export const EntradaDoCliente = z
  .object({ nome: Nome, documento: TextoDoDocumento.optional() })
  .strict();
export const AlteracaoDoCliente = z
  .object({ nome: Nome.optional(), documento: TextoDoDocumento.optional() })
  .strict();
export const FiltroDeClientes = ConsultaPaginada.extend({
  nome: z.string().trim().max(200).optional(),
});

/** Cliente para a API: o documento vai inteiro para quem é do escritório. */
export interface ClienteListado {
  readonly id: Uuid;
  readonly nome: string;
  readonly documento: string | null;
}

const clienteListado = (cliente: Cliente): ClienteListado => ({
  id: cliente.id,
  nome: cliente.nome,
  documento: cliente.documento,
});

/** Na trilha, o CPF vai mascarado (LGPD, minimização). */
const paraTrilha = (cliente: Cliente) => ({
  nome: cliente.nome,
  documento: cliente.documento === null ? null : mascararDocumento(cliente.documento),
});

function lerDocumento(texto: string | null | undefined): Result<Documento | null, Validacao> {
  if (texto === undefined || texto === null || texto.trim() === '') return ok(null);
  return Documento.de(texto);
}

const naoEncontrado = () => new NaoEncontrado('cliente-nao-encontrado', 'Cliente não encontrado.');

/** POST /v1/clientes. */
export class CadastrarCliente<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly clientes: RepositorioDeClientes<Transacao>,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
    private readonly relogio: Clock,
  ) {}

  async executar(
    autor: AutorNoTenant,
    entrada: unknown,
  ): Promise<Result<ClienteListado, Validacao>> {
    const dados = EntradaDoCliente.safeParse(entrada);
    if (!dados.success) return err(validacao(dados.error));
    const documento = lerDocumento(dados.data.documento);
    if (!documento.ok) return documento;
    const cliente = novoCliente(
      { tenantId: autor.tenantId, nome: dados.data.nome, documento: documento.valor },
      this.relogio,
    );
    return this.unidade.executar(async (transacao) => {
      await this.clientes.inserir(transacao, cliente);
      await this.trilha.registrar(
        transacao,
        {
          tipo: 'cadastro.cliente-cadastrado',
          entidade: 'cliente',
          entidadeId: cliente.id,
          depois: paraTrilha(cliente),
        },
        origemDe(autor),
      );
      return ok(clienteListado(cliente));
    });
  }
}

/** GET /v1/clientes/{id}. */
export class ConsultarCliente<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly clientes: RepositorioDeClientes<Transacao>,
  ) {}

  async executar(id: Uuid): Promise<Result<ClienteListado, NaoEncontrado>> {
    const cliente = await this.unidade.executar((tx) => this.clientes.buscar(tx, id));
    return cliente === undefined ? err(naoEncontrado()) : ok(clienteListado(cliente));
  }
}

/** GET /v1/clientes: filtro por parte do nome. */
export class ListarClientes<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly clientes: RepositorioDeClientes<Transacao>,
  ) {}

  async executar(consulta: unknown): Promise<Result<Pagina<ClienteListado>, Validacao>> {
    const dados = FiltroDeClientes.safeParse(consulta);
    if (!dados.success) return err(validacao(dados.error));
    const { cursor, limite, nome } = dados.data;
    const apos = lerCursor(cursor);
    if (!apos.ok) return apos;
    const linhas = await this.unidade.executar((tx) =>
      this.clientes.listar(tx, nome === undefined || nome === '' ? {} : { nome }, {
        limite: limite + 1,
        ...(apos.valor === undefined ? {} : { apos: apos.valor }),
      }),
    );
    return ok(paginar(linhas, limite, clienteListado));
  }
}

/** PATCH /v1/clientes/{id}. */
export class AtualizarCliente<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly clientes: RepositorioDeClientes<Transacao>,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
  ) {}

  async executar(
    autor: AutorNoTenant,
    id: Uuid,
    entrada: unknown,
  ): Promise<Result<ClienteListado, Validacao | NaoEncontrado>> {
    const dados = AlteracaoDoCliente.safeParse(entrada);
    if (!dados.success) return err(validacao(dados.error));
    const documento =
      dados.data.documento === undefined ? undefined : lerDocumento(dados.data.documento);
    if (documento !== undefined && !documento.ok) return documento;
    return this.unidade.executar(async (transacao) => {
      const antes = await this.clientes.buscar(transacao, id);
      if (antes === undefined) return err(naoEncontrado());
      const depois: Cliente = {
        ...antes,
        ...(dados.data.nome === undefined ? {} : { nome: dados.data.nome }),
        ...(documento === undefined ? {} : { documento: documento.valor?.valor ?? null }),
      };
      await this.clientes.salvar(transacao, depois);
      await this.trilha.registrar(
        transacao,
        {
          tipo: 'cadastro.cliente-atualizado',
          entidade: 'cliente',
          entidadeId: id,
          antes: paraTrilha(antes),
          depois: paraTrilha(depois),
        },
        origemDe(autor),
      );
      return ok(clienteListado(depois));
    });
  }
}

/** DELETE /v1/clientes/{id}: só sem processos vinculados; a trilha guarda o que saiu. */
export class RemoverCliente<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly clientes: RepositorioDeClientes<Transacao>,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
  ) {}

  async executar(
    autor: AutorNoTenant,
    id: Uuid,
  ): Promise<Result<void, NaoEncontrado | RegraDeNegocio>> {
    return this.unidade.executar(async (transacao) => {
      const antes = await this.clientes.buscar(transacao, id);
      if (antes === undefined) return err(naoEncontrado());
      const removido = await this.clientes.remover(transacao, id);
      if (removido === 'nao-encontrado') return err(naoEncontrado());
      if (removido === 'com-processos')
        return err(
          new RegraDeNegocio(
            'cliente-com-processos',
            'Desvincule os processos deste cliente antes de removê-lo.',
          ),
        );
      await this.trilha.registrar(
        transacao,
        {
          tipo: 'cadastro.cliente-removido',
          entidade: 'cliente',
          entidadeId: id,
          antes: paraTrilha(antes),
        },
        origemDe(autor),
      );
      return ok(undefined);
    });
  }
}
