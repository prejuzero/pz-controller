import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import type { ClienteApi } from './cliente-api.js';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';

export const NOME_DO_SERVIDOR = 'prejuzero';

/** Mensagem do problem+json da API, sem detalhes internos. */
function mensagemDoErro(erro: unknown, status: number): string {
  if (typeof erro === 'object' && erro !== null) {
    const { detail, title } = erro as { detail?: unknown; title?: unknown };
    if (typeof detail === 'string') return detail;
    if (typeof title === 'string') return title;
  }
  return `A API respondeu ${String(status)}.`;
}

/**
 * Servidor MCP sobre o catálogo de ferramentas da API (HU60, ADR-016): lista e executa pelo
 * cliente gerado, sem regra própria. Tudo é só leitura (o catálogo recusa o que altera estado) e
 * cada resposta leva o aviso de que as datas vêm do motor e exigem a confirmação do advogado.
 */
export function criarServidorMcp(api: ClienteApi, versao: string): McpServer {
  const mcp = new McpServer(
    { name: NOME_DO_SERVIDOR, version: versao },
    {
      capabilities: { tools: {} },
      instructions:
        'Ferramentas de leitura dos prazos, publicações e processos do escritório no PrejuZero. Nunca calcule nem ajuste datas de prazo: use as que as ferramentas devolvem e lembre que só valem depois da confirmação do advogado no portal.',
    },
  );
  // Os schemas vêm da API (JSON Schema do catálogo), não de Zod local: handlers no servidor
  // de baixo nível, o caso avançado previsto pelo SDK.
  const servidor = mcp.server;

  servidor.setRequestHandler(ListToolsRequestSchema, async () => {
    const { data, error, response } = await api.GET('/v1/ia/ferramentas');
    if (data === undefined) throw new Error(mensagemDoErro(error, response.status));
    const tools: Tool[] = data.itens.map((f) => ({
      name: f.nome,
      description: `${f.descricao} ${data.aviso}`,
      inputSchema: { ...f.entrada, type: 'object' },
      annotations: { readOnlyHint: true, openWorldHint: false },
    }));
    return { tools };
  });

  servidor.setRequestHandler(CallToolRequestSchema, async (pedido): Promise<CallToolResult> => {
    const { data, error, response } = await api.POST('/v1/ia/ferramentas/{nome}', {
      params: { path: { nome: pedido.params.name } },
      body: { argumentos: pedido.params.arguments ?? {} },
    });
    // Erro da ferramenta (proibida, entrada inválida, cota) volta ao assistente, que pode corrigir.
    if (data === undefined) {
      return {
        isError: true,
        content: [{ type: 'text', text: mensagemDoErro(error, response.status) }],
      };
    }
    return {
      content: [
        { type: 'text', text: JSON.stringify(data.resultado) },
        { type: 'text', text: data.aviso },
      ],
    };
  });
  return mcp;
}
