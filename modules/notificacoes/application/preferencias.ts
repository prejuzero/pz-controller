import { err, gerarUuidV7, ok, Validacao } from '@pz/kernel';
import { z } from 'zod';

import {
  ANTECEDENCIAS_PADRAO,
  MAIOR_ANTECEDENCIA,
  MAXIMO_DE_ANTECEDENCIAS,
  normalizarAntecedencias,
} from '../domain/lembrete.js';
import { HORARIO_PADRAO_DO_RESUMO, horarioValido } from '../domain/resumo.js';

import type { TrilhaDeAuditoria } from '@pz/auditoria';
import type { Clock, EventoDominio, Outbox, Result, UnidadeDeTrabalho, Uuid } from '@pz/kernel';

/** Tipos que o advogado liga ou desliga no e-mail (MVP: só e-mail). */
export const TIPOS_CONFIGURAVEIS = ['nova-intimacao', 'lembrete-prazo', 'resumo-diario'] as const;
export type TipoConfiguravel = (typeof TIPOS_CONFIGURAVEIS)[number];

export interface PreferenciasDoUsuario {
  /** Dias úteis antes do vencimento (0 = no dia). */
  readonly antecedencias: readonly number[];
  readonly horarioResumo: string;
  readonly ativos: Readonly<Record<TipoConfiguravel, boolean>>;
}

export const PREFERENCIAS_PADRAO: PreferenciasDoUsuario = {
  antecedencias: ANTECEDENCIAS_PADRAO,
  horarioResumo: HORARIO_PADRAO_DO_RESUMO,
  ativos: { 'nova-intimacao': true, 'lembrete-prazo': true, 'resumo-diario': true },
};

/** Porta: preferências gravadas (tabela `preferencia_notificacao`, RLS); ausente = padrão. */
export interface RepositorioDePreferencias<Transacao> {
  ler(transacao: Transacao, usuarioId: Uuid): Promise<Partial<PreferenciasDoUsuario>>;
  gravar(
    transacao: Transacao,
    tenantId: Uuid,
    usuarioId: Uuid,
    preferencias: PreferenciasDoUsuario,
  ): Promise<void>;
}

export const PedidoDePreferencias = z
  .object({
    antecedencias: z
      .array(z.number().int().min(0).max(MAIOR_ANTECEDENCIA))
      .min(1)
      .max(MAXIMO_DE_ANTECEDENCIAS),
    horarioResumo: z.string().refine(horarioValido, 'Use HH:MM (00:00 a 23:59).'),
    ativos: z
      .object({
        'nova-intimacao': z.boolean(),
        'lembrete-prazo': z.boolean(),
        'resumo-diario': z.boolean(),
      })
      .strict(),
  })
  .strict();

export type PreferenciasAlteradas = EventoDominio<
  'PreferenciasDeNotificacaoAlteradas',
  { usuarioId: Uuid }
>;

export interface AutorDasPreferencias {
  readonly tenantId: Uuid;
  readonly usuarioId: Uuid;
  readonly canal: 'portal' | 'app' | 'mcp' | 'integrador';
}

const completar = (lidas: Partial<PreferenciasDoUsuario>): PreferenciasDoUsuario => ({
  antecedencias: lidas.antecedencias ?? PREFERENCIAS_PADRAO.antecedencias,
  horarioResumo: lidas.horarioResumo ?? PREFERENCIAS_PADRAO.horarioResumo,
  ativos: { ...PREFERENCIAS_PADRAO.ativos, ...lidas.ativos },
});

/** GET /v1/notificacoes/preferencias: as gravadas, completadas com o padrão. */
export class ConsultarPreferencias<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly preferencias: RepositorioDePreferencias<Transacao>,
  ) {}

  async executar(usuarioId: Uuid): Promise<PreferenciasDoUsuario> {
    return completar(await this.unidade.executar((tx) => this.preferencias.ler(tx, usuarioId)));
  }
}

/**
 * PUT /v1/notificacoes/preferencias (HU31): grava, audita e publica o evento na mesma transação;
 * o worker reprograma os lembretes futuros do usuário.
 */
export class AlterarPreferencias<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly preferencias: RepositorioDePreferencias<Transacao>,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
    private readonly outbox: Outbox<Transacao>,
    private readonly relogio: Clock,
  ) {}

  async executar(
    autor: AutorDasPreferencias,
    entrada: unknown,
  ): Promise<Result<PreferenciasDoUsuario, Validacao>> {
    const pedido = PedidoDePreferencias.safeParse(entrada);
    if (!pedido.success) {
      return err(
        new Validacao(
          pedido.error.issues.map((p) => ({ campo: p.path.join('.'), mensagem: p.message })),
        ),
      );
    }
    const novas: PreferenciasDoUsuario = {
      ...pedido.data,
      antecedencias: normalizarAntecedencias(pedido.data.antecedencias),
    };
    return this.unidade.executar(async (tx) => {
      const antes = completar(await this.preferencias.ler(tx, autor.usuarioId));
      await this.preferencias.gravar(tx, autor.tenantId, autor.usuarioId, novas);
      await this.trilha.registrar(
        tx,
        {
          tipo: 'notificacoes.preferencias-alteradas',
          entidade: 'usuario',
          entidadeId: autor.usuarioId,
          antes: { ...antes },
          depois: { ...novas },
        },
        { canal: autor.canal, usuarioId: autor.usuarioId },
      );
      const evento: PreferenciasAlteradas = {
        id: gerarUuidV7(this.relogio),
        tipo: 'PreferenciasDeNotificacaoAlteradas',
        versao: 1,
        tenantId: autor.tenantId,
        agregadoId: autor.usuarioId,
        ocorridoEm: this.relogio.agora(),
        payload: { usuarioId: autor.usuarioId },
      };
      await this.outbox.gravar(tx, [evento]);
      return ok(novas);
    });
  }
}
