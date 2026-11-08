import { z } from 'zod';

import { ConsultaPaginada, DataCivil, Instante, pagina, Uuid } from '../comum.js';
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
    conferenciaACadaDias: z
      .number()
      .int()
      .describe('Conferência de painel a cada N dias corridos (HU36), quando exigida.'),
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
    conferenciaACadaDias: z
      .number()
      .int()
      .min(1)
      .max(9)
      .nullable()
      .optional()
      .describe(
        'Conferência de painel a cada N dias corridos (HU36), abaixo dos 10 dias da ciência tácita (Lei 11.419, art. 5º, §3º). null: padrão (5); ausente: mantém.',
      ),
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

const Resultado = z.enum(['sem-novidade', 'nova-intimacao']);

export const PedidoDeConferencia = nomear(
  'PedidoDeConferencia',
  z
    .object({
      resultado: Resultado.describe('"nova-intimacao": o portal leva ao cadastro assistido.'),
      observacao: z.string().max(1000).optional(),
    })
    .strict(),
);
export type PedidoDeConferencia = z.infer<typeof PedidoDeConferencia.esquema>;

export const ConferenciaDePainel = nomear(
  'ConferenciaDePainel',
  z.object({
    id: Uuid,
    processoId: Uuid,
    usuarioId: Uuid,
    realizadaEm: Instante.describe('Relógio do servidor.'),
    resultado: Resultado,
    observacao: z.string().nullable(),
  }),
);
export type ConferenciaDePainel = z.infer<typeof ConferenciaDePainel.esquema>;

export const ConferenciasDoEscritorio = nomear(
  'ConferenciasDoEscritorio',
  z.object({
    itens: z.array(
      z.object({
        processoId: Uuid,
        numeroCnj: z.string(),
        tribunal: z.string().nullable(),
        cobertura: Cobertura,
        sigiloso: z.boolean(),
        periodicidade: z.number().int(),
        proxima: DataCivil.describe('Data da próxima conferência (Brasília).'),
        atrasada: z.boolean(),
        lembrarHoje: z.boolean(),
        ultimaConferencia: z.object({ realizadaEm: Instante, resultado: Resultado }).nullable(),
      }),
    ),
  }),
);
export type ConferenciasDoEscritorio = z.infer<typeof ConferenciasDoEscritorio.esquema>;

export const listarConferencias = definirRota({
  id: 'listarConferencias',
  metodo: 'get',
  caminho: '/v1/conferencias',
  resumo: 'Processos que exigem conferência de painel, com a próxima data (atrasados primeiro).',
  tag: 'processos',
  resposta: { status: 200, corpo: ConferenciasDoEscritorio },
});

export const registrarConferencia = definirRota({
  id: 'registrarConferencia',
  metodo: 'post',
  caminho: '/v1/processos/{id}/conferencias',
  resumo: 'Registra a conferência do painel do tribunal (com ou sem novidade).',
  tag: 'processos',
  parametrosDeCaminho: comId,
  corpo: PedidoDeConferencia,
  resposta: { status: 201, corpo: ConferenciaDePainel },
  erros: [404],
});

/** Colunas aceitas na planilha (HU42); só numeroCnj é obrigatória, em qualquer ordem. */
export const COLUNAS_DA_IMPORTACAO_DE_PROCESSOS = [
  'numeroCnj',
  'orgao',
  'comarca',
  'sigiloso',
] as const;

export const PedidoDeImportacaoDeProcessos = nomear(
  'PedidoDeImportacaoDeProcessos',
  z.object({
    csv: z
      .string()
      .min(1)
      .max(1_000_000)
      .describe(
        'CSV (separador ; ou ,), até 1.000 processos. Cabeçalho com numeroCnj e, se quiser, orgao, comarca e sigiloso (sim/não).',
      ),
    somentePrevia: z
      .boolean()
      .default(true)
      .describe('true: só valida; false: grava o pedido se nenhuma linha tiver problema.'),
  }),
);

export const ResultadoDaImportacaoDeProcessos = nomear(
  'ResultadoDaImportacaoDeProcessos',
  z.object({
    linhas: z.array(
      z.object({
        linha: z.number().int().describe('Linha no arquivo (o cabeçalho é a 1).'),
        numeroCnj: z.string().nullable().describe('Com a máscara do CNJ; nulo se inválido.'),
        situacao: z
          .enum(['valida', 'ja-cadastrado', 'invalida'])
          .describe('ja-cadastrado: já está no monitoramento e será ignorado.'),
        problemas: z.array(z.object({ campo: z.string(), mensagem: z.string() })),
      }),
    ),
    importacaoId: Uuid.nullable().describe(
      'Pedido gravado (os processos são cadastrados em segundo plano); nulo na prévia.',
    ),
  }),
);
export type ResultadoDaImportacaoDeProcessos = z.infer<
  typeof ResultadoDaImportacaoDeProcessos.esquema
>;

export const ImportacaoDeProcessos = nomear(
  'ImportacaoDeProcessos',
  z.object({
    id: Uuid,
    situacao: z.enum(['pendente', 'concluida']),
    total: z.number().int().describe('Processos novos no pedido.'),
    criados: z.number().int().nullable(),
    jaExistiam: z
      .number()
      .int()
      .nullable()
      .describe('Cadastrados por outro caminho entre a prévia e o processamento.'),
    solicitadaEm: Instante,
    concluidaEm: Instante.nullable(),
  }),
);
export type ImportacaoDeProcessos = z.infer<typeof ImportacaoDeProcessos.esquema>;

export const importarProcessos = definirRota({
  id: 'importarProcessos',
  metodo: 'post',
  caminho: '/v1/processos/importacoes',
  resumo:
    'Valida uma planilha CSV de processos (prévia) e, se tudo estiver certo, pede a importação.',
  tag: 'processos',
  corpo: PedidoDeImportacaoDeProcessos,
  resposta: { status: 200, corpo: ResultadoDaImportacaoDeProcessos },
});

export const consultarImportacaoDeProcessos = definirRota({
  id: 'consultarImportacaoDeProcessos',
  metodo: 'get',
  caminho: '/v1/processos/importacoes/{id}',
  resumo: 'Andamento de uma importação de processos do escritório.',
  tag: 'processos',
  parametrosDeCaminho: comId,
  resposta: { status: 200, corpo: ImportacaoDeProcessos },
  erros: [404],
});

/** Nome do escritório monitorado na captura (HU42, RF05). */
export const NomeMonitorado = nomear(
  'NomeMonitorado',
  z.object({ id: Uuid, nome: z.string(), criadoEm: Instante }),
);
export type NomeMonitorado = z.infer<typeof NomeMonitorado.esquema>;

export const NomesMonitorados = nomear(
  'NomesMonitorados',
  z.object({ itens: z.array(NomeMonitorado.esquema) }),
);

export const PedidoDeNomeMonitorado = nomear(
  'PedidoDeNomeMonitorado',
  z.object({
    nome: z
      .string()
      .min(5)
      .max(150)
      .describe('Razão social ou nome fantasia, como aparece nas publicações.'),
  }),
);

export const listarNomesMonitorados = definirRota({
  id: 'listarNomesMonitorados',
  metodo: 'get',
  caminho: '/v1/escritorio/nomes-monitorados',
  resumo: 'Nomes do escritório monitorados na captura (até 5).',
  tag: 'escritorio',
  resposta: { status: 200, corpo: NomesMonitorados },
});

export const adicionarNomeMonitorado = definirRota({
  id: 'adicionarNomeMonitorado',
  metodo: 'post',
  caminho: '/v1/escritorio/nomes-monitorados',
  resumo:
    'Passa a monitorar um nome; publicações que chegarem só por ele ficam "a conferir" (homônimos).',
  tag: 'escritorio',
  corpo: PedidoDeNomeMonitorado,
  resposta: { status: 201, corpo: NomeMonitorado },
  erros: [409, 422],
});

export const removerNomeMonitorado = definirRota({
  id: 'removerNomeMonitorado',
  metodo: 'delete',
  caminho: '/v1/escritorio/nomes-monitorados/{id}',
  resumo: 'Deixa de monitorar o nome; as publicações já recebidas continuam.',
  tag: 'escritorio',
  parametrosDeCaminho: comId,
  resposta: { status: 204, corpo: null },
  erros: [404],
});

export const ROTAS_PROCESSOS = [
  listarConferencias,
  registrarConferencia,
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
  importarProcessos,
  consultarImportacaoDeProcessos,
  listarNomesMonitorados,
  adicionarNomeMonitorado,
  removerNomeMonitorado,
] as const;
