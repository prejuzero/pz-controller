import { FixedClock, gerarUuidV7, Instant, OutboxEmMemoria } from '@pz/kernel';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  AceitarDocumento,
  ConsultarDocumentosVigentes,
  ConsultarTermosPendentes,
  ListarAceites,
} from '../application/termos.js';

import { TermosEmMemoria } from './em-memoria.js';

import type { EntradaDeAuditoria, TrilhaDeAuditoria } from '@pz/auditoria';
import type { TransacaoEmMemoria, Uuid } from '@pz/kernel';

// Documentos e usuários FICTÍCIOS.
const relogio = new FixedClock(Instant.deIso('2026-10-07T12:00:00Z'));
const TENANT = gerarUuidV7();
const USUARIO = gerarUuidV7();
const sessao = {
  tenantId: TENANT,
  usuarioId: USUARIO,
  sessaoIniciadaEm: relogio.agora(),
  canal: 'portal' as const,
};
const contexto = { ip: '203.0.113.10', userAgent: 'Navegador FICTÍCIO' };
const doc = (tipo: 'termos' | 'privacidade', versao: string, publicado: string) => ({
  id: gerarUuidV7(),
  tipo,
  versao,
  conteudo: 'FICTÍCIO',
  publicadoEm: Instant.deIso(publicado),
});

let repo: TermosEmMemoria;
let auditados: EntradaDeAuditoria[];
let consultar: ConsultarTermosPendentes<TransacaoEmMemoria>;
let aceitar: AceitarDocumento<TransacaoEmMemoria>;
let listar: ListarAceites<TransacaoEmMemoria>;

beforeEach(() => {
  repo = new TermosEmMemoria();
  auditados = [];
  const unidade = new OutboxEmMemoria();
  const noTenant = {
    executar: <T>(_t: Uuid, f: (tx: TransacaoEmMemoria) => Promise<T>) => unidade.executar(f),
  };
  const trilha: TrilhaDeAuditoria<TransacaoEmMemoria> = {
    registrar: (tx, entrada) => {
      tx.aoConfirmar(() => auditados.push(entrada));
      return Promise.resolve();
    },
  };
  consultar = new ConsultarTermosPendentes(noTenant, repo, repo);
  aceitar = new AceitarDocumento(noTenant, repo, repo, trilha, relogio);
  listar = new ListarAceites(noTenant, repo);
});

describe('aceite versionado (HU38)', () => {
  it('aceitar tira da lista de pendentes, audita uma vez e entra no histórico', async () => {
    const termos = doc('termos', '1.0', '2026-10-01T00:00:00Z');
    const privacidade = doc('privacidade', '1.0', '2026-10-01T00:00:00Z');
    repo.documentos.push(termos, privacidade);
    expect((await consultar.executar(sessao)).map((d) => d.tipo)).toEqual([
      'privacidade',
      'termos',
    ]);

    expect((await aceitar.executar(sessao, termos.id, contexto)).ok).toBe(true);
    expect((await aceitar.executar(sessao, termos.id, contexto)).ok).toBe(true);
    expect((await consultar.executar(sessao)).map((d) => d.tipo)).toEqual(['privacidade']);
    expect(auditados.map((a) => a.tipo)).toEqual(['termos.documento-aceito']);
    expect(await listar.executar(sessao)).toEqual([
      expect.objectContaining({ tipo: 'termos', versao: '1.0', ip: '203.0.113.10' }),
    ]);
  });

  it('nova versão exige novo aceite; a anterior não pode mais ser aceita', async () => {
    const v1 = doc('termos', '1.0', '2026-09-01T00:00:00Z');
    const v2 = doc('termos', '2.0', '2026-10-05T00:00:00Z');
    repo.documentos.push(v1, v2);
    const antiga = await aceitar.executar(sessao, v1.id, contexto);
    expect(!antiga.ok && antiga.erro.codigo).toBe('validacao');
    expect((await consultar.executar(sessao)).map((d) => d.versao)).toEqual(['2.0']);
  });

  it('documento inexistente ou ainda não publicado: 404', async () => {
    const futuro = doc('termos', '3.0', '2026-12-01T00:00:00Z');
    repo.documentos.push(futuro);
    for (const id of [futuro.id, gerarUuidV7()]) {
      const r = await aceitar.executar(sessao, id, contexto);
      expect(!r.ok && r.erro.codigo).toBe('documento-inexistente');
    }
  });
});

describe('documentos vigentes para as páginas públicas (HU38)', () => {
  it('a versão mais recente de cada tipo já publicada, com o resumo das alterações', async () => {
    const v1 = doc('termos', '1.0', '2026-09-01T00:00:00Z');
    const v2 = {
      ...doc('termos', '2.0', '2026-10-05T00:00:00Z'),
      resumoAlteracoes: 'FICTÍCIO: item 3',
    };
    repo.documentos.push(v1, v2, doc('termos', '3.0', '2026-12-01T00:00:00Z'));
    const unidade = new OutboxEmMemoria();
    const vigentes = new ConsultarDocumentosVigentes(
      { executar: <T>(_t: Uuid, f: (tx: TransacaoEmMemoria) => Promise<T>) => unidade.executar(f) },
      repo,
      relogio,
      TENANT,
    );
    expect(await vigentes.executar()).toEqual([v2]);
  });
});
