import {
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { concede, ConsultarPermissoes, ValidarSessao } from '@pz/identidade';

import {
  CABECALHO_CSRF,
  COOKIE_CSRF,
  COOKIE_SESSAO,
  iguaisEmTempoConstante,
  lerCookies,
} from '../auth/cookies.js';

import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Permissao, Sessao } from '@pz/identidade';
import type { FastifyRequest } from 'fastify';

const CHAVE_PUBLICO = 'pz:publico';
const CHAVE_PARCIAL = 'pz:sessao-parcial';
const CHAVE_PERMISSOES = 'pz:permissoes';
const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Rota sem autenticação (CLAUDE.md, seção 12). Toda rota declara isto ou @RequerPermissao. */
export const Publico = (): MethodDecorator & ClassDecorator => SetMetadata(CHAVE_PUBLICO, true);

/** Rota que aceita sessão sem o 2FA concluído (ex.: consultar a sessão, sair, verificar 2FA). */
export const PermiteSessaoParcial = (): MethodDecorator & ClassDecorator =>
  SetMetadata(CHAVE_PARCIAL, true);

/**
 * Permissões exigidas pela rota (HU07), todas necessárias. Vêm do catálogo do módulo identidade;
 * perfis só as combinam, então perfil novo não muda endpoints.
 */
export const RequerPermissao = (
  ...permissoes: [Permissao, ...Permissao[]]
): MethodDecorator & ClassDecorator => SetMetadata(CHAVE_PERMISSOES, permissoes);

/** Declarações de acesso da rota (usadas pela varredura que exige uma em toda rota). */
export function declaracaoDeAcesso(
  refletor: Reflector,
  alvos: Parameters<Reflector['getAllAndOverride']>[1],
): { publica: boolean; parcial: boolean; permissoes: readonly Permissao[] | undefined } {
  return {
    publica: refletor.getAllAndOverride<boolean | undefined>(CHAVE_PUBLICO, alvos) === true,
    parcial: refletor.getAllAndOverride<boolean | undefined>(CHAVE_PARCIAL, alvos) === true,
    permissoes: refletor.getAllAndOverride<readonly Permissao[] | undefined>(
      CHAVE_PERMISSOES,
      alvos,
    ),
  };
}

export interface Autenticacao {
  readonly token: string;
  readonly sessao: Sessao;
  readonly modo: 'cookie' | 'bearer';
  /** Permissões efetivas, lidas a cada requisição (vazio sem o 2FA). */
  readonly permissoes: ReadonlySet<Permissao>;
}

export type RequisicaoAutenticada = FastifyRequest & { autenticacao?: Autenticacao };

/**
 * Nega por padrão (HU06, ADR-015): rota sem @Publico() exige sessão válida, pelo cookie
 * (navegador, com CSRF double-submit nos métodos que alteram estado) ou por
 * `Authorization: Bearer` (app, MCP, integradores; sem CSRF). A mesma sessão e a mesma
 * identidade nos dois modos. Sem o 2FA, só as rotas marcadas com @PermiteSessaoParcial().
 * Com sessão completa, a rota exige as permissões de @RequerPermissao (HU07); rota autenticada
 * sem essa declaração nem @PermiteSessaoParcial é negada (403).
 */
@Injectable()
export class GuardaDeAcesso implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly refletor: Reflector,
    @Inject(ValidarSessao) private readonly validar: ValidarSessao,
    @Inject(ConsultarPermissoes) private readonly consultarPermissoes: ConsultarPermissoes,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const declaracao = declaracaoDeAcesso(this.refletor, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (declaracao.publica) return true;
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
    const sessao = resultado.valor;
    if (sessao.nivel !== 'completo' && !declaracao.parcial) throw new UnauthorizedException();
    const permissoes = await this.consultarPermissoes.executar(sessao);
    if (!declaracao.parcial && !concede(permissoes, declaracao.permissoes ?? [])) {
      throw new ForbiddenException('Você não tem permissão para esta operação.');
    }
    requisicao.autenticacao = { token, sessao, modo, permissoes };
    return true;
  }
}
