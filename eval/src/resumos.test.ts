import { ErroPermanente, ErroTransitorio } from '@pz/integracoes';
import { describe, expect, it } from 'vitest';

import { GravadorDeProvedor, ProvedorGravado } from './gravacoes.js';
import {
  avaliarResumos,
  lerCasosDeResumo,
  relatorioDeResumos,
  type CasoDeResumo,
  type ResultadoDoResumo,
} from './resumos.js';
import { relogio } from './teste-apoio.js';

import type { OpcoesIA, PromptIA, ProvedorIA, RespostaIA } from '@pz/integracoes';
import type { z } from 'zod';

// Dados FICTÍCIOS.
const caso = (
  id: string,
  teor: string,
  termos: string[],
  temProvidencia = true,
  origem: CasoDeResumo['origem'] = 'ficticio',
): CasoDeResumo => ({ id, origem, teor, esperado: { termos, temProvidencia } });

/** Resume pelo teor: "INVENTA" cita trecho que não está no teor, "QUEBRA" e "REDE" falham. */
class ResumoDeMentira implements ProvedorIA {
  gerarEstruturado<Saida>(
    prompt: PromptIA,
    schema: z.ZodType<Saida>,
    opcoes: OpcoesIA,
  ): Promise<RespostaIA<Saida>> {
    const texto = prompt.mensagens.map((m) => m.conteudo).join('\n');
    if (texto.includes('QUEBRA')) return Promise.reject(new ErroPermanente('fora do schema', 'ia'));
    if (texto.includes('REDE')) return Promise.reject(new ErroTransitorio('caiu', 'ia'));
    const saida = {
      resumo: 'Pede manifestação sobre a contestação.',
      providencia: texto.includes('arquivem') ? null : 'Manifestar-se.',
      trechos: [
        texto.includes('INVENTA')
          ? 'a parte ré foi condenada'
          : 'manifestar-se sobre a contestação',
      ],
    };
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

const TEOR = 'Intime-se a parte autora para manifestar-se sobre a contestação.';

describe('avaliação do resumo (HU62)', () => {
  const casos = [
    caso('r1', TEOR, ['contestação']),
    caso('r2', TEOR, ['sentença']),
    caso('r3', TEOR, ['contestação'], false),
    caso('r4', `${TEOR} INVENTA`, ['contestação']),
    caso('r5', `${TEOR} QUEBRA`, ['contestação']),
    caso('r6', `${TEOR} arquivem-se`, ['contestação'], false),
  ];

  it('classifica cada resumo, grava e reproduz igual', async () => {
    const gravador = new GravadorDeProvedor(new ResumoDeMentira(), relogio);
    const gravados = await avaliarResumos(casos, gravador, 'modelo-ficticio');
    expect(gravados.map((r) => r.situacao)).toEqual([
      'acerto',
      'termo-ausente',
      'providencia-errada',
      'revisao-manual',
      'revisao-manual',
      'acerto',
    ]);
    expect(gravados[1]?.detalhe).toBe('faltou: sentença');
    expect(gravados[3]?.detalhe).toBe('trecho-fora-do-teor');
    const reproduzidos = await avaliarResumos(
      casos,
      new ProvedorGravado(gravador.gravacoes, relogio),
      'modelo-ficticio',
    );
    expect(reproduzidos.map((r) => r.situacao)).toEqual(gravados.map((r) => r.situacao));
  });

  it('sem gravação vira sem-gravacao; falha de integração derruba a rodada', async () => {
    const [r] = await avaliarResumos(casos.slice(0, 1), new ProvedorGravado({}, relogio), 'm');
    expect(r?.situacao).toBe('sem-gravacao');
    await expect(
      avaliarResumos(
        [caso('r7', `${TEOR} REDE`, ['x'])],
        new GravadorDeProvedor(new ResumoDeMentira(), relogio),
        'm',
      ),
    ).rejects.toThrow('caiu');
  });

  it('os casos do conjunto seguem o schema e os termos não são datas', () => {
    const conjunto = lerCasosDeResumo();
    expect(conjunto.length).toBeGreaterThan(0);
    for (const c of conjunto) {
      for (const t of c.esperado.termos) expect(t).not.toMatch(/\d/);
    }
  });
});

describe('relatório da avaliação do resumo', () => {
  const resultado = (
    situacao: ResultadoDoResumo['situacao'],
    origem: CasoDeResumo['origem'] = 'ficticio',
  ): ResultadoDoResumo => ({
    caso: caso('c', 't', ['x'], true, origem),
    situacao,
    detalhe: 'a|b',
    chamadas: [],
  });

  it('só fictícios: aprova com aviso, mesmo com erro ou sem gravação', () => {
    const r = relatorioDeResumos(
      [resultado('acerto'), resultado('termo-ausente'), resultado('sem-gravacao')],
      'resumir-publicacao@0.3.0',
      'm',
    );
    expect(r.aprovado).toBe(true);
    expect(r.aviso).toContain('Só casos fictícios');
    expect(r.aviso).toContain('1 caso(s) sem gravação');
    expect(r.markdown).toContain('**1/3**');
    expect(r.markdown).toContain('a/b');
  });

  it('casos reais: exige gravação e acerto de 98%', () => {
    const real = (s: ResultadoDoResumo['situacao']) => resultado(s, 'real-anonimizado');
    expect(relatorioDeResumos([real('acerto')], 'v', 'm')).toEqual(
      expect.objectContaining({ aprovado: true }),
    );
    expect(relatorioDeResumos([real('acerto'), real('revisao-manual')], 'v', 'm').aprovado).toBe(
      false,
    );
    expect(relatorioDeResumos([real('sem-gravacao')], 'v', 'm').aprovado).toBe(false);
    expect(relatorioDeResumos([], 'v', 'm').markdown).toContain('(0.0%)');
  });
});
