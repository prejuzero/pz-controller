import { Conflito, err, FixedClock, Instant, ok, OutboxEmMemoria, Validacao } from '@pz/kernel';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  AdicionarOab,
  AtualizarPerfil,
  CadastrarAdvogado,
  ConsultarPerfil,
  RemoverOab,
} from '../application/cadastro.js';

import { AdvogadosEmMemoria } from './em-memoria.js';

import type { AutorDoCadastro } from '../application/cadastro.js';
import type { ContaPreparada, CriadorDeConta } from '../application/portas.js';
import type { EntradaDeAuditoria, OrigemDaAuditoria, TrilhaDeAuditoria } from '@pz/auditoria';
import type { TransacaoEmMemoria, Uuid } from '@pz/kernel';

// Dados FICTÍCIOS: CPFs gerados, OABs e e-mails inventados.
const CPF_A = '529.982.247-25';
const CPF_B = '111.444.777-35';

class TrilhaFalsa implements TrilhaDeAuditoria<TransacaoEmMemoria> {
  readonly registros: { entrada: EntradaDeAuditoria; origem: OrigemDaAuditoria }[] = [];
  registrar(tx: TransacaoEmMemoria, entrada: EntradaDeAuditoria, origem: OrigemDaAuditoria) {
    tx.aoConfirmar(() => this.registros.push({ entrada, origem }));
    return Promise.resolve();
  }
}

/** Identidade falsa: e-mail único e senha mínima, como a real. */
class ContasFalsas implements CriadorDeConta<TransacaoEmMemoria> {
  readonly emails = new Set<string>();
  preparar(entrada: { nome: string; email: string; senha: string }) {
    if (entrada.senha.length < 12)
      return Promise.resolve(err(new Validacao([{ campo: 'senha', mensagem: 'Senha curta.' }])));
    return Promise.resolve(
      ok<ContaPreparada>({ ...entrada, email: entrada.email.toLowerCase(), senhaHash: 'hash' }),
    );
  }
  gravar(tx: TransacaoEmMemoria, conta: ContaPreparada) {
    if (this.emails.has(conta.email))
      return Promise.resolve(err(new Conflito('email-em-uso', 'E-mail já cadastrado.')));
    tx.aoConfirmar(() => this.emails.add(conta.email));
    return Promise.resolve(ok(undefined));
  }
}

const entrada = (parcial: Record<string, unknown> = {}) => ({
  nome: 'Pessoa Fictícia',
  cpf: CPF_A,
  email: 'pessoa@exemplo.com',
  senha: 'uma frase longa de teste',
  celular: '(11) 98765-4321',
  oabPrincipal: { numero: '123456', uf: 'sp' },
  oabsSuplementares: [{ numero: '9876', uf: 'RJ' }],
  ...parcial,
});

describe('cadastro do advogado (HU11)', () => {
  let outbox: OutboxEmMemoria;
  let advogados: AdvogadosEmMemoria;
  let contas: ContasFalsas;
  let trilha: TrilhaFalsa;
  let cadastrar: CadastrarAdvogado<TransacaoEmMemoria>;
  const relogio = new FixedClock(Instant.deEpochMs(Date.UTC(2026, 9, 7, 12)));
  const tenants: Uuid[] = [];

  beforeEach(() => {
    outbox = new OutboxEmMemoria();
    advogados = new AdvogadosEmMemoria(relogio);
    contas = new ContasFalsas();
    trilha = new TrilhaFalsa();
    const noTenant = {
      executar: <R>(tenantId: Uuid, trabalho: (tx: TransacaoEmMemoria) => Promise<R>) => {
        tenants.push(tenantId);
        return outbox.executar(trabalho);
      },
    };
    const verificacao = {
      preparar: (conta: { usuarioId: Uuid; tenantId: Uuid }) =>
        Promise.resolve({
          id: conta.usuarioId,
          tipo: 'VerificacaoDeEmailSolicitada',
          versao: 1,
          tenantId: conta.tenantId,
          agregadoId: conta.usuarioId,
          ocorridoEm: relogio.agora(),
          payload: {},
        }),
    };
    cadastrar = new CadastrarAdvogado(
      noTenant,
      contas,
      verificacao,
      advogados,
      trilha,
      outbox,
      relogio,
    );
  });

  async function cadastrado(): Promise<AutorDoCadastro> {
    const r = await cadastrar.executar(entrada(), { ip: '203.0.113.1' });
    if (!r.ok) throw r.erro;
    return { usuarioId: r.valor.usuarioId, canal: 'portal' };
  }

  it('cria conta, advogado e OABs no tenant novo, com auditoria e eventos', async () => {
    const r = await cadastrar.executar(entrada(), { ip: '203.0.113.1' });
    if (!r.ok) throw r.erro;
    expect(tenants.at(-1)).toBe(r.valor.tenantId);
    expect(r.valor.perfil).toMatchObject({
      cpf: '***.982.247-**',
      celular: '11987654321',
      oabs: [
        { numero: '123456', uf: 'SP', tipo: 'principal' },
        { numero: '9876', uf: 'RJ', tipo: 'suplementar' },
      ],
    });
    expect(trilha.registros[0]?.entrada.tipo).toBe('cadastro.advogado-cadastrado');
    expect(trilha.registros[0]?.origem).toMatchObject({ canal: 'portal', ip: '203.0.113.1' });
    expect(JSON.stringify(trilha.registros)).not.toContain('52998224725');
    expect(outbox.pendentes().map((e) => e.tipo)).toEqual([
      'AdvogadoCadastrado',
      'OabAdicionada',
      'OabAdicionada',
      'VerificacaoDeEmailSolicitada',
    ]);
  });

  it('junta os problemas de validação de todos os campos', async () => {
    const r = await cadastrar.executar(
      entrada({
        cpf: '123',
        celular: '1',
        senha: 'curta',
        oabPrincipal: { numero: 'x', uf: 'ZZ' },
      }),
    );
    expect(!r.ok && r.erro instanceof Validacao && r.erro.problemas.map((p) => p.campo)).toEqual([
      'cpf',
      'celular',
      'oabPrincipal.numero',
      'oabPrincipal.uf',
      'senha',
    ]);
    expect((await cadastrar.executar({ nome: 'x' })).ok).toBe(false);
  });

  it.each([
    [
      'e-mail',
      { cpf: CPF_B, oabPrincipal: { numero: '1', uf: 'MG' }, oabsSuplementares: [] },
      'email-em-uso',
    ],
    [
      'CPF',
      {
        email: 'outra@exemplo.com',
        oabPrincipal: { numero: '1', uf: 'MG' },
        oabsSuplementares: [],
      },
      'cpf-em-uso',
    ],
    ['OAB', { email: 'outra@exemplo.com', cpf: CPF_B, oabsSuplementares: [] }, 'oab-em-uso'],
  ])('%s já usado: conflito e nada gravado', async (_nome, parcial, codigo) => {
    await cadastrado();
    const eventosAntes = outbox.pendentes().length;
    const r = await cadastrar.executar(entrada(parcial));
    expect(!r.ok && r.erro.codigo).toBe(codigo);
    expect(outbox.pendentes()).toHaveLength(eventosAntes);
    expect(trilha.registros).toHaveLength(1);
  });

  it('perfil: consulta, atualiza com antes e depois na trilha', async () => {
    const autor = await cadastrado();
    const consultar = new ConsultarPerfil(outbox, advogados);
    const atualizar = new AtualizarPerfil(outbox, advogados, trilha);
    expect((await consultar.executar(autor.usuarioId)).ok).toBe(true);
    const r = await atualizar.executar(autor, {
      celular: '21998765432',
      emailsAdicionais: ['Copia@Exemplo.com'],
    });
    expect(r.ok && r.valor).toMatchObject({
      celular: '21998765432',
      emailsAdicionais: ['copia@exemplo.com'],
    });
    expect(trilha.registros.at(-1)?.entrada).toMatchObject({
      tipo: 'cadastro.perfil-atualizado',
      antes: { celular: '11987654321' },
      depois: { celular: '21998765432' },
    });
    expect((await atualizar.executar(autor, { celular: '1' })).ok).toBe(false);
    expect((await atualizar.executar(autor, { extra: 1 })).ok).toBe(false);
    const ninguem = {
      usuarioId: '0199a000-0000-7000-8000-00000000ffff' as Uuid,
      canal: 'portal' as const,
    };
    expect((await consultar.executar(ninguem.usuarioId)).ok).toBe(false);
    expect((await atualizar.executar(ninguem, {})).ok).toBe(false);
  });

  it('OAB: adiciona (evento e trilha), recusa a de outro advogado e remove a suplementar', async () => {
    const autor = await cadastrado();
    const adicionar = new AdicionarOab(outbox, advogados, trilha, outbox);
    const remover = new RemoverOab(outbox, advogados, trilha, outbox);
    const nova = await adicionar.executar(autor, { numero: '555', uf: 'mg' });
    if (!nova.ok) throw nova.erro;
    expect(outbox.pendentes().at(-1)?.tipo).toBe('OabAdicionada');

    const outro = await cadastrar.executar(
      entrada({
        email: 'b@exemplo.com',
        cpf: CPF_B,
        oabPrincipal: { numero: '777', uf: 'BA' },
        oabsSuplementares: [],
      }),
    );
    if (!outro.ok) throw outro.erro;
    const deOutro = await adicionar.executar(
      { usuarioId: outro.valor.usuarioId, canal: 'app' },
      { numero: '555', uf: 'MG' },
    );
    expect(!deOutro.ok && deOutro.erro.codigo).toBe('oab-em-uso');
    expect((await adicionar.executar(autor, { numero: '?', uf: 'MG' })).ok).toBe(false);

    expect((await remover.executar(autor, nova.valor.id)).ok).toBe(true);
    expect(outbox.pendentes().at(-1)?.tipo).toBe('OabRemovida');
    expect(trilha.registros.at(-1)?.entrada).toMatchObject({
      tipo: 'cadastro.oab-removida',
      antes: { numero: '555' },
    });
    // Depois de removida, a OAB fica livre para outro advogado.
    expect(
      (
        await adicionar.executar(
          { usuarioId: outro.valor.usuarioId, canal: 'app' },
          { numero: '555', uf: 'MG' },
        )
      ).ok,
    ).toBe(true);
    const ninguem = {
      usuarioId: '0199a000-0000-7000-8000-00000000ffff' as Uuid,
      canal: 'portal' as const,
    };
    expect((await adicionar.executar(ninguem, { numero: '1', uf: 'SP' })).ok).toBe(false);
    expect((await remover.executar(ninguem, nova.valor.id)).ok).toBe(false);
    expect((await remover.executar(autor, nova.valor.id)).ok).toBe(false);
  });
});
