import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { Buscar } from '@pz/busca';

import { RequerPermissao } from '../http/acesso.js';
import { listada } from '../publicacoes/publicacoes.controller.js';

import type {
  ResultadoDaBuscaDePrazos,
  ResultadoDaBuscaDePublicacoes,
  SugestoesDaBuscaRapida,
} from '@pz/contracts';

/** Busca avançada e rápida (HU28); a regra fica no módulo busca, que compõe os outros. */
@Controller('v1/busca')
export class BuscaController {
  constructor(@Inject(Buscar) private readonly buscar: Buscar) {}

  @Post('prazos')
  @RequerPermissao('prazos:ler')
  @HttpCode(200)
  async prazos(@Body() corpo: unknown): Promise<ResultadoDaBuscaDePrazos> {
    const r = await this.buscar.prazos(corpo);
    if (!r.ok) throw r.erro;
    return r.valor;
  }

  @Post('publicacoes')
  @RequerPermissao('publicacoes:ler')
  @HttpCode(200)
  async publicacoes(@Body() corpo: unknown): Promise<ResultadoDaBuscaDePublicacoes> {
    const r = await this.buscar.publicacoes(corpo);
    if (!r.ok) throw r.erro;
    return { ...r.valor, itens: r.valor.itens.map(listada) };
  }

  @Post('rapida')
  @RequerPermissao('prazos:ler')
  @HttpCode(200)
  async rapida(@Body() corpo: unknown): Promise<SugestoesDaBuscaRapida> {
    const r = await this.buscar.rapida(corpo);
    if (!r.ok) throw r.erro;
    return r.valor;
  }
}
