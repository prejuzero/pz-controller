import { describe, expect, it } from 'vitest';

import { ErroPermanente, ErroTransitorio } from '../erros.js';
import { ResultadoEnvio } from '../portas/canal-notificacao.js';

import type { DescritorAdaptador } from '../descritor.js';
import type { ProvedorEmail } from '../portas/provedor-email.js';

export interface EmailRecebido {
  readonly para: readonly string[];
  readonly assunto: string;
  readonly html: string;
  readonly texto: string;
}

export interface CenarioEmail {
  readonly descritor: DescritorAdaptador;
  criar(): ProvedorEmail;
  criarInalcancavel(): ProvedorEmail;
  /** Lê o que chegou na caixa de teste (ex.: API do Mailpit) para o assunto informado. */
  recebido(assunto: string): Promise<EmailRecebido | undefined>;
}

/** Kit de contrato da porta `ProvedorEmail` (HU09/HU06): todo provedor de e-mail passa nele. */
export function verificarContratoEmail(nome: string, cenario: CenarioEmail): void {
  describe(`contrato ProvedorEmail: ${nome}`, () => {
    it('entrega HTML e texto puro aos destinatários e devolve o ID do envio', async () => {
      const assunto = `Contrato ${String(Math.random()).slice(2)}`;
      const resultado = await cenario.criar().enviar({
        idempotencia: `contrato-${assunto}`,
        para: ['ana@exemplo.invalid', 'bia@exemplo.invalid'],
        assunto,
        html: '<p>Você tem um <strong>prazo a confirmar</strong>.</p>',
        texto: 'Você tem um prazo a confirmar.',
      });
      expect(ResultadoEnvio.parse(resultado).idExterno.length).toBeGreaterThan(0);
      const recebido = await cenario.recebido(assunto);
      expect(recebido?.assunto).toBe(assunto);
      expect(recebido?.texto).toContain('prazo a confirmar');
      expect(recebido?.html).toContain('<strong>prazo a confirmar</strong>');
      expect([...(recebido?.para ?? [])].sort()).toEqual([
        'ana@exemplo.invalid',
        'bia@exemplo.invalid',
      ]);
    });

    it('recusa e-mail fora do modelo canônico sem enviar', async () => {
      await expect(
        cenario.criar().enviar({
          idempotencia: 'x',
          para: ['nao-e-email'],
          assunto: 'a',
          html: 'b',
          texto: 'c',
        }),
      ).rejects.toBeInstanceOf(ErroPermanente);
    });

    it('provedor fora do ar: erro transitório e saúde indisponível; no ar: operacional', async () => {
      const foraDoAr = cenario.criarInalcancavel();
      await expect(
        foraDoAr.enviar({
          idempotencia: 'y',
          para: ['ana@exemplo.invalid'],
          assunto: 'a',
          html: 'b',
          texto: 'c',
        }),
      ).rejects.toBeInstanceOf(ErroTransitorio);
      expect((await foraDoAr.saude()).estado).toBe('indisponivel');
      expect((await cenario.criar().saude()).estado).toBe('operacional');
    });
  });
}
