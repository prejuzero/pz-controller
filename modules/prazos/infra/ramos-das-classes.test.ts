import { FixedClock, gerarUuidV7, Instant, OutboxEmMemoria } from '@pz/kernel';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  AprovarRamoDaClasse,
  ListarRamosDasClasses,
  ProporRamoDaClasse,
} from '../application/ramos-das-classes.js';

import { RamosDasClassesEmMemoria } from './em-memoria.js';

// Curadora, classes e fundamentos FICTÍCIOS.
const relogio = new FixedClock(Instant.deIso('2026-11-14T12:00:00Z'));
const CURADORA = {
  tenantId: gerarUuidV7(relogio),
  usuarioId: gerarUuidV7(relogio),
  canal: 'portal' as const,
};
const PROPOSTA = {
  classe: 'Procedimento do Juizado Especial Cível',
  ramo: 'juizados',
  fundamento: 'FUNDAMENTO FICTÍCIO',
  fonteUrl: 'https://exemplo.invalid/fonte',
};

let ramos: RamosDasClassesEmMemoria;
let outbox: OutboxEmMemoria;
let trilha: { tipo: string; entidadeId: string }[];
const registrar = {
  registrar: (_tx: unknown, e: { tipo: string; entidadeId: string }) => {
    trilha.push({ tipo: e.tipo, entidadeId: e.entidadeId });
    return Promise.resolve();
  },
};

beforeEach(() => {
  ramos = new RamosDasClassesEmMemoria();
  outbox = new OutboxEmMemoria();
  trilha = [];
});

describe('ramo pela classe processual (14/11/2026)', () => {
  it('proposta nasce rascunho na forma canônica; aprovada vale, com trilha e evento', async () => {
    const proposta = await new ProporRamoDaClasse(outbox, ramos, registrar, relogio).executar(
      CURADORA,
      PROPOSTA,
    );
    if (!proposta.ok) throw proposta.erro;
    expect(proposta.valor).toMatchObject({
      classe: 'PROCEDIMENTO DO JUIZADO ESPECIAL CIVEL',
      ramo: 'juizados',
      versao: 1,
      status: 'rascunho',
    });
    expect(await ramos.ramoAprovado(undefined as never, proposta.valor.classe)).toBeUndefined();

    const aprovar = new AprovarRamoDaClasse(outbox, ramos, registrar, outbox, relogio);
    const aprovada = await aprovar.executar(CURADORA, proposta.valor.id);
    expect(aprovada.ok && aprovada.valor.status).toBe('aprovado');
    expect(await ramos.ramoAprovado(undefined as never, proposta.valor.classe)).toBe('juizados');
    expect(trilha.map((t) => t.tipo)).toEqual([
      'prazos.ramo-da-classe-proposto',
      'prazos.ramo-da-classe-aprovado',
    ]);
    expect(outbox.pendentes().map((e) => [e.tipo, e.tenantId, e.payload])).toEqual([
      [
        'RamoDaClasseAprovado',
        CURADORA.tenantId,
        {
          versaoId: proposta.valor.id,
          classe: 'PROCEDIMENTO DO JUIZADO ESPECIAL CIVEL',
          ramo: 'juizados',
        },
      ],
    ]);
    const de_novo = await aprovar.executar(CURADORA, proposta.valor.id);
    expect(!de_novo.ok && de_novo.erro.codigo).toBe('versao-ja-aprovada');
    const inexistente = await aprovar.executar(CURADORA, gerarUuidV7(relogio));
    expect(!inexistente.ok && inexistente.erro.codigo).toBe('versao-inexistente');
  });

  it('recusa classe curta, ramo fora da lista e fonte sem https', async () => {
    const propor = new ProporRamoDaClasse(outbox, ramos, registrar, relogio);
    const curta = await propor.executar(CURADORA, { ...PROPOSTA, classe: ' x ' });
    expect(!curta.ok && curta.erro.codigo).toBe('validacao');
    const ramo = await propor.executar(CURADORA, { ...PROPOSTA, ramo: 'familia' });
    expect(!ramo.ok && ramo.erro.codigo).toBe('validacao');
    const http = await propor.executar(CURADORA, { ...PROPOSTA, fonteUrl: 'http://x.invalid' });
    expect(!http.ok && http.erro.codigo).toBe('validacao');
    expect(ramos.versoes).toEqual([]);
  });

  it('lista as classes vistas e as propostas: a aprovada vale e o rascunho mais novo espera', async () => {
    const propor = new ProporRamoDaClasse(outbox, ramos, registrar, relogio);
    const aprovar = new AprovarRamoDaClasse(outbox, ramos, registrar, outbox, relogio);
    const v1 = await propor.executar(CURADORA, {
      ...PROPOSTA,
      classe: 'PROCEDIMENTO COMUM CIVEL',
      ramo: 'civel',
    });
    if (!v1.ok) throw v1.erro;
    await aprovar.executar(CURADORA, v1.valor.id);
    await propor.executar(CURADORA, {
      ...PROPOSTA,
      classe: 'PROCEDIMENTO COMUM CIVEL',
      ramo: 'juizados',
    });
    // Concorrência no número da versão: a segunda proposta com o mesmo número é recusada.
    ramos.proximaVersao = () => Promise.resolve(1);
    const repetida = await propor.executar(CURADORA, {
      ...PROPOSTA,
      classe: 'PROCEDIMENTO COMUM CIVEL',
    });
    expect(!repetida.ok && repetida.erro.codigo).toBe('versao-concorrente');

    const lista = await new ListarRamosDasClasses(outbox, ramos, {
      listar: () =>
        Promise.resolve([
          { classe: 'PROCEDIMENTO COMUM CIVEL', ocorrencias: 10 },
          { classe: 'APELACAO CIVEL', ocorrencias: 1 },
        ]),
    }).executar();
    expect(
      lista.map((c) => [
        c.classe,
        c.ocorrencias,
        c.aprovada?.ramo ?? null,
        c.rascunho?.ramo ?? null,
      ]),
    ).toEqual([
      ['PROCEDIMENTO COMUM CIVEL', 10, 'civel', 'juizados'],
      ['APELACAO CIVEL', 1, null, null],
    ]);
  });
});
