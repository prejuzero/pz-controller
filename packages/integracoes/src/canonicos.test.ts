import { gerarUuidV7, Instant, LocalDate } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { JanelaDeBusca, LinkHttps, NumeroCnj, Oab, SaudeAdaptador } from './canonicos.js';
import { definirDescritor } from './descritor.js';
import { CaminhoArquivo, chaveDoArquivo } from './portas/armazenamento.js';
import { CapacidadesCanal, MensagemNotificacao } from './portas/canal-notificacao.js';
import { PublicacaoCapturada } from './portas/fonte-publicacoes.js';

// Dados fictícios de teste.
const publicacao = {
  fonte: 'djen',
  idExterno: '123456',
  hashConteudo: 'a'.repeat(64),
  dataDisponibilizacao: LocalDate.de(2026, 10, 5),
  teor: 'Intimação de teste.',
  numeroCnj: '0000001-23.2026.8.26.0100',
  destinatarios: [{ oab: { numero: '123456', uf: 'SP' } }],
  urlFonte: 'https://exemplo.invalid/publicacao/123456',
  metadados: { orgao: 'Vara de teste' },
};

describe('modelos canônicos', () => {
  it('publicação: datas são LocalDate, CNJ no formato da Res. CNJ 65/2008, OAB com seccional', () => {
    expect(PublicacaoCapturada.parse(publicacao)).toEqual(publicacao);
    expect(PublicacaoCapturada.safeParse({ ...publicacao, numeroCnj: undefined }).success).toBe(
      true,
    );
    for (const invalida of [
      { ...publicacao, dataDisponibilizacao: '2026-10-05' },
      { ...publicacao, numeroCnj: '00000012320268260100' },
      { ...publicacao, hashConteudo: 'XYZ' },
      { ...publicacao, destinatarios: [{ oab: { numero: '12', uf: 'XX' } }] },
      { ...publicacao, campoNovo: true },
    ]) {
      expect(PublicacaoCapturada.safeParse(invalida).success).toBe(false);
    }
  });

  it('OAB e CNJ isolados', () => {
    expect(Oab.safeParse({ numero: '1', uf: 'AC' }).success).toBe(true);
    expect(Oab.safeParse({ numero: 'A1', uf: 'SP' }).success).toBe(false);
    expect(NumeroCnj.safeParse('1234567-89.2026.4.03.6100').success).toBe(true);
    expect(NumeroCnj.safeParse('1234567-89.2026.4.3.6100').success).toBe(false);
  });

  it('janela de busca não pode terminar antes de começar; um dia só vale', () => {
    const dia = LocalDate.de(2026, 10, 5);
    expect(JanelaDeBusca.safeParse({ inicio: dia, fim: dia }).success).toBe(true);
    expect(JanelaDeBusca.safeParse({ inicio: dia, fim: dia.maisDias(-1) }).success).toBe(false);
  });

  it('links enviados ao usuário são sempre HTTPS', () => {
    expect(LinkHttps.safeParse('https://app.prejuzero.com.br/prazos/1').success).toBe(true);
    expect(LinkHttps.safeParse('http://app.prejuzero.com.br/prazos/1').success).toBe(false);
    expect(LinkHttps.safeParse('javascript:alert(1)').success).toBe(false);
  });

  it('mensagem de notificação: até 3 botões, link HTTPS, sem campos extras', () => {
    const mensagem = {
      idempotencia: 'prazo-1:lembrete-d1',
      destinatario: 'advogada@exemplo.invalid',
      texto: 'Você tem um prazo a confirmar.',
      link: 'https://app.prejuzero.com.br/prazos/1',
    };
    expect(MensagemNotificacao.safeParse(mensagem).success).toBe(true);
    const botao = { rotulo: 'Abrir', link: mensagem.link };
    expect(
      MensagemNotificacao.safeParse({ ...mensagem, botoes: [botao, botao, botao, botao] }).success,
    ).toBe(false);
    expect(MensagemNotificacao.safeParse({ ...mensagem, cpf: '000' }).success).toBe(false);
    expect(
      CapacidadesCanal.parse({
        exigeTemplateAprovado: true,
        janelaDeConversaHoras: 24,
        tamanhoMaximo: 1024,
        suportaBotoes: true,
        suportaMidia: false,
      }).janelaDeConversaHoras,
    ).toBe(24);
  });

  it('saúde do adaptador usa Instant', () => {
    expect(
      SaudeAdaptador.safeParse({ estado: 'operacional', verificadoEm: Instant.deEpochMs(0) })
        .success,
    ).toBe(true);
    expect(SaudeAdaptador.safeParse({ estado: 'operacional', verificadoEm: 0 }).success).toBe(
      false,
    );
  });
});

describe('caminhos de arquivo', () => {
  const tenant = gerarUuidV7();

  it('a chave sempre começa pelo tenant', () => {
    expect(chaveDoArquivo(tenant, 'publicacoes/2026/teor.pdf')).toBe(
      `${tenant}/publicacoes/2026/teor.pdf`,
    );
  });

  it('recusa travessia de diretório, barra inicial e segmentos vazios', () => {
    for (const caminho of [
      '../outro/arquivo',
      'a/../../b',
      '/absoluto',
      'a//b',
      'a/',
      '',
      '.oculto',
    ]) {
      expect(CaminhoArquivo.safeParse(caminho).success, caminho).toBe(false);
      expect(() => chaveDoArquivo(tenant, caminho)).toThrow();
    }
  });
});

describe('descritor de adaptador', () => {
  const base = {
    id: 'rustfs',
    porta: 'armazenamento-arquivos',
    versao: '1.0.0',
    capacidades: { urlAssinada: true },
    limites: { concorrencia: 20, timeoutMs: 5_000 },
    requerCredenciais: true,
  } as const;

  it('é validado e congelado na declaração', () => {
    const descritor = definirDescritor(base);
    expect(Object.isFrozen(descritor)).toBe(true);
    expect(descritor.porta).toBe('armazenamento-arquivos');
  });

  it('recusa ID fora do padrão, porta desconhecida, versão sem semver e limite não positivo', () => {
    expect(() => definirDescritor({ ...base, id: 'S3 Amazon' })).toThrow();
    expect(() => definirDescritor({ ...base, porta: 'cobranca' as never })).toThrow();
    expect(() => definirDescritor({ ...base, versao: 'v1' })).toThrow();
    expect(() => definirDescritor({ ...base, limites: { requisicoesPorMinuto: 0 } })).toThrow();
  });
});
