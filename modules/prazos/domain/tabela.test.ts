import { LocalDate } from '@pz/kernel';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { ANA, aprovada, BETO, conteudo, relogio } from '../teste/ficticios.js';

import { selecionarVigente, VersaoDaTabela } from './tabela.js';

describe('VersaoDaTabela (HU15)', () => {
  it('nasce rascunho, com o proponente registrado', () => {
    const r = VersaoDaTabela.propor(conteudo(), 1, ANA, relogio());
    expect(r.ok && r.valor.estado).toMatchObject({
      status: 'rascunho',
      propostoPor: ANA.usuarioId,
      versao: 1,
    });
  });

  it.each([
    ['tipoAto', { tipoAto: 'Ato Inválido' }],
    ['dias', { dias: 0 }],
    ['dias', { dias: 1.5 }],
    ['fundamento', { fundamento: '  ' }],
    ['fonteUrl', { fonteUrl: 'http://exemplo.invalid' }],
    ['vigenciaFim', { vigenciaFim: LocalDate.de(2019, 12, 31) }],
  ])('recusa conteúdo inválido em %s', (campo, parcial) => {
    const r = VersaoDaTabela.propor(conteudo(parcial), 1, ANA, relogio());
    expect(!r.ok && r.erro.problemas.map((p) => p.campo)).toEqual([campo]);
  });

  it('quatro olhos: o próprio proponente não aprova', () => {
    const r = VersaoDaTabela.propor(conteudo(), 1, ANA, relogio());
    if (!r.ok) throw r.erro;
    const aprovacao = r.valor.aprovar(ANA, relogio());
    expect(!aprovacao.ok && aprovacao.erro.codigo).toBe('aprovacao-pelo-proponente');
    expect(r.valor.estado.status).toBe('rascunho');
    expect(r.valor.eventosPendentes()).toEqual([]);
  });

  it('aprovada por outra pessoa, emite TabelaPrazoAprovada no tenant do aprovador', () => {
    const r = VersaoDaTabela.propor(conteudo(), 3, ANA, relogio());
    if (!r.ok) throw r.erro;
    expect(r.valor.aprovar(BETO, relogio()).ok).toBe(true);
    expect(r.valor.estado).toMatchObject({ status: 'aprovado', aprovadoPor: BETO.usuarioId });
    const [evento] = r.valor.retirarEventos();
    expect(evento).toMatchObject({
      tipo: 'TabelaPrazoAprovada',
      tenantId: BETO.tenantId,
      payload: {
        versao: '3',
        tipoAto: 'ato-ficticio',
        ramo: 'civel',
        vigenciaInicio: '2020-01-01',
      },
    });
  });

  it('versão aprovada não é aprovada de novo', () => {
    const versao = aprovada();
    const r = versao.aprovar(BETO, relogio());
    expect(!r.ok && r.erro.codigo).toBe('versao-ja-aprovada');
  });
});

describe('selecionarVigente (HU15, CPC, art. 14)', () => {
  const v1 = aprovada({ dias: 7, vigenciaInicio: LocalDate.de(2020, 1, 1) }, 1);
  const v2 = aprovada({ dias: 9, vigenciaInicio: LocalDate.de(2024, 3, 1) }, 2);

  it('ato antes e depois de uma alteração usa versões diferentes', () => {
    expect(selecionarVigente([v1, v2], LocalDate.de(2024, 2, 29))).toBe(v1);
    expect(selecionarVigente([v1, v2], LocalDate.de(2024, 3, 1))).toBe(v2);
  });

  it('ato antes de qualquer vigência ou depois do fim não tem versão', () => {
    const encerrada = aprovada({ vigenciaFim: LocalDate.de(2021, 12, 31) });
    expect(selecionarVigente([v1], LocalDate.de(2019, 12, 31))).toBeUndefined();
    expect(selecionarVigente([encerrada], LocalDate.de(2021, 12, 31))).toBe(encerrada);
    expect(selecionarVigente([encerrada], LocalDate.de(2022, 1, 1))).toBeUndefined();
  });

  it('rascunho nunca é aplicado', () => {
    const r = VersaoDaTabela.propor(
      conteudo({ vigenciaInicio: LocalDate.de(2025, 1, 1) }),
      3,
      ANA,
      relogio(),
    );
    if (!r.ok) throw r.erro;
    expect(selecionarVigente([v1, r.valor], LocalDate.de(2026, 1, 1))).toBe(v1);
  });

  it('mesmo início de vigência: vale a versão mais nova (correção do curador)', () => {
    const correcao = aprovada({ dias: 8, vigenciaInicio: LocalDate.de(2020, 1, 1) }, 3);
    expect(selecionarVigente([correcao, v1], LocalDate.de(2021, 1, 1))).toBe(correcao);
    expect(selecionarVigente([v1, correcao], LocalDate.de(2021, 1, 1))).toBe(correcao);
  });

  it('propriedade: a escolhida é aprovada, vige na data e nenhuma outra vigente é mais recente', () => {
    const data = fc
      .tuple(
        fc.integer({ min: 2000, max: 2040 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 28 }),
      )
      .map(([a, m, d]) => LocalDate.de(a, m, d));
    const versao = fc.record({
      inicio: data,
      duracao: fc.option(fc.integer({ min: 0, max: 5000 })),
      aprovar: fc.boolean(),
    });
    fc.assert(
      fc.property(fc.array(versao, { maxLength: 8 }), data, (specs, dataDoAto) => {
        const versoes = specs.map((s, i) => {
          const parcial = {
            vigenciaInicio: s.inicio,
            ...(s.duracao === null ? {} : { vigenciaFim: s.inicio.maisDias(s.duracao) }),
          };
          if (s.aprovar) return aprovada(parcial, i + 1);
          const r = VersaoDaTabela.propor(conteudo(parcial), i + 1, ANA, relogio());
          if (!r.ok) throw r.erro;
          return r.valor;
        });
        const escolhida = selecionarVigente(versoes, dataDoAto);
        const vigentes = versoes.filter(
          (v) => v.estado.status === 'aprovado' && v.vigeEm(dataDoAto),
        );
        if (escolhida === undefined) return vigentes.length === 0;
        return (
          vigentes.includes(escolhida) &&
          vigentes.every(
            (v) =>
              v.estado.vigenciaInicio.comparar(escolhida.estado.vigenciaInicio) < 0 ||
              (v.estado.vigenciaInicio.igual(escolhida.estado.vigenciaInicio) &&
                v.estado.versao <= escolhida.estado.versao),
          )
        );
      }),
    );
  });
});
