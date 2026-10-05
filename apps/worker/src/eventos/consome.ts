import { Inject, Injectable, SetMetadata } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { processarUmaVez } from '@pz/kernel';
import { criarLogger } from '@pz/observability';

import { REGISTRO_DE_PROCESSAMENTO, UNIDADE_DE_TRABALHO } from '../fichas.js';

import type { OnApplicationBootstrap } from '@nestjs/common';
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
export class DespachanteDeEventos implements OnApplicationBootstrap {
  readonly #consumidores = new Map<string, Consumidor[]>();

  constructor(
    @Inject(DiscoveryService) private readonly descoberta: DiscoveryService,
    @Inject(MetadataScanner) private readonly varredor: MetadataScanner,
    @Inject(Reflector) private readonly refletor: Reflector,
    @Inject(UNIDADE_DE_TRABALHO) private readonly unidade: UnidadeDeTrabalho<unknown>,
    @Inject(REGISTRO_DE_PROCESSAMENTO)
    private readonly registro: RegistroDeProcessamento<unknown>,
  ) {}

  onApplicationBootstrap(): void {
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

  /** Entrega o evento a cada consumidor inscrito. Lança se algum falhar (a fila tenta de novo). */
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
