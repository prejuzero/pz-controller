import { expect, userEvent } from 'storybook/test';

import { Campo } from './campo.js';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  title: 'Componentes/Campo',
  component: Campo,
  args: { rotulo: 'Número da OAB', placeholder: '123456' },
  decorators: [
    (Story) => (
      <div className="max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Campo>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Padrao: Story = {
  play: async ({ canvas }) => {
    const campo = canvas.getByLabelText('Número da OAB');
    await userEvent.type(campo, '98765');
    await expect(campo).toHaveValue('98765');
  },
};
export const ComAjuda: Story = { args: { ajuda: 'Somente números, sem a UF.', obrigatorio: true } };
export const ComErro: Story = {
  args: { erro: 'Informe o número da OAB.', obrigatorio: true },
  play: async ({ canvas }) => {
    const campo = canvas.getByRole('textbox');
    await expect(campo).toBeInvalid();
    await expect(campo).toHaveAccessibleDescription('Informe o número da OAB.');
  },
};
export const Desabilitado: Story = { args: { disabled: true, value: '123456', readOnly: true } };
