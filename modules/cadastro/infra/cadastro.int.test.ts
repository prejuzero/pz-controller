import { randomBytes } from 'node:crypto';

import { TrilhaPostgres } from '@pz/auditoria';
import { Banco, BancoSistema, executarNoTenant, OutboxPostgres } from '@pz/db';
import { subirBancoDeTeste } from '@pz/db/teste';
import {
  ContasPostgres,
  CriarConta,
  GeradorDeTokensSeguro,
  HasherArgon2,
  RedefinicoesEmMemoria,
  SolicitarVerificacaoDeEmail,
  CifraAesGcm,
} from '@pz/identidade';
import { FixedClock, gerarUuidV7, Instant } from '@pz/kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  AdicionarOab,
  CadastrarAdvogado,
  ConsultarPerfil,
  RemoverOab,
} from '../application/cadastro.js';

import { AdvogadosPostgres } from './advogados-postgres.js';

import type { AutorDoCadastro } from '../application/cadastro.js';
import type { Transacao } from '@pz/db';
import type { BancoDeTeste } from '@pz/db/teste';
import type { Email } from '@pz/identidade';
import type { Uuid } from '@pz/kernel';

// Dados FICTÍCIOS: CPFs gerados, OABs e e-mails inventados.
const relogio = new FixedClock(Instant.deEpochMs(Date.UTC(2026, 9, 7, 12)));
const entrada = (parcial: Record<string, unknown> = {}) => ({
  nome: 'Pessoa Fictícia',
  cpf: '529.982.247-25',
  email: 'pessoa@exemplo.com',
  senha: 'uma frase longa de teste',
  celular: '(11) 98765-4321',
  oabPrincipal: { numero: '123456', uf: 'SP' },
  oabsSuplementares: [{ numero: '9876', uf: 'RJ' }],
  ...parcial,
});

let postgres: BancoDeTeste;
let banco: Banco;
let sistema: BancoSistema;
let cadastrar: CadastrarAdvogado<Transacao>;
let consultar: ConsultarPerfil<Transacao>;
let adicionar: AdicionarOab<Transacao>;
let remover: RemoverOab<Transacao>;

const contar = () =>
  sistema.executarComoSistema('conferir o teste', async (tx) => ({
    tenants: await tx.tenant.count(),
    usuarios: await tx.usuario.count(),
    advogados: await tx.advogado.count(),
    oabs: await tx.oab.count(),
  }));

beforeAll(async () => {
  postgres = await subirBancoDeTeste();
  await postgres.migrar();
  banco = new Banco({ url: postgres.url('pz_app'), maxConexoes: 5 });
  sistema = new BancoSistema({ url: postgres.url('pz_sistema') });
  const advogados = new AdvogadosPostgres(relogio);
  const trilha = new TrilhaPostgres();
  const outbox = new OutboxPostgres();
  const noTenant = {
    executar: <R>(tenantId: Uuid, trabalho: (tx: Transacao) => Promise<R>) =>
      executarNoTenant(tenantId, () => banco.executar(trabalho)),
  };
  const contas = new CriarConta(new HasherArgon2(), new ContasPostgres());
  const solicitar = new SolicitarVerificacaoDeEmail(
    new RedefinicoesEmMemoria(),
    new GeradorDeTokensSeguro(),
    new CifraAesGcm(randomBytes(32).toString('base64')),
    relogio,
  );
  const verificacao = {
    preparar: (conta: { usuarioId: Uuid; tenantId: Uuid; email: string }) =>
      solicitar.preparar({ ...conta, email: conta.email as Email }),
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
  consultar = new ConsultarPerfil(banco, advogados);
  adicionar = new AdicionarOab(banco, advogados, trilha, outbox);
  remover = new RemoverOab(banco, advogados, trilha, outbox);
}, 120_000);

afterAll(async () => {
  await banco.encerrar();
  await sistema.encerrar();
  await postgres.parar();
});

describe('cadastro no PostgreSQL (HU11)', () => {
  let ana: AutorDoCadastro & { tenantId: Uuid };

  it('cria tenant autônomo, usuário, perfil, advogado e OABs com trilha e eventos', async () => {
    const r = await cadastrar.executar(entrada(), { ip: '203.0.113.1' });
    if (!r.ok) throw r.erro;
    ana = { usuarioId: r.valor.usuarioId, tenantId: r.valor.tenantId, canal: 'portal' };
    const gravado = await sistema.executarComoSistema('conferir o teste', async (tx) => ({
      tenant: await tx.tenant.findUnique({ where: { id: ana.tenantId } }),
      perfis: await tx.usuarioPerfil.findMany({ where: { usuarioId: ana.usuarioId } }),
      trilha: await tx.eventoAuditoria.findMany({ where: { tenantId: ana.tenantId } }),
      eventos: await tx.eventoDominio.findMany({ where: { tenantId: ana.tenantId } }),
    }));
    expect(gravado.tenant?.tipo).toBe('autonomo');
    expect(gravado.perfis.map((p) => p.perfil)).toEqual(['advogado']);
    expect(gravado.trilha.map((t) => t.tipo)).toEqual(['cadastro.advogado-cadastrado']);
    const semBigInt = (_chave: string, valor: unknown) =>
      typeof valor === 'bigint' ? String(valor) : valor;
    expect(JSON.stringify(gravado.trilha, semBigInt)).not.toContain('52998224725');
    expect(gravado.eventos.map((e) => e.tipo).sort()).toEqual([
      'AdvogadoCadastrado',
      'OabAdicionada',
      'OabAdicionada',
      'VerificacaoDeEmailSolicitada',
    ]);
    const perfil = await executarNoTenant(ana.tenantId, () => consultar.executar(ana.usuarioId));
    expect(perfil.ok && perfil.valor.oabs).toHaveLength(2);
  });

  it.each([
    [
      'e-mail',
      { cpf: '111.444.777-35', oabPrincipal: { numero: '1', uf: 'MG' }, oabsSuplementares: [] },
      'email-em-uso',
    ],
    [
      'CPF',
      { email: 'b@exemplo.com', oabPrincipal: { numero: '1', uf: 'MG' }, oabsSuplementares: [] },
      'cpf-em-uso',
    ],
    ['OAB', { email: 'b@exemplo.com', cpf: '111.444.777-35', oabsSuplementares: [] }, 'oab-em-uso'],
  ])('%s já usado em outro tenant: conflito e nada fica gravado', async (_n, parcial, codigo) => {
    const antes = await contar();
    const r = await cadastrar.executar(entrada(parcial));
    expect(!r.ok && r.erro.codigo).toBe(codigo);
    expect(await contar()).toEqual(antes);
  });

  it('OAB ativa é única entre tenants, mesmo invisível pelo RLS; removida, fica livre', async () => {
    const b = await cadastrar.executar(
      entrada({
        email: 'b@exemplo.com',
        cpf: '111.444.777-35',
        oabPrincipal: { numero: '777', uf: 'BA' },
        oabsSuplementares: [],
      }),
    );
    if (!b.ok) throw b.erro;
    const beto = { usuarioId: b.valor.usuarioId, canal: 'portal' as const };
    // O tenant de Beto não vê o advogado de Ana.
    const alheio = await executarNoTenant(b.valor.tenantId, () =>
      consultar.executar(ana.usuarioId),
    );
    expect(alheio.ok).toBe(false);

    const tomada = await executarNoTenant(b.valor.tenantId, () =>
      adicionar.executar(beto, { numero: '9876', uf: 'RJ' }),
    );
    expect(!tomada.ok && tomada.erro.codigo).toBe('oab-em-uso');

    const perfil = await executarNoTenant(ana.tenantId, () => consultar.executar(ana.usuarioId));
    const suplementar = perfil.ok
      ? perfil.valor.oabs.find((o) => o.tipo === 'suplementar')
      : undefined;
    const removida = await executarNoTenant(ana.tenantId, () =>
      remover.executar(ana, suplementar?.id ?? ('' as Uuid)),
    );
    expect(removida.ok).toBe(true);
    const livre = await executarNoTenant(b.valor.tenantId, () =>
      adicionar.executar(beto, { numero: '9876', uf: 'RJ' }),
    );
    expect(livre.ok).toBe(true);
  });

  it('pz_app só cria tenant autônomo e só com o id do contexto', async () => {
    const id = gerarUuidV7(relogio);
    const criar = (tipo: 'escritorio' | 'plataforma' | 'autonomo', tenantId: Uuid) =>
      executarNoTenant(id, () =>
        banco.executar((tx) => tx.tenant.create({ data: { id: tenantId, nome: 'x', tipo } })),
      );
    await expect(criar('plataforma', id)).rejects.toThrow();
    await expect(criar('escritorio', id)).rejects.toThrow();
    await expect(criar('autonomo', gerarUuidV7(relogio))).rejects.toThrow();
    await expect(criar('autonomo', id)).resolves.toBeDefined();
  });

  it('OAB não é apagada pela aplicação', async () => {
    await expect(
      executarNoTenant(ana.tenantId, () => banco.executar((tx) => tx.oab.deleteMany({}))),
    ).rejects.toThrow();
  });
});
