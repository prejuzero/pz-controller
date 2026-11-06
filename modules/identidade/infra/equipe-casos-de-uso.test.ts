import { FixedClock, gerarUuidV7, Instant, OutboxEmMemoria } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import {
  AceitarConvite,
  AlterarPerfisDoMembro,
  CancelarConvite,
  ConvidarMembro,
  DescreverConvite,
  DesativarMembro,
  EnviarConvite,
  ListarEquipe,
} from '../application/equipe.js';

import {
  CredenciaisEmMemoria,
  DispositivosEmMemoria,
  EquipeEmMemoria,
  RenovacoesEmMemoria,
  SessoesEmMemoria,
} from './em-memoria.js';

import type { Email } from '../domain/credenciais.js';
import type { EmailCanonico } from '@pz/integracoes';

// Dados FICTÍCIOS.
const relogio = new FixedClock(Instant.deIso('2026-11-06T12:00:00Z'));
const TENANT = gerarUuidV7();
const TITULAR = gerarUuidV7();

function montar() {
  const unidade = new OutboxEmMemoria();
  const credenciais = new CredenciaisEmMemoria();
  const equipe = new EquipeEmMemoria(credenciais);
  const sessoes = new SessoesEmMemoria();
  const dispositivos = new DispositivosEmMemoria();
  const renovacoes = new RenovacoesEmMemoria();
  const auditados: string[] = [];
  let n = 0;
  const tokens = { novoToken: () => `token-ficticio-${String(++n).padStart(3, '0')}` };
  const cifra = { cifrar: (t: string) => `c:${t}`, decifrar: (c: string) => c.slice(2) };
  const deps = {
    unidade,
    equipe,
    credenciais,
    trilha: {
      registrar: (_tx: unknown, e: { tipo: string }) => {
        auditados.push(e.tipo);
        return Promise.resolve();
      },
    },
    outbox: unidade,
    tokens,
    cifra,
    relogio,
  };
  const hasher = {
    gerar: (s: string) => Promise.resolve(`hash:${s}`),
    verificar: () => Promise.resolve(true),
  };
  const noTenant = <R>(_t: string, trabalho: () => Promise<R>) => trabalho();
  equipe.incluir({
    usuarioId: TITULAR,
    nome: 'Titular Fictícia',
    email: 'titular@exemplo.invalid',
    perfis: ['admin_escritorio', 'advogado'],
    criadoEm: relogio.agora(),
    desativadoEm: null,
  });
  credenciais.cadastrar('titular@exemplo.invalid' as Email, {
    usuarioId: TITULAR,
    tenantId: TENANT,
    senhaHash: 'h',
    segundoFatorAtivo: true,
  });
  return {
    unidade,
    equipe,
    credenciais,
    sessoes,
    dispositivos,
    auditados,
    convidar: new ConvidarMembro(deps),
    cancelar: new CancelarConvite(deps),
    listar: new ListarEquipe(deps),
    descrever: new DescreverConvite(deps),
    aceitar: new AceitarConvite(deps, hasher, noTenant),
    alterar: new AlterarPerfisDoMembro(deps),
    desativar: new DesativarMembro(deps, sessoes, dispositivos, renovacoes),
  };
}

const autor = { tenantId: TENANT, usuarioId: TITULAR };
const pedido = {
  email: 'Colab@Exemplo.invalid',
  nome: 'Colaboradora Fictícia',
  perfil: 'colaborador',
};

describe('convites da equipe (HU41)', () => {
  it('convida, lista, aceita com senha e o novo membro entra com o perfil do convite', async () => {
    const m = montar();
    const convite = await m.convidar.executar(autor, pedido);
    if (!convite.ok) throw new Error('convidar falhou');
    expect(convite.valor).toMatchObject({ email: 'colab@exemplo.invalid', perfil: 'colaborador' });
    expect(m.unidade.pendentes()).toEqual([
      expect.objectContaining({
        tipo: 'ConviteDeMembroEnviado',
        payload: { conviteId: convite.valor.id, tokenCifrado: 'c:token-ficticio-001' },
      }),
    ]);
    expect((await m.listar.executar()).convites).toHaveLength(1);
    const repetido = await m.convidar.executar(autor, pedido);
    expect(!repetido.ok && repetido.erro.codigo).toBe('convite-aberto');

    expect(await m.descrever.executar('token-ficticio-001')).toEqual({
      ok: true,
      valor: {
        nome: 'Colaboradora Fictícia',
        email: 'colab@exemplo.invalid',
        perfil: 'colaborador',
      },
    });
    const fraca = await m.aceitar.executar('token-ficticio-001', 'curta');
    expect(!fraca.ok && fraca.erro.codigo).toBe('validacao');
    expect((await m.aceitar.executar('token-ficticio-001', 'senha fictícia longa')).ok).toBe(true);
    const deNovo = await m.aceitar.executar('token-ficticio-001', 'senha fictícia longa');
    expect(!deNovo.ok && deNovo.erro.codigo).toBe('convite-invalido');
    const equipe = await m.listar.executar();
    expect(equipe.convites).toEqual([]);
    expect(equipe.membros.find((x) => x.email === 'colab@exemplo.invalid')?.perfis).toEqual([
      'colaborador',
    ]);
    expect(m.auditados).toEqual(['identidade.membro-convidado', 'identidade.convite-aceito']);
  });

  it('recusa e-mail já cadastrado, entrada inválida, convite cancelado, vencido ou de escritório suspenso', async () => {
    const m = montar();
    const existente = await m.convidar.executar(autor, {
      ...pedido,
      email: 'titular@exemplo.invalid',
    });
    expect(!existente.ok && existente.erro.codigo).toBe('email-ja-cadastrado');
    expect((await m.convidar.executar(autor, { ...pedido, perfil: 'admin_plataforma' })).ok).toBe(
      false,
    );
    expect((await m.convidar.executar(autor, { ...pedido, email: 'sem-arroba' })).ok).toBe(false);

    const c = await m.convidar.executar(autor, pedido);
    if (!c.ok) throw new Error('convidar falhou');
    expect((await m.cancelar.executar(autor, c.valor.id)).ok).toBe(true);
    expect((await m.cancelar.executar(autor, c.valor.id)).ok).toBe(false);
    expect((await m.descrever.executar('token-ficticio-001')).ok).toBe(false);
    expect((await m.descrever.executar('nao-existe')).ok).toBe(false);

    const outro = await m.convidar.executar(autor, pedido);
    if (!outro.ok) throw new Error('convidar falhou');
    m.equipe.tenantsSuspensos.add(TENANT);
    expect((await m.aceitar.executar('token-ficticio-002', 'senha fictícia longa')).ok).toBe(false);
    m.equipe.tenantsSuspensos.clear();
    // Alguém criou conta com o e-mail entre o convite e o aceite.
    m.credenciais.cadastrar('colab@exemplo.invalid' as Email, {
      usuarioId: gerarUuidV7(),
      tenantId: gerarUuidV7(),
      senhaHash: 'h',
      segundoFatorAtivo: false,
    });
    const tomado = await m.aceitar.executar('token-ficticio-002', 'senha fictícia longa');
    expect(!tomado.ok && tomado.erro.codigo).toBe('email-ja-cadastrado');

    const vencido = new FixedClock(Instant.deIso('2026-11-14T12:00:00Z'));
    const m2 = montar();
    await m2.convidar.executar(autor, pedido);
    const descrever = new DescreverConvite({
      unidade: m2.unidade,
      equipe: m2.equipe,
      credenciais: m2.credenciais,
      trilha: { registrar: () => Promise.resolve() },
      outbox: m2.unidade,
      tokens: { novoToken: () => 'x' },
      cifra: { cifrar: (t: string) => t, decifrar: (t: string) => t },
      relogio: vencido,
    });
    expect((await descrever.executar('token-ficticio-001')).ok).toBe(false);
  });
});

describe('perfis e desativação (HU41)', () => {
  async function comColaboradora(m: ReturnType<typeof montar>) {
    await m.convidar.executar(autor, pedido);
    await m.aceitar.executar('token-ficticio-001', 'senha fictícia longa');
    const membro = (await m.listar.executar()).membros.find(
      (x) => x.email === 'colab@exemplo.invalid',
    );
    if (membro === undefined) throw new Error('membro ausente');
    return membro.usuarioId;
  }

  it('troca perfis e desativa; o escritório nunca fica sem administrador', async () => {
    const m = montar();
    const colab = await comColaboradora(m);
    expect((await m.alterar.executar(autor, colab, { perfis: ['advogado'] })).ok).toBe(true);
    const ultimo = await m.alterar.executar(autor, TITULAR, { perfis: ['advogado'] });
    expect(!ultimo.ok && ultimo.erro.codigo).toBe('ultimo-administrador');
    expect((await m.alterar.executar(autor, colab, { perfis: [] })).ok).toBe(false);
    const inexistente = await m.alterar.executar(autor, gerarUuidV7(), { perfis: ['advogado'] });
    expect(!inexistente.ok && inexistente.erro.codigo).toBe('membro-nao-encontrado');

    const proprio = await m.desativar.executar(autor, TITULAR);
    expect(!proprio.ok && proprio.erro.codigo).toBe('desativar-a-si-mesmo');
    await m.sessoes.gravar('sessao-da-colab', {
      id: gerarUuidV7(),
      usuarioId: colab,
      tenantId: TENANT,
      nivel: 'completo',
      segundoFatorAtivo: true,
      criadaEm: relogio.agora(),
      ultimoUso: relogio.agora(),
    });
    await m.dispositivos.registrar({
      id: gerarUuidV7(),
      usuarioId: colab,
      tenantId: TENANT,
      tipoCliente: 'mobile',
      nome: 'Celular fictício',
      criadoEm: relogio.agora(),
      ultimoUso: relogio.agora(),
    });
    expect((await m.desativar.executar(autor, colab)).ok).toBe(true);
    expect(await m.sessoes.obter('sessao-da-colab')).toBeUndefined();
    expect((await m.dispositivos.listar(colab))[0]?.revogadaEm).toBeDefined();
    expect((await m.desativar.executar(autor, colab)).ok).toBe(false);
    expect((await m.alterar.executar(autor, colab, { perfis: ['advogado'] })).ok).toBe(false);

    // Outro administrador desativando a titular, última admin ativa: recusado.
    const outroAdmin = { tenantId: TENANT, usuarioId: colab };
    const ultimoAdmin = await m.desativar.executar(outroAdmin, TITULAR);
    expect(!ultimoAdmin.ok && ultimoAdmin.erro.codigo).toBe('ultimo-administrador');
    expect(m.auditados).toContain('identidade.perfis-alterados');
    expect(m.auditados).toContain('identidade.membro-desativado');
  });
});

describe('e-mail do convite (HU41)', () => {
  it('envia o link com o token no fragmento; convite já fechado não envia', async () => {
    const enviados: EmailCanonico[] = [];
    const email = {
      enviar: (e: EmailCanonico) => {
        enviados.push(e);
        return Promise.resolve({ idExterno: 'x', aceitoEm: relogio.agora() });
      },
      saude: () =>
        Promise.resolve({ estado: 'operacional' as const, verificadoEm: relogio.agora() }),
    };
    let existe = true;
    const convites = {
      doConvite: () =>
        Promise.resolve(existe ? { email: 'colab@exemplo.invalid', nome: 'Colab <b>' } : undefined),
    };
    const enviar = new EnviarConvite(
      email,
      convites,
      { cifrar: (t: string) => t, decifrar: (c: string) => c.toUpperCase() },
      'http://localhost:3001',
    );
    const evento = {
      id: gerarUuidV7(),
      tipo: 'ConviteDeMembroEnviado' as const,
      versao: 1,
      tenantId: TENANT,
      agregadoId: gerarUuidV7(),
      ocorridoEm: relogio.agora(),
      payload: { conviteId: gerarUuidV7(), tokenCifrado: 'abc' },
    };
    await enviar.executar(null, evento);
    expect(enviados[0]).toMatchObject({ para: ['colab@exemplo.invalid'], idempotencia: evento.id });
    expect(enviados[0]?.texto).toContain('http://localhost:3001/convite#token=ABC');
    expect(enviados[0]?.html).toContain('Colab &#60;b&#62;');
    existe = false;
    await enviar.executar(null, evento);
    expect(enviados).toHaveLength(1);
  });
});
