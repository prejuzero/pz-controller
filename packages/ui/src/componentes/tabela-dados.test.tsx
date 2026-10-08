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
});
