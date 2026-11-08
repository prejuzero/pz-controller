import type { Advogado, Oab } from '../domain/advogado.js';
import type { Cliente } from '../domain/cliente.js';
import type { ProcessoDaPlanilha } from '../domain/importacao.js';
import type { Cobertura, EstadoDoProcesso, Processo } from '../domain/processo.js';
import type { Conflito, EventoDominio, Instant, Result, Uuid, Validacao } from '@pz/kernel';

/**
 * Porta: proteção de campos sensíveis (HU37, ADR-021), composta nas apps com as chaves de dados.
 * CPF e documento do cliente são gravados cifrados; o CPF tem índice cego para a unicidade.
 */
export interface ProtecaoDeCampos {
  cifrar(texto: string): string;
  decifrar(cifrado: string): string;
  /** HMAC estável do texto (busca exata e unicidade sem o texto em claro). */
  indice(texto: string): string;
  /** Cifrado com chave que não é a ativa (ou no formato antigo): a recifra o atualiza. */
  precisaRecifrar(cifrado: string): boolean;
}

/** Porta: advogado e OABs do tenant da transação (tabelas `advogado` e `oab`, RLS). */
export interface RepositorioDeAdvogados<Transacao> {
  /**
   * Grava o advogado e as OABs. CPF ou OAB ativa já usados em qualquer tenant (índices únicos
   * globais) não abortam a transação: voltam como conflito para o caso de uso desfazê-la.
   */
  inserir(transacao: Transacao, advogado: Advogado): Promise<'ok' | 'cpf-em-uso' | 'oab-em-uso'>;
  buscarPorUsuario(transacao: Transacao, usuarioId: Uuid): Promise<Advogado | undefined>;
  /** Advogados do tenant da transação, por nome (filtro por responsável). */
  daEquipe(transacao: Transacao): Promise<{ usuarioId: Uuid; nome: string }[]>;
  salvarPerfil(transacao: Transacao, advogado: Advogado): Promise<void>;
  /** `false` se a OAB já está ativa para outro advogado (em qualquer tenant). */
  inserirOab(transacao: Transacao, advogado: Advogado, oab: Oab): Promise<boolean>;
  desativarOab(transacao: Transacao, oab: Oab): Promise<void>;
  /** Inscrições ativas do tenant com a UF e o número (busca por OAB, HU28). */
  oabsDoNumero(
    transacao: Transacao,
    uf: string,
    numero: string,
  ): Promise<{ oabId: Uuid; usuarioId: Uuid }[]>;
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

/** Filtros da busca (HU28) que dizem respeito ao processo. */
export interface FiltroDeProcessosNaBusca {
  /** Só dígitos; 20 é exato, menos é parcial. */
  readonly numeroCnj?: string;
  readonly clienteId?: Uuid;
  readonly tribunal?: string;
  /** Parcial, sem diferença de maiúsculas. */
  readonly orgao?: string;
  readonly comarca?: string;
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
  /** Processos do tenant no filtro (card "processos monitorados" do dashboard, HU26). */
  contar(
    transacao: Transacao,
    filtro: Pick<FiltroDeProcessos, 'tribunal' | 'clienteId'>,
  ): Promise<number>;
  /** Ids dos processos do tenant no filtro da busca (HU28), até `limite`. */
  idsNoFiltro(
    transacao: Transacao,
    filtro: FiltroDeProcessosNaBusca,
    limite: number,
  ): Promise<Uuid[]>;
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

/** Importação de processos por CSV (HU42): as linhas validadas e o desfecho. */
export interface ImportacaoDeProcessos {
  readonly id: Uuid;
  readonly tenantId: Uuid;
  readonly solicitadaPor: Uuid;
  readonly linhas: readonly ProcessoDaPlanilha[];
  readonly situacao: 'pendente' | 'concluida';
  readonly criados: number | null;
  readonly jaExistiam: number | null;
  readonly solicitadaEm: Instant;
  readonly concluidaEm: Instant | null;
}

/** Porta: importações do tenant da transação (tabela `importacao_processo`, RLS). */
export interface RepositorioDeImportacoes<Transacao> {
  inserir(transacao: Transacao, importacao: ImportacaoDeProcessos): Promise<void>;
  buscar(transacao: Transacao, id: Uuid): Promise<ImportacaoDeProcessos | undefined>;
  concluir(
    transacao: Transacao,
    id: Uuid,
    desfecho: { readonly criados: number; readonly jaExistiam: number; readonly em: Instant },
  ): Promise<void>;
}

/** Nome do escritório monitorado na captura (HU42). */
export interface NomeMonitorado {
  readonly id: Uuid;
  readonly tenantId: Uuid;
  readonly nome: string;
  /** Forma canônica (a do alvo da captura). */
  readonly valor: string;
  readonly criadoPor: Uuid;
  readonly criadoEm: Instant;
}

/** Porta: nomes monitorados do tenant da transação (tabela `nome_monitorado`, RLS). */
export interface RepositorioDeNomesMonitorados<Transacao> {
  ativos(transacao: Transacao): Promise<NomeMonitorado[]>;
  /** `false` se o nome já está ativo no tenant (índice único): não aborta a transação. */
  inserir(transacao: Transacao, nome: NomeMonitorado): Promise<boolean>;
  /** Marca como removido; devolve o nome se estava ativo. */
  remover(
    transacao: Transacao,
    id: Uuid,
    remocao: { readonly por: Uuid; readonly em: Instant },
  ): Promise<NomeMonitorado | undefined>;
}
