import { executarComContexto } from '@pz/observability';
import { describe, expect, it } from 'vitest';

import {
  ClienteDesatualizado,
  compararVersoes,
  GuardaDeVersaoDoCliente,
  lerCliente,
  versoesMinimasDoBanco,
} from './versao-do-cliente.js';

describe('versão mínima dos apps (HU63)', () => {
  it('lê X-Cliente; sem cabeçalho ou fora do formato, não identifica', () => {
    expect(lerCliente('android/1.02.3')).toEqual({ plataforma: 'android', versao: '1.2.3' });
    expect(lerCliente(' ios/2.0.0 ')).toEqual({ plataforma: 'ios', versao: '2.0.0' });
    for (const invalido of [undefined, ['ios/1.0.0'], 'ios', 'ios/1.0', 'IOS/1.0.0', 'ios/1.0.0.1'])
      expect(lerCliente(invalido)).toBeUndefined();
  });

  it('compara pelos números, não pelo texto', () => {
    expect(compararVersoes('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compararVersoes('1.2.3', '1.2.3')).toBe(0);
    expect(compararVersoes('0.9.9', '1.0.0')).toBeLessThan(0);
    const versoes = ['0.0.1', '0.9.9', '1.0.0', '1.2.3', '1.9.0', '1.10.0', '10.0.0'];
    for (const [i, a] of versoes.entries()) {
      for (const [j, b] of versoes.entries())
        expect(Math.sign(compararVersoes(a, b))).toBe(Math.sign(i - j));
    }
  });

  it('relê a tabela só depois de um minuto (mudança sem deploy)', async () => {
    let leituras = 0;
    let agora = 0;
    let versoes = [{ plataforma: 'android', versao: '1.0.0' }];
    const banco = {
      executarSemTenant: (_motivo: string, f: (tx: never) => Promise<unknown>) => {
        leituras++;
        return f({ versaoMinimaCliente: { findMany: () => Promise.resolve(versoes) } } as never);
      },
    } as never;
    const minimas = versoesMinimasDoBanco(banco, () => agora);
    expect(await minimas('android')).toBe('1.0.0');
    versoes = [{ plataforma: 'android', versao: '2.0.0' }];
    expect(await minimas('android')).toBe('1.0.0');
    agora = 60_001;
    expect(await minimas('android')).toBe('2.0.0');
    expect(await minimas('ios')).toBeUndefined();
    expect(leituras).toBe(2);
  });

  it('barra só o app abaixo da mínima; portal (sem X-Cliente) e plataforma sem mínima passam', async () => {
    const guarda = new GuardaDeVersaoDoCliente((p) =>
      Promise.resolve(p === 'android' ? '1.5.0' : undefined),
    );
    const com = (cliente?: string) =>
      executarComContexto(cliente === undefined ? {} : { cliente }, () => guarda.canActivate());
    expect(await com()).toBe(true);
    expect(await com('ios/0.0.1')).toBe(true);
    expect(await com('android/1.5.0')).toBe(true);
    const erro = await com('android/1.4.9').catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ClienteDesatualizado);
    expect((erro as ClienteDesatualizado).getStatus()).toBe(426);
    expect((erro as ClienteDesatualizado).getResponse()).toEqual({
      detail: expect.stringContaining('1.5.0') as string,
    });
  });
});
