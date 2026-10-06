import { Injectable } from '@nestjs/common';
import { executarNoTenant } from '@pz/db';
import { Observable } from 'rxjs';

import type { RequisicaoAutenticada } from '../http/acesso.js';
import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';

/**
 * Executa o handler no tenant da sessão (ADR-003): todo acesso ao banco da requisição usa o RLS
 * do tenant de quem está autenticado. Rotas públicas seguem sem tenant.
 */
@Injectable()
export class ContextoDoUsuario implements NestInterceptor {
  intercept(contexto: ExecutionContext, proximo: CallHandler): Observable<unknown> {
    const sessao = contexto.switchToHttp().getRequest<RequisicaoAutenticada>().autenticacao?.sessao;
    if (sessao === undefined) return proximo.handle();
    return new Observable((assinante) =>
      executarNoTenant(sessao.tenantId, () => proximo.handle().subscribe(assinante)),
    );
  }
}
