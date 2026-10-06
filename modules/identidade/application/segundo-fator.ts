import { Conflito, err, NaoAutenticado, ok } from '@pz/kernel';

import type { Cifra, RepositorioDeSegundoFator, SegredosDoSegundoFator } from './portas.js';
import type { Sessao } from '../domain/sessao.js';
import type { Clock, Result } from '@pz/kernel';

/** RFC 6238: passo de 30 s; aceita o passo anterior e o seguinte (relógio do celular). */
const PERIODO_MS = 30_000;
const JANELA = 1;
const QUANTIDADE_DE_CODIGOS = 10;
const FORMATO_TOTP = /^\d{6}$/;

const codigoInvalido = () => new NaoAutenticado('segundo-fator-invalido', 'Código inválido.');

function passoAtual(relogio: Clock): number {
  return Math.floor(relogio.agora().epochMs / PERIODO_MS);
}

/** Procura, na janela, um passo ainda não usado cujo código confere. */
function passoQueConfere(
  segredos: SegredosDoSegundoFator,
  segredo: string,
  codigo: string,
  atual: number,
  ultimoUsado: number | null,
): number | undefined {
  for (let desvio = -JANELA; desvio <= JANELA; desvio++) {
    const passo = atual + desvio;
    if (ultimoUsado !== null && passo <= ultimoUsado) continue;
    if (segredos.iguais(segredos.codigo(segredo, passo), codigo)) return passo;
  }
  return undefined;
}

/** Gera o segredo TOTP (pendente até ser ativado) e a URI para o QR code do aplicativo. */
export class ConfigurarSegundoFator {
  constructor(
    private readonly repositorio: RepositorioDeSegundoFator,
    private readonly segredos: SegredosDoSegundoFator,
    private readonly cifra: Cifra,
  ) {}

  async executar(sessao: Sessao): Promise<Result<{ uri: string; segredo: string }, Conflito>> {
    const dados = await this.repositorio.obter(sessao.usuarioId);
    if (dados === undefined || dados.ativo) {
      return err(new Conflito('segundo-fator-ja-ativo', 'O 2FA já está ativo para este usuário.'));
    }
    const segredo = this.segredos.novoSegredo();
    await this.repositorio.guardarSegredoPendente(sessao.usuarioId, this.cifra.cifrar(segredo));
    return ok({ uri: this.segredos.uri(segredo, dados.email), segredo });
  }
}

/**
 * Ativa o 2FA com o primeiro código do aplicativo e devolve os 10 códigos de recuperação, que
 * só são exibidos agora (guardados apenas como hash).
 */
export class AtivarSegundoFator {
  constructor(
    private readonly repositorio: RepositorioDeSegundoFator,
    private readonly segredos: SegredosDoSegundoFator,
    private readonly cifra: Cifra,
    private readonly relogio: Clock,
  ) {}

  async executar(
    sessao: Sessao,
    codigo: string,
  ): Promise<Result<{ codigosDeRecuperacao: string[] }, Conflito | NaoAutenticado>> {
    const dados = await this.repositorio.obter(sessao.usuarioId);
    if (dados === undefined || dados.ativo || dados.segredoCifrado === null) {
      return err(new Conflito('segundo-fator-nao-pendente', 'Configure o 2FA antes de ativar.'));
    }
    const segredo = this.cifra.decifrar(dados.segredoCifrado);
    const passo = FORMATO_TOTP.test(codigo)
      ? passoQueConfere(this.segredos, segredo, codigo, passoAtual(this.relogio), null)
      : undefined;
    if (passo === undefined) return err(codigoInvalido());
    const codigos = Array.from({ length: QUANTIDADE_DE_CODIGOS }, () =>
      this.segredos.novoCodigoDeRecuperacao(),
    );
    await this.repositorio.ativar(
      sessao.usuarioId,
      passo,
      this.relogio.agora(),
      codigos.map((item) => this.segredos.hashDoCodigoDeRecuperacao(item)),
    );
    return ok({ codigosDeRecuperacao: codigos });
  }
}

/** Verifica o 2FA no login: código do aplicativo (sem reutilização) ou de recuperação. */
export class VerificarSegundoFator {
  constructor(
    private readonly repositorio: RepositorioDeSegundoFator,
    private readonly segredos: SegredosDoSegundoFator,
    private readonly cifra: Cifra,
    private readonly relogio: Clock,
  ) {}

  async executar(sessao: Sessao, codigo: string): Promise<Result<void, NaoAutenticado>> {
    const dados = await this.repositorio.obter(sessao.usuarioId);
    if (dados === undefined || !dados.ativo || dados.segredoCifrado === null) {
      return err(codigoInvalido());
    }
    const limpo = codigo.replace(/[\s-]/g, '').toUpperCase();
    if (FORMATO_TOTP.test(limpo)) {
      const segredo = this.cifra.decifrar(dados.segredoCifrado);
      const passo = passoQueConfere(
        this.segredos,
        segredo,
        limpo,
        passoAtual(this.relogio),
        dados.ultimoPasso,
      );
      const aceito =
        passo !== undefined && (await this.repositorio.registrarPasso(sessao.usuarioId, passo));
      return aceito ? ok(undefined) : err(codigoInvalido());
    }
    const hash = this.segredos.hashDoCodigoDeRecuperacao(limpo);
    return (await this.repositorio.consumirCodigo(sessao.usuarioId, hash))
      ? ok(undefined)
      : err(codigoInvalido());
  }
}
