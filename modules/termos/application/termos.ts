import { err, gerarUuidV7, NaoEncontrado, ok, Validacao } from '@pz/kernel';

import { pendentes, problemasDaNovaVersao } from '../domain/documento.js';

import type { RepositorioDeAceites, RepositorioDeDocumentos, UnidadeNoTenant } from './portas.js';
import type { Aceite, DocumentoLegal, NovaVersao } from '../domain/documento.js';
import type { OrigemDaAuditoria, TrilhaDeAuditoria } from '@pz/auditoria';
import type { Clock, Instant, Result, Uuid } from '@pz/kernel';

/** Quem aceita: o usuário da sessão, com o início dela e o canal (vão para a trilha). */
export interface UsuarioDaSessao {
  readonly tenantId: Uuid;
  readonly usuarioId: Uuid;
  readonly sessaoIniciadaEm: Instant;
  readonly canal: OrigemDaAuditoria['canal'];
}

export interface ContextoDoAceite {
  readonly ip: string;
  readonly userAgent: string;
}

/**
 * Termos pendentes (HU38): versões vigentes no início da sessão ainda não aceitas. Enquanto
 * houver, a API bloqueia o uso (exceto sessão, aceite e saída).
 */
export class ConsultarTermosPendentes<Transacao> {
  constructor(
    private readonly noTenant: UnidadeNoTenant<Transacao>,
    private readonly documentos: RepositorioDeDocumentos<Transacao>,
    private readonly aceites: RepositorioDeAceites<Transacao>,
  ) {}

  executar(usuario: Omit<UsuarioDaSessao, 'canal'>): Promise<DocumentoLegal[]> {
    return this.noTenant.executar(usuario.tenantId, async (tx) => {
      const [documentos, aceitos] = await Promise.all([
        this.documentos.publicadosAte(tx, usuario.sessaoIniciadaEm),
        this.aceites.aceitosPor(tx, usuario.usuarioId),
      ]);
      return pendentes(
        documentos,
        new Set(aceitos.map((a) => a.documentoId)),
        usuario.sessaoIniciadaEm,
      );
    });
  }
}

/**
 * Versão vigente de cada documento, para as páginas públicas (HU38). Lê só a tabela global de
 * documentos, no tenant técnico da plataforma (as tabelas de tenant ficam fora).
 */
export class ConsultarDocumentosVigentes<Transacao> {
  constructor(
    private readonly noTenant: UnidadeNoTenant<Transacao>,
    private readonly documentos: RepositorioDeDocumentos<Transacao>,
    private readonly relogio: Clock,
    private readonly tenantPlataforma: Uuid,
  ) {}

  executar(): Promise<DocumentoLegal[]> {
    const agora = this.relogio.agora();
    return this.noTenant.executar(this.tenantPlataforma, async (tx) =>
      pendentes(await this.documentos.publicadosAte(tx, agora), new Set(), agora),
    );
  }
}

/** Histórico de aceites do usuário (exportável, LGPD). */
export class ListarAceites<Transacao> {
  constructor(
    private readonly noTenant: UnidadeNoTenant<Transacao>,
    private readonly aceites: RepositorioDeAceites<Transacao>,
  ) {}

  executar(usuario: Pick<UsuarioDaSessao, 'tenantId' | 'usuarioId'>): Promise<Aceite[]> {
    return this.noTenant.executar(usuario.tenantId, (tx) =>
      this.aceites.aceitosPor(tx, usuario.usuarioId),
    );
  }
}

/**
 * Aceite de um documento publicado (HU38): grava com IP e navegador e registra na trilha na
 * mesma transação. Repetir não duplica nem audita de novo.
 */
export class AceitarDocumento<Transacao> {
  constructor(
    private readonly noTenant: UnidadeNoTenant<Transacao>,
    private readonly documentos: RepositorioDeDocumentos<Transacao>,
    private readonly aceites: RepositorioDeAceites<Transacao>,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
    private readonly relogio: Clock,
  ) {}

  executar(
    usuario: UsuarioDaSessao,
    documentoId: Uuid,
    contexto: ContextoDoAceite,
  ): Promise<Result<void, NaoEncontrado | Validacao>> {
    const agora = this.relogio.agora();
    return this.noTenant.executar(usuario.tenantId, async (tx) => {
      const documento = await this.documentos.buscar(tx, documentoId);
      if (documento === undefined || documento.publicadoEm.ehDepoisDe(agora)) {
        return err(new NaoEncontrado('documento-inexistente', 'Documento não encontrado.'));
      }
      const vigentes = await this.documentos.publicadosAte(tx, agora);
      const maisRecente = vigentes
        .filter((d) => d.tipo === documento.tipo)
        .reduce((a, b) => (b.publicadoEm.ehDepoisDe(a.publicadoEm) ? b : a), documento);
      if (maisRecente.id !== documento.id) {
        return err(
          new Validacao([
            { campo: 'documentoId', mensagem: 'Há uma versão mais recente deste documento.' },
          ]),
        );
      }
      const novo = await this.aceites.registrar(tx, {
        tenantId: usuario.tenantId,
        usuarioId: usuario.usuarioId,
        documentoId,
        aceitoEm: agora,
        ip: contexto.ip,
        userAgent: contexto.userAgent.slice(0, 500),
      });
      if (novo) {
        await this.trilha.registrar(
          tx,
          {
            tipo: 'termos.documento-aceito',
            entidade: 'documento_legal',
            entidadeId: documento.id,
            depois: { tipo: documento.tipo, versao: documento.versao, aceitoEm: agora.paraIso() },
          },
          { canal: usuario.canal, usuarioId: usuario.usuarioId },
        );
      }
      return ok(undefined);
    });
  }
}

/** Quem publica: o administrador da plataforma, na sessão dele (a trilha fica no tenant dele). */
export interface Publicador {
  readonly tenantId: Uuid;
  readonly usuarioId: Uuid;
  readonly canal: OrigemDaAuditoria['canal'];
}

/**
 * Publicação de nova versão de um documento legal (PZ-303, HU38): vale a partir de agora (horário
 * do servidor) e passa a exigir novo aceite no próximo login. Auditada na mesma transação, sem o
 * texto (só tipo e versão). O texto vem do jurídico; o sistema não o altera.
 */
export class PublicarDocumentoLegal<Transacao> {
  constructor(
    private readonly noTenant: UnidadeNoTenant<Transacao>,
    private readonly documentos: RepositorioDeDocumentos<Transacao>,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
    private readonly relogio: Clock,
  ) {}

  executar(publicador: Publicador, nova: NovaVersao): Promise<Result<DocumentoLegal, Validacao>> {
    const agora = this.relogio.agora();
    return this.noTenant.executar(publicador.tenantId, async (tx) => {
      const problemas = problemasDaNovaVersao(nova, await this.documentos.todos(tx));
      if (problemas.length > 0) return err(new Validacao(problemas));
      const resumo = nova.resumoAlteracoes?.trim();
      const documento: DocumentoLegal = {
        id: gerarUuidV7(this.relogio),
        tipo: nova.tipo,
        versao: nova.versao,
        conteudo: nova.conteudo,
        ...(resumo === undefined || resumo === '' ? {} : { resumoAlteracoes: resumo }),
        publicadoEm: agora,
      };
      if (!(await this.documentos.inserir(tx, documento))) {
        return err(
          new Validacao([{ campo: 'versao', mensagem: 'Esta versão acabou de ser publicada.' }]),
        );
      }
      await this.trilha.registrar(
        tx,
        {
          tipo: 'termos.documento-publicado',
          entidade: 'documento_legal',
          entidadeId: documento.id,
          depois: { tipo: documento.tipo, versao: documento.versao, publicadoEm: agora.paraIso() },
        },
        { canal: publicador.canal, usuarioId: publicador.usuarioId },
      );
      return ok(documento);
    });
  }
}

/** Histórico das versões publicadas até agora, da mais recente para a mais antiga (admin). */
export class ListarVersoesDosDocumentos<Transacao> {
  constructor(
    private readonly noTenant: UnidadeNoTenant<Transacao>,
    private readonly documentos: RepositorioDeDocumentos<Transacao>,
    private readonly relogio: Clock,
  ) {}

  async executar(tenantId: Uuid): Promise<DocumentoLegal[]> {
    const publicados = await this.noTenant.executar(tenantId, (tx) =>
      this.documentos.publicadosAte(tx, this.relogio.agora()),
    );
    return [...publicados].sort((a, b) => b.publicadoEm.epochMs - a.publicadoEm.epochMs);
  }
}
