import { Controller, Get, Header, Inject, NotFoundException } from '@nestjs/common';
import { documentoOpenApi } from '@pz/contracts';

import { AMBIENTE } from './fichas.js';
import { Publico } from './http/acesso.js';

import type { AmbienteApi } from './ambiente.js';

// A interface de documentação carrega o Scalar da CDN jsDelivr com versão e hash (SRI) fixos;
// só fora de produção.
const PAGINA_DOCUMENTACAO = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>PrejuZero API</title>
  </head>
  <body>
    <script id="api-reference" data-url="/v1/openapi.json"></script>
    <script
      src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.73.0"
      integrity="sha384-OKyMdsDX84ypSZEhVun8YElXk5c2GQaH3EXPOc6ItmVcLDUAvKHYwvDLvAgsqVtB"
      crossorigin="anonymous"
    ></script>
  </body>
</html>`;

@Controller('v1')
export class OpenApiController {
  private readonly documento = documentoOpenApi();

  constructor(@Inject(AMBIENTE) private readonly ambiente: AmbienteApi) {}

  /** Contrato da API (ADR-009): o mesmo gerado em packages/contracts/openapi.json. */
  @Get('openapi.json')
  @Publico()
  openapi(): Record<string, unknown> {
    return this.documento;
  }

  @Get('docs')
  @Publico()
  @Header('Content-Type', 'text/html; charset=utf-8')
  documentacao(): string {
    if (this.ambiente.NODE_ENV === 'production') throw new NotFoundException();
    return PAGINA_DOCUMENTACAO;
  }
}
