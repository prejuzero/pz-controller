import { Inject, Injectable, SetMetadata } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { processarUmaVez } from '@pz/kernel';
import { criarLogger } from '@pz/observability';

import { REGISTRO_DE_PROCESSAMENTO, UNIDADE_DE_TRABALHO } from '../fichas.js';

import type { OnModuleInit } from '@nestjs/common';
import type {
  EventoDominio,
  RegistroDeProcessamento,
  ResultadoConsumo,
  UnidadeDeTrabalho,
} from '@pz/kernel';

const CHAVE_CONSUMO = 'pz:consome';
const logger = criarLogger('worker.eventos');

interface Inscricao {
  readonly tipo: string;
  readonly versao: number;
}

/**
 * Inscreve o método como consumidor do evento `tipo` na `versao` informada (ADR-004).
 * O método recebe `(transacao, evento)`; a entrega única por consumidor é automática
 * (registro em `evento_processado` na mesma transação dos efeitos).
 *
 * @example
 * \@Consome('PrazoConfirmado', { versao: 1 })
 * tratar(transacao: Tx, evento: PrazoConfirmado) { ... }
 */
export const Consome = (tipo: string, opcoes: { versao: number }): MethodDecorator =>
  SetMetadata(CHAVE_CONSUMO, { tipo, versao: opcoes.versao } satisfies Inscricao);

type Tratador = (transacao: unknown, evento: EventoDominio) => Promise<void>;

interface Consumidor {
  /** `Classe.metodo`: identifica o consumidor na deduplicação. Renomear reprocessa eventos. */
  readonly nome: string;
  readonly tratar: Tratador;
}

/** Encontra os métodos com @Consome e entrega cada evento a todos os inscritos, uma vez só. */
@Injectable()
export class DespachanteDeEventos implements OnModuleInit {
  readonly #consumidores = new Map<string, Consumidor[]>();

  constructor(
    @Inject(DiscoveryService) private readonly descoberta: DiscoveryService,
    @Inject(MetadataScanner) private readonly varredor: MetadataScanner,
    @Inject(Reflector) private readonly refletor: Reflector,
    @Inject(UNIDADE_DE_TRABALHO) private readonly unidade: UnidadeDeTrabalho<unknown>,
    @Inject(REGISTRO_DE_PROCESSAMENTO)
    private readonly registro: RegistroDeProcessamento<unknown>,
  ) {}

  // Na inicialização dos módulos, antes do boot das filas: os consumidores já estão inscritos
  // quando o relay e o processamento começam.
  onModuleInit(): void {
    for (const provedor of this.descoberta.getProviders()) {
      const instancia: unknown = provedor.instance;
      if (instancia === null || typeof instancia !== 'object') continue;
      const prototipo = Object.getPrototypeOf(instancia) as Record<string, unknown>;
      for (const metodo of this.varredor.getAllMethodNames(prototipo)) {
        const alvo = prototipo[metodo] as (...argumentos: unknown[]) => Promise<void>;
        const inscricao = this.refletor.get<Inscricao | undefined>(CHAVE_CONSUMO, alvo);
        if (inscricao === undefined) continue;
        const chave = `${inscricao.tipo}@${String(inscricao.versao)}`;
        const nome = `${instancia.constructor.name}.${metodo}`;
        const lista = this.#consumidores.get(chave) ?? [];
        lista.push({
          nome,
          tratar: (transacao, evento) => alvo.call(instancia, transacao, evento),
        });
        this.#consumidores.set(chave, lista);
        logger.info({ evento: chave, consumidor: nome }, 'consumidor inscrito');
      }
    }
  }

  inscritos(): ReadonlyMap<string, readonly string[]> {
    return new Map(
      [...this.#consumidores].map(([chave, lista]) => [chave, lista.map((c) => c.nome)]),
    );
  }

  /** Nomes dos consumidores inscritos no tipo e versão do evento. */
  consumidoresDe(evento: EventoDominio): readonly string[] {
    return (this.#consumidores.get(`${evento.tipo}@${String(evento.versao)}`) ?? []).map(
      (c) => c.nome,
    );
  }

  /**
   * Entrega o evento a um consumidor (job `eventos.consumir`), uma vez só por consumidor.
   * Consumidor que não existe mais lança: o job vai para a DLQ e a falha fica visível.
   */
  consumir(nome: string, evento: EventoDominio): Promise<ResultadoConsumo> {
    const consumidor = (
      this.#consumidores.get(`${evento.tipo}@${String(evento.versao)}`) ?? []
    ).find((c) => c.nome === nome);
    if (consumidor === undefined) {
      return Promise.reject(
        new Error(`consumidor ${nome} não inscrito em ${evento.tipo}@${String(evento.versao)}`),
      );
    }
    return processarUmaVez(this.unidade, this.registro, consumidor.nome, evento, consumidor.tratar);
  }

  /** Entrega o evento a todos os inscritos no próprio processo (testes e uso local). */
  async despachar(evento: EventoDominio): Promise<ResultadoConsumo[]> {
    const consumidores = this.#consumidores.get(`${evento.tipo}@${String(evento.versao)}`) ?? [];
    const resultados: ResultadoConsumo[] = [];
    for (const consumidor of consumidores) {
      resultados.push(
        await processarUmaVez(
          this.unidade,
          this.registro,
          consumidor.nome,
          evento,
          consumidor.tratar,
        ),
      );
    }
    return resultados;
  }
}
