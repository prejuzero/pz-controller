import { createHash } from 'node:crypto';

import { TrilhaPostgres } from '@pz/auditoria';
import { ObterOuCriarProcesso, ProcessosPostgres } from '@pz/cadastro';
import { Banco, BancoSistema, executarNoTenant, OutboxPostgres } from '@pz/db';
import { subirBancoDeTeste } from '@pz/db/teste';
import { gerarUuidV7, SystemClock } from '@pz/kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { IngerirCaptura } from '../application/ingestao.js';

import { PublicacoesPostgres } from './publicacoes-postgres.js';

import type { Transacao } from '@pz/db';
import type { BancoDeTeste } from '@pz/db/teste';
import type { Uuid } from '@pz/kernel';

/**
 * Vazão da ingestão (HU18, PZ-148/PZ-309): meta de 10 mil publicações por minuto por réplica do
 * worker. Mede o caso de uso real (conteúdo global, destinatário, processo encontrado ou criado,
 * outbox) em PostgreSQL de teste, com a concorrência da fila `eventos` (20, em
 * packages/integracoes/src/filas.ts). Massa FICTÍCIA. Roda com PZ_DESEMPENHO=1.
 */
const ATIVO = process.env.PZ_DESEMPENHO === '1';
const EVENTOS = 200;
// Tamanho do lote de CapturaConcluida (PUBLICACOES_POR_EVENTO no módulo captura).
const POR_EVENTO = 50;
const PROCESSOS = 2_000;
const CONCORRENCIA = 20;
const META_POR_MINUTO = 10_000;
const TENANT = gerarUuidV7();
const OAB = gerarUuidV7();
const relogio = new SystemClock();

/** CNJ FICTÍCIO com dígito verificador válido (módulo 97), justiça estadual de teste. */
function cnj(n: number): string {
  const sequencial = String(n).padStart(7, '0');
  const base = BigInt(`${sequencial}2026826010000`);
  const digito = String(98n - (base % 97n)).padStart(2, '0');
  return `${sequencial}-${digito}.2026.8.26.0100`;
}

const evento = (e: number, rodada: number) => ({
  tenantId: TENANT,
  payload: {
    alvoId: gerarUuidV7(),
    tipo: 'oab',
    referencias: [OAB],
    fonte: 'djen',
    publicacoes: Array.from({ length: POR_EVENTO }, (_, i) => {
      const n = e * POR_EVENTO + i;
      const id = `massa-${String(rodada)}-${String(n)}`;
      return {
        idExterno: id,
        hashConteudo: createHash('sha256').update(id).digest('hex'),
        dataDisponibilizacao: '2026-11-04',
        teor: `FICTÍCIO: intimação ${String(n)} para manifestação no prazo legal.`,
        numeroCnj: cnj(1 + (n % PROCESSOS)),
        urlFonte: 'https://exemplo.invalid/certidao',
        metadados: { siglaTribunal: 'TJSP' },
      };
    }),
  },
});

let postgres: BancoDeTeste;
let banco: Banco;
let ingerir: IngerirCaptura<Transacao>;

describe.runIf(ATIVO)('vazão da ingestão (10 mil publicações por minuto)', () => {
  beforeAll(async () => {
    postgres = await subirBancoDeTeste();
    await postgres.migrar();
    const sistema = new BancoSistema({ url: postgres.url('pz_sistema') });
    await sistema.executarComoSistema('preparar massa de desempenho', async (tx) => {
      await tx.tenant.create({
        data: { id: TENANT, nome: 'Massa (fictício)', tipo: 'escritorio' },
      });
      const usuario = gerarUuidV7();
      await tx.usuario.create({
        data: { id: usuario, tenantId: TENANT, nome: 'Fictícia', email: 'f@exemplo.invalid' },
      });
      const advogado = gerarUuidV7();
      await tx.advogado.create({
        data: {
          id: advogado,
          tenantId: TENANT,
          usuarioId: usuario,
          nome: 'Fictícia',
          cpf: '52998224725',
          celular: '11900000000',
        },
      });
      await tx.oab.create({
        data: {
          id: OAB,
          tenantId: TENANT,
          advogadoId: advogado,
          numero: '123450',
          uf: 'SP',
          tipo: 'principal',
        },
      });
    });
    await sistema.encerrar();
    banco = new Banco({ url: postgres.url('pz_app'), maxConexoes: CONCORRENCIA * 2 });
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
  }, 600_000);

  afterAll(async () => {
    await banco.encerrar();
    await postgres.parar();
  });

  /** Ingere 10 mil publicações em lotes, com a concorrência da fila; devolve por minuto. */
  async function medir(rodada: number): Promise<number> {
    const fila = Array.from({ length: EVENTOS }, (_, e) => evento(e, rodada));
    let novas = 0;
    const inicio = performance.now();
    // Cada slot consome um evento por vez, como a fila com concorrência 20 (uma transação por evento).
    await Promise.all(
      Array.from({ length: CONCORRENCIA }, async () => {
        for (let proximo = fila.shift(); proximo !== undefined; proximo = fila.shift()) {
          const ev = proximo;
          const r = await executarNoTenant(TENANT, () =>
            banco.executar((tx) => ingerir.executar(tx, ev)),
          );
          novas += r.novas;
        }
      }),
    );
    const minutos = (performance.now() - inicio) / 60_000;
    expect(novas).toBe(EVENTOS * POR_EVENTO);
    const porMinuto = Math.round((EVENTOS * POR_EVENTO) / minutos);
    process.stdout.write(
      `ingestão (rodada ${String(rodada)}): ${String(EVENTOS * POR_EVENTO)} publicações em ${(minutos * 60).toFixed(1)} s = ${String(porMinuto)}/min\n`,
    );
    return porMinuto;
  }

  it('primeira captura: 10 mil publicações e 2 mil processos novos acima da meta', async () => {
    expect(await medir(1)).toBeGreaterThan(META_POR_MINUTO);
  }, 900_000);

  it('regime normal (processos já cadastrados): acima da meta', async () => {
    expect(await medir(2)).toBeGreaterThan(META_POR_MINUTO);
  }, 900_000);
});
