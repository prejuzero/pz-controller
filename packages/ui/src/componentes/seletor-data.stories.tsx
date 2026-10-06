import { expect, fn, screen, userEvent } from 'storybook/test';

import { SeletorData } from './seletor-data.js';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  title: 'Componentes/Seletor de data',
  component: SeletorData,
  args: { rotulo: 'Data da publicação', aoMudar: fn() },
  decorators: [
    (Story) => (
      <div className="max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SeletorData>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Vazio: Story = {};
export const ComData: Story = {
  args: { valor: '2026-03-02' },
  play: async ({ canvas, args }) => {
    const gatilho = canvas.getByRole('button', { name: /Data da publicação/ });
    await expect(gatilho).toHaveTextContent('02/03/2026');
    gatilho.focus();
    await userEvent.keyboard('{Enter}');
    await expect(await screen.findByRole('grid', { name: /março 2026/i })).toBeVisible();
    // O foco começa no dia selecionado; a seta move um dia.
    await userEvent.keyboard('{ArrowRight}{Enter}');
    await expect(args.aoMudar).toHaveBeenCalledWith('2026-03-03');
  },
};
export const ComErro: Story = { args: { erro: 'Informe a data.', obrigatorio: true } };
export const Desabilitado: Story = { args: { valor: '2026-12-21', desabilitado: true } };
