import type { Advogado, Oab } from '../domain/advogado.js';
import type { Conflito, Result, Uuid, Validacao } from '@pz/kernel';

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
