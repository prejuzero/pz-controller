import { FixedClock, gerarUuidV7, Instant, OutboxEmMemoria } from '@pz/kernel';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  AceitarDocumento,
  ConsultarDocumentosVigentes,
  ConsultarTermosPendentes,
  ListarAceites,
  ListarVersoesDosDocumentos,
  PublicarDocumentoLegal,
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

// Publicação pelo administrador da plataforma (PZ-303). Textos FICTÍCIOS.
describe('publicação de documento legal (PZ-303)', () => {
  const ADMIN = gerarUuidV7();
  const admin = { tenantId: TENANT, usuarioId: ADMIN, canal: 'portal' as const };
  const novo = (versao: string, extra: object = {}) => ({
    tipo: 'termos' as const,
    versao,
    conteudo: 'Texto FICTÍCIO dos termos.',
    ...extra,
  });
  let publicar: PublicarDocumentoLegal<TransacaoEmMemoria>;

  beforeEach(() => {
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
    publicar = new PublicarDocumentoLegal(noTenant, repo, trilha, relogio);
  });

  it('publica agora (horário do servidor), audita sem o texto e passa a exigir novo aceite', async () => {
    repo.documentos.push(doc('termos', '1.0', '2026-10-01T00:00:00Z'));
    const r = await publicar.executar(admin, novo('1.1', { resumoAlteracoes: 'Ajuste FICTÍCIO.' }));
    if (!r.ok) throw new Error('deveria publicar');
    expect(r.valor).toMatchObject({
      tipo: 'termos',
      versao: '1.1',
      resumoAlteracoes: 'Ajuste FICTÍCIO.',
    });
    expect(r.valor.publicadoEm.paraIso()).toBe(relogio.agora().paraIso());
    expect(auditados).toEqual([
      {
        tipo: 'termos.documento-publicado',
        entidade: 'documento_legal',
        entidadeId: r.valor.id,
        depois: { tipo: 'termos', versao: '1.1', publicadoEm: relogio.agora().paraIso() },
      },
    ]);
    const pendentes = await consultar.executar({ ...sessao, sessaoIniciadaEm: relogio.agora() });
    expect(pendentes.map((d) => d.versao)).toEqual(['1.1']);
  });

  it('versão repetida, menor que a vigente ou fora do formato; texto vazio: nada é gravado', async () => {
    repo.documentos.push(doc('termos', '2.0', '2026-10-01T00:00:00Z'));
    for (const [pedido, campo] of [
      [novo('2.0'), 'versao'],
      [novo('1.9.9'), 'versao'],
      [novo('v3'), 'versao'],
      [novo('3.0', { conteudo: '   ' }), 'conteudo'],
    ] as const) {
      const r = await publicar.executar(admin, pedido);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.erro.problemas.map((p) => p.campo)).toEqual([campo]);
    }
    expect(repo.documentos).toHaveLength(1);
    expect(auditados).toEqual([]);
  });

  it('a primeira versão de um tipo é aceita; versão maior em outro tipo não interfere', async () => {
    repo.documentos.push(doc('privacidade', '5.0', '2026-10-01T00:00:00Z'));
    expect((await publicar.executar(admin, novo('1.0'))).ok).toBe(true);
    expect((await publicar.executar(admin, novo('1.0.1'))).ok).toBe(true);
    expect((await publicar.executar(admin, novo('1.10'))).ok).toBe(true);
  });

  it('outra publicação gravou a mesma versão no meio: recusa sem auditar', async () => {
    repo.inserir = () => Promise.resolve(false);
    const r = await publicar.executar(admin, novo('1.0'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro.problemas.map((p) => p.campo)).toEqual(['versao']);
    expect(auditados).toEqual([]);
  });

  it('lista todas as versões publicadas, da mais recente para a mais antiga', async () => {
    repo.documentos.push(
      doc('termos', '1.0', '2026-09-01T00:00:00Z'),
      doc('privacidade', '1.0', '2026-09-15T00:00:00Z'),
      doc('termos', '9.0', '2026-12-01T00:00:00Z'), // agendada: ainda não publicada
    );
    const listar = new ListarVersoesDosDocumentos(
      {
        executar: <T>(_t: Uuid, f: (tx: TransacaoEmMemoria) => Promise<T>) =>
          new OutboxEmMemoria().executar(f),
      },
      repo,
      relogio,
    );
    const versoes = await listar.executar(TENANT);
    expect(versoes.map((d) => `${d.tipo} ${d.versao}`)).toEqual(['privacidade 1.0', 'termos 1.0']);
  });
});
