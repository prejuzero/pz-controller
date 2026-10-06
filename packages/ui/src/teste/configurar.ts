import { setProjectAnnotations } from '@storybook/react-vite';

import preview from '../../.storybook/preview.js';

// Os testes usam as mesmas decorações e parâmetros do Storybook (tema, CSS global).
setProjectAnnotations(preview);
