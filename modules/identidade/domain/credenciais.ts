import { err, ok, Validacao } from '@pz/kernel';

import type { Result } from '@pz/kernel';

/** E-mail normalizado (sem espaços, minúsculo): único no sistema e chave do login. */
export type Email = string & { readonly __marca: 'Email' };

const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizarEmail(texto: string): Result<Email, Validacao> {
  const email = texto.trim().toLowerCase();
  if (email.length > 254 || !FORMATO_EMAIL.test(email)) {
    return err(new Validacao([{ campo: 'email', mensagem: 'E-mail inválido.' }]));
  }
  return ok(email as Email);
}

/**
 * Política de senha (OWASP ASVS 4.0, V2.1): de 12 a 128 caracteres, sem regras de composição
 * nem troca periódica; espaços e qualquer caractere Unicode são aceitos.
 */
export const SENHA_MINIMO = 12;
export const SENHA_MAXIMO = 128;

const segmentador = new Intl.Segmenter('pt-BR', { granularity: 'grapheme' });

/** Caracteres como o usuário os vê (grafemas): um emoji composto conta como um. */
export function contarCaracteres(texto: string): number {
  return Array.from(segmentador.segment(texto)).length;
}

export function validarNovaSenha(senha: string): Result<string, Validacao> {
  const tamanho = contarCaracteres(senha);
  if (tamanho < SENHA_MINIMO || tamanho > SENHA_MAXIMO) {
    return err(
      new Validacao([
        {
          campo: 'senha',
          mensagem: `A senha deve ter de ${String(SENHA_MINIMO)} a ${String(SENHA_MAXIMO)} caracteres.`,
        },
      ]),
    );
  }
  return ok(senha);
}
