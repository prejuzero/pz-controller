import { expect, fn, userEvent } from 'storybook/test';

import { Botao } from './botao.js';
import { EstadoCarregando, Esqueleto } from './esqueleto.js';
import { EstadoErro, EstadoSemPermissao, EstadoVazio } from './estados.js';

import type { Meta, StoryObj } from '@storybook/react-vite';

/**
 * Padrões de estado de qualquer tela que busca dados. Toda consulta mostra exatamente um destes:
 *
 * - **Carregando** (`EstadoCarregando`): esqueletos no formato do conteúdo; anúncio único para
 *   leitores de tela. Nunca uma tela em branco.
 * - **Vazio** (`EstadoVazio`): diz por que não há nada e oferece o próximo passo.
 * - **Erro** (`EstadoErro`): diz que falhou e permite tentar de novo; nada falha em silêncio.
 * - **Sem permissão** (`EstadoSemPermissao`): resposta 403; explica a quem pedir acesso.
 */
const meta = {
  title: 'Padrões/Estados',
  component: EstadoVazio,
  tags: ['autodocs'],
} satisfies Meta<typeof EstadoVazio>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Carregando: Story = {
  render: () => <EstadoCarregando />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent('Carregando…');
  },
};
export const EsqueletoAvulso: Story = { render: () => <Esqueleto className="h-24 w-64" /> };
export const Vazio: Story = {
  args: {
    titulo: 'Nenhuma OAB cadastrada',
    descricao: 'Cadastre sua OAB para começarmos a captar suas intimações.',
    acao: <Botao>Cadastrar OAB</Botao>,
  },
};
export const VazioPadrao: Story = {};
export const Erro: Story = {
  render: () => <EstadoErro aoTentarNovamente={fn()} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('alert')).toHaveTextContent('Não foi possível carregar');
    await userEvent.click(canvas.getByRole('button', { name: 'Tentar novamente' }));
  },
};
export const ErroSemNovaTentativa: Story = {
  render: () => <EstadoErro titulo="Falha na captura do DJEN" />,
};
export const SemPermissao: Story = { render: () => <EstadoSemPermissao /> };
