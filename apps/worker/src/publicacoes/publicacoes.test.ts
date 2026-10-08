import { tenantAtual } from '@pz/db';
import { err, gerarUuidV7, ok, Validacao } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { ConsumidorDaPrivacidade } from '../privacidade/consumidor.js';

import { ConsumidorDasPublicacoes } from './consumidor.js';
import { noTenantDoBanco, processoPeloCadastro } from './processos.js';

import type { ObterOuCriarProcesso } from '@pz/cadastro';
import type { EventoDominio, Uuid } from '@pz/kernel';
import type { GerarExportacao } from '@pz/privacidade';
import type { IngerirCaptura } from '@pz/publicacoes';

const evento = { tipo: 'CapturaConcluida', agregadoId: 'alvo' } as EventoDominio;

describe('publicações e privacidade no worker (HU18, HU38)', () => {
  it('consumidores repassam o evento ao caso de uso, na transação do consumo', async () => {
    const recebidos: string[] = [];
    const ingerir = {
      executar: (tx: unknown, e: EventoDominio) => {
        recebidos.push(`ingerir ${String(tx)} ${e.tipo}`);
        return Promise.resolve({ novas: 1, recebidas: 1 });
      },
    } as unknown as IngerirCaptura<unknown>;
    const gerar = {
      executar: (tx: unknown, e: EventoDominio) => {
        recebidos.push(`gerar ${String(tx)} ${e.tipo}`);
        return Promise.resolve();
      },
    } as unknown as GerarExportacao<unknown>;
    await new ConsumidorDasPublicacoes(ingerir).capturaConcluida('tx', evento);
    await new ConsumidorDaPrivacidade(gerar).exportacaoSolicitada('tx', {
      ...evento,
      tipo: 'ExportacaoDeDadosSolicitada',
    });
    expect(recebidos).toEqual([
      'ingerir tx CapturaConcluida',
      'gerar tx ExportacaoDeDadosSolicitada',
    ]);
  });

  it('processo pelo cadastro: devolve o id; número inválido lança', async () => {
    const processoId = gerarUuidV7();
    const obter = (r: unknown) =>
      processoPeloCadastro({ executar: () => Promise.resolve(r) } as unknown as Pick<
        ObterOuCriarProcesso<unknown>,
        'executar'
      >);
    expect(await obter(ok({ processoId, criado: true }))('t' as Uuid, '1')).toBe(processoId);
    await expect(
      obter(err(new Validacao([{ campo: 'numero', mensagem: 'inválido' }])))('t' as Uuid, '1'),
    ).rejects.toBeInstanceOf(Validacao);
  });

  it('unidade no tenant: o trabalho roda com o tenant da execução definido', async () => {
    const tenant = gerarUuidV7();
    const banco = { executar: <T>(f: (tx: string) => Promise<T>) => f('tx') };
    const visto = await noTenantDoBanco(banco).executar(tenant, (tx) =>
      Promise.resolve([tx, tenantAtual()]),
    );
    expect(visto).toEqual(['tx', tenant]);
  });
});
