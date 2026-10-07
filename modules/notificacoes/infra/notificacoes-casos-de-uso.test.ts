import { FixedClock, gerarUuidV7, Instant, OutboxEmMemoria } from '@pz/kernel';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  ConsultarAvisosDeEntrega,
  EnviarNotificacao,
  Notificar,
  RegistrarDesfechosDeEntrega,
} from '../application/notificacoes.js';
import { renderizar } from '../application/templates.js';

import { NotificacoesEmMemoria } from './em-memoria.js';

import type { EnviadorDeCanal } from '../application/portas.js';
import type { EventoEntrega } from '@pz/integracoes';
import type { TransacaoEmMemoria } from '@pz/kernel';

// Dados FICTÍCIOS (número de processo inventado, e-mails reservados .invalid).
const relogio = new FixedClock(Instant.deIso('2026-10-07T12:00:00Z'));
const TENANT = gerarUuidV7();
const USUARIO = gerarUuidV7();
const pedido = (parcial: Record<string, unknown> = {}) => ({
  tipo: 'nova-intimacao',
  tenantId: TENANT,
  usuarioId: USUARIO,
  janela: '2026-10-07',
  dados: {
    numeroProcesso: '0000001-00.2026.8.26.0001',
    link: 'https://app.exemplo.invalid/prazos/1',
  },
  ...parcial,
});

describe('notificações (HU30)', () => {
  let outbox: OutboxEmMemoria;
  let repositorio: NotificacoesEmMemoria;
  let ativo: boolean | undefined;
  let suprimidos: Set<string>;
  let suprimidosPor: string[];
  let enviados: { idempotencia: string; destinatarios: readonly string[]; assunto: string }[];
  let notificar: Notificar<TransacaoEmMemoria>;
  let enviar: EnviarNotificacao<TransacaoEmMemoria>;
  let desfechos: RegistrarDesfechosDeEntrega<TransacaoEmMemoria>;

  beforeEach(() => {
    outbox = new OutboxEmMemoria();
    repositorio = new NotificacoesEmMemoria();
    ativo = undefined;
    suprimidos = new Set();
    suprimidosPor = [];
    enviados = [];
    const email: EnviadorDeCanal = {
      enviar: ({ idempotencia, destinatarios, mensagem }) => {
        enviados.push({ idempotencia, destinatarios, assunto: mensagem.assunto });
        return Promise.resolve({
          idExterno: `ext-${String(enviados.length)}`,
          aceitoEm: relogio.agora(),
        });
      },
    };
    notificar = new Notificar(
      repositorio,
      { ativo: () => Promise.resolve(ativo) },
      {
        emails: () =>
          Promise.resolve({
            principal: 'Ana@Exemplo.invalid',
            copias: ['copia@exemplo.invalid', 'ana@exemplo.invalid'],
          }),
      },
      {
        suprimidos: (_tx, emails) =>
          Promise.resolve(new Set(emails.filter((e) => suprimidos.has(e)))),
        suprimir: (_tx, emails, motivo) => {
          for (const e of emails) suprimidos.add(e);
          suprimidosPor.push(motivo);
          return Promise.resolve();
        },
      },
      outbox,
      relogio,
    );
    enviar = new EnviarNotificacao(repositorio, { email }, relogio);
    desfechos = new RegistrarDesfechosDeEntrega(
      repositorio,
      {
        suprimidos: () => Promise.resolve(new Set()),
        suprimir: (_tx, emails, motivo) => {
          for (const e of emails) suprimidos.add(e);
          suprimidosPor.push(motivo);
          return Promise.resolve();
        },
      },
      outbox,
      relogio,
    );
  });

  const pedir = (entrada: unknown) => outbox.executar((tx) => notificar.executar(tx, entrada));

  it('pede uma vez por chave, com cópias sem repetição, e envia uma vez', async () => {
    const r = await pedir(pedido());
    if (!r.ok || !r.valor.solicitada) throw new Error('não solicitada');
    expect(repositorio.todas()[0]?.destinatarios).toEqual([
      'ana@exemplo.invalid',
      'copia@exemplo.invalid',
    ]);
    expect(outbox.pendentes().map((e) => e.tipo)).toEqual(['NotificacaoSolicitada']);
    const repetido = await pedir(pedido());
    expect(repetido.ok && repetido.valor).toEqual({ solicitada: false, motivo: 'ja-solicitada' });

    const id = r.valor.notificacaoId;
    await outbox.executar((tx) => enviar.executar(tx, id));
    await outbox.executar((tx) => enviar.executar(tx, id));
    expect(enviados).toHaveLength(1);
    expect(enviados[0]?.idempotencia).toBe(`nova-intimacao:-:${USUARIO}:email:2026-10-07`);
    expect(repositorio.todas()[0]).toMatchObject({
      idExterno: 'ext-1',
      enviadaEm: relogio.agora(),
    });
  });

  it('respeita preferência desativada e a lista de supressão', async () => {
    ativo = false;
    expect((await pedir(pedido())).ok && repositorio.todas()).toEqual([]);
    ativo = true;
    suprimidos = new Set(['ana@exemplo.invalid', 'copia@exemplo.invalid']);
    const r = await pedir(pedido());
    expect(r.ok && r.valor).toEqual({ solicitada: false, motivo: 'sem-destinatario' });
    suprimidos = new Set(['copia@exemplo.invalid']);
    await pedir(pedido({ janela: '2026-10-08' }));
    expect(repositorio.todas()[0]?.destinatarios).toEqual(['ana@exemplo.invalid']);
  });

  it('valida o pedido e os dados do template', async () => {
    const semTipo = await pedir(pedido({ tipo: 'desconhecido' }));
    expect(!semTipo.ok && semTipo.erro.problemas[0]?.campo).toBe('tipo');
    const semLink = await pedir(pedido({ dados: { numeroProcesso: '1' } }));
    expect(!semLink.ok && semLink.erro.problemas[0]?.campo).toBe('dados.link');
  });

  it('notificação inexistente ou canal sem enviador falham com motivo (vai para a DLQ)', async () => {
    await expect(outbox.executar((tx) => enviar.executar(tx, gerarUuidV7()))).rejects.toThrow(
      'não encontrada',
    );
    const r = await outbox.executar((tx) => notificar.executar(tx, pedido(), 'sms'));
    if (!r.ok || !r.valor.solicitada) throw new Error('não solicitada');
    const id = r.valor.notificacaoId;
    await expect(outbox.executar((tx) => enviar.executar(tx, id))).rejects.toThrow('sem enviador');
  });

  it('templates: texto e HTML, HTML escapado, lembrete com o vencimento recebido', () => {
    const intimacao = renderizar('nova-intimacao', {
      numeroProcesso: '<1>',
      link: 'https://app.exemplo.invalid/x',
    });
    expect(intimacao.html).toContain('&#60;1&#62;');
    expect(intimacao.texto).toContain('https://app.exemplo.invalid/x');
    const lembrete = renderizar('lembrete-prazo', {
      numeroProcesso: '1',
      vencimento: '15/10/2026',
      link: 'https://app.exemplo.invalid/x',
    });
    expect(lembrete.assunto).toBe('Prazo do processo 1 vence em 15/10/2026');
  });

  describe('desfechos de entrega (webhook)', () => {
    const em = Instant.deIso('2026-10-07T12:05:00Z');
    const evento = (tipo: EventoEntrega['tipo'], extra: Partial<EventoEntrega> = {}) => ({
      idExterno: 'ext-1',
      tipo,
      ocorridoEm: em,
      ...extra,
    });
    let antes = 0;
    const novos = () => outbox.pendentes().slice(antes);
    const aplicar = (eventos: EventoEntrega[]) =>
      outbox.executar((tx) => desfechos.executar(tx, eventos));

    beforeEach(async () => {
      const r = await pedir(pedido());
      if (!r.ok || !r.valor.solicitada) throw new Error('não solicitada');
      const id = r.valor.notificacaoId;
      await outbox.executar((tx) => enviar.executar(tx, id));
      antes = outbox.pendentes().length;
    });

    it('entrega e abertura gravadas uma vez; só a entrega gera evento', async () => {
      const resumo = await aplicar([
        evento('entregue'),
        evento('entregue'),
        evento('aberto'),
        evento('clicado'),
      ]);
      expect(resumo).toEqual({ rejeicoes: [], semNotificacao: 0 });
      expect(repositorio.todas()[0]).toMatchObject({ entregueEm: em, abertaEm: em });
      expect(novos().map((e) => e.tipo)).toEqual(['NotificacaoEntregue']);
    });

    it('rejeição permanente: supressão, desfecho e evento uma vez, mesmo repetida', async () => {
      const bounce = evento('rejeitado', {
        motivo: 'Permanent/General',
        destinatarios: [' Ana@Exemplo.invalid '],
      });
      expect(await aplicar([bounce, bounce])).toEqual({ rejeicoes: ['bounce'], semNotificacao: 0 });
      expect(suprimidos).toEqual(new Set(['ana@exemplo.invalid']));
      expect(repositorio.todas()[0]).toMatchObject({
        rejeitadaEm: em,
        motivoRejeicao: 'bounce: Permanent/General',
      });
      const [rejeitada] = novos();
      expect(rejeitada).toMatchObject({
        tipo: 'NotificacaoRejeitada',
        tenantId: TENANT,
        payload: { usuarioId: USUARIO, motivo: 'bounce', detalhe: 'Permanent/General' },
      });
      expect(novos()).toHaveLength(1);
    });

    it('reclamação suprime como spam; falha não suprime; envio desconhecido só suprime', async () => {
      expect(
        await aplicar([
          evento('falhou', { idExterno: 'ext-1' }),
          evento('reclamacao', { idExterno: 'outro', destinatarios: ['bia@exemplo.invalid'] }),
          evento('rejeitado', { idExterno: 'outro' }),
        ]),
      ).toEqual({ rejeicoes: ['falha'], semNotificacao: 2 });
      expect(suprimidos).toEqual(new Set(['bia@exemplo.invalid']));
      expect(suprimidosPor).toEqual(['spam']);
      expect(repositorio.todas()[0]?.motivoRejeicao).toBe('falha');
    });

    it('avisos: e-mails suprimidos do usuário e, para quem administra, colegas na janela', async () => {
      await aplicar([evento('rejeitado', { destinatarios: ['ana@exemplo.invalid'] })]);
      const avisos = (agora: string) =>
        new ConsultarAvisosDeEntrega(
          outbox,
          repositorio,
          {
            emails: () =>
              Promise.resolve({ principal: 'Ana@Exemplo.invalid', copias: ['c@exemplo.invalid'] }),
          },
          {
            suprimidos: (_tx, emails) =>
              Promise.resolve(new Set(emails.filter((e) => suprimidos.has(e)))),
            suprimir: () => Promise.resolve(),
          },
          new FixedClock(Instant.deIso(agora)),
        );
      const hoje = avisos('2026-10-08T00:00:00Z');
      expect(await hoje.executar(USUARIO, true)).toEqual({
        emailsRejeitados: ['ana@exemplo.invalid'],
        usuariosDaEquipeComRejeicao: 1,
      });
      expect((await hoje.executar(USUARIO, false)).usuariosDaEquipeComRejeicao).toBeNull();
      const depois = await avisos('2026-10-15T12:05:01Z').executar(USUARIO, true);
      expect(depois.usuariosDaEquipeComRejeicao).toBe(0);
    });
  });
});
