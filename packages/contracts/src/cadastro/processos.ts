import { z } from 'zod';

import { ConsultaPaginada, pagina, Uuid } from '../comum.js';
import { definirRota, nomear } from '../rota.js';

const Cobertura = z
  .enum(['automatica', 'parcial', 'manual'])
  .describe(
    'Automática: as fontes públicas trazem as intimações; parcial ou manual: conferir no painel do tribunal.',
  );
const TextoOpcional = z.string().min(1).max(200).nullable();
const Motivo = z.string().min(3).max(500).nullable();

export const ProcessoDoTenant = nomear(
  'ProcessoDoTenant',
  z.object({
    id: Uuid,
    numeroCnj: z.string().describe('Com a máscara do CNJ (NNNNNNN-DD.AAAA.J.TR.OOOO).'),
    tribunal: z.string().nullable().describe('Sigla deduzida do número; nula se desconhecida.'),
    ramo: z.string().nullable().describe('Ramo da Justiça deduzido do tribunal.'),
    orgao: z.string().nullable(),
    comarca: z.string().nullable(),
    sigiloso: z.boolean(),
    cobertura: Cobertura,
    motivoCobertura: z.string().nullable(),
    clienteId: Uuid.nullable(),
  }),
);
export type ProcessoDoTenant = z.infer<typeof ProcessoDoTenant.esquema>;

export const PaginaDeProcessos = nomear('PaginaDeProcessos', pagina(ProcessoDoTenant.esquema));

export const PedidoDeProcesso = nomear(
  'PedidoDeProcesso',
  z.object({
    numeroCnj: z.string().min(20).max(40).describe('Com ou sem pontuação; dígito verificado.'),
    orgao: TextoOpcional.optional(),
    comarca: TextoOpcional.optional(),
    sigiloso: z.boolean().optional(),
    cobertura: Cobertura.optional(),
    motivoCobertura: Motivo.optional().describe('Obrigatório quando a cobertura não é automática.'),
    clienteId: Uuid.nullable().optional(),
  }),
);
export type PedidoDeProcesso = z.infer<typeof PedidoDeProcesso.esquema>;

export const AlteracaoDoProcesso = nomear(
  'AlteracaoDoProcesso',
  z.object({
    orgao: TextoOpcional.optional(),
    comarca: TextoOpcional.optional(),
    sigiloso: z.boolean().optional(),
    clienteId: Uuid.nullable().optional().describe('Nulo desvincula o cliente.'),
  }),
);
export type AlteracaoDoProcesso = z.infer<typeof AlteracaoDoProcesso.esquema>;

export const PedidoDeCobertura = nomear(
  'PedidoDeCobertura',
  z.object({
    cobertura: Cobertura,
    motivo: Motivo.optional().describe('Obrigatório quando a cobertura não é automática.'),
  }),
);
export type PedidoDeCobertura = z.infer<typeof PedidoDeCobertura.esquema>;

export const ClienteDoTenant = nomear(
  'ClienteDoTenant',
  z.object({
    id: Uuid,
    nome: z.string(),
    documento: z.string().nullable().describe('CPF ou CNPJ sem pontuação.'),
  }),
);
export type ClienteDoTenant = z.infer<typeof ClienteDoTenant.esquema>;

export const PaginaDeClientes = nomear('PaginaDeClientes', pagina(ClienteDoTenant.esquema));

const Documento = z.string().max(30).nullable().describe('CPF ou CNPJ, com ou sem máscara.');

export const PedidoDeCliente = nomear(
  'PedidoDeCliente',
  z.object({ nome: z.string().min(2).max(200), documento: Documento.optional() }),
);
export type PedidoDeCliente = z.infer<typeof PedidoDeCliente.esquema>;

export const AlteracaoDoCliente = nomear(
  'AlteracaoDoCliente',
  z.object({ nome: z.string().min(2).max(200).optional(), documento: Documento.optional() }),
);
export type AlteracaoDoCliente = z.infer<typeof AlteracaoDoCliente.esquema>;

const comId = z.object({ id: Uuid });

export const listarProcessos = definirRota({
  id: 'listarProcessos',
  metodo: 'get',
  caminho: '/v1/processos',
  resumo: 'Lista os processos monitorados, do mais novo para o mais antigo.',
  tag: 'processos',
  consulta: ConsultaPaginada.extend({
    numero: z.string().max(40).optional().describe('Número CNJ completo ou parcial.'),
    clienteId: Uuid.optional(),
    tribunal: z.string().max(20).optional().describe('Sigla (ex.: TJSP).'),
    cobertura: Cobertura.optional(),
    sigiloso: z.enum(['true', 'false']).optional(),
  }),
  resposta: { status: 200, corpo: PaginaDeProcessos },
});

export const consultarProcesso = definirRota({
  id: 'consultarProcesso',
  metodo: 'get',
  caminho: '/v1/processos/{id}',
  resumo: 'Um processo do escritório.',
  tag: 'processos',
  parametrosDeCaminho: comId,
  resposta: { status: 200, corpo: ProcessoDoTenant },
  erros: [404],
});

export const cadastrarProcesso = definirRota({
  id: 'cadastrarProcesso',
  metodo: 'post',
  caminho: '/v1/processos',
  resumo: 'Cadastra um processo pelo número CNJ; o tribunal é deduzido do número.',
  tag: 'processos',
  corpo: PedidoDeProcesso,
  resposta: { status: 201, corpo: ProcessoDoTenant },
  erros: [404, 409, 422],
});

export const atualizarProcesso = definirRota({
  id: 'atualizarProcesso',
  metodo: 'patch',
  caminho: '/v1/processos/{id}',
  resumo: 'Altera órgão, comarca, cliente ou sigilo do processo.',
  tag: 'processos',
  parametrosDeCaminho: comId,
  corpo: AlteracaoDoProcesso,
  resposta: { status: 200, corpo: ProcessoDoTenant },
  erros: [404],
});

export const alterarCobertura = definirRota({
  id: 'alterarCobertura',
  metodo: 'put',
  caminho: '/v1/processos/{id}/cobertura',
  resumo: 'Marca a cobertura do processo (automática, parcial ou manual), com motivo.',
  tag: 'processos',
  parametrosDeCaminho: comId,
  corpo: PedidoDeCobertura,
  resposta: { status: 200, corpo: ProcessoDoTenant },
  erros: [404, 422],
});

export const listarClientes = definirRota({
  id: 'listarClientes',
  metodo: 'get',
  caminho: '/v1/clientes',
  resumo: 'Lista os clientes do escritório, do mais novo para o mais antigo.',
  tag: 'processos',
  consulta: ConsultaPaginada.extend({
    nome: z.string().max(200).optional().describe('Parte do nome.'),
  }),
  resposta: { status: 200, corpo: PaginaDeClientes },
});

export const consultarCliente = definirRota({
  id: 'consultarCliente',
  metodo: 'get',
  caminho: '/v1/clientes/{id}',
  resumo: 'Um cliente do escritório.',
  tag: 'processos',
  parametrosDeCaminho: comId,
  resposta: { status: 200, corpo: ClienteDoTenant },
  erros: [404],
});

export const cadastrarCliente = definirRota({
  id: 'cadastrarCliente',
  metodo: 'post',
  caminho: '/v1/clientes',
  resumo: 'Cadastra um cliente.',
  tag: 'processos',
  corpo: PedidoDeCliente,
  resposta: { status: 201, corpo: ClienteDoTenant },
});

export const atualizarCliente = definirRota({
  id: 'atualizarCliente',
  metodo: 'patch',
  caminho: '/v1/clientes/{id}',
  resumo: 'Altera nome ou documento do cliente.',
  tag: 'processos',
  parametrosDeCaminho: comId,
  corpo: AlteracaoDoCliente,
  resposta: { status: 200, corpo: ClienteDoTenant },
  erros: [404],
});

export const removerCliente = definirRota({
  id: 'removerCliente',
  metodo: 'delete',
  caminho: '/v1/clientes/{id}',
  resumo: 'Remove um cliente sem processos vinculados.',
  tag: 'processos',
  parametrosDeCaminho: comId,
  resposta: { status: 204, corpo: null },
  erros: [404, 422],
});

export const ROTAS_PROCESSOS = [
  listarProcessos,
  consultarProcesso,
  cadastrarProcesso,
  atualizarProcesso,
  alterarCobertura,
  listarClientes,
  consultarCliente,
  cadastrarCliente,
  atualizarCliente,
  removerCliente,
] as const;
