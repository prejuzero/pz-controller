import { SystemClock } from '@pz/kernel';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { definirDescritor } from '../descritor.js';
import {
  ErroCredencialInvalida,
  ErroLimiteExcedido,
  ErroSaidaInvalida,
  ErroTransitorio,
} from '../erros.js';
import { RegistroDeAdaptadores } from '../registro.js';

import type { DescritorAdaptador } from '../descritor.js';
import type { OpcoesIA, PromptIA, ProvedorIA } from '../portas/provedor-ia.js';

export interface CenarioIA {
  readonly descritor: DescritorAdaptador;
  /** Adaptador contra o provedor local ou as fixtures (sem rede externa no CI). */
  criar(): ProvedorIA;
  /** Provedor fora do ar (porta sem nada escutando). */
  criarInalcancavel(): ProvedorIA;
  criarComLimiteExcedido(): ProvedorIA;
  criarComCredencialInvalida(): ProvedorIA;
  /** Provedor respondendo fora do schema pedido. */
  criarComSaidaInvalida(): ProvedorIA;
  readonly opcoes: OpcoesIA;
}

/** Saída de exemplo do kit: sem campo de data (ADR-008). */
export const SaidaDoContrato = z.object({
  tipoAto: z.string().min(1),
  confianca: z.number().min(0).max(1),
});

export const PROMPT_DO_CONTRATO: PromptIA = {
  versao: 'contrato-1',
  sistema: 'Classifique o ato do texto fictício.',
  mensagens: [{ papel: 'usuario', conteudo: 'Texto FICTÍCIO: cite-se o réu.' }],
};

/**
 * Kit de contrato da porta `ProvedorIA` (HU21, ADR-005/016): todo adaptador de IA chama esta
 * suíte e só entra se passar.
 */
export function verificarContratoIa(nome: string, cenario: CenarioIA): void {
  describe(`contrato ProvedorIA: ${nome}`, () => {
    it('saída estruturada validada pelo schema, com modelo e uso de tokens', async () => {
      const r = await cenario
        .criar()
        .gerarEstruturado(PROMPT_DO_CONTRATO, SaidaDoContrato, cenario.opcoes);
      expect(SaidaDoContrato.parse(r.saida)).toEqual(r.saida);
      expect(r.modelo.length).toBeGreaterThan(0);
      expect(r.uso.tokensEntrada).toBeGreaterThan(0);
      expect(r.uso.tokensSaida).toBeGreaterThan(0);
      expect(r.uso.tokensCacheLidos).toBeGreaterThanOrEqual(0);
    });

    it('saída fora do schema vira erro tipado, nunca dado', async () => {
      await expect(
        cenario
          .criarComSaidaInvalida()
          .gerarEstruturado(PROMPT_DO_CONTRATO, SaidaDoContrato, cenario.opcoes),
      ).rejects.toBeInstanceOf(ErroSaidaInvalida);
    });

    it('classifica os erros: inalcançável, cota e credencial', async () => {
      const gerar = (provedor: ProvedorIA) =>
        provedor.gerarEstruturado(PROMPT_DO_CONTRATO, SaidaDoContrato, cenario.opcoes);
      await expect(gerar(cenario.criarInalcancavel())).rejects.toBeInstanceOf(ErroTransitorio);
      await expect(gerar(cenario.criarComLimiteExcedido())).rejects.toBeInstanceOf(
        ErroLimiteExcedido,
      );
      await expect(gerar(cenario.criarComCredencialInvalida())).rejects.toBeInstanceOf(
        ErroCredencialInvalida,
      );
    });

    it('saúde: operacional no ar, indisponível fora do ar', async () => {
      expect((await cenario.criar().saude()).estado).toBe('operacional');
      expect((await cenario.criarInalcancavel().saude()).estado).toBe('indisponivel');
    });

    it('funciona pelo registro, com resiliência e saúde', async () => {
      const registro = new RegistroDeAdaptadores(
        { padrao: { 'provedor-ia': cenario.descritor.id } },
        { relogio: new SystemClock() },
      );
      registro.registrar(definirDescritor({ ...cenario.descritor, porta: 'provedor-ia' }), () =>
        cenario.criar(),
      );
      registro.validar();
      const r = await registro
        .obter('provedor-ia')
        .gerarEstruturado(PROMPT_DO_CONTRATO, SaidaDoContrato, cenario.opcoes);
      expect(r.saida.tipoAto.length).toBeGreaterThan(0);
      expect(registro.situacao()).toEqual([
        expect.objectContaining({ adaptador: cenario.descritor.id, estado: 'operacional' }),
      ]);
    });
  });
}
