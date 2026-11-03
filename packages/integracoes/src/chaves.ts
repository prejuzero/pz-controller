import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';

import type { ChaveDeDados, ProvedorChaves } from './portas/provedor-chaves.js';

const TAG = 16;
const IV = 12;

function bytes(base64: string, nome: string): Buffer {
  const chave = Buffer.from(base64, 'base64');
  if (chave.length !== 32) throw new Error(`${nome}: a chave deve ter 32 bytes em base64`);
  return chave;
}

const derivar = (mestra: Buffer, rotulo: string) =>
  Buffer.from(hkdfSync('sha256', mestra, Buffer.alloc(0), rotulo, 32));

/**
 * Chaves locais (desenvolvimento, testes e enquanto não há KMS, ADR-021). Sem lista, uma chave de
 * dados derivada da mestra (HKDF). Com `CHAVES_DE_DADOS` ("id:base64,id:base64"), a primeira é a
 * ativa e as demais só decifram (rotação). O índice cego deriva da mestra e não roda.
 */
export class ProvedorChavesLocal implements ProvedorChaves {
  readonly #chaves: readonly ChaveDeDados[];
  readonly #indice: Buffer;

  constructor(mestraBase64: string, lista?: string) {
    const mestra = bytes(mestraBase64, 'CHAVE_CIFRAGEM');
    this.#indice = derivar(mestra, 'pz:indice-cego');
    const itens = (lista ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item !== '');
    this.#chaves =
      itens.length === 0
        ? [{ id: 'l1', chave: derivar(mestra, 'pz:dados:l1') }]
        : itens.map((item) => {
            const separador = item.indexOf(':');
            const id = item.slice(0, separador);
            if (separador <= 0 || !/^[a-z0-9-]{1,20}$/.test(id)) {
              throw new Error('CHAVES_DE_DADOS: use "id:base64", com id de 1 a 20 [a-z0-9-]');
            }
            return { id, chave: bytes(item.slice(separador + 1), `CHAVES_DE_DADOS (${id})`) };
          });
    if (new Set(this.#chaves.map((c) => c.id)).size !== this.#chaves.length) {
      throw new Error('CHAVES_DE_DADOS: ids repetidos');
    }
  }

  ativa(): ChaveDeDados {
    const [ativa] = this.#chaves;
    // O construtor garante ao menos uma chave.
    if (ativa === undefined) throw new Error('sem chave de dados');
    return ativa;
  }

  porId(id: string): ChaveDeDados | undefined {
    return this.#chaves.find((c) => c.id === id);
  }

  indice(): Uint8Array {
    return this.#indice;
  }
}

/**
 * Cifra de campos com chave de dados identificada (AES-256-GCM): `v2.<id>.<iv>.<tag>.<dados>`
 * em base64url. Lê também o formato `v1.<iv>.<tag>.<dados>` de antes (chave da aplicação direta),
 * para os segredos do 2FA gravados até aqui.
 */
export class CifraVersionada {
  readonly #legada: Buffer | undefined;

  constructor(
    private readonly chaves: ProvedorChaves,
    legadaBase64?: string,
  ) {
    this.#legada = legadaBase64 === undefined ? undefined : bytes(legadaBase64, 'CHAVE_CIFRAGEM');
  }

  cifrar(texto: string): string {
    const { id, chave } = this.chaves.ativa();
    const iv = randomBytes(IV);
    const cifrador = createCipheriv('aes-256-gcm', chave, iv, { authTagLength: TAG });
    // O id entra como dado autenticado: trocar o id do texto cifrado invalida a tag.
    cifrador.setAAD(Buffer.from(id));
    const dados = Buffer.concat([cifrador.update(texto, 'utf8'), cifrador.final()]);
    return [
      'v2',
      id,
      ...[iv, cifrador.getAuthTag(), dados].map((p) => p.toString('base64url')),
    ].join('.');
  }

  decifrar(cifrado: string): string {
    const partes = cifrado.split('.');
    if (partes[0] === 'v1' && partes.length === 4 && this.#legada !== undefined) {
      const [, iv, tag, dados] = partes as [string, string, string, string];
      return abrir(this.#legada, iv, tag, dados);
    }
    if (partes[0] === 'v2' && partes.length === 5) {
      const [, id, iv, tag, dados] = partes as [string, string, string, string, string];
      const chave = this.chaves.porId(id);
      if (chave === undefined) throw new Error(`Chave de dados desconhecida: ${id}`);
      return abrir(chave.chave, iv, tag, dados, id);
    }
    throw new Error('Formato cifrado desconhecido');
  }

  /** Id da chave de um dado cifrado (v1: `legada`): a rotação recifra os que não são da ativa. */
  chaveDe(cifrado: string): string {
    const [versao, id] = cifrado.split('.');
    return versao === 'v2' && id !== undefined ? id : 'legada';
  }

  precisaRecifrar(cifrado: string): boolean {
    return this.chaveDe(cifrado) !== this.chaves.ativa().id;
  }
}

function abrir(chave: Uint8Array, iv: string, tag: string, dados: string, aad?: string): string {
  // Tamanho da tag fixo: sem isso, uma tag truncada (mais fácil de forjar) seria aceita.
  const decifrador = createDecipheriv('aes-256-gcm', chave, Buffer.from(iv, 'base64url'), {
    authTagLength: TAG,
  });
  if (aad !== undefined) decifrador.setAAD(Buffer.from(aad));
  decifrador.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decifrador.update(Buffer.from(dados, 'base64url')),
    decifrador.final(),
  ]).toString('utf8');
}

/**
 * Índice cego (HMAC-SHA256 em hex): permite unicidade e busca exata de um campo cifrado sem
 * guardá-lo em claro. Determinístico por desenho; só serve para campos de alta entropia de
 * contexto (CPF + chave secreta: sem a chave, não há dicionário possível).
 */
export function indiceCego(chaves: ProvedorChaves, texto: string): string {
  return createHmac('sha256', chaves.indice()).update(texto, 'utf8').digest('hex');
}

/** Proteção de campos sensíveis (cifra + índice cego) sobre as chaves de dados (ADR-021). */
export function protecaoDeCampos(chaves: ProvedorChaves, legadaBase64?: string) {
  const cifra = new CifraVersionada(chaves, legadaBase64);
  return {
    cifrar: (texto: string) => cifra.cifrar(texto),
    decifrar: (cifrado: string) => cifra.decifrar(cifrado),
    indice: (texto: string) => indiceCego(chaves, texto),
    precisaRecifrar: (cifrado: string) => cifra.precisaRecifrar(cifrado),
  };
}
