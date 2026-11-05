import { TrilhaPostgres } from '@pz/auditoria';
import {
  AprovarEventoDoCalendario,
  ConsultarDiasNaoUteis,
  EventosGlobaisPostgres,
  FeriadosLocaisPostgres,
  fusoDoJuizo,
  jurisdicaoDoProcesso,
  ProporEventoDoCalendario,
} from '@pz/calendario';
import { Banco, BancoSistema, executarNoTenant, OutboxPostgres } from '@pz/db';
import { subirBancoDeTeste } from '@pz/db/teste';
import { gerarUuidV7 } from '@pz/kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CalcularPrazoParaProcesso,
  CriarPrazo,
  lerAlteracaoDoCalendario,
  RecalcularPrazosPorCalendario,
  TenantsAfetadosPeloCalendario,
} from '../application/prazos.js';
import {
  AprovarVersaoDaTabela,
  CadastrarTipoDeAto,
  ProporVersaoDaTabela,
  ResolverPrazoAplicavel,
} from '../application/tabela-de-prazos.js';
import { ANA, BETO, PLATAFORMA, relogio } from '../teste/ficticios.js';

import { PrazosPostgres } from './prazos-postgres.js';
import { TabelaPostgres, TiposDeAtoPostgres } from './tabela-postgres.js';

import type { LocalizadorDoProcesso } from '../application/portas.js';
import type { Transacao } from '@pz/db';
import type { BancoDeTeste } from '@pz/db/teste';
import type { Uuid } from '@pz/kernel';

/**
 * Recálculo em massa (HU16, PZ-142/PZ-333): meta de 100 mil prazos em menos de 10 min. Um prazo
 * real (motor + tabela + calendário FICTÍCIOS, 2030) é clonado por SQL em 10 escritórios; um
 * feriado fictício aprovado muda o vencimento de todos. Os lotes rodam como no worker: em
 * sequência dentro do escritório (cada lote enfileira o próximo) e escritórios em paralelo
 * (concorrência 10 da fila `prazos`). Massa FICTÍCIA. Roda com PZ_DESEMPENHO=1.
 */
const ATIVO = process.env.PZ_DESEMPENHO === '1';
const ESCRITORIOS = 10;
const PRAZOS_POR_ESCRITORIO = 10_000;
const META_MS = 10 * 60_000;
const ana = { ...ANA, canal: 'portal' as const };
const beto = { ...BETO, canal: 'portal' as const };
const escritorios = Array.from({ length: ESCRITORIOS }, () => gerarUuidV7());
const processos = escritorios.map(() => gerarUuidV7());

let postgres: BancoDeTeste;
let banco: Banco;
let sistema: BancoSistema;
let recalcular: RecalcularPrazosPorCalendario<Transacao>;
let tenants: TenantsAfetadosPeloCalendario<Transacao>;
let proporEvento: ProporEventoDoCalendario<Transacao>;
let aprovarEvento: AprovarEventoDoCalendario<Transacao>;

const naPlataforma = <T>(trabalho: () => Promise<T>) => executarNoTenant(PLATAFORMA, trabalho);

describe.runIf(ATIVO)('recálculo em massa (100 mil prazos)', () => {
  beforeAll(async () => {
    postgres = await subirBancoDeTeste();
    await postgres.migrar();
    sistema = new BancoSistema({ url: postgres.url('pz_sistema') });
    await sistema.executarComoSistema('preparar massa de desempenho', async (tx) => {
      await tx.tenant.create({
        data: { id: PLATAFORMA, nome: 'PrejuZero (fictício)', tipo: 'plataforma' },
      });
      for (const [i, tenantId] of escritorios.entries()) {
        await tx.tenant.create({
          data: { id: tenantId, nome: `E${String(i)} (fictício)`, tipo: 'escritorio' },
        });
        await tx.processo.create({
          data: {
            id: processos[i] ?? gerarUuidV7(),
            tenantId,
            numeroCnj: `${String(i + 1).padStart(7, '0')}0120308090001`,
            tribunal: 'TJGO',
            ramo: 'estadual',
            comarca: 'Comarca Fictícia',
          },
        });
      }
    });
    banco = new Banco({ url: postgres.url('pz_app'), maxConexoes: 30 });
    const r = relogio();
    const trilha = new TrilhaPostgres();
    const outbox = new OutboxPostgres();
    const tabela = new TabelaPostgres();
    const tiposDeAto = new TiposDeAtoPostgres();
    const globais = new EventosGlobaisPostgres();
    const dias = new ConsultarDiasNaoUteis(banco, globais, new FeriadosLocaisPostgres());
    // Mesma composição do worker (apps/worker/src/prazos/processo.ts), lendo o processo direto.
    const localizar: LocalizadorDoProcesso = async (processoId) => {
      const p = await banco.executar((tx) => tx.processo.findUnique({ where: { id: processoId } }));
      if (p === null) return undefined;
      const { jurisdicao, lacunas } = jurisdicaoDoProcesso(p);
      return {
        ramoDoTribunal: p.ramo,
        jurisdicao,
        lacunas,
        fuso: fusoDoJuizo(p.tribunal),
        diasNaoUteis: async (inicio, fim) =>
          (await dias.diasNaoUteis(jurisdicao, inicio, fim)).map((d) => ({
            data: d.data,
            tipo: d.tipo,
            motivo: d.motivo,
            atoNormativo: d.fonte.atoNormativo,
            urlAto: d.fonte.urlAto,
          })),
      };
    };
    const prazos = new PrazosPostgres();
    const calcular = new CalcularPrazoParaProcesso(
      localizar,
      new ResolverPrazoAplicavel(banco, tabela),
    );
    const criar = new CriarPrazo(banco, prazos, trilha, outbox, r);
    recalcular = new RecalcularPrazosPorCalendario(banco, prazos, localizar, trilha, outbox, r);
    tenants = new TenantsAfetadosPeloCalendario(sistema.unidade('teste: tenants afetados'), prazos);
    proporEvento = new ProporEventoDoCalendario(banco, globais, trilha, r);
    aprovarEvento = new AprovarEventoDoCalendario(banco, globais, trilha, outbox, r);

    // Tabela FICTÍCIA: 15 dias úteis no cível, aprovada por outra curadora (quatro olhos).
    await naPlataforma(async () => {
      const tipo = await new CadastrarTipoDeAto(banco, tiposDeAto, trilha).executar(ana, {
        codigo: 'ato-ficticio',
        nome: 'Ato fictício',
        descricao: '',
      });
      if (!tipo.ok) throw tipo.erro;
      const proposta = await new ProporVersaoDaTabela(
        banco,
        tiposDeAto,
        tabela,
        trilha,
        r,
      ).executar(ana, {
        tipoAto: 'ato-ficticio',
        ramo: 'civel',
        dias: 15,
        unidade: 'dias',
        fundamento: 'FICTÍCIO: Lei de Teste, art. 1º',
        fonteUrl: 'https://exemplo.invalid/ficticio',
        vigenciaInicio: '2020-01-01',
      });
      if (!proposta.ok) throw proposta.erro;
      const aprovacao = await new AprovarVersaoDaTabela(banco, tabela, trilha, outbox, r).executar(
        beto,
        proposta.valor.id,
      );
      if (!aprovacao.ok) throw aprovacao.erro;
    });

    // Um prazo real por escritório (motor), clonado por SQL até PRAZOS_POR_ESCRITORIO.
    for (const [i, tenantId] of escritorios.entries()) {
      await executarNoTenant(tenantId, async () => {
        const sugestao = await calcular.executar({
          processoId: processos[i] ?? gerarUuidV7(),
          tipoAto: 'ato-ficticio',
          ramo: 'civel',
          meio: 'djen',
          dataDeReferencia: '2030-08-05',
        });
        if (!sugestao.ok) throw sugestao.erro;
        const criado = await criar.executar(
          sugestao.valor,
          { origem: 'djen', responsavelId: null, publicacaoConteudoId: null },
          { tenantId, canal: 'evento' },
        );
        if (!criado.ok) throw criado.erro;
      });
    }
    const dono = await postgres.conectar('pz_dev');
    const colunas = (
      await dono.query<{ c: string }>(
        `SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) AS c
           FROM information_schema.columns WHERE table_name = 'prazo' AND column_name <> 'id'`,
      )
    ).rows[0]?.c;
    await dono.query(
      `INSERT INTO prazo (id, ${colunas ?? ''})
       SELECT gen_random_uuid(), ${colunas ?? ''} FROM prazo, generate_series(2, $1)`,
      [PRAZOS_POR_ESCRITORIO],
    );
    await dono.query('ANALYZE prazo');
    await dono.end();
  }, 1_800_000);

  afterAll(async () => {
    await banco.encerrar();
    await sistema.encerrar();
    await postgres.parar();
  });

  it('feriado novo: recalcula os 100 mil prazos em menos de 10 min', async () => {
    const alteracao = await naPlataforma(async () => {
      const p = await proporEvento.executar(ana, {
        tipo: 'feriado',
        inicio: '2030-08-14',
        fim: '2030-08-14',
        descricao: 'FICTÍCIO',
        atoNormativo: 'FICTÍCIO: Portaria de Teste 1/2030',
        urlAto: 'https://exemplo.invalid/portaria',
        abrangencia: 'nacional',
      });
      if (!p.ok) throw p.erro;
      const a = await aprovarEvento.executar(beto, p.valor.id);
      if (!a.ok) throw a.erro;
      const evento = await banco.executar((tx) =>
        tx.eventoDominio.findFirstOrThrow({
          where: { tipo: 'CalendarioAlterado', agregadoId: p.valor.id },
        }),
      );
      return lerAlteracaoDoCalendario(evento);
    });

    const inicio = performance.now();
    const alcancados = await tenants.executar(alteracao);
    let alterados = 0;
    let lotes = 0;
    // Escritórios em paralelo (concorrência 10 da fila); lotes em sequência dentro de cada um.
    await Promise.all(
      alcancados.map((tenantId) =>
        executarNoTenant(tenantId, async () => {
          let depoisDe: Uuid | null = null;
          do {
            const lote = await recalcular.executarLote(alteracao, depoisDe);
            alterados += lote.vencimentosAlterados;
            lotes++;
            depoisDe = lote.proximo;
          } while (depoisDe !== null);
        }),
      ),
    );
    const ms = performance.now() - inicio;
    process.stdout.write(
      `recálculo: ${String(alterados)} prazos em ${(ms / 1000).toFixed(1)} s (${String(lotes)} lotes, ${(ms / lotes).toFixed(0)} ms por lote)\n`,
    );
    expect(alcancados).toHaveLength(ESCRITORIOS);
    expect(alterados).toBe(ESCRITORIOS * PRAZOS_POR_ESCRITORIO);
    expect(ms).toBeLessThan(META_MS);
  }, 1_800_000);
});
