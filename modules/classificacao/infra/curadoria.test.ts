import { FixedClock, Instant } from '@pz/kernel';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  DecidirCandidato,
  ExportarCasosAceitos,
  ListarCandidatos,
  RegistrarCandidatoDeCuradoria,
} from '../application/curadoria.js';

import { CandidatosEmMemoria } from './em-memoria.js';

import type { EntradaDeAuditoria, TrilhaDeAuditoria } from '@pz/auditoria';
import type { UnidadeDeTrabalho, Uuid } from '@pz/kernel';

// Dados FICTÍCIOS: exercitam o ciclo de curadoria (HU22, PZ-162), não são casos reais.
const relogio = new FixedClock(Instant.deIso('2026-10-30T12:00:00.000Z'));
const CONTEUDO = '01a10e00-0000-7000-8000-0000000c0001' as Uuid;
const CURADOR = {
  usuarioId: '01a10e00-0000-7000-8000-0000000c0a01' as Uuid,
  canal: 'portal' as const,
};
const unidade: UnidadeDeTrabalho<unknown> = { executar: (trabalho) => trabalho(undefined) };
const teor = 'Intime-se a parte para contestar. Contato: fulano@exemplo.com, CPF 123.456.789-09.';

let candidatos: CandidatosEmMemoria;
let registrados: EntradaDeAuditoria[];
let registrar: RegistrarCandidatoDeCuradoria<unknown>;
const trilha: TrilhaDeAuditoria<unknown> = {
  registrar: (_tx, entrada) => {
    registrados.push(entrada);
    return Promise.resolve();
  },
};
const ajuste = (payload: Record<string, unknown>) => ({
  payload: {
    tipoAto: 'contestacao',
    tipoAtoAnterior: 'citacao',
    diasAnterior: 15,
    diasNovo: 15,
    publicacaoConteudoId: CONTEUDO,
    ...payload,
  },
});

beforeEach(() => {
  candidatos = new CandidatosEmMemoria();
  candidatos.classificacoes.set(CONTEUDO, { tipoAto: 'citacao', diasCitados: 15 });
  registrados = [];
  registrar = new RegistrarCandidatoDeCuradoria(
    candidatos,
    { teor: (_tx, id) => Promise.resolve(id === CONTEUDO ? teor : undefined) },
    relogio,
  );
});

describe('candidatos de curadoria a partir de correções (HU22, PZ-162)', () => {
  it('ato corrigido vira caso, com dados pessoais minimizados e sem duplicar', async () => {
    expect(await registrar.executar(undefined, ajuste({}))).toBe('registrado');
    expect(await registrar.executar(undefined, ajuste({}))).toBe('ja-registrado');
    const [caso] = candidatos.casos.values();
    expect(caso).toMatchObject({
      tipoAtoClassificado: 'citacao',
      tipoAtoCorrigido: 'contestacao',
      diasCitados: 15,
      diasCorrigidos: 15,
      status: 'pendente',
    });
    expect(caso?.teorAnonimizado).not.toContain('fulano@exemplo.com');
    expect(caso?.teorAnonimizado).not.toContain('123.456.789-09');
  });

  it('não registra: sem publicação, sem mudança ou correção igual à classificação', async () => {
    expect(await registrar.executar(undefined, ajuste({ publicacaoConteudoId: null }))).toBe(
      'sem-publicacao',
    );
    expect(await registrar.executar(undefined, ajuste({ tipoAto: 'citacao' }))).toBe('sem-mudanca');
    // O cálculo errou os dias, mas a classificação já citava 10: nada a aprender para a IA.
    candidatos.classificacoes.set(CONTEUDO, { tipoAto: 'citacao', diasCitados: 10 });
    expect(await registrar.executar(undefined, ajuste({ tipoAto: 'citacao', diasNovo: 10 }))).toBe(
      'sem-mudanca',
    );
    expect(candidatos.casos.size).toBe(0);
  });

  it('dias corrigidos contra a classificação também viram caso; teor sumido lança', async () => {
    expect(await registrar.executar(undefined, ajuste({ tipoAto: 'citacao', diasNovo: 5 }))).toBe(
      'registrado',
    );
    await expect(
      registrar.executar(
        undefined,
        ajuste({ publicacaoConteudoId: '01a10e00-0000-7000-8000-0000000c0002' }),
      ),
    ).rejects.toThrow('sem teor');
    await expect(registrar.executar(undefined, { payload: {} })).rejects.toThrow();
  });

  it('curador aceita (com teor revisado) ou descarta, com motivo e trilha; exporta os aceitos', async () => {
    await registrar.executar(undefined, ajuste({}));
    await registrar.executar(undefined, ajuste({ tipoAto: 'citacao', diasNovo: 5 }));
    const idDe = (ato: string): Uuid => {
      const caso = [...candidatos.casos.values()].find((c) => c.tipoAtoCorrigido === ato);
      if (caso === undefined) throw new Error(`sem caso de ${ato}`);
      return caso.id;
    };
    const [a, b] = [idDe('contestacao'), idDe('citacao')];
    const [primeiro, segundo] = [a, b].sort() as [Uuid, Uuid];
    const decidir = new DecidirCandidato(unidade, candidatos, trilha, relogio);
    const curto = await decidir.executar(CURADOR, a, { decisao: 'aceitar', motivo: 'ok' });
    expect(!curto.ok && curto.erro.codigo).toBe('validacao');
    const aceito = await decidir.executar(CURADOR, a, {
      decisao: 'aceitar',
      motivo: 'classificação errou o ato',
      teorAnonimizado: 'Intime-se a parte para contestar.',
    });
    expect(aceito.ok && aceito.valor).toMatchObject({
      status: 'aceito',
      decididoPor: CURADOR.usuarioId,
    });
    const de_novo = await decidir.executar(CURADOR, a, {
      decisao: 'descartar',
      motivo: 'mudei de ideia',
    });
    expect(!de_novo.ok && de_novo.erro.codigo).toBe('caso-ja-decidido');
    const descartado = await decidir.executar(CURADOR, b, {
      decisao: 'descartar',
      motivo: 'o despacho era ambíguo',
    });
    expect(descartado.ok && descartado.valor.status).toBe('descartado');
    const inexistente = await decidir.executar(CURADOR, CONTEUDO, {
      decisao: 'aceitar',
      motivo: 'qualquer motivo',
    });
    expect(!inexistente.ok && inexistente.erro.codigo).toBe('caso-inexistente');
    expect(registrados.map((r) => r.tipo)).toEqual([
      'classificacao.caso-candidato-decidido',
      'classificacao.caso-candidato-decidido',
    ]);

    const listar = new ListarCandidatos(unidade, candidatos);
    const pendentes = await listar.executar({ status: 'pendente' });
    expect(pendentes.ok && pendentes.valor.itens).toEqual([]);
    const todos = await listar.executar({ limite: '1' });
    expect(todos.ok && todos.valor.proximoCursor).toBe(primeiro);
    const resto = await listar.executar({ limite: '1', cursor: primeiro });
    expect(resto.ok && resto.valor.itens.map((c) => c.id)).toEqual([segundo]);
    expect((await listar.executar({ status: 'outro' })).ok).toBe(false);

    const exportados = await new ExportarCasosAceitos(unidade, candidatos).executar();
    expect(exportados).toEqual([
      {
        id: `correcao-${a}`,
        origem: 'real-anonimizado',
        teor: 'Intime-se a parte para contestar.',
        anotacao: {
          tipoAto: 'contestacao',
          trecho: '',
          prazoCitado: { quantidade: 15, unidade: 'dias' },
        },
        anotador: 'curadoria',
        revisor: null,
        anonimizacaoConferidaPor: null,
      },
    ]);
  });
});
