import { createHash } from 'node:crypto';

import { ErroLimiteExcedido, ErroPermanente, ErroTransitorio } from '@pz/integracoes';
import { FixedClock, Instant, LocalDate } from '@pz/kernel';
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { classificarStatusDjen } from './erros.js';
import { FontePublicacoesDjen, URL_PADRAO_DJEN } from './fonte-djen.js';
import { subirServidorDeFixtures, type ServidorDeFixtures } from './servidor-de-fixtures.js';
import { hashDoTeor, normalizarTeor } from './teor.js';

// Dados FICTÍCIOS (fixtures anonimizadas).
const relogio = new FixedClock(Instant.deIso('2026-10-07T03:00:00Z'));
const janela = { inicio: LocalDate.de(2026, 10, 1), fim: LocalDate.de(2026, 10, 7) };
const OAB = { numero: '123456', uf: 'SP' } as const;

let servidor: ServidorDeFixtures;
beforeAll(async () => {
  servidor = await subirServidorDeFixtures();
});
afterAll(async () => {
  await servidor.encerrar();
});

const fonte = (opcoes: { itensPorPagina?: number; fetch?: typeof fetch } = {}) =>
  new FontePublicacoesDjen({
    relogio,
    urlBase: servidor.url,
    urlPublica: URL_PADRAO_DJEN,
    ...opcoes,
  });

describe('normalizarTeor (HU17)', () => {
  it('remove HTML, decodifica entidades e colapsa espaços e linhas vazias', () => {
    expect(
      normalizarTeor(
        '<p>Processo&nbsp;&nbsp;1</p>\r\n\r\n<br/>  Prazo&#58; 5 dias &amp; &#x41;&eacute;\t fim ',
      ),
    ).toBe('Processo 1\nPrazo: 5 dias & Aé fim');
  });

  it('caracteres especiais: acentos e símbolos por entidade nomeada ou numérica', () => {
    expect(
      normalizarTeor(
        'Cita&ccedil;&atilde;o &Agrave; R&Eacute;: art. 5&ordm;, &sect; 1&ordf; &ndash; &ldquo;prazo&rdquo; &#233; &copy;',
      ),
    ).toBe('Citação À RÉ: art. 5º, § 1ª – “prazo” é &copy;');
  });

  it('propriedade: idempotente e o hash não depende de espaços extras', () => {
    fc.assert(
      fc.property(fc.string(), (texto) => {
        const uma = normalizarTeor(texto);
        expect(normalizarTeor(uma)).toBe(uma);
        expect(hashDoTeor(normalizarTeor(`  ${texto.replaceAll(' ', '   ')}\n\n`))).toBe(
          hashDoTeor(uma),
        );
      }),
    );
  });
});

describe('classificação de erros do DJEN (HU17)', () => {
  it('429 é cota (com Retry-After), 5xx é transitório e 4xx é permanente', () => {
    const cota = classificarStatusDjen(429, '30');
    expect(cota).toBeInstanceOf(ErroLimiteExcedido);
    expect((cota as ErroLimiteExcedido).repetirAposMs).toBe(30_000);
    expect((classificarStatusDjen(429, null) as ErroLimiteExcedido).repetirAposMs).toBeUndefined();
    expect(
      (classificarStatusDjen(429, 'amanhã') as ErroLimiteExcedido).repetirAposMs,
    ).toBeUndefined();
    expect(classificarStatusDjen(503, null)).toBeInstanceOf(ErroTransitorio);
    expect(classificarStatusDjen(400, null)).toBeInstanceOf(ErroPermanente);
    expect(classificarStatusDjen(404, null)).toBeInstanceOf(ErroPermanente);
  });
});

describe('FontePublicacoesDjen (HU17)', () => {
  it('por OAB: pagina, mapeia para o modelo canônico e ignora inscrição fora do padrão', async () => {
    servidor.consultas.length = 0;
    const publicacoes = await fonte({ itensPorPagina: 2 }).buscarPorOab(OAB, janela);
    expect(servidor.consultas.map((q) => [q.get('pagina'), q.get('itensPorPagina')])).toEqual([
      ['1', '2'],
      ['2', '2'],
    ]);
    expect(servidor.consultas[0]?.get('dataDisponibilizacaoInicio')).toBe('2026-10-01');
    expect(servidor.consultas[0]?.get('dataDisponibilizacaoFim')).toBe('2026-10-07');
    expect(publicacoes).toHaveLength(3);
    const [primeira] = publicacoes;
    expect(primeira).toMatchObject({
      fonte: 'djen',
      idExterno: '900000001',
      numeroCnj: '1000001-51.2026.8.26.0100',
      destinatarios: [{ oab: OAB }],
      urlFonte:
        'https://comunicaapi.pje.jus.br/api/v1/comunicacao/FicticioHash000000000000000001/certidao',
    });
    expect(primeira?.dataDisponibilizacao.paraIso()).toBe('2026-10-06');
    expect(primeira?.teor).toBe(
      'FICTÍCIO Processo 1000001-51.2026.8.26.0100\nIntimação de teste 1: manifeste-se a parte autora no prazo legal.& Texto anonimizado.',
    );
    expect(primeira?.hashConteudo).toBe(
      createHash('sha256')
        .update(primeira?.teor ?? '')
        .digest('hex'),
    );
    expect(primeira?.metadados.siglaTribunal).toBe('TJSP');
    expect(primeira?.metadados.linkTribunal).toBe('https://tribunal.exemplo.invalid/expediente/1');
    // O advogado com inscrição suplementar (letra) só aparece nos metadados.
    expect(publicacoes[2]?.destinatarios).toEqual([{ oab: OAB }]);
    expect(publicacoes[2]?.metadados.advogados).toHaveLength(2);
  });

  it('por processo: consulta pelos dígitos do número', async () => {
    servidor.consultas.length = 0;
    const publicacoes = await fonte().buscarPorProcesso('1000004-06.2026.8.26.0100', janela);
    expect(servidor.consultas[0]?.get('numeroProcesso')).toBe('10000040620268260100');
    expect(publicacoes.map((p) => p.numeroCnj)).toEqual([
      '1000004-06.2026.8.26.0100',
      '1000004-06.2026.8.26.0100',
    ]);
  });

  it('sem resultado devolve lista vazia; saúde consulta a data de hoje no fuso de Brasília', async () => {
    servidor.consultas.length = 0;
    expect(await fonte().buscarPorOab({ numero: '1', uf: 'AC' }, janela)).toEqual([]);
    expect(await fonte().saude()).toMatchObject({ estado: 'operacional' });
    expect(servidor.consultas.at(-1)?.get('dataDisponibilizacaoInicio')).toBe('2026-10-07');
  });

  const respondendo =
    (status: number, corpo: unknown, tipo = 'application/json'): typeof fetch =>
    () =>
      Promise.resolve(
        new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo), {
          status,
          headers: { 'content-type': tipo },
        }),
      );
  const item = (parcial: Record<string, unknown>) => ({
    id: 1,
    data_disponibilizacao: '2026-10-06',
    texto: 'FICTÍCIO',
    hash: 'h',
    ...parcial,
  });

  it('corpo fora do formato, não JSON, data inválida ou teor vazio: erro permanente', async () => {
    const casos: [number, unknown][] = [
      [200, 'não é json'],
      [200, { status: 'error', count: 0, items: [] }],
      [
        200,
        { status: 'success', count: 1, items: [item({ data_disponibilizacao: '06/10/2026' })] },
      ],
      [200, { status: 'success', count: 1, items: [item({ texto: '<p> </p>' })] }],
      [404, { message: 'Not Found' }],
    ];
    for (const [status, corpo] of casos) {
      await expect(
        fonte({ fetch: respondendo(status, corpo) }).buscarPorOab(OAB, janela),
      ).rejects.toBeInstanceOf(ErroPermanente);
    }
  });

  it('janela grande demais (mais de 100 páginas): pede para dividir, sem truncar em silêncio', async () => {
    const pagina: typeof fetch = () =>
      Promise.resolve(
        Response.json({
          status: 'success',
          count: 1_000_000,
          items: [item({ id: Math.random() })],
        }),
      );
    await expect(
      fonte({ itensPorPagina: 1, fetch: pagina }).buscarPorOab(OAB, janela),
    ).rejects.toThrow(/divida a janela/);
  });

  it('saúde: cota é degradado; falha de rede é indisponível', async () => {
    expect(await fonte({ fetch: respondendo(429, {}) }).saude()).toMatchObject({
      estado: 'degradado',
    });
    const semRede: typeof fetch = () => Promise.reject(new TypeError('fetch failed'));
    expect(await fonte({ fetch: semRede }).saude()).toMatchObject({ estado: 'indisponivel' });
    await expect(fonte({ fetch: semRede }).buscarPorOab(OAB, janela)).rejects.toBeInstanceOf(
      ErroTransitorio,
    );
  });
});
