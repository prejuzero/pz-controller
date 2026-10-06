import { CalendarClock } from 'lucide-react';

import { CardIndicador } from './card-indicador.js';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  title: 'Componentes/Card de indicador',
  component: CardIndicador,
  args: { titulo: 'Prazos a vencer', valor: 12, descricao: 'nos próximos 5 dias úteis' },
  decorators: [
    (Story) => (
      <div className="max-w-xs">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CardIndicador>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Padrao: Story = {};
export const ComIcone: Story = { args: { icone: <CalendarClock />, descricao: undefined } };
