import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';

import { TabelaDados, type ColunaTabela } from './tabela-dados.js';

interface Linha {
  readonly id: string;
}

function Contador() {
  const [cliques, setCliques] = useState(0);
  return (
    <button
      type="button"
      onClick={() => {
        setCliques((c) => c + 1);
      }}
    >
      {`cliques: ${String(cliques)}`}
    </button>
  );
}

function Tela() {
  const [renders, setRenders] = useState(0);
  // Colunas declaradas inline, como nas telas: um tipo de função novo a cada render.
  const colunas: ColunaTabela<Linha>[] = [{ id: 'acao', header: 'Ação', cell: () => <Contador /> }];
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setRenders((r) => r + 1);
        }}
      >
        {`renderizar de novo ${String(renders)}`}
      </button>
      <TabelaDados titulo="Teste" colunas={colunas} dados={[{ id: 'a' }]} />
    </>
  );
}

describe('TabelaDados', () => {
  it('não remonta as células quando o pai renderiza de novo (diálogos abertos continuam abertos)', async () => {
    const tela = await render(<Tela />);
    await tela.getByRole('button', { name: 'cliques: 0' }).click();
    await expect.element(tela.getByRole('button', { name: 'cliques: 1' })).toBeVisible();

    await tela.getByRole('button', { name: /renderizar de novo/ }).click();
    await expect.element(tela.getByRole('button', { name: 'renderizar de novo 1' })).toBeVisible();
    await expect.element(tela.getByRole('button', { name: 'cliques: 1' })).toBeVisible();
  });

  it('ordena pela coluna (texto, número e data) e pagina (TanStack Table v9)', async () => {
    interface Prazo {
      readonly id: string;
      readonly ato: string;
      readonly dias: number;
      readonly vence: Date;
    }
    const dados: Prazo[] = [
      { id: '1', ato: 'Contestacao', dias: 15, vence: new Date('2027-03-23T00:00:00Z') },
      { id: '2', ato: 'Apelacao', dias: 5, vence: new Date('2027-03-10T00:00:00Z') },
      { id: '3', ato: 'Embargos', dias: 10, vence: new Date('2027-03-15T00:00:00Z') },
    ];
    const colunas: ColunaTabela<Prazo>[] = [
      { accessorKey: 'ato', header: 'Ato' },
      { accessorKey: 'dias', header: 'Dias' },
      {
        accessorKey: 'vence',
        header: 'Vence',
        cell: ({ row }) => row.original.vence.toISOString().slice(0, 10),
      },
    ];
    const tela = await render(
      <TabelaDados
        titulo="Prazos"
        colunas={colunas}
        dados={dados}
        tamanhoPagina={2}
        idLinha={(p) => p.id}
      />,
    );
    const primeira = () => tela.getByRole('row').nth(1);
    await expect.element(tela.getByText('Página 1 de 2')).toBeVisible();
    await expect.element(primeira()).toHaveTextContent('Contestacao152027-03-23');

    await tela.getByRole('button', { name: 'Ato' }).click();
    await expect
      .element(tela.getByRole('columnheader', { name: 'Ato' }))
      .toHaveAttribute('aria-sort', 'ascending');
    await expect.element(primeira()).toHaveTextContent('Apelacao52027-03-10');

    // Número e data começam do maior (como na v8); o segundo clique inverte.
    await tela.getByRole('button', { name: 'Dias' }).click();
    await expect
      .element(tela.getByRole('columnheader', { name: 'Dias' }))
      .toHaveAttribute('aria-sort', 'descending');
    await expect.element(primeira()).toHaveTextContent('Contestacao152027-03-23');

    await tela.getByRole('button', { name: 'Vence' }).click();
    await tela.getByRole('button', { name: 'Vence' }).click();
    await expect
      .element(tela.getByRole('columnheader', { name: 'Vence' }))
      .toHaveAttribute('aria-sort', 'ascending');
    await expect.element(primeira()).toHaveTextContent('Apelacao52027-03-10');

    await tela.getByRole('button', { name: 'Próxima página' }).click();
    await expect.element(tela.getByText('Página 2 de 2')).toBeVisible();
    await expect.element(primeira()).toHaveTextContent('Contestacao152027-03-23');
  });
});
