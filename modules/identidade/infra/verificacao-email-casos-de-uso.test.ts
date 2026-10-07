import { randomBytes } from 'node:crypto';

import { FixedClock, gerarUuidV7, Instant } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { EnviarAvisosDeSeguranca } from '../application/avisos.js';
import {
  SolicitarVerificacaoDeEmail,
  VALIDADE_DA_VERIFICACAO_MS,
  VerificarEmail,
} from '../application/verificacao-email.js';

import { RedefinicoesEmMemoria } from './em-memoria.js';
import { CifraAesGcm } from './segundo-fator.js';

import type { Email } from '../domain/credenciais.js';
import type { EmailCanonico, ProvedorEmail } from '@pz/integracoes';
import type { Uuid } from '@pz/kernel';

// Dados FICTÍCIOS.
const relogio = new FixedClock(Instant.deIso('2026-10-07T12:00:00Z'));
const USUARIO = gerarUuidV7();
const TENANT = gerarUuidV7();
const conta = { usuarioId: USUARIO, tenantId: TENANT, email: 'ana@exemplo.invalid' as Email };

function montar() {
  const verificacoes = new RedefinicoesEmMemoria();
  const cifra = new CifraAesGcm(randomBytes(32).toString('base64'));
  const verificados: { usuarioId: Uuid; em: Instant; tenant: string }[] = [];
  let tenantAtual = '';
  const noTenant = <R>(tenant: string, trabalho: () => Promise<R>) => {
    tenantAtual = tenant;
    return trabalho();
  };
  const usuarios = {
    marcarVerificado: (_tx: object, usuarioId: Uuid, em: Instant) => {
      verificados.push({ usuarioId, em, tenant: tenantAtual });
      return Promise.resolve();
    },
  };
  const trilha: string[] = [];
  const unidade = { executar: <R>(trabalho: (tx: object) => Promise<R>) => trabalho({}) };
  const registrar = {
    registrar: (_tx: object, entrada: { tipo: string }) => {
      trilha.push(entrada.tipo);
      return Promise.resolve();
    },
  };
  return {
    cifra,
    verificados,
    solicitar: new SolicitarVerificacaoDeEmail(
      verificacoes,
      { novoToken: () => 'tok<en>' },
      cifra,
      relogio,
    ),
    verificar: new VerificarEmail(verificacoes, unidade, usuarios, registrar, noTenant, relogio),
    trilha,
  };
}

describe('verificação do e-mail (HU11)', () => {
  it('prepara o evento com o token cifrado; o link confirma uma vez, no tenant da conta', async () => {
    const { solicitar, verificar, verificados, cifra, trilha } = montar();
    const evento = await solicitar.preparar(conta);
    expect(evento).toMatchObject({ tipo: 'VerificacaoDeEmailSolicitada', tenantId: TENANT });
    expect(cifra.decifrar(evento.payload.tokenCifrado)).toBe('tok<en>');
    expect((await verificar.executar('tok<en>')).ok).toBe(true);
    expect(verificados).toEqual([{ usuarioId: USUARIO, em: relogio.agora(), tenant: TENANT }]);
    expect(trilha).toEqual(['identidade.email-verificado']);
    const reuso = await verificar.executar('tok<en>');
    expect(!reuso.ok && reuso.erro.codigo).toBe('verificacao-invalida');
    expect(VALIDADE_DA_VERIFICACAO_MS).toBe(24 * 60 * 60_000);
  });

  it('e-mail com o link no fragmento, escapado no HTML; usuário inexistente não gera envio', async () => {
    const { cifra } = montar();
    const enviados: EmailCanonico[] = [];
    const email: ProvedorEmail = {
      enviar: (mensagem) => {
        enviados.push(mensagem);
        return Promise.resolve({ idExterno: 'x', aceitoEm: relogio.agora() });
      },
      saude: () => Promise.resolve({ estado: 'operacional', verificadoEm: relogio.agora() }),
    };
    const avisos = new EnviarAvisosDeSeguranca(
      email,
      { emailDe: (_tx, id) => Promise.resolve(id === USUARIO ? 'ana@exemplo.invalid' : undefined) },
      cifra,
      'https://app.prejuzero.com.br',
    );
    const base = { versao: 1, tenantId: TENANT, agregadoId: USUARIO, ocorridoEm: relogio.agora() };
    const id = gerarUuidV7();
    await avisos.verificacaoDeEmailSolicitada(undefined, {
      ...base,
      id,
      tipo: 'VerificacaoDeEmailSolicitada',
      payload: { usuarioId: USUARIO, tokenCifrado: cifra.cifrar('tok<en>') },
    });
    await avisos.verificacaoDeEmailSolicitada(undefined, {
      ...base,
      id: gerarUuidV7(),
      tipo: 'VerificacaoDeEmailSolicitada',
      payload: { usuarioId: gerarUuidV7(), tokenCifrado: 'x' },
    });
    expect(enviados).toHaveLength(1);
    expect(enviados[0]).toMatchObject({ idempotencia: id, para: ['ana@exemplo.invalid'] });
    expect(enviados[0]?.texto).toContain(
      'https://app.prejuzero.com.br/verificar-email#token=tok<en>',
    );
    expect(enviados[0]?.html).toContain('#token=tok&#60;en&#62;');
  });
});
