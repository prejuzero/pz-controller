import { createHash } from 'node:crypto';

import { SystemClock } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { definirDescritor } from '../descritor.js';
import { ErroLimiteExcedido, ErroPermanente, ErroTransitorio } from '../erros.js';
import { PublicacaoCapturada } from '../portas/fonte-publicacoes.js';
import { RegistroDeAdaptadores } from '../registro.js';

import type { JanelaDeBusca, NumeroCnj, Oab } from '../canonicos.js';
import type { DescritorAdaptador } from '../descritor.js';
import type { FontePublicacoes } from '../portas/fonte-publicacoes.js';

export interface CenarioFontePublicacoes {
  readonly descritor: DescritorAdaptador;
  /** Adaptador contra o provedor local ou as fixtures gravadas (sem rede externa no CI). */
  criar(): FontePublicacoes;
  /** Provedor fora do ar (ex.: porta sem nada escutando). */
  criarInalcancavel(): FontePublicacoes;
  /** Provedor recusando por cota (HTTP 429 ou equivalente). */
  criarComLimiteExcedido(): FontePublicacoes;
  /** Provedor devolvendo corpo fora do formato esperado. */
  criarComRespostaInvalida(): FontePublicacoes;
  /** OAB e processo com publicações na janela, segundo as fixtures. */
  readonly oab: Oab;
  readonly numeroCnj: NumeroCnj;
  readonly janela: JanelaDeBusca;
}

const sha256 = (texto: string) => createHash('sha256').update(texto, 'utf8').digest('hex');

/**
 * Kit de contrato da porta `FontePublicacoes` (HU17, ADR-005/014): todo adaptador de fonte de
 * publicações chama esta suíte e só entra se passar.
 */
export function verificarContratoFontePublicacoes(
  nome: string,
  cenario: CenarioFontePublicacoes,
): void {
  describe(`contrato FontePublicacoes: ${nome}`, () => {
    it('por OAB: modelo canônico, destinatário buscado e hash do teor', async () => {
      const publicacoes = await cenario.criar().buscarPorOab(cenario.oab, cenario.janela);
      expect(publicacoes.length).toBeGreaterThan(0);
      for (const publicacao of publicacoes) {
        expect(PublicacaoCapturada.parse(publicacao)).toBeDefined();
        expect(publicacao.fonte).toBe(cenario.descritor.id);
        expect(publicacao.destinatarios).toContainEqual({ oab: cenario.oab });
        expect(publicacao.hashConteudo).toBe(sha256(publicacao.teor));
        expect(new URL(publicacao.urlFonte).protocol).toBe('https:');
        expect(publicacao.dataDisponibilizacao.ehAntesDe(cenario.janela.inicio)).toBe(false);
        expect(publicacao.dataDisponibilizacao.ehDepoisDe(cenario.janela.fim)).toBe(false);
      }
    });

    it('por processo: só publicações do número pedido', async () => {
      const publicacoes = await cenario
        .criar()
        .buscarPorProcesso(cenario.numeroCnj, cenario.janela);
      expect(publicacoes.length).toBeGreaterThan(0);
      for (const publicacao of publicacoes) {
        expect(PublicacaoCapturada.parse(publicacao).numeroCnj).toBe(cenario.numeroCnj);
      }
    });

    it('idempotente: repetir a busca devolve os mesmos ids e hashes, sem repetição', async () => {
      const fonte = cenario.criar();
      const chaves = async () =>
        (await fonte.buscarPorOab(cenario.oab, cenario.janela))
          .map((p) => `${p.idExterno}:${p.hashConteudo}`)
          .sort();
      const primeira = await chaves();
      expect(await chaves()).toEqual(primeira);
      expect(new Set(primeira).size).toBe(primeira.length);
    });

    it('classifica os erros: inalcançável, cota e resposta fora do formato', async () => {
      await expect(
        cenario.criarInalcancavel().buscarPorOab(cenario.oab, cenario.janela),
      ).rejects.toBeInstanceOf(ErroTransitorio);
      await expect(
        cenario.criarComLimiteExcedido().buscarPorOab(cenario.oab, cenario.janela),
      ).rejects.toBeInstanceOf(ErroLimiteExcedido);
      await expect(
        cenario.criarComRespostaInvalida().buscarPorProcesso(cenario.numeroCnj, cenario.janela),
      ).rejects.toBeInstanceOf(ErroPermanente);
    });

    it('saúde: operacional no ar, indisponível fora do ar', async () => {
      expect((await cenario.criar().saude()).estado).toBe('operacional');
      expect((await cenario.criarInalcancavel().saude()).estado).toBe('indisponivel');
    });

    it('funciona pelo registro, com resiliência e validação da saída', async () => {
      const registro = new RegistroDeAdaptadores(
        { padrao: { 'fonte-publicacoes': cenario.descritor.id } },
        { relogio: new SystemClock() },
      );
      registro.registrar(
        definirDescritor({ ...cenario.descritor, porta: 'fonte-publicacoes' }),
        () => cenario.criar(),
      );
      registro.validar();
      const fonte = registro.obter('fonte-publicacoes', '01a10e00-0000-7000-8000-000000000001');
      expect((await fonte.buscarPorOab(cenario.oab, cenario.janela)).length).toBeGreaterThan(0);
      expect(registro.situacao()).toEqual([
        expect.objectContaining({ adaptador: cenario.descritor.id, estado: 'operacional' }),
      ]);
    });
  });
}
