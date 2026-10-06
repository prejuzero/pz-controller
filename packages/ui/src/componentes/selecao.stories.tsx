import { expect, fn, screen, userEvent } from 'storybook/test';

import { Selecao } from './selecao.js';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  title: 'Componentes/Seleção',
  component: Selecao,
  args: {
    rotulo: 'UF da OAB',
    aoMudar: fn(),
    opcoes: [
      { valor: 'SP', rotulo: 'São Paulo' },
      { valor: 'RJ', rotulo: 'Rio de Janeiro' },
      { valor: 'MG', rotulo: 'Minas Gerais', desabilitada: true },
    ],
  },
  decorators: [
    (Story) => (
      <div className="max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Selecao>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Padrao: Story = {
  play: async ({ canvas, args }) => {
    const gatilho = canvas.getByRole('combobox', { name: 'UF da OAB' });
    gatilho.focus();
    await userEvent.keyboard('{Enter}');
    await expect(await screen.findByRole('listbox')).toBeVisible();
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await expect(args.aoMudar).toHaveBeenCalledWith('RJ');
  },
};
export const ComValor: Story = { args: { valor: 'SP', ajuda: 'Estado de inscrição.' } };
export const ComErro: Story = { args: { erro: 'Selecione a UF.', obrigatorio: true } };
export const Desabilitada: Story = { args: { desabilitada: true } };
