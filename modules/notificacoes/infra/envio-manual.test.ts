import {
  err,
  FixedClock,
  gerarUuidV7,
  Instant,
  NaoEncontrado,
  ok,
  OutboxEmMemoria,
} from '@pz/kernel';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  ListarEnviosRecentes,
  PrepararEnvioManual,
  SolicitarEnvioManual,
} from '../application/envio-manual.js';
import {
  ConsultarAvisosDeEntrega,
  EnviarNotificacao,
  Notificar,
} from '../application/notificacoes.js';

import { ConsentimentosEmMemoria, EnviosEmMemoria, NotificacoesEmMemoria } from './em-memoria.js';

import type { AnexoDoEnvio, GeradorDoAnexo } from '../application/envio-manual.js';
import type { EnviadorDeCanal } from '../application/portas.js';
import type { EstadoDaNotificacao } from '../domain/notificacao.js';
import type { EntradaDeAuditoria } from '@pz/auditoria';
import type { AnexoDeEmail, ArquivoParaGravar } from '@pz/integracoes';
import type { TransacaoEmMemoria, Uuid } from '@pz/kernel';

// Envio manual por e-mail (HU32). Dados FICTÍCIOS (e-mails reservados .invalid).
const relogio = new FixedClock(Instant.deIso('2026-11-03T15:00:00Z'));
const TENANT = gerarUuidV7();
const USUARIO = gerarUuidV7();
const PRAZO = gerarUuidV7();
const remetente = { tenantId: TENANT, usuarioId: USUARIO, canal: 'portal' as const };
const idDe = (n: EstadoDaNotificacao | undefined): Uuid => {
  if (n === undefined) throw new Error('notificação não pedida');
  return n.id;
};
const PDF = new TextEncoder().encode('%PDF-1.4 fictício');

let outbox: OutboxEmMemoria;
let auditados: EntradaDeAuditoria[];
let arquivos: Map<string, ArquivoParaGravar>;
let suprimidos: Set<string>;
let repositorio: NotificacoesEmMemoria;
let envios: EnviosEmMemoria;
let enviados: {
  destinatarios: readonly string[];
  assunto: string;
  anexos?: readonly AnexoDeEmail[];
}[];

const trilha = {
  registrar: (tx: TransacaoEmMemoria, entrada: EntradaDeAuditoria) => {
    tx.aoConfirmar(() => auditados.push(entrada));
    return Promise.resolve();
  },
};

const solicitar = () =>
  new SolicitarEnvioManual(
    outbox,
    {
      internos: (_tx, emails) =>
        Promise.resolve(new Set(emails.filter((e) => e.endsWith('@escritorio.invalid')))),
    },
    (_tx, _recurso, id) => Promise.resolve(id === PRAZO),
    trilha,
    outbox,
    relogio,
    envios,
  );

const notificar = () =>
  new Notificar(
    repositorio,
    // Preferência desligada não barra o envio manual: é um pedido explícito.
    { ativo: () => Promise.resolve(false), antecedencias: () => Promise.resolve(undefined) },
    { emails: () => Promise.resolve({ principal: 'nao-usar@escritorio.invalid', copias: [] }) },
    {
      suprimidos: (_tx, emails) =>
        Promise.resolve(new Set(emails.filter((e) => suprimidos.has(e)))),
      suprimir: () => Promise.resolve(),
    },
    new ConsentimentosEmMemoria(),
    outbox,
    relogio,
  );

const gerador: GeradorDoAnexo = (_usuario, anexo) =>
  Promise.resolve(
    anexo.origem === 'prazo' && anexo.id !== PRAZO
      ? err(new NaoEncontrado('prazo-inexistente', 'Prazo não encontrado.'))
      : ok({
          conteudo: PDF,
          tipoMime: 'application/pdf',
          extensao: 'pdf',
          numeroProcesso: '0000001-09.2030.8.09.0001',
        }),
  );

const preparar = () =>
  new PrepararEnvioManual({
    unidade: outbox,
    arquivos: {
      gravar: (a) => {
        arquivos.set(a.caminho, a);
        return Promise.resolve();
      },
    },
    gerar: gerador,
    notificar: notificar(),
    trilha,
    nomeDoRemetente: () => Promise.resolve('Ana Fictícia'),
    link: (anexo) => `https://app.exemplo.invalid/${anexo.origem}`,
    envios,
    relogio,
  });

const enviar = () => {
  const email: EnviadorDeCanal = {
    enviar: ({ destinatarios, mensagem, anexos }) => {
      enviados.push({ destinatarios, assunto: mensagem.assunto, ...(anexos ? { anexos } : {}) });
      return Promise.resolve({
        idExterno: `ext-${String(enviados.length)}`,
        aceitoEm: relogio.agora(),
      });
    },
  };
  return new EnviarNotificacao(repositorio, { email }, relogio, undefined, {
    ler: (tenantId, caminho) =>
      Promise.resolve(tenantId === TENANT ? arquivos.get(caminho)?.conteudo : undefined),
  });
};

beforeEach(() => {
  outbox = new OutboxEmMemoria();
  auditados = [];
  arquivos = new Map();
  suprimidos = new Set();
  repositorio = new NotificacoesEmMemoria();
  envios = new EnviosEmMemoria(repositorio, relogio);
  enviados = [];
});

const pedidoDePrazo = (extra: object = {}) => ({
  recurso: 'prazo',
  recursoId: PRAZO,
  destinatarios: ['Bia@Escritorio.invalid'],
  ...extra,
});

describe('envio manual: pedido (HU32)', () => {
  it('externo sem confirmação é recusado sem trilha nem evento', async () => {
    const r = await solicitar().executar(
      remetente,
      pedidoDePrazo({ destinatarios: ['bia@escritorio.invalid', 'cliente@fora.invalid'] }),
    );
    expect(!r.ok && r.erro.codigo).toBe('confirmacao-de-sigilo');
    expect(!r.ok && r.erro.message).toContain('cliente@fora.invalid');
    expect(auditados).toEqual([]);
    expect(outbox.pendentes()).toEqual([]);
  });

  it('com confirmação: trilha com destinatários e externos, evento com o anexo', async () => {
    const r = await solicitar().executar(
      remetente,
      pedidoDePrazo({
        destinatarios: ['Bia@Escritorio.invalid', 'cliente@fora.invalid', 'bia@escritorio.invalid'],
        confirmacaoSigilo: true,
        mensagem: '',
      }),
    );
    if (!r.ok) throw r.erro;
    expect(r.valor.externos).toEqual(['cliente@fora.invalid']);
    expect(auditados).toEqual([
      expect.objectContaining({
        tipo: 'notificacoes.envio-manual-solicitado',
        entidadeId: r.valor.id,
        depois: {
          recurso: 'prazo',
          anexo: { origem: 'prazo', id: PRAZO, formato: 'pdf' },
          destinatarios: ['bia@escritorio.invalid', 'cliente@fora.invalid'],
          externos: ['cliente@fora.invalid'],
          confirmacaoSigilo: true,
        },
      }),
    ]);
    const [evento] = outbox.pendentes();
    expect(evento).toMatchObject({ tipo: 'EnvioManualSolicitado', tenantId: TENANT });
    expect(evento?.payload).not.toHaveProperty('mensagem');
  });

  it('recurso inexistente é 404; pedido fora do contrato é validação', async () => {
    const r = await solicitar().executar(remetente, pedidoDePrazo({ recursoId: gerarUuidV7() }));
    expect(!r.ok && r.erro.codigo).toBe('prazo-inexistente');
    for (const corpo of [
      pedidoDePrazo({ destinatarios: [] }),
      pedidoDePrazo({
        destinatarios: Array.from({ length: 11 }, (_, i) => `a${String(i)}@x.invalid`),
      }),
      pedidoDePrazo({ destinatarios: ['nao-e-email'] }),
      {
        recurso: 'busca',
        alvo: 'prazos',
        filtros: { cursor: 'x' },
        destinatarios: ['a@x.invalid'],
      },
    ]) {
      const v = await solicitar().executar(remetente, corpo);
      expect(!v.ok && v.erro.categoria, JSON.stringify(corpo)).toBe('validacao');
    }
  });
});

describe('envio manual: preparo e envio (HU32)', () => {
  const pedido = (anexo: AnexoDoEnvio, destinatarios = ['bia@escritorio.invalid']) => ({
    envioId: gerarUuidV7(),
    tenantId: TENANT,
    usuarioId: USUARIO,
    anexo,
    destinatarios,
    mensagem: 'Pode cuidar?',
  });

  it('gera o anexo, pede a notificação e envia com o arquivo; repetir não duplica', async () => {
    const p = pedido({ origem: 'prazo', id: PRAZO, formato: 'pdf' }, [
      'bia@escritorio.invalid',
      'cliente@fora.invalid',
    ]);
    expect(await preparar().executar(p)).toBe('solicitado');
    expect(await preparar().executar(p)).toBe('ja-solicitado');
    expect([...arquivos.keys()]).toEqual([`envios/${p.envioId}/prejuzero-prazo.pdf`]);
    const [notificacao] = repositorio.todas();
    expect(notificacao).toMatchObject({
      tipo: 'envio-manual',
      usuarioId: USUARIO,
      destinatarios: ['bia@escritorio.invalid', 'cliente@fora.invalid'],
      anexo: { nome: 'prejuzero-prazo.pdf', tipoMime: 'application/pdf' },
    });
    await outbox.executar((tx) => enviar().executar(tx, idDe(notificacao)));
    expect(enviados).toHaveLength(1);
    expect(enviados[0]?.assunto).toBe(
      'Ana Fictícia enviou o prazo do processo 0000001-09.2030.8.09.0001 pelo PrejuZero',
    );
    expect(enviados[0]?.anexos).toEqual([
      { nome: 'prejuzero-prazo.pdf', tipoMime: 'application/pdf', conteudo: PDF },
    ]);
  });

  it('suprimidos ficam de fora; todos suprimidos ou recurso sumido: falha na trilha', async () => {
    suprimidos.add('cliente@fora.invalid');
    const parcial = pedido({ origem: 'prazo', id: PRAZO, formato: 'pdf' }, [
      'bia@escritorio.invalid',
      'cliente@fora.invalid',
    ]);
    expect(await preparar().executar(parcial)).toBe('solicitado');
    expect(repositorio.todas()[0]?.destinatarios).toEqual(['bia@escritorio.invalid']);

    const todos = pedido({ origem: 'busca', alvo: 'prazos', filtros: {}, formato: 'pdf' }, [
      'cliente@fora.invalid',
    ]);
    expect(await preparar().executar(todos)).toBe('falhou');
    const sumido = pedido({ origem: 'prazo', id: gerarUuidV7(), formato: 'pdf' });
    expect(await preparar().executar(sumido)).toBe('falhou');
    expect(
      auditados.map((a) => [a.tipo, a.entidadeId, (a.depois as { motivo: string }).motivo]),
    ).toEqual([
      ['notificacoes.envio-manual-falhou', todos.envioId, 'destinatarios-suprimidos'],
      ['notificacoes.envio-manual-falhou', sumido.envioId, 'prazo-inexistente'],
    ]);
  });

  it('anexo sumido do armazenamento: o envio lança (retentativa e DLQ)', async () => {
    const p = pedido({ origem: 'relatorio', id: gerarUuidV7() });
    expect(await preparar().executar(p)).toBe('solicitado');
    arquivos.clear();
    const [notificacao] = repositorio.todas();
    await expect(outbox.executar((tx) => enviar().executar(tx, idDe(notificacao)))).rejects.toThrow(
      /não encontrado/,
    );
    expect(enviados).toEqual([]);
  });
});

describe('envio manual: variações (HU32)', () => {
  it('busca, relatório e publicação viram o anexo do evento; mensagem segue no evento', async () => {
    const corpos = [
      {
        recurso: 'busca',
        alvo: 'publicacoes',
        filtros: { tribunal: 'TJGO' },
        formato: 'xlsx',
        destinatarios: ['bia@escritorio.invalid'],
        mensagem: 'Segue.',
      },
      { recurso: 'relatorio', recursoId: PRAZO, destinatarios: ['bia@escritorio.invalid'] },
      { recurso: 'publicacao', recursoId: PRAZO, destinatarios: ['bia@escritorio.invalid'] },
    ];
    for (const corpo of corpos) {
      const r = await solicitar().executar(remetente, corpo);
      expect(r.ok, JSON.stringify(corpo)).toBe(true);
    }
    expect(outbox.pendentes().map((e) => (e.payload as { anexo: unknown }).anexo)).toEqual([
      { origem: 'busca', alvo: 'publicacoes', filtros: { tribunal: 'TJGO' }, formato: 'xlsx' },
      { origem: 'relatorio', id: PRAZO },
      { origem: 'publicacao', id: PRAZO, formato: 'pdf' },
    ]);
    expect(outbox.pendentes()[0]?.payload).toMatchObject({ mensagem: 'Segue.' });
  });

  it('sem nome do remetente nem número do processo: texto genérico, sem observação', async () => {
    const semNumero: GeradorDoAnexo = () =>
      Promise.resolve(ok({ conteudo: PDF, tipoMime: 'application/pdf', extensao: 'pdf' }));
    const p = new PrepararEnvioManual({
      unidade: outbox,
      arquivos: { gravar: () => Promise.resolve() },
      gerar: semNumero,
      notificar: notificar(),
      trilha,
      nomeDoRemetente: () => Promise.resolve(undefined),
      link: () => 'https://app.exemplo.invalid/busca',
      envios,
      relogio,
    });
    const envioId = gerarUuidV7();
    expect(
      await p.executar({
        envioId,
        tenantId: TENANT,
        usuarioId: USUARIO,
        anexo: { origem: 'busca', alvo: 'prazos', filtros: {}, formato: 'pdf' },
        destinatarios: ['bia@escritorio.invalid'],
      }),
    ).toBe('solicitado');
    expect(repositorio.todas()[0]?.dados).toEqual({
      recurso: 'busca',
      remetente: 'Um advogado',
      link: 'https://app.exemplo.invalid/busca',
    });
  });

  it('destinatários explícitos só no e-mail; anexo sem leitor de arquivos lança', async () => {
    const r = await outbox.executar((tx) =>
      notificar().executar(
        tx,
        {
          tipo: 'envio-manual',
          tenantId: TENANT,
          usuarioId: USUARIO,
          janela: 'x',
          destinatarios: ['bia@escritorio.invalid'],
          dados: { recurso: 'busca', remetente: 'Ana', link: 'https://app.exemplo.invalid/busca' },
        },
        'push',
      ),
    );
    expect(!r.ok && r.erro.problemas).toEqual([
      { campo: 'destinatarios', mensagem: 'Só no e-mail.' },
    ]);

    expect(
      await preparar().executar({
        envioId: gerarUuidV7(),
        tenantId: TENANT,
        usuarioId: USUARIO,
        anexo: { origem: 'prazo', id: PRAZO, formato: 'pdf' },
        destinatarios: ['bia@escritorio.invalid'],
      }),
    ).toBe('solicitado');
    const semLeitor = new EnviarNotificacao(
      repositorio,
      { email: { enviar: () => Promise.reject(new Error('não deveria enviar')) } },
      relogio,
    );
    await expect(
      outbox.executar((tx) => semLeitor.executar(tx, idDe(repositorio.todas()[0]))),
    ).rejects.toThrow(/sem leitor de arquivos/);
  });
});

// Situação do envio no portal e aviso de falha (PZ-361).
describe('envio manual: situação para quem enviou (PZ-361)', () => {
  const recentes = () => new ListarEnviosRecentes(outbox, envios).executar(USUARIO);

  it('pedido nasce pendente; enviado depois do e-mail; rejeitado quando o provedor recusa', async () => {
    const r = await solicitar().executar(remetente, pedidoDePrazo());
    if (!r.ok) throw r.erro;
    expect(await recentes()).toEqual([
      expect.objectContaining({
        id: r.valor.id,
        recurso: 'prazo',
        destinatarios: 1,
        situacao: 'pendente',
      }),
    ]);
    const preparo = {
      envioId: r.valor.id,
      tenantId: TENANT,
      usuarioId: USUARIO,
      anexo: { origem: 'prazo' as const, id: PRAZO, formato: 'pdf' as const },
      destinatarios: ['bia@escritorio.invalid'],
    };
    expect(await preparar().executar(preparo)).toBe('solicitado');
    const [notificacao] = repositorio.todas();
    await outbox.executar((tx) => enviar().executar(tx, idDe(notificacao)));
    expect((await recentes())[0]).toMatchObject({ situacao: 'enviado', motivo: null });

    // Rejeição do provedor (bounce) chega pelo webhook e aparece como rejeitado, com aviso.
    await outbox.executar(async (tx) => {
      const lida = await repositorio.buscar(tx, idDe(notificacao));
      if (lida === undefined) throw new Error('sem notificação');
      lida.registrarDesfecho(
        { tipo: 'rejeitado', ocorridoEm: relogio.agora(), motivo: 'x' },
        relogio,
      );
      await repositorio.registrarDesfecho(tx, lida);
    });
    expect((await recentes())[0]).toMatchObject({ situacao: 'rejeitado', motivo: 'bounce' });
    expect(await avisos()).toBe(1);
  });

  it('falha do preparo aparece como falhou, com o motivo, e conta no aviso', async () => {
    const r = await solicitar().executar(
      remetente,
      pedidoDePrazo({ destinatarios: ['cliente@fora.invalid'], confirmacaoSigilo: true }),
    );
    if (!r.ok) throw r.erro;
    suprimidos.add('cliente@fora.invalid');
    const preparo = {
      envioId: r.valor.id,
      tenantId: TENANT,
      usuarioId: USUARIO,
      anexo: { origem: 'prazo' as const, id: PRAZO, formato: 'pdf' as const },
      destinatarios: ['cliente@fora.invalid'],
    };
    expect(await preparar().executar(preparo)).toBe('falhou');
    expect(await recentes()).toEqual([
      expect.objectContaining({ situacao: 'falhou', motivo: 'destinatarios-suprimidos' }),
    ]);
    expect(await avisos()).toBe(1);
    // Outro usuário não vê os envios de quem enviou.
    expect(await new ListarEnviosRecentes(outbox, envios).executar(gerarUuidV7())).toEqual([]);
  });

  const avisos = async () =>
    (
      await new ConsultarAvisosDeEntrega(
        outbox,
        repositorio,
        { emails: () => Promise.resolve({ copias: [] }) },
        { suprimidos: () => Promise.resolve(new Set<string>()), suprimir: () => Promise.resolve() },
        relogio,
        envios,
      ).executar(USUARIO, false)
    ).enviosComProblema;
});
