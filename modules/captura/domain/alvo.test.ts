import { Instant, LocalDate } from '@pz/kernel';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  buscaAgoraLiberadaEm,
  chaveDaCaptura,
  janelaDaCaptura,
  proximaTentativa,
  valorDaOab,
  valorDoNome,
  valorDoProcesso,
} from './alvo.js';

const d = (iso: string) => {
  const r = LocalDate.analisar(iso);
  if (!r.ok) throw r.erro;
  return r.valor;
};

describe('alvo de monitoramento (HU17)', () => {
  it('normaliza o valor: OAB "número/UF" e processo só com dígitos', () => {
    expect(valorDaOab(' 123456 ', 'sp')).toBe('123456/SP');
    expect(valorDoProcesso('1000004-06.2026.8.26.0100')).toBe('10000040620268260100');
    expect(() => valorDaOab('12A', 'SP')).toThrow(RangeError);
    expect(() => valorDoProcesso('123')).toThrow(RangeError);
  });

  it('nome (HU42): espaços simples e maiúsculas; curto ou longo demais é recusado', () => {
    expect(valorDoNome('  Sociedade   Fictícia\nde Advogados ')).toBe(
      'SOCIEDADE FICTÍCIA DE ADVOGADOS',
    );
    expect(() => valorDoNome(' abc ')).toThrow(RangeError);
    expect(() => valorDoNome('x'.repeat(151))).toThrow(RangeError);
  });

  it('janela: do dia anterior ao último fim capturado até hoje (sobreposição de um dia)', () => {
    expect(janelaDaCaptura(d('2026-10-06'), d('2026-10-07'), 7)).toEqual({
      inicio: d('2026-10-05'),
      fim: d('2026-10-07'),
    });
  });

  it('janela do alvo novo: os dias iniciais configurados até hoje', () => {
    expect(janelaDaCaptura(undefined, d('2026-10-07'), 7)).toEqual({
      inicio: d('2026-09-30'),
      fim: d('2026-10-07'),
    });
  });

  it('propriedade: a janela termina hoje, nunca começa depois de hoje e cobre o último fim', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -400, max: 400 }),
        fc.integer({ min: 0, max: 30 }),
        (deslocamento, iniciais) => {
          const hoje = d('2026-10-07');
          const ultimo = hoje.maisDias(deslocamento);
          const janela = janelaDaCaptura(ultimo, hoje, iniciais);
          expect(janela.fim).toEqual(hoje);
          expect(janela.inicio.ehDepoisDe(hoje)).toBe(false);
          if (!ultimo.ehDepoisDe(hoje)) expect(janela.inicio.ehDepoisDe(ultimo)).toBe(false);
        },
      ),
    );
  });

  it('chave de idempotência: alvo e janela', () => {
    expect(
      chaveDaCaptura('01a10e00-0000-7000-8000-000000000001', {
        inicio: d('2026-10-05'),
        fim: d('2026-10-07'),
      }),
    ).toBe('01a10e00-0000-7000-8000-000000000001:2026-10-05:2026-10-07');
  });

  it('chave com a rodada: a mesma janela em outra rodada do dia é outra entrega', () => {
    const janela = { inicio: d('2026-10-06'), fim: d('2026-10-07') };
    const id = '01a10e00-0000-7000-8000-000000000001';
    expect(chaveDaCaptura(id, janela, 'r1')).toBe(`${id}:2026-10-06:2026-10-07:r1`);
    expect(chaveDaCaptura(id, janela, 'r1')).not.toBe(chaveDaCaptura(id, janela, 'r2'));
  });

  it('buscar agora: nova busca da mesma OAB só 5 minutos depois do último pedido', () => {
    const pedido = Instant.deIso('2026-10-07T12:00:00Z');
    expect(buscaAgoraLiberadaEm(undefined)).toBeUndefined();
    expect(buscaAgoraLiberadaEm(pedido)?.paraIso()).toBe('2026-10-07T12:05:00.000Z');
  });

  it('falhas seguidas afastam a próxima tentativa, até 6 horas', () => {
    const agora = Instant.deIso('2026-10-07T12:00:00Z');
    const minutos = (falhas: number) => agora.msAte(proximaTentativa(agora, falhas)) / 60_000;
    expect([1, 2, 3, 4, 5, 10].map(minutos)).toEqual([30, 60, 120, 240, 360, 360]);
  });
});
