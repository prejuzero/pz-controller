import { z } from 'zod';

import { CABECALHO_IDEMPOTENCIA, ChaveIdempotencia, Problema } from './comum.js';

import type { EsquemaNomeado, Rota } from './rota.js';

export interface OpcoesOpenApi {
  readonly titulo: string;
  readonly versao: string;
  readonly descricao: string;
  readonly rotas: readonly Rota[];
}

type Json = Record<string, unknown>;

const REF = (nome: string) => ({ $ref: `#/components/schemas/${nome}` });
const RESPOSTA_PROBLEMA = (descricao: string) => ({
  description: descricao,
  content: { 'application/problem+json': { schema: REF('Problema') } },
});
const DESCRICAO_ERRO: Record<number, string> = {
  400: 'Entrada inválida.',
  401: 'Não autenticado.',
  403: 'Sem permissão.',
  404: 'Não encontrado.',
  409: 'Conflito com o estado atual.',
  422: 'Regra de negócio violada.',
  429: 'Limite de requisições excedido.',
  500: 'Erro inesperado.',
};

/** `$schema` e `$id` de cada schema avulso não fazem sentido dentro do documento OpenAPI. */
function semMetadados(esquema: Json): Json {
  return Object.fromEntries(
    Object.entries(esquema).filter(([chave]) => chave !== '$schema' && chave !== '$id'),
  );
}

function esquemaDoCampo(esquema: z.ZodType): Json {
  return semMetadados(z.toJSONSchema(esquema, { io: 'input' }));
}

function parametros(lugar: 'path' | 'query', objeto: z.ZodObject | undefined): Json[] {
  if (objeto === undefined) return [];
  return Object.entries(objeto.shape).map(([nome, campo]) => {
    const tipo = campo as z.ZodType;
    const esquema = esquemaDoCampo(tipo);
    return {
      name: nome,
      in: lugar,
      required: lugar === 'path' || !tipo.safeParse(undefined).success,
      ...(typeof esquema.description === 'string' ? { description: esquema.description } : {}),
      schema: esquema,
    };
  });
}

function operacao(rota: Rota): Json {
  const temEntrada =
    rota.corpo !== undefined ||
    rota.consulta !== undefined ||
    rota.parametrosDeCaminho !== undefined;
  const erros = new Set<number>([
    500,
    ...(temEntrada ? [400] : []),
    ...(rota.publica === true ? [] : [401, 403]),
    ...(rota.erros ?? []),
  ]);
  const respostas: Json = {
    [String(rota.resposta.status)]:
      rota.resposta.corpo === null
        ? { description: 'Sucesso, sem corpo.' }
        : {
            description: 'Sucesso.',
            content: { 'application/json': { schema: REF(rota.resposta.corpo.nome) } },
          },
  };
  for (const status of [...erros].sort((a, b) => a - b)) {
    respostas[String(status)] = RESPOSTA_PROBLEMA(DESCRICAO_ERRO[status] ?? 'Erro.');
  }
  return {
    operationId: rota.id,
    summary: rota.resumo,
    tags: [rota.tag],
    ...(rota.publica === true ? { security: [] } : {}),
    parameters: [
      ...parametros('path', rota.parametrosDeCaminho),
      ...parametros('query', rota.consulta),
      ...(rota.idempotente === true
        ? [
            {
              name: CABECALHO_IDEMPOTENCIA,
              in: 'header',
              required: true,
              description: 'Chave única por operação: repetir a chave não repete o efeito.',
              schema: esquemaDoCampo(ChaveIdempotencia),
            },
          ]
        : []),
    ],
    ...(rota.corpo === undefined
      ? {}
      : {
          requestBody: {
            required: true,
            content: { 'application/json': { schema: REF(rota.corpo.nome) } },
          },
        }),
    responses: respostas,
  };
}

function componentes(rotas: readonly Rota[]): Json {
  const porNome = new Map<string, z.ZodType>([['Problema', Problema]]);
  const nomeados = rotas.flatMap((rota) =>
    [rota.corpo, rota.resposta.corpo].filter(
      (item): item is EsquemaNomeado => item !== undefined && item !== null,
    ),
  );
  for (const { nome, esquema } of nomeados) {
    const existente = porNome.get(nome);
    if (existente !== undefined && existente !== esquema) {
      throw new Error(`Dois schemas diferentes com o nome "${nome}"`);
    }
    porNome.set(nome, esquema);
  }
  const registro = z.registry<{ id: string }>();
  for (const [nome, esquema] of porNome) {
    if (registro.has(esquema)) {
      throw new Error(
        `O mesmo schema tem dois nomes: "${registro.get(esquema)?.id ?? ''}" e "${nome}"`,
      );
    }
    registro.add(esquema, { id: nome });
  }
  const { schemas } = z.toJSONSchema(registro, {
    uri: (id) => `#/components/schemas/${id}`,
    io: 'output',
  }) as { schemas: Record<string, Json> };
  return Object.fromEntries(
    Object.keys(schemas)
      .sort()
      .map((nome) => [nome, semMetadados(schemas[nome] ?? {})]),
  );
}

/** Gera o documento OpenAPI 3.1 a partir das rotas. Determinístico: mesma entrada, mesmo JSON. */
export function gerarOpenApi(opcoes: OpcoesOpenApi): Json {
  const ids = opcoes.rotas.map((rota) => rota.id);
  const repetido = ids.find((id, indice) => ids.indexOf(id) !== indice);
  if (repetido !== undefined) throw new Error(`operationId repetido: ${repetido}`);

  const caminhos: Record<string, Json> = {};
  for (const rota of [...opcoes.rotas].sort((a, b) => a.caminho.localeCompare(b.caminho))) {
    const existente = caminhos[rota.caminho] ?? {};
    if (existente[rota.metodo] !== undefined) {
      throw new Error(`Rota duplicada: ${rota.metodo.toUpperCase()} ${rota.caminho}`);
    }
    caminhos[rota.caminho] = { ...existente, [rota.metodo]: operacao(rota) };
  }

  return {
    openapi: '3.1.0',
    info: { title: opcoes.titulo, version: opcoes.versao, description: opcoes.descricao },
    servers: [{ url: '/' }],
    paths: caminhos,
    components: {
      schemas: componentes(opcoes.rotas),
      securitySchemes: {
        sessao: { type: 'apiKey', in: 'cookie', name: 'pz_sessao' },
        oauth2: { type: 'http', scheme: 'bearer', description: 'Token OAuth 2.1 (ADR-015).' },
      },
    },
    security: [{ sessao: [] }, { oauth2: [] }],
  };
}
