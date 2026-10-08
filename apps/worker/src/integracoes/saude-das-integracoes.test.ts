import { PainelEmMemoria, PublicarSituacaoDasIntegracoes } from '@pz/administracao';
import { FixedClock, Instant } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { PublicacaoDaSaudeDasIntegracoes } from './saude-das-integracoes.js';

import type { RegistroDeAdaptadores } from '@pz/integracoes';

const relogio = new FixedClock(Instant.deIso('2026-10-08T12:00:00Z'));
const registro = {
  situacao: () => [{ adaptador: 'djen', estado: 'operacional' as const }],
} as unknown as RegistroDeAdaptadores; // só situacao() é usada aqui

describe('publicação da saúde das integrações (HU39)', () => {
  it('grava o retrato da instância com os adaptadores de todos os registros', async () => {
    const painel = new PainelEmMemoria();
    const publicacao = new PublicacaoDaSaudeDasIntegracoes(
      new PublicarSituacaoDasIntegracoes(painel, relogio),
      [registro],
    );
    await publicacao.publicarAgora();
    const [retrato] = await painel.retratos();
    expect(retrato?.situacoes).toEqual([{ adaptador: 'djen', estado: 'operacional' }]);
    expect(retrato?.em).toEqual(relogio.agora());
  });

  it('falha ao gravar não derruba o worker (vira log de erro)', async () => {
    const painel = new PainelEmMemoria();
    painel.gravar = () => Promise.reject(new Error('Redis fora'));
    const publicacao = new PublicacaoDaSaudeDasIntegracoes(
      new PublicarSituacaoDasIntegracoes(painel, relogio),
      [registro],
    );
    await expect(publicacao.publicarAgora()).resolves.toBeUndefined();
  });
});
