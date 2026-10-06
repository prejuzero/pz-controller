import { expect, screen, userEvent, waitFor } from 'storybook/test';

import { Botao } from './botao.js';
import { avisar, Avisos } from './toast.js';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  title: 'Componentes/Toast',
  component: Avisos,
  // O estado dos avisos é global (sonner): cada execução começa sem avisos.
  beforeEach: () => {
    avisar.dispensarTodos();
  },
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Avisos />
      <Botao onClick={() => avisar.sucesso('Prazo confirmado', 'Vencimento em 16/03/2026.')}>
        Sucesso
      </Botao>
      <Botao variante="secundaria" onClick={() => avisar.info('Captura em andamento')}>
        Info
      </Botao>
      <Botao
        variante="secundaria"
        onClick={() => avisar.alerta('Sem regra legal cadastrada para este ato')}
      >
        Alerta
      </Botao>
      <Botao
        variante="perigo"
        onClick={() => avisar.erro('Falha ao enviar e-mail', 'Tentaremos de novo em 5 minutos.')}
      >
        Erro
      </Botao>
    </div>
  ),
} satisfies Meta<typeof Avisos>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Padrao: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Sucesso' }));
    await waitFor(() => expect(screen.getByText('Prazo confirmado')).toBeVisible());
    await userEvent.click(canvas.getByRole('button', { name: 'Erro' }));
    await waitFor(() => expect(screen.getByText('Falha ao enviar e-mail')).toBeVisible());
    await userEvent.click(canvas.getByRole('button', { name: 'Info' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Alerta' }));
    await waitFor(() => expect(screen.getByText('Captura em andamento')).toBeVisible());
  },
};
