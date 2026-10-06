import {
  FixedClock,
  gerarUuidV7,
  Instant,
  OutboxEmMemoria,
  processarUmaVez,
  publicarPendentes,
} from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { ConsultarSituacao } from '../application/consultar-situacao.js';
import {
  CONSUMIDOR_HISTORICO,
  RegistrarHistoricoDeSituacao,
  RegistrarVerificacao,
} from '../application/registrar-verificacao.js';

import { HistoricoEmMemoria } from './historico-em-memoria.js';

import type { VerificadorDeDependencia } from '../application/consultar-situacao.js';
import type { SituacaoVerificada } from '../domain/situacao.js';
import type { EventoDominio } from '@pz/kernel';

const relogio = new FixedClock(Instant.deIso('2026-10-05T12:00:00Z'));

function verificador(nome: string, comportamento: () => Promise<void>): VerificadorDeDependencia {
  return { nome, verificar: comportamento };
}

describe('fluxo ponta a ponta: verificação → outbox → relay → consumidor', () => {
  it('o evento chega ao consumidor e o histórico é gravado uma única vez', async () => {
    const banco = new OutboxEmMemoria();
    const historico = new HistoricoEmMemoria();
    const consumidor = new RegistrarHistoricoDeSituacao(historico);
    // O worker despacha assim (@Consome): entrega única por consumidor via processarUmaVez.
    const consumir = (evento: EventoDominio) =>
      processarUmaVez(banco, banco, CONSUMIDOR_HISTORICO, evento as SituacaoVerificada, (tx, e) =>
        consumidor.tratar(tx, e),
      );
    const registrar = new RegistrarVerificacao(
      new ConsultarSituacao([verificador('banco', () => Promise.resolve())], relogio, 'abc123'),
      banco,
      banco,
      relogio,
    );
    const tenantId = gerarUuidV7(relogio);
    const entregar = async (evento: EventoDominio) => {
      await consumir(evento);
    };

    expect(await registrar.executar(tenantId)).toBe('operacional');
    expect(await publicarPendentes(banco, banco, entregar, relogio, 10)).toBe(1);
    // Reentrega do mesmo evento (ex.: relay reiniciado) não duplica o histórico.
    const [entrada] = historico.entradas();
    expect(
      await consumir({
        id: entrada?.eventoId ?? gerarUuidV7(),
        tipo: 'SituacaoVerificada',
        versao: 1,
        tenantId,
        agregadoId: 'x',
        ocorridoEm: relogio.agora(),
        payload: { situacao: 'operacional' },
      }),
    ).toBe('ignorado');

    expect(historico.entradas()).toEqual([
      { eventoId: entrada?.eventoId, tenantId, situacao: 'operacional', em: relogio.agora() },
    ]);
  });
});

describe('HistoricoEmMemoria', () => {
  it('com transação sem confirmação (ex.: PostgreSQL), grava na hora', async () => {
    const historico = new HistoricoEmMemoria();
    const entrada = {
      eventoId: gerarUuidV7(relogio),
      tenantId: gerarUuidV7(relogio),
      situacao: 'operacional' as const,
      em: relogio.agora(),
    };
    await historico.registrar({}, entrada);
    expect(historico.entradas()).toEqual([entrada]);
  });
});
