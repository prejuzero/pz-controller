import { z } from 'zod';

import { Instante, Uuid } from '../comum.js';

/**
 * Contrato de evento de domínio (ADR-004): `tipo` + `versao` identificam o schema do payload.
 * Mudança incompatível no payload exige nova versão, publicada ao lado da anterior.
 */
export interface ContratoEvento<Tipo extends string, Payload extends z.ZodObject> {
  readonly tipo: Tipo;
  readonly versao: number;
  readonly payload: Payload;
  /** Envelope completo, como gravado no outbox e entregue aos consumidores. */
  readonly envelope: z.ZodObject;
}

export function definirEvento<Tipo extends string, Payload extends z.ZodObject>(
  tipo: Tipo,
  versao: number,
  payload: Payload,
): ContratoEvento<Tipo, Payload> {
  if (!/^[A-Z][A-Za-z0-9]*$/.test(tipo)) {
    throw new Error(
      `Tipo de evento deve ser PascalCase no passado (ex.: PrazoConfirmado): "${tipo}"`,
    );
  }
  if (!Number.isInteger(versao) || versao < 1) {
    throw new Error(`Versão do evento ${tipo} deve ser inteiro positivo`);
  }
  return {
    tipo,
    versao,
    payload,
    envelope: z.object({
      id: Uuid,
      tipo: z.literal(tipo),
      versao: z.literal(versao),
      tenantId: Uuid,
      agregadoId: z.string().min(1),
      ocorridoEm: Instante,
      payload,
    }),
  };
}

/** Catálogo de eventos: falha se dois contratos tiverem o mesmo tipo e versão. */
export function catalogoDeEventos<Contratos extends readonly ContratoEvento<string, z.ZodObject>[]>(
  ...contratos: Contratos
): Contratos {
  const chaves = contratos.map((contrato) => `${contrato.tipo}@${String(contrato.versao)}`);
  const repetida = chaves.find((chave, indice) => chaves.indexOf(chave) !== indice);
  if (repetida !== undefined) throw new Error(`Evento repetido no catálogo: ${repetida}`);
  return contratos;
}
