import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
import { AVISO_DAS_FERRAMENTAS } from '@pz/contracts';
import { CatalogoDeFerramentas } from '@pz/ia';
import { z } from 'zod';

import { autenticacao, validar } from '../auth/auth.controller.js';
import { RequerPermissao } from '../http/acesso.js';
import { LimitarPorUsuario } from '../http/limite.js';

import type { RequisicaoAutenticada } from '../http/acesso.js';
import type { FerramentasDeIa, ResultadoDeFerramentaDeIa } from '@pz/contracts';
import type { ContextoDaFerramenta } from '@pz/ia';

/** Cota por usuário, além da cota de cada integração OAuth (HU49). */
const CHAMADAS_POR_MINUTO = 60;
const Nome = z.string().regex(/^[a-z][a-z0-9_]*$/);
const Corpo = z.object({ argumentos: z.record(z.string(), z.unknown()) }).strict();

/**
 * O contexto vem da identidade autenticada, nunca do assistente (ADR-016): escritório, usuário e
 * permissões efetivas (no token OAuth, só os escopos concedidos). Token de cliente OAuth é um
 * assistente externo (canal mcp).
 */
function contextoDe(requisicao: RequisicaoAutenticada): ContextoDaFerramenta {
  const { sessao, permissoes } = autenticacao(requisicao);
  return {
    tenantId: sessao.tenantId,
    usuarioId: sessao.usuarioId,
    permissoes,
    canal:
      sessao.escopos !== undefined ? 'mcp' : sessao.dispositivoId === undefined ? 'portal' : 'app',
  };
}

/**
 * Catálogo de ferramentas de IA (HU59) pela API, para o servidor MCP e outros assistentes (HU60,
 * ADR-015): só leitura, cada chamada auditada no escritório pelo catálogo. Sem regra aqui.
 */
@Controller('v1/ia/ferramentas')
export class FerramentasDeIaController {
  constructor(@Inject(CatalogoDeFerramentas) private readonly catalogo: CatalogoDeFerramentas) {}

  @Get()
  @RequerPermissao('prazos:ler')
  listar(@Req() requisicao: RequisicaoAutenticada): FerramentasDeIa {
    return {
      itens: this.catalogo.disponiveis(contextoDe(requisicao)),
      aviso: AVISO_DAS_FERRAMENTAS,
    };
  }

  @Post(':nome')
  @RequerPermissao('prazos:ler')
  @LimitarPorUsuario(CHAMADAS_POR_MINUTO, 60_000)
  @HttpCode(200)
  async executar(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('nome') nome: string,
    @Body() corpo: unknown,
  ): Promise<ResultadoDeFerramentaDeIa> {
    const { argumentos } = validar(Corpo, corpo);
    const r = await this.catalogo.executar(validar(Nome, nome), argumentos, contextoDe(requisicao));
    if (!r.ok) throw r.erro;
    return { resultado: r.valor, aviso: AVISO_DAS_FERRAMENTAS };
  }
}
