import { describe, expect, it } from 'vitest';

import { FixedClock } from './clock.js';
import { Instant } from './instant.js';
import { OutboxEmMemoria } from './outbox-em-memoria.js';
import { publicarPendentes, processarUmaVez } from './outbox.js';
import { gerarUuidV7 } from './uuid.js';

import type { EventoDominio } from './entidade.js';
import type { TransacaoEmMemoria } from './outbox-em-memoria.js';

const relogio = new FixedClock(Instant.deIso('2026-10-05T12:00:00Z'));
const tenantId = gerarUuidV7(relogio);

function evento(tipo = 'PrazoConfirmado'): EventoDominio {
  return {
    id: gerarUuidV7(relogio),
    tipo,
    versao: 1,
    tenantId,
    agregadoId: gerarUuidV7(relogio),
    ocorridoEm: relogio.agora(),
    payload: { exemplo: true },
  };
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

describe('outbox transacional', () => {
  it('grava os eventos junto com a transação e não grava nada se ela for revertida', async () => {
    const banco = new OutboxEmMemoria();
    const confirmado = evento();

    await expect(
      banco.executar(async (tx) => {
        await banco.gravar(tx, [evento()]);
        throw new Error('falha depois de gravar o agregado');
      }),
    ).rejects.toThrow('falha depois de gravar');
    await banco.executar((tx) => banco.gravar(tx, [confirmado]));

    expect(banco.pendentes().map((item) => item.id)).toEqual([confirmado.id]);
  });

  it('o relay publica os pendentes em ordem e os marca como publicados', async () => {
    const banco = new OutboxEmMemoria();
    const eventos = [evento('A'), evento('B'), evento('C')];
    await banco.executar((tx) => banco.gravar(tx, eventos));
    const publicados: string[] = [];

    const quantidade = await publicarPendentes(
      banco,
      banco,
      (item) => {
        publicados.push(item.tipo);
        return Promise.resolve();
      },
      relogio,
      10,
    );

    expect(quantidade).toBe(3);
    expect(publicados).toEqual(['A', 'B', 'C']);
    expect(banco.pendentes()).toEqual([]);
    expect(banco.publicadoEm(eventos[0]?.id ?? '')).toEqual(relogio.agora());
    expect(await publicarPendentes(banco, banco, () => Promise.resolve(), relogio, 10)).toBe(0);
  });

  it('respeita o tamanho do lote', async () => {
    const banco = new OutboxEmMemoria();
    await banco.executar((tx) => banco.gravar(tx, [evento(), evento(), evento()]));

    expect(await publicarPendentes(banco, banco, () => Promise.resolve(), relogio, 2)).toBe(2);
    expect(banco.pendentes()).toHaveLength(1);
  });

  it('relay que morre entre publicar e marcar republica, e o consumidor processa uma vez só', async () => {
    const banco = new OutboxEmMemoria();
    const confirmado = evento();
    await banco.executar((tx) => banco.gravar(tx, [confirmado]));
    const efeitos: string[] = [];
    const consumir = (item: EventoDominio) =>
      processarUmaVez(banco, banco, 'notificacoes', item, (tx: TransacaoEmMemoria, recebido) => {
        tx.aoConfirmar(() => efeitos.push(recebido.id));
        return Promise.resolve();
      });

    banco.falharAoMarcarPublicados = true;
    await expect(
      publicarPendentes(
        banco,
        banco,
        async (item) => {
          await consumir(item);
        },
        relogio,
        10,
      ),
    ).rejects.toThrow('marcar');
    banco.falharAoMarcarPublicados = false;
    expect(banco.pendentes()).toHaveLength(1);

    const resultados: string[] = [];
    await publicarPendentes(
      banco,
      banco,
      async (item) => {
        resultados.push(await consumir(item));
      },
      relogio,
      10,
    );

    expect(resultados).toEqual(['ignorado']);
    expect(efeitos).toEqual([confirmado.id]);
    expect(banco.pendentes()).toEqual([]);
  });

  it('dois relays concorrentes não publicam o mesmo evento duas vezes', async () => {
    const banco = new OutboxEmMemoria();
    const eventos = Array.from({ length: 20 }, () => evento());
    await banco.executar((tx) => banco.gravar(tx, eventos));
    const publicados: string[] = [];
    const publicarDevagar = async (item: EventoDominio) => {
      await esperar(1);
      publicados.push(item.id);
    };

    const [primeiro, segundo] = await Promise.all([
      publicarPendentes(banco, banco, publicarDevagar, relogio, 15),
      publicarPendentes(banco, banco, publicarDevagar, relogio, 15),
    ]);

    expect(primeiro + segundo).toBe(20);
    expect(new Set(publicados).size).toBe(20);
    expect(publicados).toHaveLength(20);
    expect(banco.pendentes()).toEqual([]);
  });

  it('consumidor que falha não registra o evento, e a nova tentativa processa', async () => {
    const banco = new OutboxEmMemoria();
    const confirmado = evento();
    let tentativas = 0;
    const tratar = () => {
      tentativas += 1;
      return tentativas === 1
        ? Promise.reject(new Error('serviço indisponível'))
        : Promise.resolve();
    };

    await expect(processarUmaVez(banco, banco, 'notificacoes', confirmado, tratar)).rejects.toThrow(
      'indisponível',
    );
    await expect(processarUmaVez(banco, banco, 'notificacoes', confirmado, tratar)).resolves.toBe(
      'processado',
    );
    await expect(processarUmaVez(banco, banco, 'notificacoes', confirmado, tratar)).resolves.toBe(
      'ignorado',
    );
    expect(tentativas).toBe(2);
  });

  it('a deduplicação é por consumidor: cada inscrito processa o evento uma vez', async () => {
    const banco = new OutboxEmMemoria();
    const confirmado = evento();
    const tratar = () => Promise.resolve();

    expect(await processarUmaVez(banco, banco, 'notificacoes', confirmado, tratar)).toBe(
      'processado',
    );
    expect(await processarUmaVez(banco, banco, 'auditoria', confirmado, tratar)).toBe('processado');
    expect(await processarUmaVez(banco, banco, 'auditoria', confirmado, tratar)).toBe('ignorado');
  });

  it('o mesmo consumidor processando o mesmo evento em paralelo: um processa, o outro falha e é retentado', async () => {
    const banco = new OutboxEmMemoria();
    const confirmado = evento();
    const tratarDevagar = () => esperar(5);

    const resultados = await Promise.allSettled([
      processarUmaVez(banco, banco, 'notificacoes', confirmado, tratarDevagar),
      processarUmaVez(banco, banco, 'notificacoes', confirmado, tratarDevagar),
    ]);

    expect(resultados.map((resultado) => resultado.status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ]);
    await expect(
      processarUmaVez(banco, banco, 'notificacoes', confirmado, tratarDevagar),
    ).resolves.toBe('ignorado');
  });
});
