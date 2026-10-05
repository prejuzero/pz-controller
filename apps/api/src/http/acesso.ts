import { Inject, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { CanActivate, ExecutionContext } from '@nestjs/common';

const CHAVE_PUBLICO = 'pz:publico';

/** Rota sem autenticação (CLAUDE.md, seção 12). Toda rota declara isto ou @RequerPermissao. */
export const Publico = (): MethodDecorator & ClassDecorator => SetMetadata(CHAVE_PUBLICO, true);

/**
 * Nega por padrão: rota sem @Publico() exige autenticação. Até a HU06 (identidade) não há
 * autenticação, então toda rota não pública responde 401. A HU07 acrescenta @RequerPermissao.
 */
@Injectable()
export class GuardaDeAcesso implements CanActivate {
  constructor(@Inject(Reflector) private readonly refletor: Reflector) {}

  canActivate(contexto: ExecutionContext): boolean {
    const publico = this.refletor.getAllAndOverride<boolean | undefined>(CHAVE_PUBLICO, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (publico === true) return true;
    throw new UnauthorizedException();
  }
}
