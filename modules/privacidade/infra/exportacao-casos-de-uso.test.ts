import { FixedClock, gerarUuidV7, Instant, OutboxEmMemoria } from '@pz/kernel';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  ConsultarExportacao,
  GerarExportacao,
  SolicitarExportacao,
} from '../application/exportacao.js';

import { ExportacoesEmMemoria } from './em-memoria.js';

import type { FonteDeExportacao } from '../application/portas.js';
import type { EntradaDeAuditoria } from '@pz/auditoria';
import type { ArmazenamentoArquivos, ArquivoParaGravar } from '@pz/integracoes';
import type { TransacaoEmMemoria } from '@pz/kernel';

// Dados FICTÍCIOS.
const relogio = new FixedClock(Instant.deIso('2026-10-07T12:00:00Z'));
const TENANT = gerarUuidV7();
const USUARIO = gerarUuidV7();
const solicitante = {
  tenantId: TENANT,
  usuarioId: USUARIO,
  canal: 'portal' as const,
  podeExportarEscritorio: false,
};

class ArmazenamentoFalso implements ArmazenamentoArquivos {
  readonly gravados = new Map<string, string>();
  gravar(arquivo: ArquivoParaGravar) {
    this.gravados.set(arquivo.caminho, new TextDecoder().decode(arquivo.conteudo));
    return Promise.resolve();
  }
  urlAssinada(pedido: { caminho: string }) {
    return Promise.resolve(`https://exemplo.invalid/${pedido.caminho}`);
  }
  remover() {
    return Promise.resolve();
  }
  metadados() {
    return Promise.resolve(undefined);
  }
  saude() {
    return Promise.resolve({ estado: 'operacional' as const, verificadoEm: relogio.agora() });
  }
}

const fonte: FonteDeExportacao<TransacaoEmMemoria> = {
  titular: (_tx, usuarioId) =>
    Promise.resolve([{ nome: 'conta', linhas: [{ id: usuarioId, nome: 'FICTÍCIO' }] }]),
  escritorio: () =>
    Promise.resolve([{ nome: 'processos', linhas: [{ numeroCnj: '10000040620268260100' }] }]),
};

let outbox: OutboxEmMemoria;
let repo: ExportacoesEmMemoria;
let armazenamento: ArmazenamentoFalso;
let auditados: EntradaDeAuditoria[];
let solicitar: SolicitarExportacao<TransacaoEmMemoria>;
let gerar: GerarExportacao<TransacaoEmMemoria>;
let consultar: ConsultarExportacao<TransacaoEmMemoria>;

beforeEach(() => {
  outbox = new OutboxEmMemoria();
  repo = new ExportacoesEmMemoria();
  armazenamento = new ArmazenamentoFalso();
  auditados = [];
  const trilha = {
    registrar: (tx: TransacaoEmMemoria, entrada: EntradaDeAuditoria) => {
      tx.aoConfirmar(() => auditados.push(entrada));
      return Promise.resolve();
    },
  };
  solicitar = new SolicitarExportacao(outbox, repo, trilha, outbox, relogio);
  gerar = new GerarExportacao(repo, [fonte], armazenamento, relogio);
  consultar = new ConsultarExportacao(outbox, repo, armazenamento, relogio);
});

const eventos = () => outbox.executar((tx) => outbox.reservarPendentes(tx, 10));

describe('exportação de dados (HU38)', () => {
  it('pedido do titular: evento, trilha, arquivos JSON e CSV e links assinados', async () => {
    const pedido = await solicitar.executar(solicitante, { escopo: 'titular' });
    if (!pedido.ok) throw pedido.erro;
    expect(pedido.valor.nova).toBe(true);
    const repetido = await solicitar.executar(solicitante, { escopo: 'titular' });
    expect(repetido.ok && repetido.valor).toEqual({ id: pedido.valor.id, nova: false });
    expect(auditados.map((a) => a.tipo)).toEqual(['privacidade.exportacao-solicitada']);

    const pendente = await consultar.executar(solicitante, pedido.valor.id);
    expect(pendente.ok && pendente.valor).toMatchObject({ situacao: 'pendente', arquivos: [] });

    const [evento] = await eventos();
    await outbox.executar((tx) => gerar.executar(tx, evento));
    await outbox.executar((tx) => gerar.executar(tx, evento));
    const caminho = `privacidade/exportacoes/${pedido.valor.id}`;
    expect(JSON.parse(armazenamento.gravados.get(`${caminho}/dados.json`) ?? '{}')).toMatchObject({
      escopo: 'titular',
      secoes: { conta: [{ id: USUARIO, nome: 'FICTÍCIO' }] },
    });
    expect(armazenamento.gravados.get(`${caminho}/dados.csv`)).toContain('# conta');

    const pronta = await consultar.executar(solicitante, pedido.valor.id);
    expect(pronta.ok && pronta.valor).toMatchObject({
      situacao: 'concluida',
      expiraEm: '2026-10-14T12:00:00.000Z',
      arquivos: [
        { nome: 'dados.json', url: `https://exemplo.invalid/${caminho}/dados.json` },
        { nome: 'dados.csv', url: `https://exemplo.invalid/${caminho}/dados.csv` },
      ],
    });
  });

  it('escritório só para quem tem a permissão; pedido de outro usuário é 404', async () => {
    const negado = await solicitar.executar(solicitante, { escopo: 'escritorio' });
    expect(!negado.ok && negado.erro.codigo).toBe('exportacao-do-escritorio');
    const permitido = await solicitar.executar(
      { ...solicitante, podeExportarEscritorio: true },
      { escopo: 'escritorio' },
    );
    if (!permitido.ok) throw permitido.erro;
    const outro = await consultar.executar(
      { tenantId: TENANT, usuarioId: gerarUuidV7() },
      permitido.valor.id,
    );
    expect(!outro.ok && outro.erro.codigo).toBe('exportacao-inexistente');
    const invalido = await solicitar.executar(solicitante, { escopo: 'tudo' });
    expect(invalido.ok).toBe(false);
  });

  it('evento de pedido inexistente lança (vai para a DLQ)', async () => {
    await expect(
      outbox.executar((tx) =>
        gerar.executar(tx, {
          tenantId: TENANT,
          payload: { exportacaoId: gerarUuidV7(), usuarioId: USUARIO, escopo: 'titular' },
        }),
      ),
    ).rejects.toThrow(/não encontrada/);
  });
});
