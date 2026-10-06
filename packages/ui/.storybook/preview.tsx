import '../src/estilos.css';

import { definirTema } from '../src/tema.js';

import type { Preview } from '@storybook/react-vite';

const preview: Preview = {
  globalTypes: {
    tema: {
      description: 'Tema de cores',
      toolbar: {
        icon: 'mirror',
        items: [
          { value: 'claro', title: 'Claro' },
          { value: 'escuro', title: 'Escuro' },
        ],
      },
    },
  },
  initialGlobals: { tema: 'claro' },
  decorators: [
    (Story, { globals }) => {
      definirTema(globals.tema === 'escuro' ? 'escuro' : 'claro');
      return <Story />;
    },
  ],
  // Violação de acessibilidade (axe) é erro, não aviso (WCAG 2.1 AA, CLAUDE.md seção 13).
  parameters: { a11y: { test: 'error' }, layout: 'padded' },
};

export default preview;
