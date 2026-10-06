import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from '@nestjs/common';
import {
  AprovarEventoDoCalendario,
  CadastrarFeriadoLocal,
  ConsultarCalendario,
  ConsultarDiasNaoUteis,
  ImportarCalendario,
  ProporEventoDoCalendario,
  RevogarEventoDoCalendario,
  RevogarFeriadoLocal,
} from '@pz/calendario';
import { ConsultaDoPeriodo } from '@pz/contracts';
import { LocalDate } from '@pz/kernel';
import { z } from 'zod';

import { autenticacao, validar } from '../auth/auth.controller.js';
import { RequerPermissao } from '../http/acesso.js';

import type { RequisicaoAutenticada } from '../http/acesso.js';
import type { AutorEmAcao, FiltroDoCalendario } from '@pz/calendario';
import type {
  DiasNaoUteis,
  EventoDoCalendario,
  EventosDoCalendario,
  FeriadoLocal,
  FeriadosLocais,
  ResultadoDaImportacao,
} from '@pz/contracts';
import type { Uuid } from '@pz/kernel';

/** Quem age: token de dispositivo é app (o tipo exato do cliente entra com a HU49). */
function autorDe(requisicao: RequisicaoAutenticada): AutorEmAcao {
  const { sessao } = autenticacao(requisicao);
  return {
    tenantId: sessao.tenantId,
    usuarioId: sessao.usuarioId,
    canal: sessao.dispositivoId === undefined ? 'portal' : 'app',
  };
}

function filtroDe(consulta: unknown): FiltroDoCalendario {
  const { inicio, fim } = validar(ConsultaDoPeriodo, consulta);
  const data = (texto: string) => LocalDate.analisar(texto);
  const [de, ate] = [
    inicio === undefined ? undefined : data(inicio),
    fim === undefined ? undefined : data(fim),
  ];
  return {
    ...(de?.ok === true ? { inicio: de.valor } : {}),
    ...(ate?.ok === true ? { fim: ate.valor } : {}),
  };
}

const Id = z.uuid();
const idDe = (id: string) => validar(Id, id) as Uuid;

/** Contratos do calendário forense (HU13); a regra fica no módulo calendario. */
@Controller('v1')
export class CalendarioController {
  constructor(
    @Inject(ProporEventoDoCalendario) private readonly propor: ProporEventoDoCalendario<unknown>,
    @Inject(AprovarEventoDoCalendario) private readonly aprovar: AprovarEventoDoCalendario<unknown>,
    @Inject(RevogarEventoDoCalendario) private readonly revogar: RevogarEventoDoCalendario<unknown>,
    @Inject(ImportarCalendario) private readonly importar: ImportarCalendario<unknown>,
    @Inject(CadastrarFeriadoLocal) private readonly cadastrar: CadastrarFeriadoLocal<unknown>,
    @Inject(RevogarFeriadoLocal) private readonly revogarLocal: RevogarFeriadoLocal<unknown>,
    @Inject(ConsultarCalendario) private readonly consultar: ConsultarCalendario<unknown>,
    @Inject(ConsultarDiasNaoUteis) private readonly dias: ConsultarDiasNaoUteis<unknown>,
  ) {}

  @Get('admin/calendario')
  @RequerPermissao('curadoria:calendario')
  async listarGlobal(@Query() consulta: unknown): Promise<EventosDoCalendario> {
    return {
      itens: await this.consultar.globaisListados(filtroDe(consulta)),
    } as EventosDoCalendario;
  }

  @Post('admin/calendario')
  @RequerPermissao('curadoria:calendario')
  @HttpCode(201)
  async proporGlobal(
    @Req() requisicao: RequisicaoAutenticada,
    @Body() corpo: unknown,
  ): Promise<EventoDoCalendario> {
    const r = await this.propor.executar(autorDe(requisicao), corpo);
    if (!r.ok) throw r.erro;
    return r.valor as EventoDoCalendario;
  }

  @Post('admin/calendario/importacao')
  @RequerPermissao('curadoria:calendario')
  @HttpCode(200)
  async importarGlobal(
    @Req() requisicao: RequisicaoAutenticada,
    @Body() corpo: unknown,
  ): Promise<ResultadoDaImportacao> {
    const r = await this.importar.executar(autorDe(requisicao), corpo);
    if (!r.ok) throw r.erro;
    return {
      linhas: r.valor.linhas.map((l) => ({ linha: l.linha, problemas: [...l.problemas] })),
      propostos: r.valor.propostos.map((e) => e as EventoDoCalendario),
    };
  }

  @Post('admin/calendario/:id/aprovar')
  @RequerPermissao('curadoria:calendario')
  @HttpCode(200)
  async aprovarGlobal(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('id') id: string,
  ): Promise<EventoDoCalendario> {
    const r = await this.aprovar.executar(autorDe(requisicao), idDe(id));
    if (!r.ok) throw r.erro;
    return r.valor as EventoDoCalendario;
  }

  @Post('admin/calendario/:id/revogar')
  @RequerPermissao('curadoria:calendario')
  @HttpCode(200)
  async revogarGlobal(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('id') id: string,
    @Body() corpo: unknown,
  ): Promise<EventoDoCalendario> {
    const r = await this.revogar.executar(autorDe(requisicao), idDe(id), corpo);
    if (!r.ok) throw r.erro;
    return r.valor as EventoDoCalendario;
  }

  @Get('calendario/locais')
  @RequerPermissao('calendario:ler')
  async listarLocais(@Query() consulta: unknown): Promise<FeriadosLocais> {
    return { itens: await this.consultar.locaisListados(filtroDe(consulta)) } as FeriadosLocais;
  }

  @Post('calendario/locais')
  @RequerPermissao('calendario:gerir')
  @HttpCode(201)
  async cadastrarLocal(
    @Req() requisicao: RequisicaoAutenticada,
    @Body() corpo: unknown,
  ): Promise<FeriadoLocal> {
    const r = await this.cadastrar.executar(autorDe(requisicao), corpo);
    if (!r.ok) throw r.erro;
    return r.valor as FeriadoLocal;
  }

  @Post('calendario/locais/:id/revogar')
  @RequerPermissao('calendario:gerir')
  @HttpCode(200)
  async revogarLocalDoEscritorio(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('id') id: string,
  ): Promise<FeriadoLocal> {
    const r = await this.revogarLocal.executar(autorDe(requisicao), idDe(id));
    if (!r.ok) throw r.erro;
    return r.valor as FeriadoLocal;
  }

  @Get('calendario/dias-nao-uteis')
  @RequerPermissao('calendario:ler')
  async diasNaoUteis(@Query() consulta: Record<string, unknown>): Promise<DiasNaoUteis> {
    const { inicio, fim, ...jurisdicao } = consulta;
    const r = await this.dias.executar({ jurisdicao, inicio, fim });
    if (!r.ok) throw r.erro;
    return {
      itens: r.valor.map((dia) => ({ ...dia, data: dia.data.paraIso() })),
    };
  }
}
