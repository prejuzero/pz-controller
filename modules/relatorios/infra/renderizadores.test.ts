import { ExtratorPdf } from '@pz/adapter-pdf';
import { Instant } from '@pz/kernel';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import { RelatoriosEmMemoria } from './em-memoria.js';
import { RenderizadorPdf } from './renderizador-pdf.js';
import { RenderizadorXlsx } from './renderizador-xlsx.js';

import type { Documento } from '../domain/relatorio.js';
import type { Uuid } from '@pz/kernel';

// Documentos FICTÍCIOS (HU29).
const base: Documento = {
  titulo: 'Agenda de prazos',
  cabecalho: {
    geradoEm: '02/11/2026, 12:00 (horário de Brasília)',
    usuario: 'Ana Fictícia',
    filtros: [],
    aviso: 'Limitado às primeiras 5.000 linhas: refine os filtros.',
  },
  colunas: [
    { chave: 'ato', titulo: 'Ato', largura: 1 },
    { chave: 'memoria', titulo: 'Memória resumida', largura: 2 },
  ],
  rotuloDoGrupo: 'Vencimento',
  grupos: Array.from({ length: 40 }, (_, d) => ({
    titulo: `${String(d + 1).padStart(2, '0')}/12/2026`,
    linhas: [{ ato: `Ato ${String(d)}` }, { ato: 'Réplica', memoria: 'CPC, art. 351' }],
  })),
};

describe('renderizadores (HU29)', () => {
  it('Excel: o grupo vira a primeira coluna e o aviso entra no cabeçalho', async () => {
    const bytes = await new RenderizadorXlsx().renderizar(base);
    const livro = new ExcelJS.Workbook();
    // Os tipos do ExcelJS são de um Buffer antigo do @types/node.
    await livro.xlsx.load(Buffer.from(bytes) as never);
    const folha = livro.worksheets[0];
    expect(folha?.getRow(3).getCell(1).value).toBe(base.cabecalho.aviso);
    expect(folha?.getRow(5).values).toEqual([undefined, 'Vencimento', 'Ato', 'Memória resumida']);
    expect(folha?.getRow(6).values).toEqual([undefined, '01/12/2026', 'Ato 0', '']);
    expect(folha?.getRow(7).values).toEqual([undefined, '01/12/2026', 'Réplica', 'CPC, art. 351']);
  });

  it('PDF: grupos com quebra de página, títulos repetidos e rodapé; vazio avisa', async () => {
    const extrator = new ExtratorPdf();
    const cheio = await extrator.extrairDePdf(await new RenderizadorPdf().renderizar(base));
    expect(cheio.paginas).toBeGreaterThan(1);
    expect(cheio.texto).toContain('Filtro: nenhum');
    expect(cheio.texto).toContain(`Página ${String(cheio.paginas)} de ${String(cheio.paginas)}`);
    expect(cheio.texto.match(/Memória resumida/g)?.length).toBeGreaterThanOrEqual(cheio.paginas);

    const vazio = await extrator.extrairDePdf(
      await new RenderizadorPdf().renderizar({
        ...base,
        cabecalho: { ...base.cabecalho, aviso: null },
        rotuloDoGrupo: null,
        grupos: [{ titulo: null, linhas: [] }],
      }),
    );
    expect(vazio.texto).toContain('Nenhum resultado.');
  });

  it('repositório em memória ignora id inexistente', async () => {
    const repo = new RelatoriosEmMemoria();
    const id = 'x' as Uuid;
    await repo.concluir(undefined, id, {
      em: Instant.deEpochMs(0),
      expiraEm: Instant.deEpochMs(0),
      linhas: 0,
    });
    await repo.falhar(undefined, id);
    expect(repo.itens.size).toBe(0);
  });
});
