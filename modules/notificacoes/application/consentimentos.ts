import { Conflito, err, gerarUuidV7, NaoEncontrado, ok, Validacao } from '@pz/kernel';
import { z } from 'zod';

import { ConsentimentoCanal } from '../domain/consentimento.js';

import type { RepositorioDeConsentimentos, RepositorioDeDestinosPush } from './portas.js';
import type { CanalComConsentimento, OrigemDoConsentimento } from '../domain/consentimento.js';
import type { TrilhaDeAuditoria } from '@pz/auditoria';
import type { Clock, Outbox, Result, UnidadeDeTrabalho, Uuid } from '@pz/kernel';

/** Quem age: vem da sessão, nunca do corpo da requisição. */
export interface AutorDoConsentimento {
  readonly tenantId: Uuid;
  readonly usuarioId: Uuid;
  readonly origem: OrigemDoConsentimento;
  /** Dispositivo da sessão do app (OAuth); ausente no navegador. */
  readonly dispositivoId?: Uuid;
}

export interface ConsentimentoListado {
  readonly id: Uuid;
  readonly canal: CanalComConsentimento;
  readonly destino: string;
  readonly concedidoEm: string;
  readonly origem: OrigemDoConsentimento;
}

const Telefone = z.string().regex(/^\+[1-9]\d{7,14}$/, 'Telefone no formato E.164 (+5511...).');
export const PedidoDeConsentimento = z.discriminatedUnion('canal', [
  z.object({ canal: z.literal('push'), destino: z.uuid() }).strict(),
  z.object({ canal: z.literal('whatsapp'), destino: Telefone }).strict(),
  z.object({ canal: z.literal('sms'), destino: Telefone }).strict(),
]);

export const PedidoDeDestinoPush = z
  .object({
    plataforma: z.enum(['ios', 'android', 'web']),
    token: z.string().min(1).max(4096),
  })
  .strict();

const listado = (c: ConsentimentoCanal): ConsentimentoListado => {
  const { id, canal, destino, concedidoEm, origem } = c.estado;
  return { id, canal, destino, concedidoEm: concedidoEm.paraIso(), origem };
};

/** Consentimentos ativos do usuário da sessão (HU30). */
export class ListarConsentimentos<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly consentimentos: RepositorioDeConsentimentos<Transacao>,
  ) {}

  async executar(usuarioId: Uuid): Promise<ConsentimentoListado[]> {
    const ativos = await this.unidade.executar((tx) => this.consentimentos.ativos(tx, usuarioId));
    return ativos.map(listado);
  }
}

/**
 * Registra o consentimento para um canal e destino (HU30, ADR-015), com auditoria e evento na
 * mesma transação. Idempotente: já ativo devolve o existente, sem novo registro.
 */
export class ConcederConsentimento<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly consentimentos: RepositorioDeConsentimentos<Transacao>,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
    private readonly outbox: Outbox<Transacao>,
    private readonly relogio: Clock,
  ) {}

  async executar(
    autor: AutorDoConsentimento,
    entrada: unknown,
  ): Promise<Result<ConsentimentoListado, Validacao | Conflito>> {
    const pedido = PedidoDeConsentimento.safeParse(entrada);
    if (!pedido.success) return err(problemas(pedido.error));
    const { canal, destino } = pedido.data;
    return this.unidade.executar(async (tx) => {
      const existente = (await this.consentimentos.ativos(tx, autor.usuarioId)).find(
        (c) => c.estado.canal === canal && c.estado.destino === destino,
      );
      if (existente !== undefined) return ok(listado(existente));
      const consentimento = ConsentimentoCanal.conceder(
        {
          tenantId: autor.tenantId,
          usuarioId: autor.usuarioId,
          canal,
          destino,
          origem: autor.origem,
        },
        this.relogio,
      );
      // Pedido concorrente gravou antes: o índice único barra o segundo ativo.
      if (!(await this.consentimentos.inserir(tx, consentimento)))
        return err(new Conflito('consentimento-ja-registrado', 'Consentimento já registrado.'));
      await this.trilha.registrar(
        tx,
        {
          tipo: 'notificacoes.consentimento-concedido',
          entidade: 'consentimento_canal',
          entidadeId: consentimento.id,
          depois: { canal, origem: autor.origem },
        },
        { canal: autor.origem, usuarioId: autor.usuarioId },
      );
      await this.outbox.gravar(tx, consentimento.retirarEventos());
      return ok(listado(consentimento));
    });
  }
}

/** Revoga o consentimento (HU30): o canal para de enviar; o registro fica como prova. */
export class RevogarConsentimento<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly consentimentos: RepositorioDeConsentimentos<Transacao>,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
    private readonly outbox: Outbox<Transacao>,
    private readonly relogio: Clock,
  ) {}

  executar(autor: AutorDoConsentimento, id: Uuid): Promise<Result<void, NaoEncontrado>> {
    return this.unidade.executar(async (tx) => {
      const consentimento = await this.consentimentos.buscar(tx, id);
      if (consentimento?.estado.usuarioId !== autor.usuarioId)
        return err(
          new NaoEncontrado('consentimento-nao-encontrado', 'Consentimento não encontrado.'),
        );
      if (!consentimento.revogar(this.relogio)) return ok(undefined);
      await this.consentimentos.registrarRevogacao(tx, consentimento);
      await this.trilha.registrar(
        tx,
        {
          tipo: 'notificacoes.consentimento-revogado',
          entidade: 'consentimento_canal',
          entidadeId: consentimento.id,
          depois: { canal: consentimento.estado.canal },
        },
        { canal: autor.origem, usuarioId: autor.usuarioId },
      );
      await this.outbox.gravar(tx, consentimento.retirarEventos());
      return ok(undefined);
    });
  }
}

/**
 * Registra ou atualiza o token de push do dispositivo da sessão (HU30). O envio ainda exige o
 * consentimento de push para o dispositivo. O token nunca vai para a trilha.
 */
export class RegistrarDestinoPush<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly destinos: RepositorioDeDestinosPush<Transacao>,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
    private readonly relogio: Clock,
  ) {}

  async executar(
    autor: AutorDoConsentimento,
    entrada: unknown,
  ): Promise<Result<{ id: Uuid; dispositivoId: Uuid }, Validacao>> {
    const dispositivoId = autor.dispositivoId;
    if (dispositivoId === undefined)
      return err(
        new Validacao([{ campo: 'sessao', mensagem: 'Push exige a sessão de um dispositivo.' }]),
      );
    const pedido = PedidoDeDestinoPush.safeParse(entrada);
    if (!pedido.success) return err(problemas(pedido.error));
    return this.unidade.executar(async (tx) => {
      const id = await this.destinos.gravar(
        tx,
        { tenantId: autor.tenantId, usuarioId: autor.usuarioId, dispositivoId, ...pedido.data },
        gerarUuidV7(this.relogio),
      );
      await this.trilha.registrar(
        tx,
        {
          tipo: 'notificacoes.destino-push-registrado',
          entidade: 'destino_push',
          entidadeId: id,
          depois: { dispositivoId, plataforma: pedido.data.plataforma },
        },
        { canal: autor.origem, usuarioId: autor.usuarioId },
      );
      return ok({ id, dispositivoId });
    });
  }
}

/** Desativa o push do dispositivo da sessão (HU30). Sem destino ativo, nada muda. */
export class DesativarDestinoPush<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly destinos: RepositorioDeDestinosPush<Transacao>,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
  ) {}

  executar(autor: AutorDoConsentimento): Promise<void> {
    const dispositivoId = autor.dispositivoId;
    if (dispositivoId === undefined) return Promise.resolve();
    return this.unidade.executar(async (tx) => {
      const id = await this.destinos.desativar(tx, autor.usuarioId, dispositivoId);
      if (id === undefined) return;
      await this.trilha.registrar(
        tx,
        {
          tipo: 'notificacoes.destino-push-desativado',
          entidade: 'destino_push',
          entidadeId: id,
          depois: { dispositivoId },
        },
        { canal: autor.origem, usuarioId: autor.usuarioId },
      );
    });
  }
}

function problemas(erro: z.ZodError): Validacao {
  return new Validacao(erro.issues.map((p) => ({ campo: p.path.join('.'), mensagem: p.message })));
}
