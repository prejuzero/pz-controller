import { Injectable } from '@nestjs/common';
import { executarNoTenant } from '@pz/db';
import { tenantEfetivo } from '@pz/identidade';
import { executarComContexto } from '@pz/observability';
import { Observable } from 'rxjs';

import type { RequisicaoAutenticada } from '../http/acesso.js';
import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';

/**
 * Executa o handler no tenant da sessão (ADR-003): todo acesso ao banco da requisição usa o RLS
 * do tenant de quem está autenticado, ou do tenant acessado na impersonação (HU07). Os logs da
 * requisição levam o usuário real e, se houver, a impersonação. Rotas públicas seguem sem tenant.
 */
@Injectable()
export class ContextoDoUsuario implements NestInterceptor {
  intercept(contexto: ExecutionContext, proximo: CallHandler): Observable<unknown> {
    const sessao = contexto.switchToHttp().getRequest<RequisicaoAutenticada>().autenticacao?.sessao;
    if (sessao === undefined) return proximo.handle();
    const correlacao = {
      userId: sessao.usuarioId,
      ...(sessao.impersonacao === undefined ? {} : { impersonacaoId: sessao.impersonacao.id }),
    };
    return new Observable((assinante) =>
      executarComContexto(correlacao, () =>
        executarNoTenant(tenantEfetivo(sessao), () => proximo.handle().subscribe(assinante)),
      ),
    );
  }
}
