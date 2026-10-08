import { describe, expect, it } from 'vitest';

import { renderizar, TEMPLATES } from '../application/templates.js';
import { TIPOS_DE_NOTIFICACAO } from '../domain/notificacao.js';

import type { TipoDeNotificacao } from '../domain/notificacao.js';
import type { CapacidadesCanal } from '@pz/integracoes';

// Dados fictícios. Os snapshots em __snapshots__/emails/ são também a prévia local: abra o .html
// no navegador; `pnpm --filter @pz/notificacoes test -u` os regrava após mudar um template.
const PORTAL = 'https://app.exemplo.invalid/prazos/1';
const CIENCIA = 'https://app.exemplo.invalid/ciencia/abc';
const PROCESSO = '0000001-00.2026.8.26.0001';
const PUSH: CapacidadesCanal = {
  exigeTemplateAprovado: false,
  janelaDeConversaHoras: 0,
  tamanhoMaximo: 500,
  suportaBotoes: true,
  suportaMidia: false,
};

const EXEMPLOS: Record<TipoDeNotificacao, unknown> = {
  'nova-intimacao': { numeroProcesso: PROCESSO, link: PORTAL, linkCiencia: CIENCIA },
  'lembrete-prazo': {
    numeroProcesso: PROCESSO,
    vencimento: '15/10/2026',
    link: PORTAL,
    linkCiencia: CIENCIA,
  },
  'resumo-diario': {
    data: '07/10/2026',
    intimacoes: [{ numeroProcesso: PROCESSO, link: PORTAL }],
    prazos: [
      { numeroProcesso: '0000002-00.2026.8.26.0001', vencimento: '09/10/2026', link: PORTAL },
      { numeroProcesso: '0000003-00.2026.8.26.0001', vencimento: '13/10/2026', link: PORTAL },
    ],
    link: 'https://app.exemplo.invalid/painel',
  },
  'prazo-recalculado': {
    numeroProcesso: PROCESSO,
    vencimentoAnterior: '15/10/2026',
    vencimento: '19/10/2026',
    link: PORTAL,
    linkCiencia: CIENCIA,
  },
  'ciencia-confirmada': {
    numeroProcesso: PROCESSO,
    confirmadaEm: '07/10/2026 14:32',
    link: PORTAL,
  },
  'email-rejeitado': {
    endereco: 'ana@exemplo.invalid',
    motivo: 'bounce',
    link: 'https://app.exemplo.invalid/configuracoes/notificacoes',
  },
  'envio-manual': {
    numeroProcesso: PROCESSO,
    remetente: 'Bruno Lima',
    observacao: 'Pode cuidar desta? <b>Obrigado</b>',
    link: PORTAL,
    linkCiencia: CIENCIA,
  },
  'fonte-degradada': {
    fonte: 'DJEN',
    desde: '07/10/2026 14:32',
    link: 'https://app.exemplo.invalid/configuracoes/cobertura',
  },
  'fonte-restabelecida': {
    fonte: 'DJEN',
    em: '07/10/2026 18:05',
    link: 'https://app.exemplo.invalid/configuracoes/cobertura',
  },
};

describe.each(TIPOS_DE_NOTIFICACAO)('template %s', (tipo) => {
  it('e-mail: HTML e texto do mesmo componente (snapshot)', async () => {
    const m = await renderizar(tipo, EXEMPLOS[tipo]);
    await expect(m.html).toMatchFileSnapshot(`__snapshots__/emails/${tipo}.html`);
    await expect(`${m.assunto}\n\n${m.texto}`).toMatchFileSnapshot(
      `__snapshots__/emails/${tipo}.txt`,
    );
    expect(m.html).toContain('lang="pt-BR"');
    expect(m.texto).toContain(m.link);
  });

  it('fora do e-mail: versão mínima sem número do processo nem endereço', async () => {
    const m = await renderizar(tipo, EXEMPLOS[tipo], 'push', PUSH);
    expect(m.html).toBe('');
    expect(JSON.stringify(m)).not.toMatch(/0000001|ana@/);
  });

  it('rejeita dados fora do schema', () => {
    expect(
      TEMPLATES[tipo].dados.safeParse({ ...(EXEMPLOS[tipo] as object), extra: 1 }).success,
    ).toBe(false);
  });
});

describe('templates', () => {
  it('"Confirmar ciência" só com o link de ciência; "Ver no portal" sempre', async () => {
    const com = await renderizar('nova-intimacao', EXEMPLOS['nova-intimacao']);
    expect(com.texto).toContain(`Confirmar ciência ${CIENCIA}`);
    expect(com.texto).toContain(`Ver no portal ${PORTAL}`);
    const sem = await renderizar('nova-intimacao', { numeroProcesso: PROCESSO, link: PORTAL });
    expect(sem.html).not.toContain('Confirmar ciência');
    expect(sem.html).toContain('Ver no portal');
  });

  it('escapa o texto vindo de quem pede (sem HTML injetado)', async () => {
    const m = await renderizar('envio-manual', EXEMPLOS['envio-manual']);
    expect(m.html).toContain('&lt;b&gt;Obrigado&lt;/b&gt;');
    expect(m.html).not.toContain('<b>Obrigado');
  });

  it('resumo diário exige ao menos um item e respeita o plural', async () => {
    const vazio = { data: '07/10/2026', intimacoes: [], prazos: [], link: PORTAL };
    expect(TEMPLATES['resumo-diario'].dados.safeParse(vazio).success).toBe(false);
    const m = await renderizar('resumo-diario', EXEMPLOS['resumo-diario']);
    expect(m.html).toContain('1 intimação nova e 2 prazos próximos.');
  });

  it('e-mail rejeitado por spam explica o motivo', async () => {
    const m = await renderizar('email-rejeitado', {
      ...(EXEMPLOS['email-rejeitado'] as object),
      motivo: 'spam',
    });
    expect(m.texto).toContain('marcados como spam');
  });
});
