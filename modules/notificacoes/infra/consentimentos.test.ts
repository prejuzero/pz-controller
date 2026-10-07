import { FixedClock, gerarUuidV7, Instant, OutboxEmMemoria } from '@pz/kernel';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  ConcederConsentimento,
  DesativarDestinoPush,
  ListarConsentimentos,
  RegistrarDestinoPush,
  RevogarConsentimento,
} from '../application/consentimentos.js';
import { EnviarNotificacao, Notificar } from '../application/notificacoes.js';
import { renderizar } from '../application/templates.js';

import { ConsentimentosEmMemoria, NotificacoesEmMemoria } from './em-memoria.js';

import type { AutorDoConsentimento } from '../application/consentimentos.js';
import type { TrilhaDeAuditoria } from '@pz/auditoria';
import type { CapacidadesCanal } from '@pz/integracoes';
import type { TransacaoEmMemoria } from '@pz/kernel';

// Dados FICTÍCIOS (telefone e token inventados).
const relogio = new FixedClock(Instant.deIso('2026-10-07T12:00:00Z'));
const TENANT = gerarUuidV7();
const USUARIO = gerarUuidV7();
const DISPOSITIVO = gerarUuidV7();
const autor: AutorDoConsentimento = {
  tenantId: TENANT,
  usuarioId: USUARIO,
  origem: 'app',
  dispositivoId: DISPOSITIVO,
};
const PUSH: CapacidadesCanal = {
  exigeTemplateAprovado: false,
  janelaDeConversaHoras: 0,
  tamanhoMaximo: 30,
  suportaBotoes: true,
  suportaMidia: false,
};
const dados = {
  numeroProcesso: '0000001-00.2026.8.26.0001',
  vencimento: '15/10/2026',
  link: 'https://app.exemplo.invalid/prazos/1',
};
const intimacao = { numeroProcesso: dados.numeroProcesso, link: dados.link };

describe('consentimento por canal e destinos de push (HU30)', () => {
  let outbox: OutboxEmMemoria;
  let repositorio: ConsentimentosEmMemoria;
  let auditados: { tipo: string; depois: unknown }[];
  let trilha: TrilhaDeAuditoria<TransacaoEmMemoria>;

  beforeEach(() => {
    outbox = new OutboxEmMemoria();
    repositorio = new ConsentimentosEmMemoria();
    auditados = [];
    trilha = {
      registrar: (tx, entrada) => {
        tx.aoConfirmar(() => auditados.push({ tipo: entrada.tipo, depois: entrada.depois }));
        return Promise.resolve();
      },
    };
  });

  const conceder = () => new ConcederConsentimento(outbox, repositorio, trilha, outbox, relogio);
  const revogar = () => new RevogarConsentimento(outbox, repositorio, trilha, outbox, relogio);

  it('concede uma vez (idempotente), lista, revoga uma vez; trilha e evento sem o destino', async () => {
    const pedido = { canal: 'whatsapp', destino: '+5511987654321' };
    const r = await conceder().executar(autor, pedido);
    if (!r.ok) throw r.erro;
    const repetido = await conceder().executar(autor, pedido);
    expect(repetido.ok && repetido.valor.id).toBe(r.valor.id);
    expect(await new ListarConsentimentos(outbox, repositorio).executar(USUARIO)).toEqual([
      { ...r.valor, concedidoEm: '2026-10-07T12:00:00.000Z' },
    ]);

    const id = r.valor.id;
    expect((await revogar().executar(autor, id)).ok).toBe(true);
    expect((await revogar().executar(autor, id)).ok).toBe(true);
    expect(await new ListarConsentimentos(outbox, repositorio).executar(USUARIO)).toEqual([]);
    expect(auditados.map((a) => a.tipo)).toEqual([
      'notificacoes.consentimento-concedido',
      'notificacoes.consentimento-revogado',
    ]);
    const eventos = outbox.pendentes();
    expect(eventos.map((e) => (e.payload as { situacao: string }).situacao)).toEqual([
      'concedido',
      'revogado',
    ]);
    expect(JSON.stringify([eventos, auditados])).not.toContain('+5511987654321');
  });

  it('valida canal e destino; e-mail não é consentimento; revogar de outro usuário é 404', async () => {
    for (const invalido of [
      { canal: 'email', destino: 'a@exemplo.invalid' },
      { canal: 'sms', destino: '11987654321' },
      { canal: 'push', destino: 'nao-e-uuid' },
    ]) {
      expect((await conceder().executar(autor, invalido)).ok).toBe(false);
    }
    const r = await conceder().executar(autor, { canal: 'push', destino: DISPOSITIVO });
    if (!r.ok) throw r.erro;
    const outro = { ...autor, usuarioId: gerarUuidV7() };
    const negado = await revogar().executar(outro, r.valor.id);
    expect(!negado.ok && negado.erro.categoria).toBe('nao-encontrado');
  });

  it('push: token do dispositivo da sessão, atualizado e desativado; sem dispositivo, recusa', async () => {
    const registrar = new RegistrarDestinoPush(outbox, repositorio, trilha, relogio);
    const semDispositivo = { tenantId: TENANT, usuarioId: USUARIO, origem: 'portal' as const };
    expect((await registrar.executar(semDispositivo, { plataforma: 'web', token: 't' })).ok).toBe(
      false,
    );
    expect((await registrar.executar(autor, { plataforma: 'ios', token: '' })).ok).toBe(false);
    const a = await registrar.executar(autor, { plataforma: 'ios', token: 'token-1' });
    const b = await registrar.executar(autor, { plataforma: 'ios', token: 'token-2' });
    expect(a.ok && b.ok && a.valor.id === b.valor.id).toBe(true);
    await conceder().executar(autor, { canal: 'push', destino: DISPOSITIVO });
    expect(await outbox.executar((tx) => repositorio.enderecos(tx, USUARIO, 'push'))).toEqual([
      'token-2',
    ]);

    const desativar = new DesativarDestinoPush(outbox, repositorio, trilha);
    await desativar.executar(autor);
    await desativar.executar(autor);
    await desativar.executar(semDispositivo);
    expect(await outbox.executar((tx) => repositorio.enderecos(tx, USUARIO, 'push'))).toEqual([]);
    expect(auditados.map((x) => x.tipo)).toEqual([
      'notificacoes.destino-push-registrado',
      'notificacoes.destino-push-registrado',
      'notificacoes.consentimento-concedido',
      'notificacoes.destino-push-desativado',
    ]);
    expect(JSON.stringify(auditados)).not.toContain('token-');
  });

  it('notificação por push só com consentimento; envio com a mensagem mínima do canal', async () => {
    const notificacoes = new NotificacoesEmMemoria();
    const notificar = new Notificar(
      notificacoes,
      { ativo: () => Promise.resolve(undefined) },
      { emails: () => Promise.resolve({ copias: [] }) },
      { suprimidos: () => Promise.resolve(new Set()), suprimir: () => Promise.resolve() },
      repositorio,
      outbox,
      relogio,
    );
    const pedido = (janela: string) => ({
      tipo: 'lembrete-prazo',
      tenantId: TENANT,
      usuarioId: USUARIO,
      janela,
      dados,
    });
    await new RegistrarDestinoPush(outbox, repositorio, trilha, relogio).executar(autor, {
      plataforma: 'android',
      token: 'token-1',
    });
    const sem = await outbox.executar((tx) => notificar.executar(tx, pedido('d1'), 'push'));
    expect(sem.ok && sem.valor).toEqual({ solicitada: false, motivo: 'sem-destinatario' });

    await conceder().executar(autor, { canal: 'push', destino: DISPOSITIVO });
    const r = await outbox.executar((tx) => notificar.executar(tx, pedido('d2'), 'push'));
    if (!r.ok || !r.valor.solicitada) throw new Error('não solicitada');
    const id = r.valor.notificacaoId;
    const enviados: { destinatarios: readonly string[]; texto: string; html: string }[] = [];
    const enviar = new EnviarNotificacao(
      notificacoes,
      {
        push: {
          capacidades: PUSH,
          enviar: ({ destinatarios, mensagem }) => {
            enviados.push({ destinatarios, texto: mensagem.texto, html: mensagem.html });
            return Promise.resolve({ idExterno: 'p-1', aceitoEm: relogio.agora() });
          },
        },
      },
      relogio,
    );
    await outbox.executar((tx) => enviar.executar(tx, id));
    expect(enviados).toEqual([
      { destinatarios: ['token-1'], texto: 'Um prazo vence em 15/10/2026.…', html: '' },
    ]);
  });

  it('renderização mínima: sem número do processo, limite do canal, template quando exigido', () => {
    const push = renderizar('nova-intimacao', intimacao, 'push', { ...PUSH, tamanhoMaximo: 500 });
    expect(push).toEqual({
      assunto: 'Nova intimação',
      texto: 'Há uma nova intimação para conferir no PrejuZero.',
      html: '',
      link: dados.link,
    });
    expect(JSON.stringify(push)).not.toContain(dados.numeroProcesso);
    const whatsapp = renderizar('lembrete-prazo', dados, 'whatsapp', {
      ...PUSH,
      exigeTemplateAprovado: true,
      tamanhoMaximo: 1000,
    });
    expect(whatsapp.template).toEqual({ id: 'lembrete-prazo-v1', variaveis: { link: dados.link } });
    expect(() => renderizar('nova-intimacao', intimacao, 'sms')).toThrow('sem capacidades');
    expect(renderizar('nova-intimacao', intimacao).html).toContain('0000001-00.2026.8.26.0001');
  });
});
