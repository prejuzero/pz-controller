import { verificarContratoFontePublicacoes } from '@pz/integracoes/contrato';
import { LocalDate, SystemClock } from '@pz/kernel';
import { afterAll, beforeAll } from 'vitest';

import { DESCRITOR_DJEN, FontePublicacoesDjen, URL_PADRAO_DJEN } from './fonte-djen.js';
import { subirServidorDeFixtures, type ServidorDeFixtures } from './servidor-de-fixtures.js';

let servidor: ServidorDeFixtures;
beforeAll(async () => {
  servidor = await subirServidorDeFixtures();
});
afterAll(async () => {
  await servidor.encerrar();
});

const criar = (prefixo = '') =>
  new FontePublicacoesDjen({
    relogio: new SystemClock(),
    urlBase: `${servidor.url}${prefixo}`,
    // O servidor local é HTTP; o link da certidão segue o endereço público real.
    urlPublica: URL_PADRAO_DJEN,
    // Página pequena: as fixtures exercitam a paginação.
    itensPorPagina: 2,
  });

verificarContratoFontePublicacoes('DJEN (fixtures gravadas)', {
  descritor: DESCRITOR_DJEN,
  criar: () => criar(),
  criarInalcancavel: () =>
    new FontePublicacoesDjen({ relogio: new SystemClock(), urlBase: 'http://127.0.0.1:1' }),
  criarComLimiteExcedido: () => criar('/limite'),
  criarComRespostaInvalida: () => criar('/invalido'),
  oab: { numero: '123456', uf: 'SP' },
  numeroCnj: '1000004-06.2026.8.26.0100',
  janela: { inicio: LocalDate.de(2026, 10, 1), fim: LocalDate.de(2026, 10, 7) },
});
