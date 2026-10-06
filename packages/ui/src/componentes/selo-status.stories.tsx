import { SeloStatus } from './selo-status.js';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  title: 'Componentes/Selo de status',
  component: SeloStatus,
  args: { tom: 'neutro', children: 'Rascunho' },
} satisfies Meta<typeof SeloStatus>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Todos: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <SeloStatus tom="neutro">Rascunho</SeloStatus>
      <SeloStatus tom="info">Capturada</SeloStatus>
      <SeloStatus tom="sucesso">Confirmado</SeloStatus>
      <SeloStatus tom="alerta">A confirmar</SeloStatus>
      <SeloStatus tom="perigo">Vencido</SeloStatus>
      <SeloStatus tom="ia">Sugerido por IA</SeloStatus>
    </div>
  ),
};
