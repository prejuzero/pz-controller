import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { CasoDeAvaliacao } from './caso.js';
import { lerArquivosDoConjunto } from './conjunto.js';
import { lerReferencia, regrasRapidas, tiposDaTaxonomia } from './referencia.js';

describe('referência da avaliação', () => {
  it('a do repositório é válida e cobre todo ato anotado no conjunto', () => {
    const referencia = lerReferencia();
    const codigos = new Set(tiposDaTaxonomia(referencia).map((t) => t.codigo));
    const anotados = lerArquivosDoConjunto().map(
      ({ conteudo }) => CasoDeAvaliacao.parse(conteudo).anotacao.tipoAto,
    );
    expect(anotados.filter((a) => a !== 'desconhecido' && !codigos.has(a))).toEqual([]);
    expect(regrasRapidas(referencia).length).toBeGreaterThan(0);
  });

  it('recusa regra que aponta ato fora da taxonomia', () => {
    const pasta = mkdtempSync(join(tmpdir(), 'pz-eval-ref-'));
    const cabecalho = { versao: 'v1', provisoria: true, observacao: '' };
    writeFileSync(
      join(pasta, 'taxonomia.json'),
      JSON.stringify({
        ...cabecalho,
        tipos: [{ codigo: 'citacao', nome: 'Citação', descricao: '' }],
      }),
    );
    writeFileSync(
      join(pasta, 'regras.json'),
      JSON.stringify({
        ...cabecalho,
        regras: [{ codigo: 'r1', versao: 1, tipoAto: 'sentenca', padroes: ['x'], confianca: 0.9 }],
      }),
    );
    expect(() => lerReferencia(pasta)).toThrow('r1');
  });
});
