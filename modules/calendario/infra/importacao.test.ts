import { OutboxEmMemoria } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { COLUNAS_DO_CSV, ImportarCalendario, lerCsv } from '../application/importacao.js';
import { ANA, relogio } from '../teste/ficticios.js';

import { EventosGlobaisEmMemoria } from './em-memoria.js';

import type { AutorEmAcao } from '../application/calendario.js';
import type { TrilhaDeAuditoria } from '@pz/auditoria';
import type { TransacaoEmMemoria } from '@pz/kernel';

// Linhas FICTÍCIAS: só exercitam o mecanismo.
const CABECALHO = COLUNAS_DO_CSV.join(';');
const VALIDA =
  'nacional;;;;;feriado;2030-03-10;2030-03-10;"FICTÍCIO; ""Dia"" de Teste";FICTÍCIO: Lei de Teste, art. 1º;https://exemplo.invalid/a';
const COMARCA =
  'comarca;;;tjxa;Alfa;recesso;2030-03-11;2030-03-12;FICTÍCIO;FICTÍCIO: Portaria 1;https://exemplo.invalid/b';
const ana: AutorEmAcao = { ...ANA, canal: 'portal' };

function montar() {
  const outbox = new OutboxEmMemoria();
  const globais = new EventosGlobaisEmMemoria();
  const tipos: string[] = [];
  const trilha: TrilhaDeAuditoria<TransacaoEmMemoria> = {
    registrar: (tx, entrada) => {
      tx.aoConfirmar(() => tipos.push(entrada.tipo));
      return Promise.resolve();
    },
  };
  const importar = new ImportarCalendario(outbox, globais, trilha, relogio());
  const listar = () => outbox.executar((tx) => globais.listar(tx, {}));
  return { importar, listar, tipos };
}

describe('lerCsv (HU13)', () => {
  it('aspas, aspas escapadas, separador dentro de aspas, CRLF, BOM e linhas em branco', () => {
    expect(lerCsv('﻿a;b\r\n"x;y";"di""z"\r\n\r\n;fim')).toEqual([
      ['a', 'b'],
      ['x;y', 'di"z'],
      ['', 'fim'],
    ]);
    expect(lerCsv('a,b\n1,"2\n3"')).toEqual([
      ['a', 'b'],
      ['1', '2\n3'],
    ]);
  });
});

describe('ImportarCalendario (HU13)', () => {
  it('prévia: valida cada linha e não grava nada', async () => {
    const { importar, listar, tipos } = montar();
    const r = await importar.executar(ana, { csv: [CABECALHO, VALIDA, COMARCA].join('\n') });
    expect(r.ok && r.valor).toEqual({
      linhas: [
        { linha: 2, problemas: [] },
        { linha: 3, problemas: [] },
      ],
      propostos: [],
    });
    expect(await listar()).toEqual([]);
    expect(tipos).toEqual([]);
  });

  it('tudo ou nada: uma linha inválida impede a gravação e aponta o problema', async () => {
    const { importar, listar } = montar();
    const invalida = 'uf;;;;;feriado;2030-03-10;2030-03-09;x;y;http://x;extra';
    const r = await importar.executar(ana, {
      csv: [CABECALHO, VALIDA, invalida].join('\n'),
      somentePrevia: false,
    });
    expect(r.ok && r.valor.linhas[1]?.problemas.map((p) => p.campo)).toEqual(['urlAto', 'csv']);
    expect(r.ok && r.valor.propostos).toEqual([]);
    expect(await listar()).toEqual([]);
  });

  it('confirmada: grava rascunhos normalizados e audita cada proposta', async () => {
    const { importar, listar, tipos } = montar();
    const r = await importar.executar(ana, {
      csv: [CABECALHO, VALIDA, COMARCA].join('\r\n'),
      somentePrevia: false,
    });
    expect(r.ok && r.valor.propostos.map((e) => [e.status, e.tribunal, e.descricao])).toEqual([
      ['rascunho', null, 'FICTÍCIO; "Dia" de Teste'],
      ['rascunho', 'TJXA', 'FICTÍCIO'],
    ]);
    expect(await listar()).toHaveLength(2);
    expect(tipos).toEqual(['calendario.evento-proposto', 'calendario.evento-proposto']);
  });

  it('recusa entrada sem CSV, cabeçalho diferente ou sem linhas', async () => {
    const { importar } = montar();
    for (const entrada of [{}, { csv: 'a;b\n1;2' }, { csv: CABECALHO }]) {
      const r = await importar.executar(ana, entrada);
      expect(!r.ok && r.erro.problemas[0]?.campo).toBe('csv');
    }
  });
});
