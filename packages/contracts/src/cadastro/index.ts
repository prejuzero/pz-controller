import { z } from 'zod';

import { Uuid } from '../comum.js';
import { definirRota, nomear } from '../rota.js';

const Inscricao = z.object({
  numero: z.string().min(1).max(20).describe('Número de inscrição (ex.: 123456 ou 12345A).'),
  uf: z.string().length(2).describe('Seccional (UF).'),
});
const EmailsAdicionais = z
  .array(z.email().max(254))
  .max(5)
  .describe('Recebem cópia das notificações.');

export const PedidoDeCadastro = nomear(
  'PedidoDeCadastro',
  z.object({
    nome: z.string().min(3).max(200),
    cpf: z.string().min(11).max(20).describe('Com ou sem máscara.'),
    email: z.email().max(254),
    senha: z.string().min(1).max(256),
    celular: z.string().min(10).max(30).describe('Com DDD.'),
    oabPrincipal: Inscricao,
    oabsSuplementares: z.array(Inscricao).max(26).optional(),
    emailsAdicionais: EmailsAdicionais.optional(),
  }),
);
export type PedidoDeCadastro = z.infer<typeof PedidoDeCadastro.esquema>;

export const OabDoAdvogado = nomear(
  'OabDoAdvogado',
  z.object({
    id: Uuid,
    numero: z.string(),
    uf: z.string(),
    tipo: z.enum(['principal', 'suplementar']),
  }),
);
export type OabDoAdvogado = z.infer<typeof OabDoAdvogado.esquema>;

export const PerfilDoAdvogado = nomear(
  'PerfilDoAdvogado',
  z.object({
    id: Uuid,
    nome: z.string(),
    cpf: z.string().describe('Mascarado (***.123.456-**).'),
    celular: z.string().describe('Só dígitos, com DDD.'),
    emailsAdicionais: z.array(z.string()),
    oabs: z.array(OabDoAdvogado.esquema).describe('Só as ativas.'),
  }),
);
export type PerfilDoAdvogado = z.infer<typeof PerfilDoAdvogado.esquema>;

export const CadastroRealizado = nomear(
  'CadastroRealizado',
  z.object({ usuarioId: Uuid, perfil: PerfilDoAdvogado.esquema }),
);

export const AlteracaoDoPerfil = nomear(
  'AlteracaoDoPerfil',
  z.object({
    nome: z.string().min(3).max(200).optional(),
    celular: z.string().min(10).max(30).optional(),
    emailsAdicionais: EmailsAdicionais.optional(),
  }),
);
export type AlteracaoDoPerfil = z.infer<typeof AlteracaoDoPerfil.esquema>;

export const PedidoDeOab = nomear('PedidoDeOab', Inscricao);

/** Cadastro público (HU11): cria o tenant autônomo, a conta e o advogado numa transação. */
export const cadastrarAdvogado = definirRota({
  id: 'cadastrarAdvogado',
  metodo: 'post',
  caminho: '/v1/cadastro',
  resumo: 'Cadastra um advogado autônomo; depois ele entra e ativa o 2FA.',
  tag: 'cadastro',
  publica: true,
  corpo: PedidoDeCadastro,
  resposta: { status: 201, corpo: CadastroRealizado },
  erros: [409, 429],
});

export const consultarPerfil = definirRota({
  id: 'consultarPerfil',
  metodo: 'get',
  caminho: '/v1/perfil',
  resumo: 'Perfil do advogado da sessão, com as OABs ativas.',
  tag: 'cadastro',
  resposta: { status: 200, corpo: PerfilDoAdvogado },
  erros: [404],
});

export const atualizarPerfil = definirRota({
  id: 'atualizarPerfil',
  metodo: 'patch',
  caminho: '/v1/perfil',
  resumo: 'Altera nome, celular ou e-mails em cópia.',
  tag: 'cadastro',
  corpo: AlteracaoDoPerfil,
  resposta: { status: 200, corpo: PerfilDoAdvogado },
  erros: [404],
});

const comId = z.object({ id: Uuid });

export const adicionarOab = definirRota({
  id: 'adicionarOab',
  metodo: 'post',
  caminho: '/v1/oabs',
  resumo: 'Adiciona uma OAB suplementar; ela entra no monitoramento.',
  tag: 'cadastro',
  corpo: PedidoDeOab,
  resposta: { status: 201, corpo: OabDoAdvogado },
  erros: [404, 409, 422],
});

export const removerOab = definirRota({
  id: 'removerOab',
  metodo: 'delete',
  caminho: '/v1/oabs/{id}',
  resumo: 'Remove uma OAB suplementar do monitoramento (a principal não sai).',
  tag: 'cadastro',
  parametrosDeCaminho: comId,
  resposta: { status: 204, corpo: null },
  erros: [404, 422],
});

export const ROTAS_CADASTRO = [
  cadastrarAdvogado,
  consultarPerfil,
  atualizarPerfil,
  adicionarOab,
  removerOab,
] as const;
