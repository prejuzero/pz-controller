import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ConsultarAgenda } from '@pz/busca';

import { RequerPermissao } from '../http/acesso.js';

import type { Agenda } from '@pz/contracts';

/** Agenda do calendário do portal (HU27); a regra fica no módulo busca. */
@Controller('v1/agenda')
export class AgendaController {
  constructor(@Inject(ConsultarAgenda) private readonly agenda: ConsultarAgenda) {}

  @Get()
  @RequerPermissao('prazos:ler')
  async consultarAgenda(@Query() consulta: unknown): Promise<Agenda> {
    const r = await this.agenda.executar(consulta);
    if (!r.ok) throw r.erro;
    return r.valor;
  }
}
