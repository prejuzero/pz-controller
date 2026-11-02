import { FixedClock, gerarUuidV7, Instant, OutboxEmMemoria } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { EnviarNotificacao, Notificar } from '../application/notificacoes.js';

import {
  ConsentimentosEmMemoria,
  NotificacoesEmMemoria,
  PreferenciasEmMemoria,
} from './em-memoria.js';

import type { TransacaoEmMemoria } from '@pz/kernel';

// Dados FICTÍCIOS (HU33): o link de ciência nasce no envio e não fica gravado na notificação.
const relogio = new FixedClock(Instant.deIso('2026-11-03T12:00:00.000Z'));
const TENANT = gerarUuidV7();
const ANA = gerarUuidV7();
const PRAZO = gerarUuidV7();

describe('envio com "Confirmar ciência" (HU33)', () => {
  it('nova intimação com prazo ganha o link; os dados gravados ficam sem token', async () => {
    const outbox = new OutboxEmMemoria();
    const repo = new NotificacoesEmMemoria();
    const notificar = new Notificar<TransacaoEmMemoria>(
      repo,
      new PreferenciasEmMemoria(),
      { emails: () => Promise.resolve({ principal: 'ana@exemplo.invalid', copias: [] }) },
      { suprimidos: () => Promise.resolve(new Set<string>()), suprimir: () => Promise.resolve() },
      new ConsentimentosEmMemoria(),
      outbox,
      relogio,
    );
    const pedir = (tipo: string, prazoId?: string) =>
      outbox.executar((tx) =>
        notificar.executar(tx, {
          tipo,
          tenantId: TENANT,
          usuarioId: ANA,
          ...(prazoId === undefined ? {} : { prazoId }),
          janela: prazoId === undefined ? 'sem-prazo' : 'com-prazo',
          dados:
            tipo === 'nova-intimacao'
              ? {
                  numeroProcesso: '0000001-09.2030.8.09.0001',
                  link: 'https://app.exemplo.invalid/prazos/1',
                }
              : {
                  fonte: 'DJEN',
                  desde: '03/11/2026 09:00',
                  link: 'https://app.exemplo.invalid/cobertura',
                },
        }),
      );
    const enviados: string[] = [];
    const emitidos: unknown[] = [];
    const enviar = new EnviarNotificacao<TransacaoEmMemoria>(
      repo,
      {
        email: {
          enviar: ({ mensagem }) => {
            enviados.push(mensagem.html);
            return Promise.resolve({ idExterno: 'ext', aceitoEm: relogio.agora() });
          },
        },
      },
      relogio,
      (_tx, p) => {
        emitidos.push(p);
        return Promise.resolve('https://app.exemplo.invalid/ciencia/v1.TOKEN.FICTICIO');
      },
    );
    const comPrazo = await pedir('nova-intimacao', PRAZO);
    // Mesmo tipo, sem prazo: não há o que confirmar, o e-mail sai sem o link.
    const semPrazo = await pedir('nova-intimacao');
    for (const r of [comPrazo, semPrazo]) {
      if (!r.ok || !r.valor.solicitada) throw new Error(`não solicitada: ${JSON.stringify(r)}`);
      const id = r.valor.notificacaoId;
      await outbox.executar((tx) => enviar.executar(tx, id));
    }
    // Tipo sem ciência, mesmo com prazo: não emite link.
    const aviso = await outbox.executar((tx) =>
      notificar.executar(tx, {
        tipo: 'fonte-degradada',
        tenantId: TENANT,
        usuarioId: ANA,
        prazoId: PRAZO,
        janela: 'fonte',
        dados: { fonte: 'DJEN', desde: '03/11/2026 09:00', link: 'https://app.exemplo.invalid/c' },
      }),
    );
    if (!aviso.ok || !aviso.valor.solicitada) throw new Error('aviso não solicitado');
    const idAviso = aviso.valor.notificacaoId;
    await outbox.executar((tx) => enviar.executar(tx, idAviso));
    expect(emitidos).toEqual([{ tenantId: TENANT, prazoId: PRAZO, usuarioId: ANA }]);
    expect(enviados[0]).toContain('/ciencia/v1.TOKEN.FICTICIO');
    expect(enviados[0]).toContain('Confirmar ciência');
    expect(enviados[1]).not.toContain('/ciencia/');
    expect(JSON.stringify(repo.todas().map((n) => n.dados))).not.toContain('TOKEN');
  });
});
