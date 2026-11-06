import { ErroPermanente, ErroTransitorio } from '@pz/integracoes';
import { describe, expect, it } from 'vitest';

import {
  avaliarFerramentas,
  contem,
  lerCasosDeFerramentas,
  relatorioDeFerramentas,
  type CasoDeFerramenta,
  type ResultadoDaEscolha,
} from './ferramentas.js';
import { GravadorDeProvedor, ProvedorGravado } from './gravacoes.js';
import { relogio } from './teste-apoio.js';

import type { OpcoesIA, PromptIA, ProvedorIA, RespostaIA } from '@pz/integracoes';
import type { z } from 'zod';

// Dados FICTÍCIOS.
const caso = (
  id: string,
  pergunta: string,
  ferramentas: (string | null)[],
  argumentos: Record<string, unknown> = {},
  origem: CasoDeFerramenta['origem'] = 'ficticio',
): CasoDeFerramenta => ({ id, origem, pergunta, esperado: { ferramentas, argumentos } });

/** Escolhe pela palavra da pergunta; "QUEBRA" dá saída inválida e "REDE" falha transitória. */
class EscolhaDeMentira implements ProvedorIA {
  gerarEstruturado<Saida>(
    prompt: PromptIA,
    schema: z.ZodType<Saida>,
    opcoes: OpcoesIA,
  ): Promise<RespostaIA<Saida>> {
    const texto = prompt.mensagens.map((m) => m.conteudo).join('\n');
    if (texto.includes('QUEBRA')) return Promise.reject(new ErroPermanente('fora do schema', 'ia'));
    if (texto.includes('REDE')) return Promise.reject(new ErroTransitorio('caiu', 'ia'));
    const saida = texto.includes('TJXA')
      ? { ferramenta: 'buscar_prazos', argumentos: { tribunal: 'TJXA' }, motivo: 'prazos' }
      : texto.includes('outro')
        ? { ferramenta: 'buscar_prazos', argumentos: { tribunal: 'TJXB' }, motivo: 'prazos' }
        : texto.includes('inexistente')
          ? { ferramenta: 'apagar_tudo', argumentos: {}, motivo: 'x' }
          : { ferramenta: null, argumentos: {}, motivo: 'fora do escopo' };
    return Promise.resolve({
      saida: schema.parse(saida),
      modelo: opcoes.modelo,
      uso: { tokensEntrada: 10, tokensSaida: 5, tokensCacheLidos: 0 },
      chamadasDeFerramenta: [],
    });
  }

  saude() {
    return Promise.resolve({ estado: 'operacional' as const, verificadoEm: relogio.agora() });
  }
}

describe('contem', () => {
  it('confere só as chaves esperadas, em profundidade', () => {
    expect(contem({ a: 1, b: { c: 'x', d: 2 } }, { b: { c: 'x' } })).toBe(true);
    expect(contem({ a: 1 }, { a: 2 })).toBe(false);
    expect(contem(null, { a: 1 })).toBe(false);
    expect(contem(['x'], ['x'])).toBe(true);
  });
});

describe('avaliação de uso das ferramentas (HU59)', () => {
  const casos = [
    caso('c1', 'Prazos do TJXA', ['buscar_prazos'], { tribunal: 'TJXA' }),
    caso('c2', 'Prazos do outro tribunal', ['buscar_prazos'], { tribunal: 'TJXA' }),
    caso('c3', 'Capital da França?', ['buscar_prazos']),
    caso('c4', 'Capital da França?', [null]),
    caso('c5', 'QUEBRA', [null]),
    caso('c6', 'Ferramenta inexistente', [null]),
  ];

  it('classifica cada escolha, grava e reproduz igual', async () => {
    const gravador = new GravadorDeProvedor(new EscolhaDeMentira(), relogio);
    const gravados = await avaliarFerramentas(casos, gravador, 'modelo-ficticio');
    expect(gravados.map((r) => r.situacao)).toEqual([
      'acerto',
      'argumentos-errados',
      'ferramenta-errada',
      'acerto',
      'invalida',
      'invalida',
    ]);
    const reproduzidos = await avaliarFerramentas(
      casos,
      new ProvedorGravado(gravador.gravacoes, relogio),
      'modelo-ficticio',
    );
    expect(reproduzidos.map((r) => r.situacao)).toEqual(gravados.map((r) => r.situacao));
  });

  it('sem gravação vira sem-gravacao; falha de integração derruba a rodada', async () => {
    const vazio = new ProvedorGravado({}, relogio);
    const [r] = await avaliarFerramentas(casos.slice(0, 1), vazio, 'm');
    expect(r?.situacao).toBe('sem-gravacao');
    await expect(
      avaliarFerramentas(
        [caso('c7', 'REDE', [null])],
        new GravadorDeProvedor(new EscolhaDeMentira(), relogio),
        'm',
      ),
    ).rejects.toThrow('caiu');
  });

  it('os casos do conjunto seguem o schema', () => {
    expect(lerCasosDeFerramentas().length).toBeGreaterThan(0);
  });
});

describe('relatório da avaliação de ferramentas', () => {
  const resultado = (
    situacao: ResultadoDaEscolha['situacao'],
    origem: CasoDeFerramenta['origem'] = 'ficticio',
  ): ResultadoDaEscolha => ({
    caso: caso('c', 'p', [null], {}, origem),
    situacao,
    ferramenta: null,
    detalhe: 'a|b',
    chamadas: [],
  });

  it('só fictícios: aprova com aviso, mesmo com erro ou sem gravação', () => {
    const r = relatorioDeFerramentas(
      [resultado('acerto'), resultado('ferramenta-errada'), resultado('sem-gravacao')],
      'escolher-ferramenta@0.1.0',
      'm',
    );
    expect(r.aprovado).toBe(true);
    expect(r.aviso).toContain('Só casos fictícios');
    expect(r.aviso).toContain('1 caso(s) sem gravação');
    expect(r.markdown).toContain('**1/3**');
    expect(r.markdown).toContain('a/b');
  });

  it('casos reais: exige gravação e acerto de 98%', () => {
    const real = (s: ResultadoDaEscolha['situacao']) => resultado(s, 'real-anonimizado');
    expect(relatorioDeFerramentas([real('acerto')], 'v', 'm')).toEqual(
      expect.objectContaining({ aprovado: true }),
    );
    expect(relatorioDeFerramentas([real('acerto'), real('invalida')], 'v', 'm').aprovado).toBe(
      false,
    );
    expect(relatorioDeFerramentas([real('sem-gravacao')], 'v', 'm').aprovado).toBe(false);
    expect(relatorioDeFerramentas([], 'v', 'm').markdown).toContain('(0.0%)');
  });
});
