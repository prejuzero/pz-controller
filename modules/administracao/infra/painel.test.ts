import { FixedClock, Instant } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import {
  ConsultarFilas,
  ConsultarIntegracoes,
  PublicarSituacaoDasIntegracoes,
} from '../application/painel.js';

import { PainelEmMemoria } from './painel-em-memoria.js';

const relogio = new FixedClock(Instant.deIso('2026-10-08T12:00:00Z'));

describe('painel do administrador (HU39)', () => {
  it('publica retratos, guarda só as falhas novas e consolida as instâncias', async () => {
    const painel = new PainelEmMemoria();
    const publicar = new PublicarSituacaoDasIntegracoes(painel, relogio);
    const falha = {
      adaptador: 'smtp',
      estado: 'degradado' as const,
      ultimaFalha: relogio.agora(),
      erro: 'timeout',
    };
    await publicar.executar('w1', [falha]);
    await publicar.executar('w1', [falha]);
    await publicar.executar('w2', [{ adaptador: 'smtp', estado: 'operacional' }]);
    const r = await new ConsultarIntegracoes(painel, relogio).executar();
    expect(r.adaptadores).toEqual([{ ...falha, instancias: 2 }]);
    expect(r.falhas).toEqual([
      { adaptador: 'smtp', instancia: 'w1', em: relogio.agora(), erro: 'timeout' },
    ]);
  });

  it('resumo das filas vem do contador', async () => {
    const painel = new PainelEmMemoria();
    painel.filas = [
      { fila: 'captura', aguardando: 1, ativos: 0, atrasados: 0, falhos: 0, mortos: 2 },
    ];
    expect(await new ConsultarFilas(painel).executar()).toEqual(painel.filas);
  });
});
