import { Conflito, err, ok } from '@pz/kernel';

import { normalizarEmail, validarNovaSenha } from '../domain/credenciais.js';

import type { HasherDeSenha } from './portas.js';
import type { Result, Uuid, Validacao } from '@pz/kernel';

export interface ContaNova {
  readonly tenantId: Uuid;
  readonly nomeDoTenant: string;
  readonly usuarioId: Uuid;
  readonly nome: string;
  readonly email: string;
  readonly senhaHash: string;
}

/** Porta: tenant autônomo, usuário e perfil `advogado`, na transação de quem chama (HU11). */
export interface RepositorioDeContas<Transacao> {
  /** `false` se o e-mail já pertence a outra conta (índice único global); nada é gravado. */
  criar(transacao: Transacao, conta: ContaNova): Promise<boolean>;
}

/**
 * Conta do advogado que se cadastra sozinho (HU11). O hash da senha sai antes da transação
 * (Argon2id é lento de propósito); a gravação entra na transação do cadastro, que desfaz tudo
 * se qualquer etapa falhar.
 */
export class CriarConta<Transacao> {
  constructor(
    private readonly hasher: HasherDeSenha,
    private readonly contas: RepositorioDeContas<Transacao>,
  ) {}

  async preparar(entrada: {
    nome: string;
    email: string;
    senha: string;
  }): Promise<Result<{ nome: string; email: string; senhaHash: string }, Validacao>> {
    const email = normalizarEmail(entrada.email);
    const senha = validarNovaSenha(entrada.senha);
    if (!email.ok) return email;
    if (!senha.ok) return senha;
    return ok({
      nome: entrada.nome,
      email: email.valor,
      senhaHash: await this.hasher.gerar(senha.valor),
    });
  }

  async gravar(transacao: Transacao, conta: ContaNova): Promise<Result<void, Conflito>> {
    if (await this.contas.criar(transacao, conta)) return ok(undefined);
    return err(
      new Conflito('email-em-uso', 'Este e-mail já tem cadastro. Entre ou recupere a senha.'),
    );
  }
}
