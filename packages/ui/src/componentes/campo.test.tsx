import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';

import { Campo } from './campo.js';

describe('Campo de senha', () => {
  it('o olho mostra e oculta o que foi digitado, sem enviar o formulário', async () => {
    let enviados = 0;
    const tela = await render(
      <form
        onSubmit={(evento) => {
          evento.preventDefault();
          enviados += 1;
        }}
      >
        <Campo rotulo="Senha" type="password" defaultValue="segredo fictício" />
      </form>,
    );
    const campo = tela.getByLabelText('Senha', { exact: true });
    await expect.element(campo).toHaveAttribute('type', 'password');
    const mostrar = tela.getByRole('button', { name: 'Mostrar senha' });
    await expect.element(mostrar).toHaveAttribute('aria-pressed', 'false');
    await mostrar.click();
    await expect.element(campo).toHaveAttribute('type', 'text');
    const ocultar = tela.getByRole('button', { name: 'Ocultar senha' });
    await expect.element(ocultar).toHaveAttribute('aria-pressed', 'true');
    await ocultar.click();
    await expect.element(campo).toHaveAttribute('type', 'password');
    expect(enviados).toBe(0);
  });

  it('campo comum não tem o botão', async () => {
    const tela = await render(<Campo rotulo="Nome" />);
    expect(tela.container.querySelector('button')).toBeNull();
  });
});
