import { FixedClock, Instant, OutboxEmMemoria } from '@pz/kernel';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  AtualizarCliente,
  CadastrarCliente,
  ConsultarCliente,
  ListarClientes,
  RemoverCliente,
} from '../application/clientes.js';
import {
  AlterarCobertura,
  AtualizarProcesso,
  CadastrarProcesso,
  ConsultarProcesso,
  ListarProcessos,
  ObterOuCriarProcesso,
} from '../application/processos.js';

import { ClientesEmMemoria, ProcessosEmMemoria } from './processos-em-memoria.js';

import type { AutorNoTenant } from '../application/paginacao.js';
import type { EntradaDeAuditoria, OrigemDaAuditoria, TrilhaDeAuditoria } from '@pz/auditoria';
import type { TransacaoEmMemoria, Uuid } from '@pz/kernel';

// Dados FICTÍCIOS: números CNJ com dígito conferido, CPF gerado, nomes inventados.
const NUMERO = '0000001-68.2026.8.26.0100';
const OUTRO = '1234567-03.2025.5.02.0001';
const NAO_EXISTE = '0199c0de-0000-7000-8000-00000000ffff' as Uuid;

class TrilhaFalsa implements TrilhaDeAuditoria<TransacaoEmMemoria> {
  readonly registros: { entrada: EntradaDeAuditoria; origem: OrigemDaAuditoria }[] = [];
  registrar(tx: TransacaoEmMemoria, entrada: EntradaDeAuditoria, origem: OrigemDaAuditoria) {
    tx.aoConfirmar(() => this.registros.push({ entrada, origem }));
    return Promise.resolve();
  }
}

describe('processos e clientes (HU12)', () => {
  const relogio = new FixedClock(Instant.deIso('2026-10-07T12:00:00Z'));
  const autor: AutorNoTenant = {
    tenantId: '0199c0de-0000-7000-8000-000000000001' as Uuid,
    usuarioId: '0199c0de-0000-7000-8000-000000000002' as Uuid,
    canal: 'portal',
  };
  let outbox: OutboxEmMemoria;
  let processos: ProcessosEmMemoria;
  let clientes: ClientesEmMemoria;
  let trilha: TrilhaFalsa;
  let cadastrar: CadastrarProcesso<TransacaoEmMemoria>;
  let cadastrarCliente: CadastrarCliente<TransacaoEmMemoria>;

  beforeEach(() => {
    outbox = new OutboxEmMemoria();
    processos = new ProcessosEmMemoria(relogio);
    clientes = new ClientesEmMemoria(processos);
    trilha = new TrilhaFalsa();
    cadastrar = new CadastrarProcesso(outbox, processos, clientes, trilha, outbox, relogio);
    cadastrarCliente = new CadastrarCliente(outbox, clientes, trilha, relogio);
  });

  const tipos = () => trilha.registros.map((r) => r.entrada.tipo);
  const eventos = () => outbox.pendentes().map((e) => e.tipo);

  it('cadastra pelo número com máscara, deduz o tribunal e recusa repetido', async () => {
    const r = await cadastrar.executar(autor, { numeroCnj: NUMERO.replace(/\D/g, '') });
    expect(r).toMatchObject({ ok: true, valor: { numeroCnj: NUMERO, tribunal: 'TJSP' } });
    expect(eventos()).toEqual(['ProcessoMonitorado']);
    expect(tipos()).toEqual(['cadastro.processo-cadastrado']);
    expect(trilha.registros[0]?.origem).toEqual({ canal: 'portal', usuarioId: autor.usuarioId });
    expect(await cadastrar.executar(autor, { numeroCnj: NUMERO })).toMatchObject({
      ok: false,
      erro: { codigo: 'processo-ja-cadastrado' },
    });
    expect(
      await cadastrar.executar(autor, { numeroCnj: '0000001-69.2026.8.26.0100' }),
    ).toMatchObject({
      ok: false,
      erro: { problemas: [{ campo: 'numeroCnj' }] },
    });
    expect((await cadastrar.executar(autor, { numeroCnj: NUMERO, extra: 1 })).ok).toBe(false);
    expect(
      await cadastrar.executar(autor, { numeroCnj: OUTRO, cobertura: 'manual' }),
    ).toMatchObject({ ok: false, erro: { codigo: 'motivo-da-cobertura' } });
    expect(
      await cadastrar.executar(autor, { numeroCnj: OUTRO, clienteId: NAO_EXISTE }),
    ).toMatchObject({
      ok: false,
      erro: { codigo: 'cliente-nao-encontrado' },
    });
  });

  it('obterOuCriarProcesso é idempotente, inclusive em chamadas simultâneas', async () => {
    const obter = new ObterOuCriarProcesso(
      { executar: (_tenant, trabalho) => outbox.executar(trabalho) },
      processos,
      trilha,
      outbox,
      relogio,
    );
    const [a, b] = await Promise.all([
      obter.executar(autor.tenantId, NUMERO, { orgao: '1ª Vara Cível' }),
      obter.executar(autor.tenantId, NUMERO),
    ]);
    if (!a.ok || !b.ok) throw new Error('falhou');
    expect(a.valor.processoId).toBe(b.valor.processoId);
    expect([a.valor.criado, b.valor.criado].sort()).toEqual([false, true]);
    expect(processos.linhas.size).toBe(1);
    expect(eventos()).toEqual(['ProcessoMonitorado']);
    expect(outbox.pendentes()[0]?.payload).toMatchObject({ origem: 'captura' });
    expect(trilha.registros[0]?.origem).toEqual({ canal: 'sistema' });
    expect((await obter.executar(autor.tenantId, 'invalido')).ok).toBe(false);
    expect((await obter.executar(autor.tenantId, OUTRO, { orgao: '' })).ok).toBe(false);
  });

  it('sigilo e cobertura alterados ficam na trilha com antes e depois', async () => {
    const r = await cadastrar.executar(autor, { numeroCnj: NUMERO });
    if (!r.ok) throw r.erro;
    const id = r.valor.id;
    const atualizar = new AtualizarProcesso(outbox, processos, clientes, trilha);
    const cobertura = new AlterarCobertura(outbox, processos, trilha, outbox);

    expect(await atualizar.executar(autor, id, { sigiloso: true })).toMatchObject({
      ok: true,
      valor: { sigiloso: true },
    });
    expect(await atualizar.executar(autor, id, { comarca: 'São Paulo' })).toMatchObject({
      ok: true,
      valor: { comarca: 'São Paulo', sigiloso: true },
    });
    expect((await atualizar.executar(autor, NAO_EXISTE, {})).ok).toBe(false);
    expect((await atualizar.executar(autor, id, { clienteId: NAO_EXISTE })).ok).toBe(false);
    expect((await atualizar.executar(autor, id, { numeroCnj: OUTRO })).ok).toBe(false);

    expect((await cobertura.executar(autor, id, { cobertura: 'parcial' })).ok).toBe(false);
    expect((await cobertura.executar(autor, NAO_EXISTE, { cobertura: 'manual' })).ok).toBe(false);
    expect((await cobertura.executar(autor, id, { cobertura: 'x' })).ok).toBe(false);
    expect(
      await cobertura.executar(autor, id, { cobertura: 'parcial', motivo: 'Só no painel' }),
    ).toMatchObject({ ok: true, valor: { cobertura: 'parcial', motivoCobertura: 'Só no painel' } });

    expect(tipos()).toEqual([
      'cadastro.processo-cadastrado',
      'cadastro.sigilo-alterado',
      'cadastro.processo-atualizado',
      'cadastro.cobertura-alterada',
    ]);
    expect(trilha.registros[1]?.entrada).toMatchObject({
      antes: { sigiloso: false },
      depois: { sigiloso: true },
    });
    expect(eventos()).toEqual(['ProcessoMonitorado', 'CoberturaAlterada']);
  });

  it('lista com filtros e cursor, do mais novo para o mais antigo', async () => {
    const cliente = await cadastrarCliente.executar(autor, { nome: 'Cliente Fictício' });
    if (!cliente.ok) throw cliente.erro;
    await cadastrar.executar(autor, { numeroCnj: NUMERO, clienteId: cliente.valor.id });
    relogio.avancarMs(1000);
    await cadastrar.executar(autor, { numeroCnj: OUTRO, sigiloso: true });
    const listar = new ListarProcessos(outbox, processos);

    const primeira = await listar.executar({ limite: '1' });
    if (!primeira.ok) throw primeira.erro;
    expect(primeira.valor.itens.map((p) => p.numeroCnj)).toEqual([OUTRO]);
    expect(primeira.valor.proximoCursor).not.toBeNull();
    const segunda = await listar.executar({ limite: '1', cursor: primeira.valor.proximoCursor });
    if (!segunda.ok) throw segunda.erro;
    expect(segunda.valor).toMatchObject({ itens: [{ numeroCnj: NUMERO }], proximoCursor: null });

    const filtrar = async (consulta: Record<string, string>) => {
      const r = await listar.executar(consulta);
      if (!r.ok) throw r.erro;
      return r.valor.itens.map((p) => p.numeroCnj);
    };
    expect(await filtrar({ numero: '1234567-03' })).toEqual([OUTRO]);
    expect(await filtrar({ sigiloso: 'false' })).toEqual([NUMERO]);
    expect(await filtrar({ clienteId: cliente.valor.id })).toEqual([NUMERO]);
    expect(await filtrar({ tribunal: 'trt2' })).toEqual([OUTRO]);
    expect(await filtrar({ cobertura: 'manual' })).toEqual([]);
    expect(await filtrar({ numero: '' })).toHaveLength(2);
    expect((await listar.executar({ cursor: 'nao-e-cursor' })).ok).toBe(false);
    expect((await listar.executar({ limite: '0' })).ok).toBe(false);

    const consultar = new ConsultarProcesso(outbox, processos);
    const [primeiro] = primeira.valor.itens;
    if (primeiro === undefined) throw new Error('lista vazia');
    expect((await consultar.executar(primeiro.id)).ok).toBe(true);
    expect((await consultar.executar(NAO_EXISTE)).ok).toBe(false);
  });

  it('clientes: CRUD com documento validado, CPF mascarado na trilha e remoção protegida', async () => {
    expect((await cadastrarCliente.executar(autor, { nome: 'X', documento: null })).ok).toBe(false);
    expect((await cadastrarCliente.executar(autor, { nome: 'Cliente', documento: '123' })).ok).toBe(
      false,
    );
    const r = await cadastrarCliente.executar(autor, {
      nome: 'Cliente Fictício',
      documento: '111.444.777-35',
    });
    if (!r.ok) throw r.erro;
    expect(r.valor.documento).toBe('11144477735');
    expect(trilha.registros[0]?.entrada.depois).toEqual({
      nome: 'Cliente Fictício',
      documento: '***.444.777-**',
    });
    const id = r.valor.id;

    const atualizar = new AtualizarCliente(outbox, clientes, trilha);
    expect(await atualizar.executar(autor, id, { documento: '11.222.333/0001-81' })).toMatchObject({
      ok: true,
      valor: { nome: 'Cliente Fictício', documento: '11222333000181' },
    });
    expect(await atualizar.executar(autor, id, { documento: '' })).toMatchObject({
      ok: true,
      valor: { documento: null },
    });
    expect((await atualizar.executar(autor, id, { documento: '999' })).ok).toBe(false);
    expect((await atualizar.executar(autor, id, { outro: 1 })).ok).toBe(false);
    expect((await atualizar.executar(autor, NAO_EXISTE, { nome: 'Novo' })).ok).toBe(false);
    expect(await atualizar.executar(autor, id, { nome: 'Novo Nome' })).toMatchObject({
      ok: true,
      valor: { nome: 'Novo Nome' },
    });

    const consultar = new ConsultarCliente(outbox, clientes);
    expect((await consultar.executar(id)).ok).toBe(true);
    expect((await consultar.executar(NAO_EXISTE)).ok).toBe(false);
    const listar = new ListarClientes(outbox, clientes);
    expect(await listar.executar({ nome: 'novo' })).toMatchObject({
      ok: true,
      valor: { itens: [{ id }], proximoCursor: null },
    });
    expect(await listar.executar({ nome: 'zzz' })).toMatchObject({
      ok: true,
      valor: { itens: [] },
    });
    expect((await listar.executar({ cursor: '!' })).ok).toBe(false);
    expect((await listar.executar({ limite: 'muitos' })).ok).toBe(false);

    const remover = new RemoverCliente(outbox, clientes, trilha);
    const processo = await cadastrar.executar(autor, { numeroCnj: NUMERO, clienteId: id });
    if (!processo.ok) throw processo.erro;
    expect(await remover.executar(autor, id)).toMatchObject({
      ok: false,
      erro: { codigo: 'cliente-com-processos' },
    });
    await new AtualizarProcesso(outbox, processos, clientes, trilha).executar(
      autor,
      processo.valor.id,
      { clienteId: null },
    );
    expect((await remover.executar(autor, id)).ok).toBe(true);
    expect((await remover.executar(autor, id)).ok).toBe(false);
    expect(tipos()).toContain('cadastro.cliente-removido');
  });
});
