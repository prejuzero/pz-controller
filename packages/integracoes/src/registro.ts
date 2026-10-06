import { criarLogger, registrarErro } from '@pz/observability';
import { z } from 'zod';

import { DescritorAdaptador, NomePorta } from './descritor.js';
import { ErroPermanente } from './erros.js';
import { MetadadosArquivo } from './portas/armazenamento.js';
import { EventoEntrega, ResultadoEnvio } from './portas/canal-notificacao.js';
import { PublicacaoCapturada } from './portas/fonte-publicacoes.js';
import { Resiliencia } from './resiliencia.js';
import { MonitorDeSaude } from './saude.js';

import type { LimitadorDeTaxa } from './limitador.js';
import type { ArmazenamentoArquivos } from './portas/armazenamento.js';
import type { CanalNotificacao } from './portas/canal-notificacao.js';
import type { FontePublicacoes } from './portas/fonte-publicacoes.js';
import type { ProvedorEmail } from './portas/provedor-email.js';
import type { ProvedorIA } from './portas/provedor-ia.js';
import type { PoliticaDeResiliencia } from './resiliencia.js';
import type { SituacaoAdaptador } from './saude.js';
import type { Clock } from '@pz/kernel';

const logger = criarLogger('integracoes.registro');

export interface MapaDePortas {
  'fonte-publicacoes': FontePublicacoes;
  'canal-notificacao': CanalNotificacao;
  'provedor-email': ProvedorEmail;
  'provedor-ia': ProvedorIA;
  'armazenamento-arquivos': ArmazenamentoArquivos;
}

interface Operacao {
  /** Chamada ao provedor (resiliência completa) ou só conversão local (só validação). */
  readonly remota: boolean;
  /** Schema da saída canônica; null quando quem valida é o chamador (ex.: saída da IA). */
  readonly saida: z.ZodType | null;
}

/**
 * Operações de cada porta. A saída do adaptador é validada contra o modelo canônico: dado fora
 * do contrato vira erro, nunca entra no domínio (camada anticorrupção).
 */
const OPERACOES: Readonly<Record<NomePorta, Readonly<Record<string, Operacao>>>> = {
  'fonte-publicacoes': {
    buscarPorOab: { remota: true, saida: z.array(PublicacaoCapturada) },
    buscarPorProcesso: { remota: true, saida: z.array(PublicacaoCapturada) },
  },
  'canal-notificacao': {
    enviar: { remota: true, saida: ResultadoEnvio },
    interpretarWebhook: { remota: false, saida: z.array(EventoEntrega) },
  },
  'provedor-email': { enviar: { remota: true, saida: ResultadoEnvio } },
  'provedor-ia': {
    gerarEstruturado: { remota: true, saida: null },
    enviarLote: { remota: true, saida: z.string().min(1) },
  },
  'armazenamento-arquivos': {
    gravar: { remota: true, saida: z.undefined() },
    urlAssinada: { remota: true, saida: z.url() },
    remover: { remota: true, saida: z.undefined() },
    metadados: { remota: true, saida: MetadadosArquivo.optional() },
  },
};

const IdAdaptador = DescritorAdaptador.shape.id;

/**
 * Qual adaptador atende cada porta: um padrão global e, por feature flag, outro por tenant
 * (ex.: piloto de um novo provedor com um escritório). Trocar de provedor é configuração.
 */
export const ConfiguracaoIntegracoes = z
  .object({
    padrao: z.partialRecord(NomePorta, IdAdaptador),
    porTenant: z.record(z.uuid(), z.partialRecord(NomePorta, IdAdaptador)).default({}),
  })
  .strict();
export type ConfiguracaoIntegracoes = z.input<typeof ConfiguracaoIntegracoes>;

interface Registrado {
  readonly descritor: DescritorAdaptador;
  readonly fabrica: () => object;
  instancia?: object;
}

/**
 * Registro de adaptadores (HU09): cada adaptador é declarado com descritor e fábrica, e quem usa
 * pede a porta, nunca o provedor. A instância entregue já vem com resiliência, telemetria,
 * validação da saída e saúde: um adaptador novo herda tudo sem código extra.
 */
export class RegistroDeAdaptadores {
  readonly #adaptadores = new Map<string, Registrado>();
  readonly #configuracao: z.output<typeof ConfiguracaoIntegracoes>;
  readonly #saude: MonitorDeSaude;

  constructor(
    configuracao: ConfiguracaoIntegracoes,
    private readonly dependencias: {
      readonly relogio: Clock;
      readonly limitador?: LimitadorDeTaxa;
      readonly politica?: Partial<PoliticaDeResiliencia>;
    },
  ) {
    this.#configuracao = ConfiguracaoIntegracoes.parse(configuracao);
    this.#saude = new MonitorDeSaude(dependencias.relogio);
  }

  registrar<P extends NomePorta>(
    descritor: DescritorAdaptador & { readonly porta: P },
    fabrica: () => MapaDePortas[P],
  ): void {
    if (this.#adaptadores.has(descritor.id)) {
      throw new Error(`Adaptador ${descritor.id} já registrado`);
    }
    this.#adaptadores.set(descritor.id, {
      descritor: DescritorAdaptador.parse(descritor),
      fabrica,
    });
  }

  /**
   * Confere no boot que toda porta configurada aponta para um adaptador registrado da porta
   * certa: configuração errada derruba a subida em vez de falhar na primeira chamada.
   */
  validar(): void {
    const escolhas = [
      ...Object.entries(this.#configuracao.padrao),
      ...Object.values(this.#configuracao.porTenant).flatMap((porta) => Object.entries(porta)),
    ];
    for (const [porta, id] of escolhas) this.#registrado(porta as NomePorta, id);
  }

  /** A porta pedida, com o adaptador escolhido pela configuração (do tenant, se houver). */
  obter<P extends NomePorta>(porta: P, tenantId?: string): MapaDePortas[P] {
    const id =
      (tenantId === undefined ? undefined : this.#configuracao.porTenant[tenantId]?.[porta]) ??
      this.#configuracao.padrao[porta];
    if (id === undefined) throw new Error(`Nenhum adaptador configurado para ${porta}`);
    const registrado = this.#registrado(porta, id);
    registrado.instancia ??= this.#envolver(registrado);
    return registrado.instancia as MapaDePortas[P];
  }

  /** Situação de cada adaptador já usado nesta instância (saúde e painel de integrações). */
  situacao(): SituacaoAdaptador[] {
    return this.#saude.situacao();
  }

  #registrado(porta: NomePorta, id: string): Registrado {
    const registrado = this.#adaptadores.get(id);
    if (registrado === undefined) throw new Error(`Adaptador ${id} (${porta}) não registrado`);
    if (registrado.descritor.porta !== porta) {
      throw new Error(`Adaptador ${id} implementa ${registrado.descritor.porta}, não ${porta}`);
    }
    return registrado;
  }

  #envolver({ descritor, fabrica }: Registrado): object {
    const alvo = fabrica();
    const resiliencia = new Resiliencia(descritor, {
      saude: this.#saude,
      ...(this.dependencias.limitador === undefined
        ? {}
        : { limitador: this.dependencias.limitador }),
      ...(this.dependencias.politica === undefined ? {} : { politica: this.dependencias.politica }),
    });
    const operacoes = OPERACOES[descritor.porta];
    return new Proxy(alvo, {
      get(objeto, nome, receptor): unknown {
        const valor: unknown = Reflect.get(objeto, nome, receptor);
        const operacao = typeof nome === 'string' ? operacoes[nome] : undefined;
        if (operacao === undefined || typeof valor !== 'function') return valor;
        return async (...argumentos: unknown[]) => {
          const chamar = () => Promise.resolve(valor.apply(objeto, argumentos) as unknown);
          const resultado = operacao.remota
            ? await resiliencia.executar(String(nome), chamar)
            : await chamar();
          return validarSaida(descritor.id, String(nome), operacao.saida, resultado);
        };
      },
    });
  }
}

function validarSaida(
  adaptador: string,
  operacao: string,
  saida: z.ZodType | null,
  valor: unknown,
): unknown {
  if (saida === null) return valor;
  const resultado = saida.safeParse(valor);
  if (resultado.success) return resultado.data;
  const erro = new ErroPermanente(
    `adaptador ${adaptador} devolveu ${operacao} fora do contrato`,
    adaptador,
    {
      causa: resultado.error,
    },
  );
  registrarErro(logger, erro, erro.message, 'integracoes.contrato');
  throw erro;
}
