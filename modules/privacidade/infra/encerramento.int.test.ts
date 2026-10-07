import { TrilhaPostgres, verificarCadeia, sha256 } from '@pz/auditoria';
import { Banco, BancoSistema, executarNoTenant } from '@pz/db';
import { subirBancoDeTeste } from '@pz/db/teste';
import { FixedClock, Instant } from '@pz/kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { EfetivarEncerramentos, SolicitarEncerramento } from '../application/encerramento.js';
import { AplicarRetencao } from '../application/retencao.js';

import {
  EncerramentosPostgres,
  OperacoesDeEncerramentoPostgres,
  OperacoesDeRetencaoPostgres,
} from './encerramento-postgres.js';

import type { Transacao } from '@pz/db';
import type { BancoDeTeste } from '@pz/db/teste';
import type { ArmazenamentoArquivos } from '@pz/integracoes';
import type { UnidadeDeTrabalho, Uuid } from '@pz/kernel';

// Escritórios e pessoas FICTÍCIOS (CPF gerado, e-mails inválidos).
const A = '01a10e00-0000-7000-8000-0000000d0001' as Uuid;
const B = '01a10e00-0000-7000-8000-0000000d0002' as Uuid;
const ANA = '01a10e00-0000-7000-8000-0000000d0003' as Uuid;
const BIA = '01a10e00-0000-7000-8000-0000000d0004' as Uuid;
const id = (n: number) => `01a10e00-0000-7000-8000-0000000d01${String(n).padStart(2, '0')}`;

let postgres: BancoDeTeste;
let banco: Banco;
let sistema: BancoSistema;
let comoSistema: UnidadeDeTrabalho<Transacao>;
const removidos: string[] = [];
const sessoesEncerradas: string[] = [];

async function semear(tenant: Uuid, usuario: Uuid, n: number) {
  await sistema.executarComoSistema('semear', async (tx) => {
    await tx.tenant.create({
      data: { id: tenant, nome: `Escritório ${String(n)} (fictício)`, tipo: 'escritorio' },
    });
    await tx.usuario.create({
      data: {
        id: usuario,
        tenantId: tenant,
        nome: 'Pessoa Fictícia',
        email: `p${String(n)}@exemplo.invalid`,
        senhaHash: 'HASH',
      },
    });
    await tx.usuarioPerfil.create({
      data: { tenantId: tenant, usuarioId: usuario, perfil: 'advogado' },
    });
    const advogado = id(n * 10 + 1);
    await tx.advogado.create({
      data: {
        id: advogado,
        tenantId: tenant,
        usuarioId: usuario,
        nome: 'Pessoa Fictícia',
        cpf: n === 1 ? '52998224725' : '11144477735',
        celular: '11900000000',
      },
    });
    await tx.oab.create({
      data: {
        id: id(n * 10 + 2),
        tenantId: tenant,
        advogadoId: advogado,
        numero: `12345${String(n)}`,
        uf: 'SP',
        tipo: 'principal',
      },
    });
    await tx.cliente.create({
      data: { id: id(n * 10 + 3), tenantId: tenant, nome: 'Cliente Fictício' },
    });
    await tx.processo.create({
      data: {
        id: id(n * 10 + 4),
        tenantId: tenant,
        numeroCnj: `1000004062026826010${String(n)}`,
        clienteId: id(n * 10 + 3),
      },
    });
    await tx.acesso.create({
      data: {
        id: id(n * 10 + 5),
        tenantId: tenant,
        usuarioId: usuario,
        tipo: 'login',
        sucesso: true,
        ip: '203.0.113.9',
        userAgent: 'Navegador',
        ocorridoEm: new Date(),
      },
    });
    await tx.exportacaoDados.create({
      data: {
        id: id(n * 10 + 6),
        tenantId: tenant,
        usuarioId: usuario,
        escopo: 'titular',
        solicitadaEm: new Date(),
      },
    });
  });
  await executarNoTenant(tenant, () =>
    banco.executar((tx) =>
      new TrilhaPostgres().registrar(
        tx,
        { tipo: 'cadastro.cliente-cadastrado', entidade: 'cliente', entidadeId: id(n * 10 + 3) },
        { canal: 'portal', usuarioId: usuario, ip: '203.0.113.9', userAgent: 'Navegador' },
      ),
    ),
  );
}

beforeAll(async () => {
  postgres = await subirBancoDeTeste();
  await postgres.migrar();
  sistema = new BancoSistema({ url: postgres.url('pz_sistema') });
  banco = new Banco({ url: postgres.url('pz_app'), maxConexoes: 5 });
  comoSistema = {
    executar: (trabalho) => sistema.executarComoSistema('encerramento: teste', trabalho),
  };
  await semear(A, ANA, 1);
  await semear(B, BIA, 2);
}, 300_000);

afterAll(async () => {
  await banco.encerrar();
  await sistema.encerrar();
  await postgres.parar();
});

const armazenamento = {
  remover: (_t: string, caminho: string) => {
    removidos.push(caminho);
    return Promise.resolve();
  },
} as unknown as ArmazenamentoArquivos;
const sessoes = {
  removerTodasDoUsuario: (u: string) => {
    sessoesEncerradas.push(u);
    return Promise.resolve();
  },
};

describe('encerramento da conta no PostgreSQL (HU38)', () => {
  it('só efetiva depois da carência; apaga negócio, pseudonimiza provas e preserva o outro tenant', async () => {
    const pedidoEm = new FixedClock(Instant.deIso('2026-10-07T12:00:00Z'));
    const solicitar = new SolicitarEncerramento(
      banco,
      new EncerramentosPostgres(),
      new TrilhaPostgres(),
      pedidoEm,
    );
    const pedido = await executarNoTenant(A, () =>
      solicitar.executar({ tenantId: A, usuarioId: ANA, canal: 'portal', podeEncerrar: true }),
    );
    expect(pedido.ok && pedido.valor.situacao).toBe('em-carencia');

    const efetivarEm = (agora: string) =>
      new EfetivarEncerramentos(
        comoSistema,
        new OperacoesDeEncerramentoPostgres(),
        new TrilhaPostgres(),
        sessoes,
        armazenamento,
        new FixedClock(Instant.deIso(agora)),
      );
    // Na carência, nada acontece; e a função do banco recusa chamada direta fora de hora.
    expect(await efetivarEm('2026-10-20T12:00:00Z').executar()).toEqual([]);
    await expect(
      comoSistema.executar((tx) => new OperacoesDeEncerramentoPostgres().efetivar(tx, A)),
    ).rejects.toThrow(/não está vencido/);

    // A função usa now() do banco: o pedido precisa vencer de verdade para o teste.
    await sistema.executarComoSistema('vencer o pedido', (tx) =>
      tx.encerramentoConta.update({
        where: { tenantId: A },
        data: {
          solicitadoEm: new Date('2026-01-01T00:00:00Z'),
          efetivarEm: new Date('2026-01-31T00:00:00Z'),
        },
      }),
    );
    expect(await efetivarEm('2026-12-01T12:00:00Z').executar()).toEqual([A]);
    expect(sessoesEncerradas).toEqual([ANA]);
    expect(removidos).toEqual([
      `privacidade/exportacoes/${id(16)}/dados.json`,
      `privacidade/exportacoes/${id(16)}/dados.csv`,
    ]);

    await sistema.executarComoSistema('conferir', async (tx) => {
      const contar = async (tenantId: Uuid) => ({
        processos: await tx.processo.count({ where: { tenantId } }),
        clientes: await tx.cliente.count({ where: { tenantId } }),
        oabs: await tx.oab.count({ where: { tenantId } }),
        advogados: await tx.advogado.count({ where: { tenantId } }),
        exportacoes: await tx.exportacaoDados.count({ where: { tenantId } }),
        perfis: await tx.usuarioPerfil.count({ where: { tenantId } }),
      });
      expect(await contar(A)).toEqual({
        processos: 0,
        clientes: 0,
        oabs: 0,
        advogados: 0,
        exportacoes: 0,
        perfis: 0,
      });
      expect((await contar(B)).processos).toBe(1);

      const usuario = await tx.usuario.findUnique({ where: { id: ANA } });
      expect(usuario).toMatchObject({ nome: 'Usuário removido', senhaHash: null });
      expect(usuario?.email).toMatch(/@encerrado\.invalid$/);
      expect(await tx.acesso.findMany({ where: { tenantId: A }, select: { ip: true } })).toEqual([
        { ip: 'pseudonimizado' },
      ]);
      expect(
        await tx.auditoriaDadoPessoal.count({ where: { tenantId: A, valor: { not: null } } }),
      ).toBe(0);
      expect(
        await tx.auditoriaDadoPessoal.count({ where: { tenantId: B, valor: { not: null } } }),
      ).toBe(2);
      expect((await tx.tenant.findUnique({ where: { id: A } }))?.encerradoEm).not.toBeNull();
      expect((await tx.tenant.findUnique({ where: { id: B } }))?.encerradoEm).toBeNull();
    });

    const cadeia = await executarNoTenant(A, () =>
      banco.executar((tx) => new TrilhaPostgres().lerCadeia(tx, A)),
    );
    expect(cadeia.map((r) => r.tipo)).toEqual([
      'cadastro.cliente-cadastrado',
      'privacidade.encerramento-solicitado',
      'privacidade.conta-encerrada',
    ]);
    expect(verificarCadeia(cadeia, sha256)).toMatchObject({ valida: true });

    // Repetir não efetiva de novo.
    expect(await efetivarEm('2026-12-02T12:00:00Z').executar()).toEqual([]);
  });

  it('a aplicação não chama a função de efetivação', async () => {
    await expect(
      executarNoTenant(B, () =>
        banco.executar((tx) => tx.$queryRaw`SELECT pz_efetivar_encerramento(${B}::uuid)`),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('retenção: provas do encerrado há mais de 5 anos e acessos com mais de 1 ano', async () => {
    const operacoes = new OperacoesDeRetencaoPostgres();
    await expect(
      comoSistema.executar((tx) => operacoes.expurgarProvas(tx, A, 1826)),
    ).rejects.toThrow(/não está encerrado há mais/);
    await sistema.executarComoSistema('envelhecer', async (tx) => {
      await tx.tenant.update({
        where: { id: A },
        data: { encerradoEm: new Date('2020-01-01T00:00:00Z') },
      });
      await tx.acesso.create({
        data: {
          id: id(90),
          tenantId: B,
          usuarioId: BIA,
          tipo: 'login',
          sucesso: true,
          ip: '203.0.113.1',
          userAgent: 'x',
          ocorridoEm: new Date('2024-01-01T00:00:00Z'),
        },
      });
    });
    const retencao = new AplicarRetencao(
      comoSistema,
      operacoes,
      new TrilhaPostgres(),
      new FixedClock(Instant.deIso('2026-12-01T12:00:00Z')),
      { acessosDias: 365, provasDias: 1826 },
    );
    expect(await retencao.executar()).toEqual({ tenantsExpurgados: [A], acessosExpurgados: 1 });
    await sistema.executarComoSistema('conferir', async (tx) => {
      expect(await tx.usuario.count({ where: { tenantId: A } })).toBe(0);
      expect(await tx.acesso.count({ where: { tenantId: A } })).toBe(0);
      expect(await tx.auditoriaDadoPessoal.count({ where: { tenantId: A } })).toBe(0);
      expect(await tx.acesso.findMany({ where: { tenantId: B }, select: { id: true } })).toEqual([
        { id: id(25) },
      ]);
    });
    const cadeia = await executarNoTenant(A, () =>
      banco.executar((tx) => new TrilhaPostgres().lerCadeia(tx, A)),
    );
    expect(cadeia.at(-1)?.tipo).toBe('privacidade.provas-expurgadas');
    expect(verificarCadeia(cadeia, sha256)).toMatchObject({ valida: true });
    // Já expurgado: a próxima execução não volta ao tenant.
    expect((await retencao.executar()).tenantsExpurgados).toEqual([]);
  });
});
