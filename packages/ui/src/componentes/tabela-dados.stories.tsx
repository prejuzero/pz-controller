import { expect, userEvent, within } from 'storybook/test';

import { SeloStatus } from './selo-status.js';
import { TabelaDados, type ColunaTabela } from './tabela-dados.js';

import type { Meta, StoryObj } from '@storybook/react-vite';

// Dados fictícios (CLAUDE.md, §3: nada de dados reais de clientes).
interface LinhaPrazo {
  processo: string;
  ato: string;
  vencimento: string;
  status: 'A confirmar' | 'Confirmado';
}

const linhas: LinhaPrazo[] = [
  {
    processo: '0000001-11.2026.8.26.0001',
    ato: 'Contestação',
    vencimento: '2026-03-16',
    status: 'A confirmar',
  },
  {
    processo: '0000002-22.2026.8.26.0002',
    ato: 'Apelação',
    vencimento: '2026-03-04',
    status: 'Confirmado',
  },
  {
    processo: '0000003-33.2026.8.26.0003',
    ato: 'Embargos de declaração',
    vencimento: '2026-03-10',
    status: 'A confirmar',
  },
];

const colunas: ColunaTabela<LinhaPrazo>[] = [
  { accessorKey: 'processo', header: 'Processo', enableSorting: false },
  { accessorKey: 'ato', header: 'Ato' },
  {
    accessorKey: 'vencimento',
    header: 'Vencimento',
    cell: ({ getValue }) => getValue<string>().split('-').reverse().join('/'),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ getValue }) => {
      const status = getValue<LinhaPrazo['status']>();
      return <SeloStatus tom={status === 'Confirmado' ? 'sucesso' : 'alerta'}>{status}</SeloStatus>;
    },
  },
];

const meta = {
  title: 'Componentes/Tabela de dados',
  component: TabelaDados<LinhaPrazo>,
  args: {
    titulo: 'Prazos',
    colunas,
    dados: linhas,
    idLinha: (linha: LinhaPrazo) => linha.processo,
  },
} satisfies Meta<typeof TabelaDados<LinhaPrazo>>;
export default meta;
type Story = StoryObj<typeof meta>;

const atos = (tabela: HTMLElement) =>
  within(tabela)
    .getAllByRole('row')
    .slice(1)
    .map((linha) => within(linha).getAllByRole('cell')[1]?.textContent);

export const Padrao: Story = {
  play: async ({ canvas }) => {
    const cabecalho = canvas.getByRole('columnheader', { name: /Ato/ });
    const ordenar = within(cabecalho).getByRole('button');
    ordenar.focus();
    await userEvent.keyboard('{Enter}');
    await expect(cabecalho).toHaveAttribute('aria-sort', 'ascending');
    await expect(atos(canvas.getByRole('table'))).toEqual([
      'Apelação',
      'Contestação',
      'Embargos de declaração',
    ]);
    await userEvent.keyboard('{Enter}');
    await expect(cabecalho).toHaveAttribute('aria-sort', 'descending');
  },
};
export const Paginada: Story = {
  args: { tamanhoPagina: 2 },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Página 1 de 2')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Página anterior' })).toBeDisabled();
    await userEvent.click(canvas.getByRole('button', { name: 'Próxima página' }));
    await expect(canvas.getByText('Página 2 de 2')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Página anterior' }));
    await expect(canvas.getByText('Página 1 de 2')).toBeVisible();
  },
};
export const Vazia: Story = {
  args: { dados: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Nenhum resultado encontrado.')).toBeVisible();
  },
};
