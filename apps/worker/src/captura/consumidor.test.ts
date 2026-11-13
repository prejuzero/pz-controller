import { describe, expect, it } from 'vitest';

import { ConsumidorDaCaptura } from './consumidor.js';

import type { Filas } from '../filas/runtime.js';
import type { ManterAssinaturas, PlanejarBuscaAgora } from '@pz/captura';
import type { EventoDominio } from '@pz/kernel';

describe('ConsumidorDaCaptura (HU17)', () => {
  it('repassa cada evento do cadastro ao caso de uso, na transação do consumo', async () => {
    const chamadas: string[] = [];
    const registrar = (nome: string) => (tx: unknown, evento: unknown) => {
      chamadas.push(`${nome} ${String(tx)} ${(evento as EventoDominio).tipo}`);
      return Promise.resolve();
    };
    const consumidor = new ConsumidorDaCaptura(
      {
        oabAdicionada: registrar('adicionada'),
        oabRemovida: registrar('removida'),
        processoMonitorado: registrar('processo'),
        nomeAdicionado: registrar('nome'),
        nomeRemovido: registrar('sem-nome'),
      } as unknown as ManterAssinaturas<unknown>,
      {} as PlanejarBuscaAgora<unknown>,
      {} as Filas,
    );
    const evento = (tipo: string) => ({ tipo }) as EventoDominio;
    await consumidor.oabAdicionada('tx', evento('OabAdicionada'));
    await consumidor.oabRemovida('tx', evento('OabRemovida'));
    await consumidor.processoMonitorado('tx', evento('ProcessoMonitorado'));
    await consumidor.nomeAdicionado('tx', evento('NomeMonitoradoAdicionado'));
    await consumidor.nomeRemovido('tx', evento('NomeMonitoradoRemovido'));
    expect(chamadas).toEqual([
      'adicionada tx OabAdicionada',
      'removida tx OabRemovida',
      'processo tx ProcessoMonitorado',
      'nome tx NomeMonitoradoAdicionado',
      'sem-nome tx NomeMonitoradoRemovido',
    ]);
  });

  it('buscar agora: enfileira a execução do plano com a chave dele; alvo inativo, nada', async () => {
    const publicados: unknown[] = [];
    const plano = {
      alvoId: '01a10e00-0000-7000-8000-000000000001',
      tipo: 'oab',
      valor: '123456/SP',
      inicio: '2026-10-06',
      fim: '2026-10-07',
      rodada: 'agora-x',
      chave: 'chave-do-plano',
    };
    let devolver: typeof plano | undefined = plano;
    const consumidor = new ConsumidorDaCaptura(
      {} as ManterAssinaturas<unknown>,
      { aoSolicitar: () => Promise.resolve(devolver) } as unknown as PlanejarBuscaAgora<unknown>,
      {
        publicar: (job: { tipo: string }, dados: unknown, _escopo: unknown, chave: string) => {
          publicados.push([job.tipo, dados, chave]);
          return Promise.resolve('id');
        },
      } as unknown as Filas,
    );
    await consumidor.buscaAgoraSolicitada('tx', { id: 'e1' } as EventoDominio);
    devolver = undefined;
    await consumidor.buscaAgoraSolicitada('tx', { id: 'e2' } as EventoDominio);
    const dados = { ...plano } as Partial<typeof plano>;
    delete dados.chave;
    expect(publicados).toEqual([['captura.executar', dados, 'chave-do-plano']]);
  });
});
