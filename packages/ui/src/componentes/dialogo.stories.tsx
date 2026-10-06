import { expect, screen, userEvent } from 'storybook/test';

import { Botao } from './botao.js';
import { Dialogo, FecharDialogo } from './dialogo.js';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  title: 'Componentes/Diálogo',
  component: Dialogo,
  args: {
    titulo: 'Confirmar prazo',
    descricao: 'O vencimento sugerido passa a valer após a sua confirmação.',
    gatilho: <Botao>Abrir</Botao>,
    acoes: (
      <>
        <FecharDialogo asChild>
          <Botao variante="secundaria">Cancelar</Botao>
        </FecharDialogo>
        <Botao>Confirmar</Botao>
      </>
    ),
  },
} satisfies Meta<typeof Dialogo>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Padrao: Story = {
  play: async ({ canvas }) => {
    const gatilho = canvas.getByRole('button', { name: 'Abrir' });
    gatilho.focus();
    await userEvent.keyboard('{Enter}');
    const dialogo = await screen.findByRole('dialog', { name: 'Confirmar prazo' });
    await expect(dialogo).toHaveAccessibleDescription(/após a sua confirmação/);
    await userEvent.keyboard('{Escape}');
    await expect(screen.queryByRole('dialog')).toBeNull();
    await expect(gatilho).toHaveFocus();
  },
};
export const Aberto: Story = {
  args: {
    aberto: true,
    descricao: undefined,
    children: <p className="text-sm">Conteúdo livre do diálogo.</p>,
  },
};
