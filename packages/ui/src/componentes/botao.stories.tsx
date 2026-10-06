import { Plus } from 'lucide-react';
import { expect, fn, userEvent } from 'storybook/test';

import { Botao } from './botao.js';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  title: 'Componentes/Botão',
  component: Botao,
  args: { children: 'Confirmar prazo', onClick: fn() },
} satisfies Meta<typeof Botao>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Primaria: Story = {
  play: async ({ canvas, args }) => {
    await userEvent.tab();
    await expect(canvas.getByRole('button')).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};
export const Secundaria: Story = { args: { variante: 'secundaria', children: 'Cancelar' } };
export const Perigo: Story = { args: { variante: 'perigo', children: 'Excluir OAB' } };
export const Fantasma: Story = { args: { variante: 'fantasma', children: 'Ver detalhes' } };
export const Tamanhos: Story = {
  render: (args) => (
    <div className="flex items-center gap-2">
      <Botao {...args} tamanho="sm" />
      <Botao {...args} tamanho="md" />
      <Botao {...args} tamanho="lg" />
      <Botao {...args} tamanho="icone" aria-label="Adicionar">
        <Plus aria-hidden />
      </Botao>
    </div>
  ),
};
export const Carregando: Story = {
  args: { carregando: true },
  play: async ({ canvas }) => {
    const botao = canvas.getByRole('button');
    await expect(botao).toBeDisabled();
    await expect(botao).toHaveAttribute('aria-busy', 'true');
  },
};
export const ComoLink: Story = {
  args: { asChild: true, variante: 'secundaria', children: <a href="#prazos">Ir para prazos</a> },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: 'Ir para prazos' })).toHaveClass('rounded-md');
  },
};
