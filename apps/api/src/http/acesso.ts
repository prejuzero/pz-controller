import {
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ValidarSessao } from '@pz/identidade';

import {
  CABECALHO_CSRF,
  COOKIE_CSRF,
  COOKIE_SESSAO,
  iguaisEmTempoConstante,
  lerCookies,
} from '../auth/cookies.js';

import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Sessao } from '@pz/identidade';
import type { FastifyRequest } from 'fastify';

const CHAVE_PUBLICO = 'pz:publico';
const CHAVE_PARCIAL = 'pz:sessao-parcial';
const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Rota sem autenticação (CLAUDE.md, seção 12). Toda rota declara isto ou @RequerPermissao. */
export const Publico = (): MethodDecorator & ClassDecorator => SetMetadata(CHAVE_PUBLICO, true);

/** Rota que aceita sessão sem o 2FA concluído (ex.: consultar a sessão, sair, verificar 2FA). */
export const PermiteSessaoParcial = (): MethodDecorator & ClassDecorator =>
  SetMetadata(CHAVE_PARCIAL, true);

export interface Autenticacao {
  readonly token: string;
  readonly sessao: Sessao;
  readonly modo: 'cookie' | 'bearer';
}

export type RequisicaoAutenticada = FastifyRequest & { autenticacao?: Autenticacao };

/**
 * Nega por padrão (HU06, ADR-015): rota sem @Publico() exige sessão válida, pelo cookie
 * (navegador, com CSRF double-submit nos métodos que alteram estado) ou por
 * `Authorization: Bearer` (app, MCP, integradores; sem CSRF). A mesma sessão e a mesma
 * identidade nos dois modos. Sem o 2FA, só as rotas marcadas com @PermiteSessaoParcial().
 */
@Injectable()
export class GuardaDeAcesso implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly refletor: Reflector,
    @Inject(ValidarSessao) private readonly validar: ValidarSessao,
  ) {}

  #marcada(chave: string, contexto: ExecutionContext): boolean {
    return (
      this.refletor.getAllAndOverride<boolean | undefined>(chave, [
        contexto.getHandler(),
        contexto.getClass(),
      ]) === true
    );
  }

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    if (this.#marcada(CHAVE_PUBLICO, contexto)) return true;
    const requisicao = contexto.switchToHttp().getRequest<RequisicaoAutenticada>();
    const bearer = /^Bearer ([A-Za-z0-9_-]{20,200})$/.exec(requisicao.headers.authorization ?? '');
    const cookies = lerCookies(requisicao.headers.cookie);
    const token = bearer?.[1] ?? cookies.get(COOKIE_SESSAO);
    if (token === undefined) throw new UnauthorizedException();
    const modo = bearer === null ? 'cookie' : 'bearer';

    if (modo === 'cookie' && !METODOS_SEGUROS.has(requisicao.method)) {
      const cabecalho = requisicao.headers[CABECALHO_CSRF];
      const valido =
        typeof cabecalho === 'string' &&
        iguaisEmTempoConstante(cabecalho, cookies.get(COOKIE_CSRF) ?? '');
      if (!valido) throw new ForbiddenException('Token CSRF ausente ou inválido.');
    }

    const resultado = await this.validar.executar(token);
    if (!resultado.ok) throw new UnauthorizedException();
    if (resultado.valor.nivel !== 'completo' && !this.#marcada(CHAVE_PARCIAL, contexto)) {
      throw new UnauthorizedException();
    }
    requisicao.autenticacao = { token, sessao: resultado.valor, modo };
    return true;
  }
}
