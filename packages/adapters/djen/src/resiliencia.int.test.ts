import { ErroTransitorio, RegistroDeAdaptadores } from '@pz/integracoes';
import { LocalDate, SystemClock } from '@pz/kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DESCRITOR_DJEN, FontePublicacoesDjen, URL_PADRAO_DJEN } from './fonte-djen.js';
import { subirServidorDeFixtures, type ServidorDeFixtures } from './servidor-de-fixtures.js';

// Dados FICTÍCIOS (fixtures anonimizadas).
const OAB = { numero: '123456', uf: 'SP' } as const;
const janela = { inicio: LocalDate.de(2026, 10, 1), fim: LocalDate.de(2026, 10, 7) };

let servidor: ServidorDeFixtures;
beforeAll(async () => {
  servidor = await subirServidorDeFixtures();
});
afterAll(async () => {
  await servidor.encerrar();
});

/** DJEN pelo registro (resiliência padrão do ADR-005), com esperas curtas para o teste. */
function peloRegistro(prefixo: string) {
  const relogio = new SystemClock();
  const registro = new RegistroDeAdaptadores(
    { padrao: { 'fonte-publicacoes': 'djen' } },
    {
      relogio,
      politica: { atrasoInicialMs: 1, atrasoMaximoMs: 5, falhasParaAbrir: 2, tentativas: 2 },
    },
  );
  registro.registrar(
    DESCRITOR_DJEN,
    () =>
      new FontePublicacoesDjen({
        relogio,
        urlBase: `${servidor.url}${prefixo}`,
        urlPublica: URL_PADRAO_DJEN,
      }),
  );
  registro.validar();
  return registro;
}

describe('DJEN pela resiliência do registro (HU17)', () => {
  it('429 passageiro: espera e retoma, sem abrir o circuito', async () => {
    const registro = peloRegistro('/instavel');
    const publicacoes = await registro.obter('fonte-publicacoes').buscarPorOab(OAB, janela);
    expect(publicacoes).toHaveLength(3);
    expect(registro.situacao()).toEqual([
      expect.objectContaining({ adaptador: 'djen', estado: 'operacional' }),
    ]);
  });

  it('5xx persistente: abre o circuito e passa a recusar sem chamar a fonte', async () => {
    const registro = peloRegistro('/fora');
    const fonte = registro.obter('fonte-publicacoes');
    for (let i = 0; i < 2; i++) {
      await expect(fonte.buscarPorOab(OAB, janela)).rejects.toBeInstanceOf(ErroTransitorio);
    }
    expect(registro.situacao()).toEqual([
      expect.objectContaining({ adaptador: 'djen', estado: 'indisponivel' }),
    ]);
    const antes = servidor.consultas.length;
    await expect(fonte.buscarPorOab(OAB, janela)).rejects.toBeInstanceOf(ErroTransitorio);
    expect(servidor.consultas.length).toBe(antes);
  });
});
