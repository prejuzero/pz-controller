import { gerarUuidV7 } from '@pz/kernel';
import { z } from 'zod';

import type { ObterOuCriarProcessoNoTenant, RepositorioDePublicacoes } from './portas.js';
import type { Clock, EventoDominio, Outbox, Uuid } from '@pz/kernel';

const EventoDaCaptura = z.object({
  tenantId: z.uuid(),
  payload: z.object({
    alvoId: z.uuid(),
    tipo: z.enum(['oab', 'processo', 'nome']),
    referencias: z.array(z.uuid()).min(1),
    fonte: z.string().min(1),
    publicacoes: z.array(
      z.object({
        idExterno: z.string().min(1),
        hashConteudo: z.string().regex(/^[0-9a-f]{64}$/),
        dataDisponibilizacao: z.iso.date(),
        teor: z.string().min(1),
        numeroCnj: z.string().optional(),
        urlFonte: z.string(),
        metadados: z.record(z.string(), z.unknown()),
      }),
    ),
  }),
});

const digitos = (numero: string) => numero.replace(/\D/g, '');

export interface ResultadoDaIngestao {
  readonly novas: number;
  readonly recebidas: number;
}

/**
 * Ingestão (HU18, ADR-014): consumidor de CapturaConcluida na transação do tenant assinante.
 * Cada publicação registra o conteúdo global uma vez (PublicacaoNova só para conteúdo novo, que
 * segue para a classificação) e o destinatário do tenant, com o processo encontrado ou criado
 * (PublicacaoRecebida). Repetir o evento não duplica nada. Nenhuma IA aqui.
 *
 * Por nome do escritório (HU42; decisão do usuário em 08/11/2026): pode ser homônimo, então o
 * destinatário fica "pendente", sem processo e sem PublicacaoRecebida (nem prazo) até o advogado
 * confirmar. Se a mesma publicação chega depois por OAB ou processo, a confirmação é automática.
 */
export class IngerirCaptura<Transacao> {
  constructor(
    private readonly publicacoes: RepositorioDePublicacoes<Transacao>,
    private readonly obterOuCriarProcesso: ObterOuCriarProcessoNoTenant,
    private readonly outbox: Outbox<Transacao>,
    private readonly relogio: Clock,
    private readonly versaoDoAdaptador: (fonte: string) => string,
  ) {}

  async executar(transacao: Transacao, evento: unknown): Promise<ResultadoDaIngestao> {
    const { tenantId, payload } = EventoDaCaptura.parse(evento);
    const tenant = tenantId as Uuid;
    const referencia = payload.referencias[0] as Uuid;
    const eventos: EventoDominio[] = [];
    let novas = 0;
    let recebidas = 0;
    for (const p of payload.publicacoes) {
      const numero = p.numeroCnj === undefined ? null : digitos(p.numeroCnj);
      const conteudo = await this.publicacoes.registrarConteudo(transacao, {
        id: gerarUuidV7(this.relogio),
        fonte: payload.fonte,
        idExterno: p.idExterno,
        hashConteudo: p.hashConteudo,
        dataDisponibilizacao: p.dataDisponibilizacao,
        numeroCnj: numero,
        teor: p.teor,
        urlFonte: p.urlFonte,
        metadados: p.metadados,
        adaptadorVersao: this.versaoDoAdaptador(payload.fonte),
      });
      if (conteudo.novo) {
        novas++;
        eventos.push(
          this.#evento(tenant, conteudo.conteudoId, 'PublicacaoNova', {
            conteudoId: conteudo.conteudoId,
            fonte: payload.fonte,
            hashConteudo: p.hashConteudo,
          }),
        );
      }
      const peloNome = payload.tipo === 'nome';
      const processoId =
        payload.tipo === 'processo'
          ? referencia
          : peloNome || numero === null
            ? null
            : await this.obterOuCriarProcesso(tenant, numero);
      const oabId = payload.tipo === 'oab' ? referencia : null;
      const registrada = await this.publicacoes.registrarDestinatario(transacao, {
        tenantId: tenant,
        conteudoId: conteudo.conteudoId,
        capturadoEm: conteudo.capturadoEm,
        processoId,
        oabId,
        conferencia: peloNome ? 'pendente' : null,
      });
      const recebida = peloNome
        ? false
        : registrada ||
          (await this.publicacoes.conferir(transacao, tenant, conteudo.conteudoId, {
            conferencia: 'confirmada',
            processoId,
            oabId,
            por: null,
            em: this.relogio.agora(),
          }));
      if (recebida) {
        recebidas++;
        eventos.push(
          this.#evento(tenant, conteudo.conteudoId, 'PublicacaoRecebida', {
            conteudoId: conteudo.conteudoId,
            processoId,
            dataDisponibilizacao: p.dataDisponibilizacao,
          }),
        );
      }
    }
    await this.outbox.gravar(transacao, eventos);
    return { novas, recebidas };
  }

  #evento(tenantId: Uuid, agregadoId: Uuid, tipo: string, payload: unknown): EventoDominio {
    return {
      id: gerarUuidV7(this.relogio),
      tipo,
      versao: 1,
      tenantId,
      agregadoId,
      ocorridoEm: this.relogio.agora(),
      payload,
    };
  }
}
