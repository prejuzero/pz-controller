import { tenantAtual } from '@pz/db';
import { LocalDate } from '@pz/kernel';
import { z } from 'zod';

import type { AlteracaoDoCalendario, CacheDeDiasNaoUteis } from '../application/portas.js';
import type { DiaNaoUtil, Jurisdicao } from '../domain/dias-nao-uteis.js';
import type { Uuid } from '@pz/kernel';
import type { Redis } from 'ioredis';

/** Rede de segurança: mesmo sem invalidação, nada fica em cache por mais de um dia. */
const VALIDADE_S = 24 * 60 * 60;

const Data = z.string().transform((texto, contexto) => {
  const data = LocalDate.analisar(texto);
  if (data.ok) return data.valor;
  contexto.addIssue({ code: 'custom', message: 'data inválida no cache' });
  return z.NEVER;
});
const Gravado = z.object({
  geracoes: z.tuple([z.string(), z.string()]),
  dias: z.array(
    z.object({
      data: Data,
      tipo: z.enum(['feriado', 'recesso', 'portaria', 'indisponibilidade']),
      motivo: z.string(),
      fonte: z.object({
        origem: z.enum(['global', 'local']),
        eventoId: z.uuid().transform((id) => id as Uuid),
        atoNormativo: z.string(),
        urlAto: z.string(),
      }),
    }),
  ),
});

const parte = (valor: string | undefined) => encodeURIComponent(valor ?? '');

/**
 * Cache Redis por (tenant, jurisdição, ano) (HU13). A invalidação incrementa contadores de
 * geração por ano: um global (alteração do curador vale para todos) e um por tenant (feriados
 * locais). A entrada guarda as gerações lidas ANTES de consultar o banco; se alguma mudou, é
 * descartada. Assim uma leitura concorrente com uma alteração nunca deixa dado velho válido.
 * Uma única ida ao Redis por ano consultado (MGET).
 */
export class CacheDeDiasNaoUteisRedis implements CacheDeDiasNaoUteis {
  constructor(
    private readonly redis: Redis,
    /** Falha de leitura ou gravação: o cálculo segue pelo banco, mas a falha é sinalizada. */
    private readonly aoFalhar: (erro: unknown) => void,
    private readonly tenant: () => Uuid | undefined = tenantAtual,
    private readonly prefixo = 'pz:calendario:',
  ) {}

  async doAno(
    jurisdicao: Jurisdicao,
    ano: number,
    calcular: () => Promise<DiaNaoUtil[]>,
  ): Promise<DiaNaoUtil[]> {
    const tenantId = this.tenant();
    // Sem tenant não há como separar os feriados locais: não usa cache.
    if (tenantId === undefined) return calcular();
    const chave = this.chave(tenantId, jurisdicao, ano);
    let geracoes: [string, string];
    try {
      const [global, local, valor] = await this.redis.mget(
        this.geracao('global', ano),
        this.geracao(tenantId, ano),
        chave,
      );
      geracoes = [global ?? '0', local ?? '0'];
      const gravado = typeof valor === 'string' ? Gravado.safeParse(JSON.parse(valor)) : undefined;
      if (gravado?.success === true && gravado.data.geracoes.join() === geracoes.join()) {
        return gravado.data.dias;
      }
    } catch (erro) {
      this.aoFalhar(erro);
      return calcular();
    }
    const dias = await calcular();
    const valor = JSON.stringify({
      geracoes,
      dias: dias.map((d) => ({ ...d, data: d.data.paraIso() })),
    });
    await this.redis.set(chave, valor, 'EX', VALIDADE_S).catch((erro: unknown) => {
      this.aoFalhar(erro);
    });
    return dias;
  }

  async invalidar({ origem, tenantId, anos }: AlteracaoDoCalendario): Promise<void> {
    if (anos.length === 0) return;
    const multi = this.redis.multi();
    for (const ano of anos) {
      const chave = this.geracao(origem === 'global' ? 'global' : tenantId, ano);
      // A geração vive mais que as entradas que ela invalida.
      multi.incr(chave).expire(chave, 2 * VALIDADE_S);
    }
    const resultado = await multi.exec();
    const falha = resultado?.find(([erro]) => erro !== null)?.[0];
    if (resultado === null || falha !== undefined) {
      throw falha ?? new Error('invalidação do cache do calendário não executada');
    }
  }

  private geracao(escopo: string, ano: number): string {
    return `${this.prefixo}geracao:${escopo}:${String(ano)}`;
  }

  private chave(tenantId: Uuid, j: Jurisdicao, ano: number): string {
    const local = [j.uf, j.municipioIbge, j.tribunal, j.comarca].map(parte).join('|');
    return `${this.prefixo}dias:${tenantId}:${local}:${String(ano)}`;
  }
}
