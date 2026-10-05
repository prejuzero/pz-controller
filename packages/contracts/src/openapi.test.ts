import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ConsultaPaginada, pagina, Uuid } from './comum.js';
import { gerarOpenApi } from './openapi.js';
import { definirRota, nomear } from './rota.js';

import { documentoOpenApi } from './index.js';

const Processo = nomear('Processo', z.object({ id: Uuid, numero: z.string() }));
const NovoProcesso = nomear('NovoProcesso', z.object({ numero: z.string() }));
const PaginaDeProcessos = nomear('PaginaDeProcessos', pagina(Processo.esquema));

const listar = definirRota({
  id: 'listarProcessos',
  metodo: 'get',
  caminho: '/v1/processos',
  resumo: 'Lista processos.',
  tag: 'processos',
  consulta: ConsultaPaginada,
  resposta: { status: 200, corpo: PaginaDeProcessos },
});
const cadastrar = definirRota({
  id: 'cadastrarProcesso',
  metodo: 'post',
  caminho: '/v1/processos',
  resumo: 'Cadastra processo.',
  tag: 'processos',
  idempotente: true,
  corpo: NovoProcesso,
  resposta: { status: 201, corpo: Processo },
  erros: [409],
});
const remover = definirRota({
  id: 'removerProcesso',
  metodo: 'delete',
  caminho: '/v1/processos/{id}',
  resumo: 'Remove processo.',
  tag: 'processos',
  parametrosDeCaminho: z.object({ id: Uuid }),
  resposta: { status: 204, corpo: null },
  erros: [404],
});

type Json = Record<string, unknown>;
const doc = gerarOpenApi({
  titulo: 'Teste',
  versao: '1',
  descricao: 'd',
  rotas: [listar, cadastrar, remover],
}) as {
  paths: Record<string, Record<string, Json>>;
  components: { schemas: Record<string, unknown> };
};

describe('gerarOpenApi', () => {
  it('produz OpenAPI 3.1 com componentes nomeados e Problema', () => {
    expect(gerarOpenApi({ titulo: 't', versao: '1', descricao: 'd', rotas: [] }).openapi).toBe(
      '3.1.0',
    );
    expect(Object.keys(doc.components.schemas)).toEqual([
      'NovoProcesso',
      'PaginaDeProcessos',
      'Problema',
      'Processo',
    ]);
    expect(JSON.stringify(doc.components.schemas.PaginaDeProcessos)).toContain(
      '#/components/schemas/Processo',
    );
  });

  it('documenta paginação por cursor nos parâmetros de consulta', () => {
    const parametros = doc.paths['/v1/processos']?.get?.parameters as {
      name: string;
      required: boolean;
      schema: Record<string, unknown>;
    }[];
    expect(parametros.map((p) => [p.name, p.required])).toEqual([
      ['cursor', false],
      ['limite', false],
    ]);
    expect(parametros[1]?.schema).toMatchObject({
      type: 'integer',
      minimum: 1,
      maximum: 100,
      default: 20,
    });
  });

  it('exige Idempotency-Key, corpo e documenta os erros em problem+json', () => {
    const post = doc.paths['/v1/processos']?.post as Record<string, unknown>;
    expect(post.parameters).toEqual([
      expect.objectContaining({ name: 'Idempotency-Key', in: 'header', required: true }),
    ]);
    expect(post.requestBody).toMatchObject({
      required: true,
      content: { 'application/json': { schema: { $ref: '#/components/schemas/NovoProcesso' } } },
    });
    const respostas = post.responses as Record<string, { content?: Record<string, unknown> }>;
    expect(Object.keys(respostas)).toEqual(['201', '400', '401', '403', '409', '500']);
    expect(Object.keys(respostas['409']?.content ?? {})).toEqual(['application/problem+json']);
    expect(post).not.toHaveProperty('security');
  });

  it('parâmetros de caminho são obrigatórios e 204 não tem corpo', () => {
    const remocao = doc.paths['/v1/processos/{id}']?.delete as Record<string, unknown>;
    expect(remocao.parameters).toEqual([
      expect.objectContaining({ name: 'id', in: 'path', required: true }),
    ]);
    expect((remocao.responses as Record<string, unknown>)['204']).toEqual({
      description: 'Sucesso, sem corpo.',
    });
    expect(Object.keys(remocao.responses as object)).toContain('404');
  });

  it('recusa operationId repetido, rota duplicada e conflitos de nome de schema', () => {
    const base = { titulo: 't', versao: '1', descricao: 'd' };
    expect(() => gerarOpenApi({ ...base, rotas: [listar, listar] })).toThrow(
      'operationId repetido',
    );
    expect(() =>
      gerarOpenApi({ ...base, rotas: [listar, { ...listar, id: 'outraLista' }] }),
    ).toThrow('Rota duplicada');
    const outroProcesso = nomear('Processo', z.object({ outro: z.string() }));
    expect(() =>
      gerarOpenApi({
        ...base,
        rotas: [
          cadastrar,
          {
            ...cadastrar,
            id: 'b',
            caminho: '/v1/b',
            resposta: { status: 201, corpo: outroProcesso },
          },
        ],
      }),
    ).toThrow('Dois schemas diferentes com o nome "Processo"');
    expect(() =>
      gerarOpenApi({
        ...base,
        rotas: [
          cadastrar,
          {
            ...cadastrar,
            id: 'b',
            caminho: '/v1/b',
            resposta: { status: 201, corpo: nomear('Apelido', Processo.esquema) },
          },
        ],
      }),
    ).toThrow('O mesmo schema tem dois nomes');
  });

  it('o openapi.json versionado está em dia com os schemas (rode pnpm --filter @pz/contracts gerar)', async () => {
    const versionado: unknown = JSON.parse(
      await readFile(new URL('../openapi.json', import.meta.url), 'utf8'),
    );
    expect(versionado).toEqual(documentoOpenApi());
  });
});
