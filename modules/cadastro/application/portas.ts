import type { Advogado, Oab } from '../domain/advogado.js';
import type { Cliente } from '../domain/cliente.js';
import type { Cobertura, EstadoDoProcesso, Processo } from '../domain/processo.js';
import type { Conflito, EventoDominio, Result, Uuid, Validacao } from '@pz/kernel';

/** Porta: advogado e OABs do tenant da transação (tabelas `advogado` e `oab`, RLS). */
export interface RepositorioDeAdvogados<Transacao> {
  /**
   * Grava o advogado e as OABs. CPF ou OAB ativa já usados em qualquer tenant (índices únicos
   * globais) não abortam a transação: voltam como conflito para o caso de uso desfazê-la.
   */
  inserir(transacao: Transacao, advogado: Advogado): Promise<'ok' | 'cpf-em-uso' | 'oab-em-uso'>;
  buscarPorUsuario(transacao: Transacao, usuarioId: Uuid): Promise<Advogado | undefined>;
  salvarPerfil(transacao: Transacao, advogado: Advogado): Promise<void>;
  /** `false` se a OAB já está ativa para outro advogado (em qualquer tenant). */
  inserirOab(transacao: Transacao, advogado: Advogado, oab: Oab): Promise<boolean>;
  desativarOab(transacao: Transacao, oab: Oab): Promise<void>;
}

/** Conta de acesso do novo advogado, já validada e com a senha em hash (fora da transação). */
export interface ContaPreparada {
  readonly nome: string;
  readonly email: string;
  readonly senhaHash: string;
}

/**
 * Porta para a identidade (implementada pela API pública dela na composição): cria o tenant
 * autônomo, o usuário com a credencial e o perfil `advogado` na transação do cadastro.
 */
export interface CriadorDeConta<Transacao> {
  preparar(entrada: {
    nome: string;
    email: string;
    senha: string;
  }): Promise<Result<ContaPreparada, Validacao>>;
  gravar(
    transacao: Transacao,
    conta: ContaPreparada & { tenantId: Uuid; usuarioId: Uuid; nomeDoTenant: string },
  ): Promise<Result<void, Conflito>>;
}

/** Unidade de trabalho num tenant ainda sem sessão (o cadastro cria o próprio tenant). */
export interface UnidadeNoTenant<Transacao> {
  executar<Resultado>(
    tenantId: Uuid,
    trabalho: (transacao: Transacao) => Promise<Resultado>,
  ): Promise<Resultado>;
}

/**
 * Porta para a identidade: prepara a verificação do e-mail (token guardado) e devolve o evento
 * que vai para o outbox na transação do cadastro; o worker envia o link (HU11).
 */
export interface PreparadorDeVerificacao {
  preparar(conta: { usuarioId: Uuid; tenantId: Uuid; email: string }): Promise<EventoDominio>;
}

/** Página por cursor: itens depois do id `apos`, do mais novo para o mais antigo (UUIDv7). */
export interface Paginacao {
  readonly apos?: Uuid;
  readonly limite: number;
}

export interface FiltroDeProcessos {
  /** Dígitos do número CNJ, completo ou parcial. */
  readonly numero?: string;
  readonly clienteId?: Uuid;
  readonly tribunal?: string | undefined;
  readonly cobertura?: Cobertura | undefined;
  readonly sigiloso?: boolean | undefined;
}

/** Porta: processos do tenant da transação (tabela `processo`, RLS). */
export interface RepositorioDeProcessos<Transacao> {
  /** `false` se o número já existe no tenant (UNIQUE): não aborta a transação. */
  inserir(transacao: Transacao, processo: Processo): Promise<boolean>;
  buscar(transacao: Transacao, id: Uuid): Promise<Processo | undefined>;
  buscarPorNumero(transacao: Transacao, numeroCnj: string): Promise<Processo | undefined>;
  salvar(transacao: Transacao, processo: Processo): Promise<void>;
  listar(
    transacao: Transacao,
    filtro: FiltroDeProcessos,
    pagina: Paginacao,
  ): Promise<EstadoDoProcesso[]>;
}

/** Porta: clientes do tenant da transação (tabela `cliente`, RLS). */
export interface RepositorioDeClientes<Transacao> {
  inserir(transacao: Transacao, cliente: Cliente): Promise<void>;
  buscar(transacao: Transacao, id: Uuid): Promise<Cliente | undefined>;
  salvar(transacao: Transacao, cliente: Cliente): Promise<void>;
  /** Só apaga sem processos vinculados. */
  remover(transacao: Transacao, id: Uuid): Promise<'ok' | 'nao-encontrado' | 'com-processos'>;
  listar(transacao: Transacao, filtro: { nome?: string }, pagina: Paginacao): Promise<Cliente[]>;
}
