import { randomBytes } from 'node:crypto';

import { FixedClock, gerarUuidV7, Instant, OutboxEmMemoria } from '@pz/kernel';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  ConfirmarCiencia,
  ConsultarLinkDeCiencia,
  EmitirLinkDeCiencia,
  RegistrarIndicioDeCiencia,
} from '../application/ciencia.js';

import { CienciaEmMemoria } from './em-memoria.js';
import { TokensHmac } from './tokens.js';

import type { PrazoParaCiencia } from '../application/ciencia.js';
import type { EntradaDeAuditoria, OrigemDaAuditoria, TrilhaDeAuditoria } from '@pz/auditoria';
import type { TransacaoEmMemoria, Uuid } from '@pz/kernel';

// Dados FICTÍCIOS (HU33, PZ-206).
const TENANT = gerarUuidV7();
const ANA = gerarUuidV7();
const PRAZO = gerarUuidV7();
const OUTRO_PRAZO = gerarUuidV7();
const PORTAL = 'https://app.exemplo.invalid';
const contexto = { ip: '203.0.113.7', userAgent: 'Navegador Fictício/1.0' };

let relogio: FixedClock;
let outbox: OutboxEmMemoria;
let repo: CienciaEmMemoria;
let status: PrazoParaCiencia['status'];
let auditados: { entrada: EntradaDeAuditoria; origem: OrigemDaAuditoria }[];
const tokens = new TokensHmac(randomBytes(32));
const trilha: TrilhaDeAuditoria<TransacaoEmMemoria> = {
  registrar: (tx, entrada, origem) => {
    tx.aoConfirmar(() => auditados.push({ entrada, origem }));
    return Promise.resolve();
  },
};
const prazos = (prazoId: Uuid) =>
  Promise.resolve(
    prazoId === PRAZO || prazoId === OUTRO_PRAZO
      ? {
          prazoId,
          numeroProcesso: '0000001-09.2030.8.09.0001',
          tipoAto: 'contestacao',
          vencimento: '2026-11-13',
          status,
        }
      : undefined,
  );
const noTenant = <T>(_t: Uuid, f: () => Promise<T>) => f();
const emitir = (prazoId = PRAZO) =>
  outbox.executar((tx) =>
    new EmitirLinkDeCiencia(repo, tokens, PORTAL, relogio).executar(tx, {
      tenantId: TENANT,
      prazoId,
      usuarioId: ANA,
    }),
  );
const tokenDe = (link: string) => link.slice(`${PORTAL}/ciencia/`.length);
const consultar = () => new ConsultarLinkDeCiencia(noTenant, outbox, repo, tokens, prazos, relogio);
const confirmar = () =>
  new ConfirmarCiencia(noTenant, outbox, repo, tokens, prazos, trilha, outbox, relogio);

beforeEach(() => {
  relogio = new FixedClock(Instant.deIso('2026-11-03T12:00:00.000Z'));
  outbox = new OutboxEmMemoria();
  repo = new CienciaEmMemoria();
  status = 'pendente';
  auditados = [];
});

describe('ciência pelo link do e-mail (HU33)', () => {
  it('o link abre a consulta (não confirma); o POST confirma uma vez, com auditoria e evento', async () => {
    const link = await emitir();
    expect(link.startsWith(`${PORTAL}/ciencia/v1.`)).toBe(true);
    expect([...repo.tokens.keys()][0]).toMatch(/^[0-9a-f]{64}$/);
    expect([...repo.tokens.keys()][0]).not.toBe(tokenDe(link));
    expect(repo.estados.get(PRAZO)?.estado).toBe('enviado');

    // Consultar quantas vezes for (varredor de links) não registra nada.
    for (let i = 0; i < 3; i++) {
      expect(await consultar().executar(tokenDe(link))).toMatchObject({
        situacao: 'valido',
        prazo: { tipoAto: 'contestacao', vencimento: '2026-11-13' },
      });
    }
    expect(repo.estados.get(PRAZO)?.estado).toBe('enviado');
    expect(auditados).toEqual([]);

    const r = await confirmar().peloLink(tokenDe(link), contexto);
    expect(r.ok && r.valor).toMatchObject({ prazoId: PRAZO, jaConfirmada: false });
    expect(repo.estados.get(PRAZO)).toMatchObject({
      estado: 'confirmado',
      confirmacao: {
        usuarioId: ANA,
        canal: 'email',
        ip: contexto.ip,
        userAgent: contexto.userAgent,
      },
    });
    expect(auditados).toHaveLength(1);
    expect(auditados[0]?.entrada).toMatchObject({
      tipo: 'ciencia.ciencia-confirmada',
      entidadeId: PRAZO,
    });
    expect(auditados[0]?.origem).toMatchObject({
      ip: contexto.ip,
      userAgent: contexto.userAgent,
      usuarioId: ANA,
    });
    const eventos = await outbox.executar((tx) => outbox.reservarPendentes(tx, 10));
    expect(eventos.map((e) => [e.tipo, e.payload])).toEqual([
      [
        'CienciaConfirmada',
        {
          prazoId: PRAZO,
          usuarioId: ANA,
          canal: 'email',
          confirmadaEm: '2026-11-03T12:00:00.000Z',
        },
      ],
    ]);

    // Reuso: recusado; a consulta mostra "usado" com o horário.
    const deNovo = await confirmar().peloLink(tokenDe(link), contexto);
    expect(!deNovo.ok && deNovo.erro.codigo).toBe('ciencia-link-usado');
    expect(await consultar().executar(tokenDe(link))).toMatchObject({ situacao: 'usado' });
  });

  it('expirado, substituído, adulterado ou desconhecido: recusado', async () => {
    const antigo = tokenDe(await emitir());
    const novo = tokenDe(await emitir());
    expect(await consultar().executar(antigo)).toMatchObject({ situacao: 'substituido' });
    const r1 = await confirmar().peloLink(antigo, contexto);
    expect(!r1.ok && r1.erro.codigo).toBe('ciencia-link-substituido');

    relogio.definir(Instant.deIso('2026-11-10T12:00:00.000Z'));
    expect(await consultar().executar(novo)).toMatchObject({ situacao: 'expirado' });
    const r2 = await confirmar().peloLink(novo, contexto);
    expect(!r2.ok && r2.erro.codigo).toBe('ciencia-link-expirado');

    const adulterado = `${novo.slice(0, -3)}abc`;
    expect(await consultar().executar(adulterado)).toEqual({ situacao: 'invalido' });
    const r3 = await confirmar().peloLink(adulterado, contexto);
    expect(!r3.ok && r3.erro.codigo).toBe('ciencia-link-invalido');
    // Assinatura válida, mas nunca registrado (outro ambiente): também inválido.
    const solto = tokens.emitir(TENANT).token;
    expect(await consultar().executar(solto)).toEqual({ situacao: 'invalido' });
    expect((await confirmar().peloLink(solto, contexto)).ok).toBe(false);
    expect(repo.estados.get(PRAZO)?.estado).toBe('enviado');
  });

  it('o token vale só para o seu prazo; prazo cancelado não recebe ciência', async () => {
    const doOutro = tokenDe(await emitir(OUTRO_PRAZO));
    await confirmar().peloLink(doOutro, contexto);
    expect(repo.estados.get(OUTRO_PRAZO)?.estado).toBe('confirmado');
    expect(repo.estados.get(PRAZO)).toBeUndefined();

    status = 'cancelado';
    const r = await confirmar().peloLink(tokenDe(await emitir()), contexto);
    expect(!r.ok && r.erro.codigo).toBe('prazo-cancelado');
  });
});

describe('ciência pela sessão e indícios (HU33)', () => {
  it('portal confirma com o mesmo núcleo; repetir não grava de novo', async () => {
    const autor = { tenantId: TENANT, usuarioId: ANA, canal: 'portal' as const };
    const r = await confirmar().pelaSessao(autor, PRAZO, contexto);
    expect(r.ok && r.valor.jaConfirmada).toBe(false);
    const deNovo = await confirmar().pelaSessao(autor, PRAZO, contexto);
    expect(deNovo.ok && deNovo.valor.jaConfirmada).toBe(true);
    expect(auditados).toHaveLength(1);
    expect(repo.estados.get(PRAZO)?.confirmacao?.canal).toBe('portal');
    const inexistente = await confirmar().pelaSessao(autor, ANA, contexto);
    expect(!inexistente.ok && inexistente.erro.codigo).toBe('prazo-inexistente');
  });

  it('entregue e aberto são indícios: não viram ciência e não regridem a confirmação', async () => {
    const indicio = new RegistrarIndicioDeCiencia(repo);
    const registrar = (estado: 'entregue' | 'aberto' | 'visualizado' | 'cumprido') =>
      outbox.executar((tx) => indicio.executar(tx, { tenantId: TENANT, prazoId: PRAZO, estado }));
    expect(await registrar('aberto')).toBe('aberto');
    expect(await registrar('entregue')).toBe('aberto');
    const r = await confirmar().pelaSessao(
      { tenantId: TENANT, usuarioId: ANA, canal: 'app' },
      PRAZO,
      contexto,
    );
    expect(r.ok && r.valor.jaConfirmada).toBe(false);
    expect(await registrar('visualizado')).toBe('confirmado');
    expect(await registrar('cumprido')).toBe('cumprido');
    expect(repo.estados.get(PRAZO)?.confirmacao?.canal).toBe('app');
  });
});
