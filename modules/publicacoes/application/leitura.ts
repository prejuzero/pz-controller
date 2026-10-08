import { err, NaoEncontrado, ok, Validacao } from '@pz/kernel';
import { z } from 'zod';

import type { PublicacaoDoTenant, RepositorioDeLeitura } from './portas.js';
import type { OrigemDaAuditoria, TrilhaDeAuditoria } from '@pz/auditoria';
import type { Clock, Result, UnidadeDeTrabalho, Uuid } from '@pz/kernel';

export interface LeitorNoTenant {
  readonly usuarioId: Uuid;
  readonly canal: OrigemDaAuditoria['canal'];
}

export interface Pagina<Item> {
  readonly itens: readonly Item[];
  readonly proximoCursor: string | null;
}

const Consulta = z.object({
  novas: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  de: z.iso.date().optional(),
  ate: z.iso.date().optional(),
  processoId: z.uuid().optional(),
  cursor: z.string().max(100).optional(),
  limite: z.coerce.number().int().min(1).max(100).default(20),
});

const validacao = (erro: z.ZodError) =>
  new Validacao(erro.issues.map((p) => ({ campo: p.path.join('.'), mensagem: p.message })));

/** GET /v1/publicacoes (HU18): filtros por novas, período de disponibilização e processo. */
export class ListarPublicacoes<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly leitura: RepositorioDeLeitura<Transacao>,
  ) {}

  async executar(consulta: unknown): Promise<Result<Pagina<PublicacaoDoTenant>, Validacao>> {
    const dados = Consulta.safeParse(consulta);
    if (!dados.success) return err(validacao(dados.error));
    const { cursor, limite, novas, de, ate, processoId } = dados.data;
    let antesDe: Uuid | undefined;
    if (cursor !== undefined) {
      const id = z.uuid().safeParse(Buffer.from(cursor, 'base64url').toString('utf8'));
      if (!id.success)
        return err(new Validacao([{ campo: 'cursor', mensagem: 'Cursor inválido.' }]));
      antesDe = id.data as Uuid;
    }
    const linhas = await this.unidade.executar((tx) =>
      this.leitura.listar(tx, {
        limite: limite + 1,
        ...(novas === undefined ? {} : { novas }),
        ...(de === undefined ? {} : { de }),
        ...(ate === undefined ? {} : { ate }),
        ...(processoId === undefined ? {} : { processoId: processoId as Uuid }),
        ...(antesDe === undefined ? {} : { antesDe }),
      }),
    );
    const itens = linhas.slice(0, limite);
    const ultimo = itens.at(-1);
    return ok({
      itens,
      proximoCursor:
        linhas.length > limite && ultimo !== undefined
          ? Buffer.from(ultimo.id, 'utf8').toString('base64url')
          : null,
    });
  }
}

const naoEncontrada = () =>
  new NaoEncontrado('publicacao-inexistente', 'Publicação não encontrada.');

export class ConsultarPublicacao<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly leitura: RepositorioDeLeitura<Transacao>,
  ) {}

  async executar(id: Uuid): Promise<Result<PublicacaoDoTenant, NaoEncontrado>> {
    const publicacao = await this.unidade.executar((tx) => this.leitura.buscar(tx, id));
    return publicacao === undefined ? err(naoEncontrada()) : ok(publicacao);
  }
}

/**
 * Marca a publicação como lida (HU18): a primeira leitura fica na trilha como indício de
 * conhecimento, não como ciência (a ciência tem fluxo próprio, HU31). Repetir não muda nada.
 */
export class MarcarComoLida<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly leitura: RepositorioDeLeitura<Transacao>,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
    private readonly relogio: Clock,
  ) {}

  executar(leitor: LeitorNoTenant, id: Uuid): Promise<Result<void, NaoEncontrado>> {
    const agora = this.relogio.agora();
    return this.unidade.executar(async (tx) => {
      if ((await this.leitura.buscar(tx, id)) === undefined) return err(naoEncontrada());
      if (await this.leitura.marcarLida(tx, id, leitor.usuarioId, agora)) {
        await this.trilha.registrar(
          tx,
          { tipo: 'publicacoes.publicacao-lida', entidade: 'publicacao', entidadeId: id },
          { canal: leitor.canal, usuarioId: leitor.usuarioId },
        );
      }
      return ok(undefined);
    });
  }
}
