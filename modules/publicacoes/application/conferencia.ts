import { Conflito, err, gerarUuidV7, NaoEncontrado, ok, Validacao } from '@pz/kernel';
import { z } from 'zod';

import type { LeitorNoTenant } from './leitura.js';
import type {
  ObterOuCriarProcessoNoTenant,
  RepositorioDeLeitura,
  RepositorioDePublicacoes,
} from './portas.js';
import type { TrilhaDeAuditoria } from '@pz/auditoria';
import type { Clock, Outbox, Result, UnidadeDeTrabalho, Uuid } from '@pz/kernel';

const Pedido = z.object({ decisao: z.enum(['confirmar', 'descartar']) }).strict();

export interface ConferenteNoTenant extends LeitorNoTenant {
  readonly tenantId: Uuid;
}

/**
 * Conferência da publicação capturada só pelo nome do escritório (HU42; decisão do usuário em
 * 08/11/2026). Confirmar: é do escritório, então ganha o processo do número e segue como
 * qualquer publicação recebida (PublicacaoRecebida leva ao prazo "a confirmar"). Descartar:
 * homônimo, sai de todas as listas. A decisão é humana e fica na trilha (ADR-016).
 */
export class ConferirPublicacao<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly leitura: RepositorioDeLeitura<Transacao>,
    private readonly publicacoes: RepositorioDePublicacoes<Transacao>,
    private readonly obterOuCriarProcesso: ObterOuCriarProcessoNoTenant,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
    private readonly outbox: Outbox<Transacao>,
    private readonly relogio: Clock,
  ) {}

  async executar(
    conferente: ConferenteNoTenant,
    id: Uuid,
    entrada: unknown,
  ): Promise<Result<void, Validacao | NaoEncontrado | Conflito>> {
    const pedido = Pedido.safeParse(entrada);
    if (!pedido.success) {
      return err(new Validacao([{ campo: 'decisao', mensagem: 'Confirmar ou descartar.' }]));
    }
    const publicacao = await this.unidade.executar((tx) => this.leitura.buscar(tx, id));
    if (publicacao === undefined) {
      return err(new NaoEncontrado('publicacao-inexistente', 'Publicação não encontrada.'));
    }
    if (publicacao.conferencia !== 'pendente') {
      return err(new Conflito('publicacao-ja-conferida', 'Esta publicação já foi conferida.'));
    }
    const confirmar = pedido.data.decisao === 'confirmar';
    // Fora da transação, como na ingestão: o cadastro cria o processo na transação dele.
    const processoId =
      confirmar && publicacao.numeroCnj !== null
        ? await this.obterOuCriarProcesso(conferente.tenantId, publicacao.numeroCnj)
        : null;
    const agora = this.relogio.agora();
    return this.unidade.executar(async (tx) => {
      const conferida = await this.publicacoes.conferir(tx, conferente.tenantId, id, {
        conferencia: confirmar ? 'confirmada' : 'descartada',
        processoId,
        oabId: null,
        por: conferente.usuarioId,
        em: agora,
      });
      if (!conferida) {
        return err(new Conflito('publicacao-ja-conferida', 'Esta publicação já foi conferida.'));
      }
      await this.trilha.registrar(
        tx,
        {
          tipo: confirmar
            ? 'publicacoes.publicacao-confirmada'
            : 'publicacoes.publicacao-descartada',
          entidade: 'publicacao',
          entidadeId: id,
          depois: { processoId },
        },
        { canal: conferente.canal, usuarioId: conferente.usuarioId },
      );
      if (confirmar) {
        await this.outbox.gravar(tx, [
          {
            id: gerarUuidV7(this.relogio),
            tipo: 'PublicacaoRecebida',
            versao: 1,
            tenantId: conferente.tenantId,
            agregadoId: id,
            ocorridoEm: agora,
            payload: {
              conteudoId: id,
              processoId,
              dataDisponibilizacao: publicacao.dataDisponibilizacao,
            },
          },
        ]);
      }
      return ok(undefined);
    });
  }
}
