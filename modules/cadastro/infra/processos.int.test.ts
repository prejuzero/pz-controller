import { TrilhaPostgres } from '@pz/auditoria';
import { Banco, BancoSistema, executarNoTenant, OutboxPostgres } from '@pz/db';
import { subirBancoDeTeste } from '@pz/db/teste';
import { FixedClock, gerarUuidV7, Instant } from '@pz/kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CadastrarCliente, ListarClientes, RemoverCliente } from '../application/clientes.js';
import {
  AlterarCobertura,
  AtualizarProcesso,
  CadastrarProcesso,
  ListarProcessos,
  ObterOuCriarProcesso,
} from '../application/processos.js';

import { ClientesPostgres, ProcessosPostgres } from './processos-postgres.js';

import type { AutorNoTenant } from '../application/paginacao.js';
import type { Transacao } from '@pz/db';
import type { BancoDeTeste } from '@pz/db/teste';

// Dados FICTÍCIOS: números CNJ com dígito conferido, CPF gerado, nomes inventados.
const NUMERO = '0000001-68.2026.8.26.0100';
const relogio = new FixedClock(Instant.deIso('2026-10-07T12:00:00Z'));

let postgres: BancoDeTeste;
let banco: Banco;
let sistema: BancoSistema;
let ana: AutorNoTenant;
let beto: AutorNoTenant;
let cadastrar: CadastrarProcesso<Transacao>;
let obter: ObterOuCriarProcesso<Transacao>;
let cadastrarCliente: CadastrarCliente<Transacao>;

const noTenant = <R>(autor: AutorNoTenant, trabalho: () => Promise<R>) =>
  executarNoTenant(autor.tenantId, trabalho);

beforeAll(async () => {
  postgres = await subirBancoDeTeste();
  await postgres.migrar();
  banco = new Banco({ url: postgres.url('pz_app'), maxConexoes: 10 });
  sistema = new BancoSistema({ url: postgres.url('pz_sistema') });
  const autor = async (nome: string): Promise<AutorNoTenant> => {
    const tenantId = gerarUuidV7(relogio);
    await sistema.executarComoSistema('preparar o teste', (tx) =>
      tx.tenant.create({ data: { id: tenantId, nome, tipo: 'escritorio' } }),
    );
    return { tenantId, usuarioId: gerarUuidV7(relogio), canal: 'portal' };
  };
  ana = await autor('Escritório A');
  beto = await autor('Escritório B');
  const processos = new ProcessosPostgres(relogio);
  const clientes = new ClientesPostgres();
  const trilha = new TrilhaPostgres();
  const outbox = new OutboxPostgres();
  cadastrar = new CadastrarProcesso(banco, processos, clientes, trilha, outbox, relogio);
  obter = new ObterOuCriarProcesso(
    {
      executar: (tenantId, trabalho) => executarNoTenant(tenantId, () => banco.executar(trabalho)),
    },
    processos,
    trilha,
    outbox,
    relogio,
  );
  cadastrarCliente = new CadastrarCliente(banco, clientes, trilha, relogio);
}, 120_000);

afterAll(async () => {
  await banco.encerrar();
  await sistema.encerrar();
  await postgres.parar();
});

describe('processos e clientes no PostgreSQL (HU12)', () => {
  it('obterOuCriarProcesso é idempotente sob concorrência', async () => {
    const resultados = await Promise.all(
      Array.from({ length: 8 }, () => obter.executar(ana.tenantId, NUMERO, { comarca: 'SP' })),
    );
    const ids = new Set(resultados.map((r) => (r.ok ? r.valor.processoId : 'erro')));
    expect(ids.size).toBe(1);
    expect(resultados.filter((r) => r.ok && r.valor.criado)).toHaveLength(1);
    const gravado = await sistema.executarComoSistema('conferir o teste', async (tx) => ({
      processos: await tx.processo.count({ where: { tenantId: ana.tenantId } }),
      eventos: await tx.eventoDominio.count({
        where: { tenantId: ana.tenantId, tipo: 'ProcessoMonitorado' },
      }),
      trilha: await tx.eventoAuditoria.count({
        where: { tenantId: ana.tenantId, tipo: 'cadastro.processo-cadastrado' },
      }),
    }));
    expect(gravado).toEqual({ processos: 1, eventos: 1, trilha: 1 });
  });

  it('o mesmo número é independente por tenant e invisível entre eles', async () => {
    const r = await noTenant(beto, () => cadastrar.executar(beto, { numeroCnj: NUMERO }));
    expect(r.ok).toBe(true);
    const repetido = await noTenant(ana, () => cadastrar.executar(ana, { numeroCnj: NUMERO }));
    expect(!repetido.ok && repetido.erro.codigo).toBe('processo-ja-cadastrado');
    const listar = new ListarProcessos(banco, new ProcessosPostgres(relogio));
    const lista = await noTenant(beto, () => listar.executar({ numero: '0000001' }));
    expect(lista.ok && lista.valor.itens).toHaveLength(1);
  });

  it('cliente de outro tenant não pode ser vinculado, nem pela FK', async () => {
    const cliente = await noTenant(ana, () =>
      cadastrarCliente.executar(ana, { nome: 'Cliente Fictício', documento: '111.444.777-35' }),
    );
    if (!cliente.ok) throw cliente.erro;
    const alheio = await noTenant(beto, () =>
      cadastrar.executar(beto, {
        numeroCnj: '1234567-03.2025.5.02.0001',
        clienteId: cliente.valor.id,
      }),
    );
    expect(!alheio.ok && alheio.erro.codigo).toBe('cliente-nao-encontrado');
    // Mesmo sem a verificação do caso de uso, a FK composta (tenant_id, cliente_id) recusa.
    await expect(
      noTenant(beto, () =>
        banco.executar((tx) => tx.processo.updateMany({ data: { clienteId: cliente.valor.id } })),
      ),
    ).rejects.toThrow();
    const lista = await noTenant(beto, () =>
      new ListarClientes(banco, new ClientesPostgres()).executar({}),
    );
    expect(lista.ok && lista.valor.itens).toEqual([]);
  });

  it('sigilo, cobertura e remoção protegida do cliente, com trilha sem o CPF', async () => {
    const processos = new ProcessosPostgres(relogio);
    const clientes = new ClientesPostgres();
    const trilha = new TrilhaPostgres();
    const cliente = await noTenant(ana, () =>
      cadastrarCliente.executar(ana, { nome: 'Outro Cliente', documento: '11.222.333/0001-81' }),
    );
    if (!cliente.ok) throw cliente.erro;
    const criado = await noTenant(ana, () =>
      cadastrar.executar(ana, {
        numeroCnj: '0000010-18.2024.4.03.6100',
        clienteId: cliente.valor.id,
        cobertura: 'parcial',
        motivoCobertura: 'Parte das intimações só no painel.',
      }),
    );
    if (!criado.ok) throw criado.erro;
    const id = criado.valor.id;
    const atualizar = new AtualizarProcesso(banco, processos, clientes, trilha);
    const sigilo = await noTenant(ana, () => atualizar.executar(ana, id, { sigiloso: true }));
    expect(sigilo.ok && sigilo.valor.sigiloso).toBe(true);
    const cobertura = await noTenant(ana, () =>
      new AlterarCobertura(banco, processos, trilha, new OutboxPostgres()).executar(ana, id, {
        cobertura: 'automatica',
      }),
    );
    expect(cobertura.ok && cobertura.valor.motivoCobertura).toBeNull();

    const remover = new RemoverCliente(banco, clientes, trilha);
    const preso = await noTenant(ana, () => remover.executar(ana, cliente.valor.id));
    expect(!preso.ok && preso.erro.codigo).toBe('cliente-com-processos');
    await noTenant(ana, () => atualizar.executar(ana, id, { clienteId: null }));
    expect((await noTenant(ana, () => remover.executar(ana, cliente.valor.id))).ok).toBe(true);
    expect((await noTenant(ana, () => remover.executar(ana, cliente.valor.id))).ok).toBe(false);

    const gravado = await sistema.executarComoSistema('conferir o teste', async (tx) => ({
      trilha: await tx.eventoAuditoria.findMany({ where: { tenantId: ana.tenantId } }),
      eventos: await tx.eventoDominio.findMany({ where: { tenantId: ana.tenantId } }),
    }));
    expect(gravado.trilha.map((t) => t.tipo)).toEqual(
      expect.arrayContaining([
        'cadastro.sigilo-alterado',
        'cadastro.cobertura-alterada',
        'cadastro.cliente-removido',
      ]),
    );
    const semBigInt = (_chave: string, valor: unknown) =>
      typeof valor === 'bigint' ? String(valor) : valor;
    expect(JSON.stringify(gravado.trilha, semBigInt)).not.toContain('11144477735');
    expect(gravado.eventos.map((e) => e.tipo)).toContain('CoberturaAlterada');
  });

  it('banco recusa cobertura sem motivo e processo não é apagado pela aplicação', async () => {
    await expect(
      noTenant(ana, () =>
        banco.executar((tx) => tx.processo.updateMany({ data: { cobertura: 'manual' } })),
      ),
    ).rejects.toThrow();
    await expect(
      noTenant(ana, () => banco.executar((tx) => tx.processo.deleteMany({}))),
    ).rejects.toThrow();
  });
});
