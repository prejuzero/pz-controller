import { expect, fn, userEvent } from 'storybook/test';

import { EtiquetaRemovivel } from './etiqueta-removivel.js';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  title: 'Componentes/Etiqueta removível',
  component: EtiquetaRemovivel,
  args: { rotulo: 'TJSP', aoRemover: fn() },
} satisfies Meta<typeof EtiquetaRemovivel>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Padrao: Story = {
  play: async ({ canvas, args }) => {
    await userEvent.tab();
    await expect(canvas.getByRole('button', { name: 'Remover TJSP' })).toHaveFocus();
    await userEvent.keyboard(' ');
    await expect(args.aoRemover).toHaveBeenCalledOnce();
  },
};
export const RotuloProprio: Story = {
  args: { rotulo: 'Cível', rotuloRemover: 'Tirar o filtro Cível' },
};
