import { FixedClock, Instant } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { Advogado, MAXIMO_DE_OABS } from './advogado.js';
import { Celular, Cpf, NumeroOab } from './valores.js';

import type { DadosDoCadastro } from './advogado.js';
import type { Uuid } from '@pz/kernel';

// Dados FICTÍCIOS (CPF gerado, OABs inventadas).
const relogio = () => new FixedClock(Instant.deEpochMs(Date.UTC(2026, 9, 7, 12)));
const exigir = <T>(r: { ok: true; valor: T } | { ok: false; erro: unknown }): T => {
  if (!r.ok) throw r.erro as Error;
  return r.valor;
};
const TENANT = '0199a000-0000-7000-8000-0000000000a1' as Uuid;
const USUARIO = '0199a000-0000-7000-8000-0000000000b1' as Uuid;
const dados = (parcial: Partial<DadosDoCadastro> = {}): DadosDoCadastro => ({
  tenantId: TENANT,
  usuarioId: USUARIO,
  nome: 'Pessoa Fictícia',
  cpf: exigir(Cpf.de('52998224725')),
  celular: exigir(Celular.de('11987654321')),
  emailsAdicionais: [],
  oabPrincipal: { numero: exigir(NumeroOab.de('123456')), uf: 'SP' },
  oabsSuplementares: [{ numero: exigir(NumeroOab.de('9876')), uf: 'RJ' }],
  ...parcial,
});

describe('Advogado (HU11)', () => {
  it('cadastro emite AdvogadoCadastrado e uma OabAdicionada por inscrição', () => {
    const advogado = exigir(Advogado.cadastrar(dados(), relogio()));
    expect(advogado.estado.oabs.map((o) => [o.numero, o.uf, o.tipo])).toEqual([
      ['123456', 'SP', 'principal'],
      ['9876', 'RJ', 'suplementar'],
    ]);
    const eventos = advogado.retirarEventos();
    expect(eventos.map((e) => e.tipo)).toEqual([
      'AdvogadoCadastrado',
      'OabAdicionada',
      'OabAdicionada',
    ]);
    expect(eventos.every((e) => e.tenantId === TENANT)).toBe(true);
  });

  it('recusa a mesma OAB duas vezes no mesmo cadastro', () => {
    const repetida = Advogado.cadastrar(
      dados({ oabsSuplementares: [{ numero: exigir(NumeroOab.de('123456')), uf: 'SP' }] }),
      relogio(),
    );
    expect(!repetida.ok && repetida.erro.codigo).toBe('oab-repetida');
  });

  it('adiciona e remove suplementar; a principal não sai', () => {
    const advogado = exigir(Advogado.cadastrar(dados({ oabsSuplementares: [] }), relogio()));
    advogado.retirarEventos();
    const nova = exigir(advogado.adicionarOab(exigir(NumeroOab.de('555')), 'MG'));
    const principal = advogado.estado.oabs.find((o) => o.tipo === 'principal');
    const semPrincipal = advogado.removerOab(principal?.id ?? ('' as Uuid));
    expect(!semPrincipal.ok && semPrincipal.erro.codigo).toBe('oab-principal');
    const removida = exigir(advogado.removerOab(nova.id));
    expect(removida.ativa).toBe(false);
    expect(removida.removidaEm).toBeDefined();
    const inexistente = advogado.removerOab(nova.id);
    expect(!inexistente.ok && inexistente.erro.codigo).toBe('oab-nao-encontrada');
    expect(advogado.retirarEventos().map((e) => e.tipo)).toEqual(['OabAdicionada', 'OabRemovida']);
    // Removida, a mesma inscrição pode voltar.
    expect(advogado.adicionarOab(exigir(NumeroOab.de('555')), 'MG').ok).toBe(true);
  });

  it('limita o número de inscrições ativas', () => {
    const advogado = exigir(Advogado.cadastrar(dados({ oabsSuplementares: [] }), relogio()));
    for (let i = 1; i < MAXIMO_DE_OABS; i++)
      exigir(advogado.adicionarOab(exigir(NumeroOab.de(String(i))), 'SP'));
    const excedente = advogado.adicionarOab(exigir(NumeroOab.de('99999')), 'SP');
    expect(!excedente.ok && excedente.erro.codigo).toBe('limite-de-oabs');
  });

  it('atualiza só os campos informados do perfil', () => {
    const advogado = exigir(Advogado.cadastrar(dados(), relogio()));
    advogado.atualizarPerfil({ celular: exigir(Celular.de('21998765432')) });
    expect(advogado.estado).toMatchObject({ nome: 'Pessoa Fictícia', celular: '21998765432' });
    advogado.atualizarPerfil({ nome: 'Outro Nome', emailsAdicionais: ['copia@exemplo.com'] });
    expect(advogado.estado).toMatchObject({
      nome: 'Outro Nome',
      emailsAdicionais: ['copia@exemplo.com'],
    });
    const restaurado = Advogado.restaurar(advogado.estado, relogio());
    expect(restaurado.estado).toEqual(advogado.estado);
  });
});
