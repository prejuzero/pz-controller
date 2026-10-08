import { TrilhaPostgres } from '@pz/auditoria';
import { ObterOuCriarProcesso, ProcessosPostgres } from '@pz/cadastro';
import { Banco, BancoSistema, executarNoTenant, OutboxPostgres } from '@pz/db';
import { subirBancoDeTeste } from '@pz/db/teste';
import { calcularDigitoCnj, FixedClock, gerarUuidV7, Instant } from '@pz/kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { IngerirCaptura } from '../application/ingestao.js';
import { ConsultarPublicacao, ListarPublicacoes } from '../application/leitura.js';

import { LeituraPostgres } from './leitura-postgres.js';
import { PublicacoesPostgres } from './publicacoes-postgres.js';

import type { Transacao } from '@pz/db';
import type { BancoDeTeste } from '@pz/db/teste';
import type { Uuid } from '@pz/kernel';

/**
 * QA da HU18 (PZ-150): deduplicação entre escritórios, captura repetida, isolamento e carga.
 * Escritórios, advogados e publicações FICTÍCIOS.
 */
const relogio = new FixedClock(Instant.deIso('2026-10-07T12:00:00Z'));
const TENANTS = [gerarUuidV7(), gerarUuidV7(), gerarUuidV7()] as const;
const [A, B, C] = TENANTS;
// 10 advogados em 3 escritórios (4 + 3 + 3), cada um com a própria OAB.
const ADVOGADOS_POR_TENANT = [4, 3, 3] as const;

let postgres: BancoDeTeste;
let banco: Banco;
let sistema: BancoSistema;
let ingerir: IngerirCaptura<Transacao>;
const oabs: Record<string, Uuid[]> = {};

const hash = (n: number) => n.toString(16).padStart(64, '0');
/** CNJ fictício válido (dígito pela Resolução CNJ 65/2008), justiça estadual de SP. */
function cnj(sequencial: number): string {
  const partes = {
    sequencial: String(sequencial).padStart(7, '0'),
    ano: '2026',
    segmento: '8',
    tribunal: '26',
    origem: '0100',
  };
  const { sequencial: s, ano, segmento, tribunal, origem } = partes;
  return `${s}${calcularDigitoCnj(partes)}${ano}${segmento}${tribunal}${origem}`;
}

interface Pub {
  readonly n: number;
  readonly processo: number;
}
const evento = (tenantId: Uuid, oab: Uuid, pubs: readonly Pub[]) => ({
  tenantId,
  payload: {
    alvoId: gerarUuidV7(),
    tipo: 'oab',
    referencias: [oab],
    janela: { inicio: '2026-10-01', fim: '2026-10-07' },
    fonte: 'djen',
    publicacoes: pubs.map(({ n, processo }) => ({
      idExterno: String(900_000_000 + n),
      hashConteudo: hash(n),
      dataDisponibilizacao: '2026-10-06',
      teor: `FICTÍCIO ${String(n)}: intimação para manifestação no prazo legal.`,
      numeroCnj: cnj(processo),
      urlFonte: `https://exemplo.invalid/certidao/${String(n)}`,
      metadados: { siglaTribunal: 'TJSP' },
    })),
  },
});

/** CPF fictício com dígitos verificadores válidos (base sequencial). */
function cpfFicticio(i: number): string {
  const base = String(100_000_000 + i * 7)
    .padStart(9, '0')
    .split('')
    .map(Number);
  const dv = (d: number[]) => {
    const soma = d.reduce((s, v, k) => s + v * (d.length + 1 - k), 0);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dv(base);
  const d2 = dv([...base, d1]);
  return [...base, d1, d2].join('');
}

const consumir = (tenant: Uuid, e: unknown) =>
  executarNoTenant(tenant, () => banco.executar((tx) => ingerir.executar(tx, e)));

/** Contagens globais (cliente do sistema, só para conferência). */
const contar = () =>
  sistema.executarComoSistema('conferir', async (tx) => ({
    conteudos: await tx.publicacaoConteudo.count(),
    destinatarios: await tx.publicacaoDestinatario.count(),
    novas: await tx.eventoDominio.count({ where: { tipo: 'PublicacaoNova' } }),
    recebidas: await tx.eventoDominio.count({ where: { tipo: 'PublicacaoRecebida' } }),
    processos: await tx.processo.count(),
  }));

beforeAll(async () => {
  postgres = await subirBancoDeTeste();
  await postgres.migrar();
  sistema = new BancoSistema({ url: postgres.url('pz_sistema') });
  await sistema.executarComoSistema('preparar', async (tx) => {
    let cpf = 0;
    for (const [n, tenant] of TENANTS.entries()) {
      await tx.tenant.create({
        data: { id: tenant, nome: `E${String(n)} (fictício)`, tipo: 'escritorio' },
      });
      oabs[tenant] = [];
      for (let k = 0; k < (ADVOGADOS_POR_TENANT[n] ?? 0); k++) {
        const usuario = gerarUuidV7();
        await tx.usuario.create({
          data: {
            id: usuario,
            tenantId: tenant,
            nome: 'Fictícia',
            email: `f${String(n)}-${String(k)}@exemplo.invalid`,
          },
        });
        const advogado = gerarUuidV7();
        await tx.advogado.create({
          data: {
            id: advogado,
            tenantId: tenant,
            usuarioId: usuario,
            nome: 'Fictícia',
            cpf: cpfFicticio(cpf++),
            celular: '11900000000',
          },
        });
        const oab = gerarUuidV7();
        oabs[tenant].push(oab);
        await tx.oab.create({
          data: {
            id: oab,
            tenantId: tenant,
            advogadoId: advogado,
            numero: `2000${String(n)}${String(k)}`,
            uf: 'SP',
            tipo: 'principal',
          },
        });
      }
    }
  });
  banco = new Banco({ url: postgres.url('pz_app'), maxConexoes: 10 });
  const noTenant = {
    executar: <T>(tenant: Uuid, trabalho: (tx: Transacao) => Promise<T>) =>
      executarNoTenant(tenant, () => banco.executar(trabalho)),
  };
  const obterOuCriar = new ObterOuCriarProcesso(
    noTenant,
    new ProcessosPostgres(relogio),
    new TrilhaPostgres(),
    new OutboxPostgres(),
    relogio,
  );
  ingerir = new IngerirCaptura(
    new PublicacoesPostgres(),
    async (tenant, numero) => {
      const r = await obterOuCriar.executar(tenant, numero);
      if (!r.ok) throw r.erro;
      return r.valor.processoId;
    },
    new OutboxPostgres(),
    relogio,
    (fonte) => `${fonte}@1.0.0`,
  );
}, 300_000);

afterAll(async () => {
  await banco.encerrar();
  await sistema.encerrar();
  await postgres.parar();
});

const oabsDe = (tenant: Uuid) => oabs[tenant] ?? [];

describe('QA da ingestão e deduplicação (HU18, PZ-150)', () => {
  it('mesma publicação para 10 advogados em 3 escritórios: 1 conteúdo, 1 destinatário por escritório, 1 PublicacaoNova', async () => {
    const pub = [{ n: 1, processo: 1 }];
    const resultados = [];
    for (const tenant of TENANTS) {
      for (const oab of oabsDe(tenant))
        resultados.push(await consumir(tenant, evento(tenant, oab, pub)));
    }
    expect(resultados.filter((r) => r.novas === 1)).toHaveLength(1);
    expect(resultados.filter((r) => r.recebidas === 1)).toHaveLength(3);
    // ADR-014: destinatário é por escritório (PK tenant + conteúdo), não por advogado.
    expect(await contar()).toEqual({
      conteudos: 1,
      destinatarios: 3,
      novas: 1,
      recebidas: 3,
      processos: 3,
    });
  });

  it('captura repetida da mesma janela não duplica conteúdo, destinatário, processo nem evento', async () => {
    const antes = await contar();
    const pub = [{ n: 1, processo: 1 }];
    for (const tenant of TENANTS) {
      for (const oab of oabsDe(tenant)) {
        expect(await consumir(tenant, evento(tenant, oab, pub))).toEqual({
          novas: 0,
          recebidas: 0,
        });
      }
    }
    expect(await contar()).toEqual(antes);
  });

  it('escritório A não enxerga conteúdo que só C recebeu, nem na lista nem pelo id', async () => {
    const [oabDeC] = oabsDe(C);
    if (oabDeC === undefined) throw new Error('sem OAB');
    await consumir(C, evento(C, oabDeC, [{ n: 2, processo: 2 }]));
    const leitura = new LeituraPostgres();
    const deC = await executarNoTenant(C, () =>
      new ListarPublicacoes(banco, leitura).executar({ limite: '10' }),
    );
    if (!deC.ok) throw deC.erro;
    const soDeC = deC.valor.itens.find((p) => p.idExterno === '900000002');
    if (soDeC === undefined) throw new Error('C não recebeu');
    for (const tenant of [A, B]) {
      const lista = await executarNoTenant(tenant, () =>
        new ListarPublicacoes(banco, leitura).executar({ limite: '100' }),
      );
      expect(lista.ok && lista.valor.itens.map((p) => p.idExterno)).toEqual(['900000001']);
      const porId = await executarNoTenant(tenant, () =>
        new ConsultarPublicacao(banco, leitura).executar(soDeC.id),
      );
      expect(!porId.ok && porId.erro.codigo).toBe('publicacao-inexistente');
    }
  });

  /**
   * Carga: SLO "publicação visível no portal em até 30 min após a captura" (padrões de engenharia).
   * No CI roda um volume menor e projeta 100 mil; o relatório completo usa CARGA_PUBLICACOES=100000.
   * Lotes de 500 por evento (como a captura entrega), 50 publicações por processo, 3 escritórios.
   */
  it('carga: vazão projetada para 100 mil publicações dentro do SLO de 30 min', async () => {
    const total = Number(process.env.CARGA_PUBLICACOES ?? '3000');
    const lote = 500;
    const inicio = performance.now();
    for (let base = 0; base < total; base += lote) {
      const tenant = TENANTS[(base / lote) % TENANTS.length] ?? A;
      const [oab] = oabsDe(tenant);
      if (oab === undefined) throw new Error('sem OAB');
      const pubs = Array.from({ length: Math.min(lote, total - base) }, (_, k) => {
        const n = 1_000 + base + k;
        return { n, processo: 1_000 + Math.floor(n / 50) };
      });
      await consumir(tenant, evento(tenant, oab, pubs));
    }
    const segundos = (performance.now() - inicio) / 1000;
    const porMinuto = Math.round((total / segundos) * 60);
    const minutosPara100Mil = 100_000 / porMinuto;
    process.stdout.write(
      `\n[carga HU18] ${String(total)} publicações em ${segundos.toFixed(1)} s: ` +
        `${String(porMinuto)}/min; 100 mil em ~${minutosPara100Mil.toFixed(1)} min (SLO 30 min)\n`,
    );
    expect((await contar()).conteudos).toBe(2 + total);
    expect(minutosPara100Mil).toBeLessThan(30);
  }, 3_600_000);
});
