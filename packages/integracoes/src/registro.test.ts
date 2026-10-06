import { FixedClock, gerarUuidV7, Instant } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { definirDescritor } from './descritor.js';
import {
  ErroCredencialInvalida,
  ErroLimiteExcedido,
  ErroPermanente,
  ErroTransitorio,
} from './erros.js';
import { LimitadorEmMemoria } from './limitador.js';
import { RegistroDeAdaptadores } from './registro.js';
import { sinalDaChamada } from './resiliencia.js';

import type { ArmazenamentoArquivos, MetadadosArquivo } from './portas/armazenamento.js';

const relogio = new FixedClock(Instant.deIso('2026-10-06T12:00:00Z'));
const TENANT = gerarUuidV7();
const POLITICA = {
  tentativas: 3,
  atrasoInicialMs: 5,
  atrasoMaximoMs: 20,
  falhasParaAbrir: 3,
  meioAbertoAposMs: 150,
  timeoutMs: 100,
} as const;

const descritor = (id: string, limites = {}) =>
  definirDescritor({
    id,
    porta: 'armazenamento-arquivos',
    versao: '1.0.0',
    capacidades: {},
    limites,
    requerCredenciais: false,
  });

/** Armazenamento falso: cada chamada a `metadados` executa o próximo comportamento roteirizado. */
class ArmazenamentoRoteirizado implements ArmazenamentoArquivos {
  chamadas = 0;
  constructor(private readonly roteiro: (() => Promise<unknown>)[]) {}
  async metadados(): Promise<MetadadosArquivo | undefined> {
    const passo = this.roteiro[Math.min(this.chamadas, this.roteiro.length - 1)];
    this.chamadas += 1;
    return (await passo?.()) as MetadadosArquivo | undefined;
  }
  gravar = () => Promise.resolve();
  urlAssinada = () => Promise.resolve('https://arquivos.exemplo.invalid/assinada');
  remover = () => Promise.resolve();
  saude = () => Promise.resolve({ estado: 'operacional' as const, verificadoEm: relogio.agora() });
}

const ok = (): Promise<unknown> =>
  Promise.resolve({ tamanhoBytes: 1, tipoMime: 'application/pdf', atualizadoEm: relogio.agora() });
const falha = (erro: Error) => (): Promise<unknown> => Promise.reject(erro);

function montar(roteiro: (() => Promise<unknown>)[], limites = {}) {
  const adaptador = new ArmazenamentoRoteirizado(roteiro);
  const registro = new RegistroDeAdaptadores(
    { padrao: { 'armazenamento-arquivos': 'falso' } },
    { relogio, politica: POLITICA, limitador: new LimitadorEmMemoria() },
  );
  registro.registrar(descritor('falso', limites), () => adaptador);
  return { adaptador, registro, porta: registro.obter('armazenamento-arquivos') };
}

describe('resiliência herdada pelo adaptador', () => {
  it('falha transitória é repetida com backoff até dar certo', async () => {
    const { adaptador, porta, registro } = montar([
      falha(new ErroTransitorio('503', 'falso')),
      falha(new ErroTransitorio('503', 'falso')),
      ok,
    ]);
    expect(await porta.metadados(TENANT, 'a.pdf')).toMatchObject({ tamanhoBytes: 1 });
    expect(adaptador.chamadas).toBe(3);
    expect(registro.situacao()).toEqual([
      { adaptador: 'falso', estado: 'operacional', ultimoSucesso: relogio.agora() },
    ]);
  });

  it('esgotadas as tentativas, o erro classificado chega a quem chamou e a saúde registra', async () => {
    const { adaptador, porta, registro } = montar([falha(new ErroLimiteExcedido('429', 'falso'))]);
    await expect(porta.metadados(TENANT, 'a.pdf')).rejects.toBeInstanceOf(ErroLimiteExcedido);
    expect(adaptador.chamadas).toBe(3);
    expect(registro.situacao()[0]).toMatchObject({
      estado: 'operacional', // cota não indica provedor fora do ar
      erro: 'ErroLimiteExcedido: 429',
      ultimaFalha: relogio.agora(),
    });
  });

  it('erro permanente e credencial inválida não são repetidos', async () => {
    for (const erro of [
      new ErroPermanente('404', 'falso'),
      new ErroCredencialInvalida('401', 'falso'),
    ]) {
      const { adaptador, porta } = montar([falha(erro)]);
      await expect(porta.metadados(TENANT, 'a.pdf')).rejects.toBe(erro);
      expect(adaptador.chamadas).toBe(1);
    }
  });

  it('erro sem classificação é defeito do adaptador: vira permanente, sem repetir', async () => {
    const { adaptador, porta } = montar([falha(new TypeError('x is undefined'))]);
    const erro = await porta.metadados(TENANT, 'a.pdf').catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroPermanente);
    expect((erro as Error).cause).toBeInstanceOf(TypeError);
    expect(adaptador.chamadas).toBe(1);
  });

  it('timeout corta a tentativa (o adaptador recebe o sinal) e conta como transitória', async () => {
    let sinal: AbortSignal | undefined;
    const { adaptador, porta } = montar(
      [
        () => {
          sinal = sinalDaChamada();
          return new Promise(() => undefined); // provedor que nunca responde
        },
        ok,
      ],
      { timeoutMs: 30 },
    );
    expect(await porta.metadados(TENANT, 'a.pdf')).toMatchObject({ tamanhoBytes: 1 });
    expect(sinal?.aborted).toBe(true);
    expect(adaptador.chamadas).toBe(2);
  });

  it('o circuito abre após falhas seguidas, recusa sem chamar o provedor e fecha depois da janela', async () => {
    const roteiro = [falha(new ErroTransitorio('503', 'falso'))];
    const { adaptador, porta, registro } = montar(roteiro);

    // 3 falhas seguidas (as 3 tentativas da 1ª chamada) abrem o circuito.
    await expect(porta.metadados(TENANT, 'a.pdf')).rejects.toBeInstanceOf(ErroTransitorio);
    expect(adaptador.chamadas).toBe(3);
    expect(registro.situacao()[0]?.estado).toBe('indisponivel');

    const erro = await porta.metadados(TENANT, 'a.pdf').catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroTransitorio);
    expect((erro as Error).message).toContain('circuito aberto');
    expect(adaptador.chamadas).toBe(3); // nem chegou ao provedor

    // Passada a janela, uma chamada de teste (meio-aberto) bem-sucedida fecha o circuito.
    roteiro[0] = ok;
    await new Promise((resolver) => setTimeout(resolver, 200));
    expect(await porta.metadados(TENANT, 'a.pdf')).toMatchObject({ tamanhoBytes: 1 });
    expect(registro.situacao()[0]?.estado).toBe('operacional');
  });

  it('cota não abre o circuito', async () => {
    const { porta, registro } = montar([falha(new ErroLimiteExcedido('429', 'falso'))]);
    for (let i = 0; i < 3; i++) await porta.metadados(TENANT, 'a.pdf').catch(() => undefined);
    expect(registro.situacao()[0]?.estado).toBe('operacional');
  });

  it('bulkhead: além da concorrência e da fila, recusa na hora com limite excedido', async () => {
    const adaptador = new ArmazenamentoRoteirizado([
      () =>
        new Promise((resolver) =>
          setTimeout(() => {
            resolver(undefined);
          }, 50),
        ),
    ]);
    const registro = new RegistroDeAdaptadores(
      { padrao: { 'armazenamento-arquivos': 'lento' } },
      { relogio, politica: { ...POLITICA, filaDeEspera: 0 } },
    );
    registro.registrar(descritor('lento', { concorrencia: 1 }), () => adaptador);
    const porta = registro.obter('armazenamento-arquivos');
    const [primeira, segunda] = await Promise.allSettled([
      porta.metadados(TENANT, 'a.pdf'),
      porta.metadados(TENANT, 'b.pdf'),
    ]);
    expect(primeira.status).toBe('fulfilled');
    expect((segunda as PromiseRejectedResult).reason).toBeInstanceOf(ErroLimiteExcedido);
  });

  it('rate limit do descritor espaça as chamadas', async () => {
    // 600/min = 10/s, capacidade de 10 fichas: a 11ª chamada espera ~100 ms.
    const { porta } = montar([ok], { requisicoesPorMinuto: 600 });
    const inicio = performance.now();
    await Promise.all(Array.from({ length: 11 }, () => porta.metadados(TENANT, 'a.pdf')));
    expect(performance.now() - inicio).toBeGreaterThanOrEqual(80);
  });
});

describe('validação da saída (camada anticorrupção)', () => {
  it('dado fora do modelo canônico vira erro permanente, não entra no domínio', async () => {
    const { porta } = montar([() => Promise.resolve({ tamanhoBytes: -1, tipoMime: '' })]);
    await expect(porta.metadados(TENANT, 'a.pdf')).rejects.toThrow('fora do contrato');
  });

  it('métodos fora do catálogo de operações passam direto', async () => {
    const { porta } = montar([ok]);
    expect((await porta.saude()).estado).toBe('operacional');
  });
});

describe('registro por configuração', () => {
  function registroCom(configuracao: ConstructorParameters<typeof RegistroDeAdaptadores>[0]) {
    const registro = new RegistroDeAdaptadores(configuracao, { relogio });
    const padrao = new ArmazenamentoRoteirizado([ok]);
    const piloto = new ArmazenamentoRoteirizado([ok]);
    registro.registrar(descritor('padrao'), () => padrao);
    registro.registrar(descritor('piloto'), () => piloto);
    return { registro, padrao, piloto };
  }

  it('escolhe o adaptador do tenant (feature flag) e cai no padrão para os demais', async () => {
    const { registro, padrao, piloto } = registroCom({
      padrao: { 'armazenamento-arquivos': 'padrao' },
      porTenant: { [TENANT]: { 'armazenamento-arquivos': 'piloto' } },
    });
    registro.validar();
    await registro.obter('armazenamento-arquivos', TENANT).metadados(TENANT, 'a.pdf');
    await registro.obter('armazenamento-arquivos', gerarUuidV7()).metadados(TENANT, 'a.pdf');
    await registro.obter('armazenamento-arquivos').metadados(TENANT, 'a.pdf');
    expect([piloto.chamadas, padrao.chamadas]).toEqual([1, 2]);
    // Uma instância (e um circuito) por adaptador.
    expect(registro.obter('armazenamento-arquivos')).toBe(registro.obter('armazenamento-arquivos'));
  });

  it('configuração errada falha no boot', () => {
    expect(() => {
      registroCom({ padrao: { 'armazenamento-arquivos': 'inexistente' } }).registro.validar();
    }).toThrow('não registrado');
    expect(() => {
      registroCom({ padrao: { 'provedor-email': 'padrao' } }).registro.validar();
    }).toThrow('implementa armazenamento-arquivos');
    expect(() => registroCom({ padrao: {} }).registro.obter('provedor-ia')).toThrow(
      'Nenhum adaptador configurado',
    );
    expect(() => registroCom({ padrao: { 'provedor-ia': 'Com Espaco' } })).toThrow();
    const { registro } = registroCom({ padrao: {} });
    expect(() => {
      registro.registrar(descritor('padrao'), () => new ArmazenamentoRoteirizado([ok]));
    }).toThrow('já registrado');
  });
});
