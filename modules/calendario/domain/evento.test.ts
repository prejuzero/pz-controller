import { LocalDate } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { ANA, BETO, CAIO, conteudo, relogio } from '../teste/ficticios.js';

import { EventoGlobal, FeriadoLocal, validarConteudo } from './evento.js';

const proposto = () => {
  const r = EventoGlobal.propor(conteudo(), ANA, relogio());
  if (!r.ok) throw r.erro;
  return r.valor;
};

describe('validarConteudo (HU13)', () => {
  it('exige os campos da abrangência e recusa os que não se aplicam', () => {
    expect(validarConteudo(conteudo({ abrangencia: 'comarca', tribunal: 'TJXX' }))).toEqual([
      { campo: 'comarca', mensagem: 'Obrigatório na abrangência comarca.' },
    ]);
    expect(
      validarConteudo(conteudo({ abrangencia: 'municipio', uf: 'XX', tribunal: 'TJXX' })),
    ).toEqual([
      { campo: 'municipioIbge', mensagem: 'Obrigatório na abrangência municipio.' },
      { campo: 'tribunal', mensagem: 'Não se aplica à abrangência municipio.' },
    ]);
    expect(validarConteudo(conteudo({ abrangencia: 'uf', uf: '  ' }))).toHaveLength(1);
  });

  it('exige período em ordem, descrição, ato normativo e link HTTPS oficial', () => {
    const problemas = validarConteudo(
      conteudo({
        inicio: LocalDate.de(2030, 3, 11),
        descricao: ' ',
        atoNormativo: '',
        urlAto: 'http://exemplo.invalid',
      }),
    );
    expect(problemas.map((p) => p.campo)).toEqual(['fim', 'descricao', 'atoNormativo', 'urlAto']);
  });
});

describe('EventoGlobal (HU13)', () => {
  it('nasce rascunho e não vale até ser aprovado', () => {
    const evento = proposto();
    expect(evento.estado.status).toBe('rascunho');
    expect(evento.vigente).toBe(false);
    expect(evento.retirarEventos()).toEqual([]);
    expect(EventoGlobal.propor(conteudo({ descricao: '' }), ANA, relogio()).ok).toBe(false);
  });

  it('quatro olhos: quem propôs não aprova; aprovado emite CalendarioAlterado', () => {
    const evento = proposto();
    const propria = evento.aprovar(ANA, relogio());
    expect(!propria.ok && propria.erro.codigo).toBe('aprovacao-pelo-proponente');
    expect(evento.aprovar(BETO, relogio()).ok).toBe(true);
    expect(evento.vigente).toBe(true);
    const [alterado] = evento.retirarEventos();
    expect(alterado?.tipo).toBe('CalendarioAlterado');
    expect(alterado?.tenantId).toBe(ANA.tenantId);
    expect(alterado?.payload).toEqual({
      eventoId: evento.id,
      origem: 'global',
      acao: 'incluido',
      abrangencia: 'nacional',
      inicio: '2030-03-10',
      fim: '2030-03-10',
      usuarioId: BETO.usuarioId,
    });
    const de_novo = evento.aprovar(ANA, relogio());
    expect(!de_novo.ok && de_novo.erro.codigo).toBe('evento-ja-aprovado');
  });

  it('revoga só o vigente, com motivo, e emite CalendarioAlterado', () => {
    const evento = proposto();
    const rascunho = evento.revogar(BETO, 'motivo suficiente', relogio());
    expect(!rascunho.ok && rascunho.erro.codigo).toBe('evento-nao-vigente');
    evento.aprovar(BETO, relogio());
    evento.retirarEventos();
    expect(evento.revogar(ANA, 'curto', relogio()).ok).toBe(false);
    expect(evento.revogar(ANA, '  ato revogado pelo tribunal  ', relogio()).ok).toBe(true);
    expect(evento.vigente).toBe(false);
    expect(evento.estado.motivoRevogacao).toBe('ato revogado pelo tribunal');
    expect(evento.retirarEventos().map((e) => e.payload.acao)).toEqual(['revogado']);
    expect(evento.revogar(ANA, 'ato revogado pelo tribunal', relogio()).ok).toBe(false);
  });
});

describe('FeriadoLocal (HU13)', () => {
  const local = { abrangencia: 'comarca', tribunal: 'TJXX', comarca: 'Comarca Fictícia' } as const;

  it('o escritório cadastra no próprio tenant, mas nunca no nível nacional', () => {
    const nacional = FeriadoLocal.cadastrar(conteudo(), CAIO, relogio());
    expect(!nacional.ok && nacional.erro.problemas.map((p) => p.campo)).toEqual(['abrangencia']);
    const r = FeriadoLocal.cadastrar(conteudo(local), CAIO, relogio());
    if (!r.ok) throw r.erro;
    expect(r.valor.estado.tenantId).toBe(CAIO.tenantId);
    expect(r.valor.vigente).toBe(true);
    expect(
      r.valor.retirarEventos().map((e) => [e.tipo, e.payload.origem, e.payload.comarca]),
    ).toEqual([['CalendarioAlterado', 'local', 'Comarca Fictícia']]);
  });

  it('revoga uma vez', () => {
    const r = FeriadoLocal.cadastrar(conteudo(local), CAIO, relogio());
    if (!r.ok) throw r.erro;
    r.valor.retirarEventos();
    expect(r.valor.revogar(CAIO, relogio()).ok).toBe(true);
    expect(r.valor.vigente).toBe(false);
    expect(r.valor.retirarEventos().map((e) => e.payload.acao)).toEqual(['revogado']);
    expect(r.valor.revogar(CAIO, relogio()).ok).toBe(false);
  });
});
