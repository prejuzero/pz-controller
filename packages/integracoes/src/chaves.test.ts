import { createCipheriv, randomBytes } from 'node:crypto';

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { CifraVersionada, indiceCego, protecaoDeCampos, ProvedorChavesLocal } from './chaves.js';

const chave = () => randomBytes(32).toString('base64');

/** Formato v1 de antes (AES-GCM com a chave da aplicação direta). */
function cifrarV1(chaveBase64: string, texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', Buffer.from(chaveBase64, 'base64'), iv, {
    authTagLength: 16,
  });
  const dados = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return ['v1', iv, c.getAuthTag(), dados]
    .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
    .join('.');
}

describe('chaves de dados e cifra versionada (HU37, PZ-219)', () => {
  it('propriedade: decifrar(cifrar(x)) = x, com IV novo a cada vez', () => {
    const cifra = new CifraVersionada(new ProvedorChavesLocal(chave()));
    fc.assert(
      fc.property(fc.string(), (texto) => {
        const a = cifra.cifrar(texto);
        expect(cifra.decifrar(a)).toBe(texto);
        expect(cifra.cifrar(texto)).not.toBe(a);
      }),
    );
  });

  it('o texto cifrado não contém o original e leva o id da chave', () => {
    const cifra = new CifraVersionada(new ProvedorChavesLocal(chave()));
    const c = cifra.cifrar('12345678909');
    expect(c).toMatch(/^v2\.l1\./);
    expect(c).not.toContain('12345678909');
  });

  it('rotação: a nova chave cifra, a antiga ainda decifra e o dado antigo pede recifra', () => {
    const mestra = chave();
    const [antiga, nova] = [chave(), chave()];
    const antes = new CifraVersionada(new ProvedorChavesLocal(mestra, `k1:${antiga}`));
    const depois = new CifraVersionada(new ProvedorChavesLocal(mestra, `k2:${nova}, k1:${antiga}`));
    const velho = antes.cifrar('segredo');
    expect(depois.decifrar(velho)).toBe('segredo');
    expect(depois.precisaRecifrar(velho)).toBe(true);
    const recifrado = depois.cifrar(depois.decifrar(velho));
    expect(depois.chaveDe(recifrado)).toBe('k2');
    expect(depois.precisaRecifrar(recifrado)).toBe(false);
    // Sem a chave antiga, o dado não abre.
    expect(() =>
      new CifraVersionada(new ProvedorChavesLocal(mestra, `k2:${nova}`)).decifrar(velho),
    ).toThrow(/desconhecida/);
  });

  it('lê o formato v1 com a chave legada; adulteração e formato estranho falham', () => {
    const mestra = chave();
    const cifra = new CifraVersionada(new ProvedorChavesLocal(mestra), mestra);
    const v1 = cifrarV1(mestra, 'JBSWY3DPEHPK3PXP');
    expect(cifra.decifrar(v1)).toBe('JBSWY3DPEHPK3PXP');
    expect(cifra.chaveDe(v1)).toBe('legada');
    const v2 = cifra.cifrar('x');
    // Trocar o id (dado autenticado) invalida a tag.
    expect(() => cifra.decifrar(v2.replace('.l1.', '.l2.'))).toThrow();
    expect(() => cifra.decifrar('v3.a.b.c')).toThrow(/desconhecido/);
    expect(() => new CifraVersionada(new ProvedorChavesLocal(mestra)).decifrar(v1)).toThrow(
      /desconhecido/,
    );
  });

  it('índice cego: determinístico, sem o original e dependente da chave mestra', () => {
    const mestra = chave();
    const a = indiceCego(new ProvedorChavesLocal(mestra), '12345678909');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(indiceCego(new ProvedorChavesLocal(mestra, `x1:${chave()}`), '12345678909')).toBe(a);
    expect(indiceCego(new ProvedorChavesLocal(chave()), '12345678909')).not.toBe(a);
  });

  it('configuração inválida não sobe', () => {
    expect(() => new ProvedorChavesLocal('curta')).toThrow(/32 bytes/);
    expect(() => new ProvedorChavesLocal(chave(), 'semid')).toThrow(/id:base64/);
    expect(() => new ProvedorChavesLocal(chave(), `A:${chave()}`)).toThrow(/id:base64/);
    expect(() => new ProvedorChavesLocal(chave(), `k1:${chave()},k1:${chave()}`)).toThrow(
      /repetidos/,
    );
    expect(() => new ProvedorChavesLocal(chave(), 'k1:curta')).toThrow(/32 bytes/);
    expect(new ProvedorChavesLocal(chave(), ' , ').ativa().id).toBe('l1');
  });

  it('proteção de campos junta cifra, índice e recifra', () => {
    const mestra = chave();
    const p = protecaoDeCampos(new ProvedorChavesLocal(mestra));
    const c = p.cifrar('52998224725');
    expect(p.decifrar(c)).toBe('52998224725');
    expect(p.indice('52998224725')).toBe(
      indiceCego(new ProvedorChavesLocal(mestra), '52998224725'),
    );
    expect(p.precisaRecifrar(c)).toBe(false);
  });
});
