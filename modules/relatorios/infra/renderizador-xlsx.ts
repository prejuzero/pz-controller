import ExcelJS from 'exceljs';

import type { Renderizador } from '../application/portas.js';
import type { Documento } from '../domain/relatorio.js';

/**
 * Planilha (HU29): cabeçalho com título, data e hora, usuário e filtro (RF61); depois a tabela
 * com uma linha por item. O agrupamento (ex.: dia da agenda) vira a primeira coluna, para a
 * planilha continuar filtrável.
 */
export class RenderizadorXlsx implements Renderizador {
  readonly formato = 'xlsx' as const;
  readonly tipoMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  async renderizar(doc: Documento): Promise<Uint8Array> {
    const livro = new ExcelJS.Workbook();
    livro.creator = 'PrejuZero';
    const folha = livro.addWorksheet('Relatório');
    folha.addRow([doc.titulo]).font = { bold: true, size: 14 };
    folha.addRow([`Gerado em ${doc.cabecalho.geradoEm} por ${doc.cabecalho.usuario}`]);
    for (const [rotulo, valor] of doc.cabecalho.filtros) folha.addRow([`${rotulo}: ${valor}`]);
    if (doc.cabecalho.aviso !== null) folha.addRow([doc.cabecalho.aviso]).font = { bold: true };
    folha.addRow([]);

    const titulos = [
      ...(doc.rotuloDoGrupo === null ? [] : [doc.rotuloDoGrupo]),
      ...doc.colunas.map((c) => c.titulo),
    ];
    const cabecalho = folha.addRow(titulos);
    cabecalho.font = { bold: true };
    for (const grupo of doc.grupos) {
      for (const linha of grupo.linhas) {
        folha.addRow([
          ...(doc.rotuloDoGrupo === null ? [] : [grupo.titulo ?? '']),
          ...doc.colunas.map((c) => linha[c.chave] ?? ''),
        ]);
      }
    }
    titulos.forEach((_, i) => {
      folha.getColumn(i + 1).width = 18;
    });
    folha.views = [{ state: 'frozen', ySplit: cabecalho.number }];
    return new Uint8Array(await livro.xlsx.writeBuffer());
  }
}
