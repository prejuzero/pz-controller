import { ExtratorPdf } from '@pz/adapter-pdf';
import { err, FixedClock, gerarUuidV7, Instant, ok, OutboxEmMemoria, Validacao } from '@pz/kernel';
import ExcelJS from 'exceljs';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  caminhoDoArquivo,
  ConsultarRelatorios,
  GerarRelatorio,
  SolicitarRelatorio,
} from '../application/relatorios.js';

import { RelatoriosEmMemoria } from './em-memoria.js';
import { RenderizadorPdf } from './renderizador-pdf.js';
import { RenderizadorXlsx } from './renderizador-xlsx.js';

import type { FonteDosRelatorios } from '../application/portas.js';
import type { PrazoDoRelatorio } from '../domain/relatorio.js';
import type { EntradaDeAuditoria } from '@pz/auditoria';
import type { ArmazenamentoArquivos, ArquivoParaGravar } from '@pz/integracoes';
import type { TransacaoEmMemoria, Uuid } from '@pz/kernel';

// Dados FICTÍCIOS (HU29). Agora: 02/11/2026 12:00 em Brasília.
const relogio = new FixedClock(Instant.deIso('2026-11-02T15:00:00Z'));
const TENANT = gerarUuidV7();
const USUARIO = gerarUuidV7();
const OUTRO = gerarUuidV7();
const solicitante = { tenantId: TENANT, usuarioId: USUARIO, canal: 'portal' as const };

class ArmazenamentoFalso implements ArmazenamentoArquivos {
  readonly gravados = new Map<string, ArquivoParaGravar>();
  readonly assinados: { caminho: string; expiraEmSegundos: number }[] = [];
  gravar(arquivo: ArquivoParaGravar) {
    this.gravados.set(arquivo.caminho, arquivo);
    return Promise.resolve();
  }
  urlAssinada(pedido: { caminho: string; expiraEmSegundos: number }) {
    this.assinados.push(pedido);
    return Promise.resolve(`https://exemplo.invalid/${pedido.caminho}`);
  }
  remover() {
    return Promise.resolve();
  }
  metadados() {
    return Promise.resolve(undefined);
  }
  saude() {
    return Promise.resolve({ estado: 'operacional' as const, verificadoEm: relogio.agora() });
  }
}

const prazo = (i: number): PrazoDoRelatorio => ({
  vencimento: `2026-11-${String(10 + (i % 3)).padStart(2, '0')}`,
  inicio: '2026-11-03',
  tipoAto: `Ato fictício ${String(i)}`,
  status: 'pendente',
  statusCiencia: 'pendente',
  fundamento: 'CPC, art. 335',
  vencimentoManual: false,
  jurisdicao: { tribunal: 'TJGO' },
});

/** Busca falsa paginada (100 por página), como a da HU28. */
function fonteCom(total: number, pedidos: Record<string, unknown>[] = []): FonteDosRelatorios {
  const todos = Array.from({ length: total }, (_, i) => prazo(i));
  return {
    prazos: (filtros) => {
      pedidos.push(filtros);
      if (filtros.tribunal === 'XX') {
        return Promise.resolve(err(new Validacao([{ campo: 'tribunal', mensagem: 'inválido' }])));
      }
      const inicio = filtros.cursor === undefined ? 0 : Number(filtros.cursor);
      const fim = inicio + Number(filtros.limite);
      return Promise.resolve(
        ok({ itens: todos.slice(inicio, fim), proximoCursor: fim < total ? String(fim) : null }),
      );
    },
    publicacoes: () =>
      Promise.resolve(
        ok({
          itens: [
            {
              dataDisponibilizacao: '2026-11-02',
              numeroCnj: '00000010920308090001',
              siglaTribunal: 'TJGO',
              teor: 'Intimação fictícia para manifestação.',
            },
          ],
          proximoCursor: null,
        }),
      ),
    nomeDoUsuario: () => Promise.resolve('Ana Fictícia'),
  };
}

let outbox: OutboxEmMemoria;
let repo: RelatoriosEmMemoria;
let armazenamento: ArmazenamentoFalso;
let auditados: EntradaDeAuditoria[];
let solicitar: SolicitarRelatorio<unknown>;
let consultar: ConsultarRelatorios<unknown>;
const trilha = {
  registrar: (tx: TransacaoEmMemoria, entrada: EntradaDeAuditoria) => {
    tx.aoConfirmar(() => auditados.push(entrada));
    return Promise.resolve();
  },
};
const gerador = (fonte: FonteDosRelatorios) =>
  new GerarRelatorio(
    outbox,
    repo,
    trilha,
    fonte,
    [new RenderizadorPdf(), new RenderizadorXlsx()],
    armazenamento,
    relogio,
  );

beforeEach(() => {
  outbox = new OutboxEmMemoria();
  repo = new RelatoriosEmMemoria();
  armazenamento = new ArmazenamentoFalso();
  auditados = [];
  solicitar = new SolicitarRelatorio(outbox, repo, trilha, outbox, relogio);
  consultar = new ConsultarRelatorios(outbox, repo, armazenamento, relogio);
});

async function pedir(corpo: unknown): Promise<Uuid> {
  const r = await solicitar.executar(solicitante, corpo);
  if (!r.ok) throw r.erro;
  return r.valor.id;
}

async function planilha(id: Uuid): Promise<string[][]> {
  const arquivo = armazenamento.gravados.get(`relatorios/${id}/relatorio.xlsx`);
  if (arquivo === undefined) throw new Error('planilha não gravada');
  const livro = new ExcelJS.Workbook();
  // Os tipos do ExcelJS são de um Buffer antigo do @types/node.
  await livro.xlsx.load(Buffer.from(arquivo.conteudo) as never);
  const linhas: string[][] = [];
  livro.worksheets[0]?.eachRow((linha) => {
    linhas.push(
      (linha.values as unknown[]).slice(1).map((v) => String((v ?? '') as string | number)),
    );
  });
  return linhas;
}

describe('relatórios (HU29)', () => {
  it('pedido: evento e trilha na mesma transação; consulta pendente sem link', async () => {
    const id = await pedir({
      tipo: 'busca-prazos',
      formato: 'xlsx',
      filtros: { tribunal: 'TJGO', statusPrazo: ['pendente'] },
    });
    expect(auditados.map((a) => [a.tipo, a.entidadeId])).toEqual([
      ['relatorios.exportacao-solicitada', id],
    ]);
    const [evento] = await outbox.executar((tx) => outbox.reservarPendentes(tx, 10));
    expect(evento).toMatchObject({
      tipo: 'RelatorioSolicitado',
      tenantId: TENANT,
      payload: { relatorioId: id, usuarioId: USUARIO },
    });
    const pendente = await consultar.um(solicitante, id);
    expect(pendente.ok && pendente.valor).toMatchObject({ situacao: 'pendente', url: null });
  });

  it('recusa pedido inválido: tipo, formato, filtro desconhecido e agenda fora do limite', async () => {
    for (const corpo of [
      { tipo: 'outro', formato: 'pdf', filtros: {} },
      { tipo: 'busca-prazos', formato: 'csv', filtros: {} },
      { tipo: 'busca-prazos', formato: 'pdf', filtros: { cursor: 'x' } },
      { tipo: 'agenda', formato: 'pdf', filtros: { de: '2026-11-30', ate: '2026-11-01' } },
      { tipo: 'agenda', formato: 'pdf', filtros: { de: '2026-01-01', ate: '2027-01-02' } },
      { tipo: 'agenda', formato: 'pdf', filtros: { de: '2026-11-01' } },
    ]) {
      expect((await solicitar.executar(solicitante, corpo)).ok, JSON.stringify(corpo)).toBe(false);
    }
    expect(repo.itens.size).toBe(0);
  });

  it('Excel bate com a busca de origem, com cabeçalho de data, hora, usuário e filtro', async () => {
    const pedidos: Record<string, unknown>[] = [];
    const id = await pedir({
      tipo: 'busca-prazos',
      formato: 'xlsx',
      filtros: { tribunal: 'TJGO', ordem: 'asc' },
    });
    expect(await gerador(fonteCom(250, pedidos)).executar(id)).toBe('gerado');
    expect(pedidos.map((p) => [p.cursor, p.limite, p.tribunal])).toEqual([
      [undefined, 100, 'TJGO'],
      ['100', 100, 'TJGO'],
      ['200', 100, 'TJGO'],
    ]);
    const linhas = await planilha(id);
    expect(linhas.slice(0, 4)).toEqual([
      ['Busca de prazos'],
      ['Gerado em 02/11/2026, 12:00 (horário de Brasília) por Ana Fictícia'],
      ['Tribunal: TJGO'],
      ['Ordem: asc'],
    ]);
    const cabecalho = linhas.findIndex((l) => l[0] === 'Vencimento');
    expect(linhas[cabecalho]).toEqual(['Vencimento', 'Ato', 'Situação', 'Ciência', 'Tribunal']);
    const dados = linhas.slice(cabecalho + 1);
    expect(dados).toHaveLength(250);
    expect(dados.map((l) => l[1])).toEqual(
      Array.from({ length: 250 }, (_, i) => `Ato fictício ${String(i)}`),
    );
    expect(auditados.map((a) => a.tipo)).toEqual([
      'relatorios.exportacao-solicitada',
      'relatorios.exportacao-gerada',
    ]);
    // Repetir o job não gera de novo.
    expect(await gerador(fonteCom(250)).executar(id)).toBe('ja-concluido');
  });

  it('agenda em PDF: período pelo vencimento, agrupada por dia, com o texto conferível', async () => {
    const pedidos: Record<string, unknown>[] = [];
    const id = await pedir({
      tipo: 'agenda',
      formato: 'pdf',
      filtros: { de: '2026-11-01', ate: '2026-11-30', tribunal: 'TJGO' },
    });
    await gerador(fonteCom(3, pedidos)).executar(id);
    expect(pedidos[0]).toEqual({
      tribunal: 'TJGO',
      periodo: { de: '2026-11-01', ate: '2026-11-30', campoData: 'vencimento' },
      ordem: 'asc',
      limite: 100,
    });
    const arquivo = armazenamento.gravados.get(caminhoDoArquivo({ id, formato: 'pdf' }));
    expect(arquivo?.tipoMime).toBe('application/pdf');
    const { texto, paginas } = await new ExtratorPdf().extrairDePdf(
      arquivo?.conteudo ?? new Uint8Array(),
    );
    expect(paginas).toBe(1);
    expect(texto.replace(/\s+/g, ' ')).toContain(
      'Filtro: Tribunal: TJGO; De: 01/11/2026; Até: 30/11/2026',
    );
    for (const trecho of [
      'Agenda de prazos',
      'Gerado em 02/11/2026, 12:00 (horário de Brasília) por Ana Fictícia',
      '10/11/2026',
      'Ato fictício 0',
      'Início 03/11/2026 · CPC, art. 335',
      'Página 1 de 1',
    ]) {
      expect(texto).toContain(trecho);
    }
  });

  it('5.000 linhas no teto: PDF com várias páginas, aviso no cabeçalho e menos de 30 s', async () => {
    const id = await pedir({ tipo: 'busca-prazos', formato: 'pdf', filtros: {} });
    const inicio = performance.now();
    await gerador(fonteCom(5_200)).executar(id);
    expect(performance.now() - inicio).toBeLessThan(30_000);
    const r = repo.itens.get(id);
    expect(r?.linhas).toBe(5_000);
    const arquivo = armazenamento.gravados.get(`relatorios/${id}/relatorio.pdf`);
    const { texto, paginas } = await new ExtratorPdf().extrairDePdf(
      arquivo?.conteudo ?? new Uint8Array(),
    );
    expect(paginas).toBeGreaterThan(50);
    expect(texto).toContain('Limitado às primeiras 5.000 linhas');
  }, 60_000);

  it('busca de publicações em Excel', async () => {
    const id = await pedir({
      tipo: 'busca-publicacoes',
      formato: 'xlsx',
      filtros: { palavraChave: 'intimação' },
    });
    await gerador(fonteCom(0)).executar(id);
    const linhas = await planilha(id);
    expect(linhas.at(-1)).toEqual([
      '02/11/2026',
      '0000001-09.2030.8.09.0001',
      'TJGO',
      'Intimação fictícia para manifestação.',
    ]);
  });

  it('filtro recusado pela busca marca "falhou" e registra na trilha', async () => {
    const id = await pedir({ tipo: 'busca-prazos', formato: 'pdf', filtros: { tribunal: 'XX' } });
    expect(await gerador(fonteCom(1)).executar(id)).toBe('filtros-invalidos');
    expect(repo.itens.get(id)?.situacao).toBe('falhou');
    expect(auditados.at(-1)?.tipo).toBe('relatorios.exportacao-falhou');
    expect(armazenamento.gravados.size).toBe(0);
  });

  it('link assinado só para quem pediu e até o fim das 24 h', async () => {
    const id = await pedir({ tipo: 'busca-prazos', formato: 'xlsx', filtros: {} });
    await gerador(fonteCom(1)).executar(id);
    const pronto = await consultar.um(solicitante, id);
    expect(pronto.ok && pronto.valor).toMatchObject({
      situacao: 'concluido',
      linhas: 1,
      expiraEm: '2026-11-03T15:00:00.000Z',
      url: `https://exemplo.invalid/relatorios/${id}/relatorio.xlsx`,
    });
    expect(armazenamento.assinados.at(-1)?.expiraEmSegundos).toBe(900);
    expect((await consultar.um({ usuarioId: OUTRO }, id)).ok).toBe(false);
    expect(await consultar.recentes({ usuarioId: OUTRO })).toEqual([]);

    const depois = new ConsultarRelatorios(
      outbox,
      repo,
      armazenamento,
      new FixedClock(Instant.deIso('2026-11-03T15:00:00Z')),
    );
    const quaseNoFim = new ConsultarRelatorios(
      outbox,
      repo,
      armazenamento,
      new FixedClock(Instant.deIso('2026-11-03T14:59:00Z')),
    );
    await quaseNoFim.recentes(solicitante);
    expect(armazenamento.assinados.at(-1)?.expiraEmSegundos).toBe(60);
    const [expirado] = await depois.recentes(solicitante);
    expect(expirado).toMatchObject({ id, situacao: 'concluido', url: null });
  });

  it('job de relatório inexistente lança (vai para a DLQ)', async () => {
    await expect(gerador(fonteCom(1)).executar(gerarUuidV7())).rejects.toThrow(/não encontrado/);
  });
});
