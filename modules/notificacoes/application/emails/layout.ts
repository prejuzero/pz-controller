import { cores, tipografia } from '@pz/design-tokens';
// O pacote é React puro, mas sem JSX: os apps (api, worker) compilam os pacotes @pz/* a partir do
// código-fonte sem configuração de JSX, então os e-mails usam createElement.
import { createElement as h, Fragment } from 'react';

import type { CSSProperties, ReactNode } from 'react';

/**
 * Peças do e-mail (HU30): tabelas e estilos inline, sem CSS externo nem imagens, para renderizar
 * igual no Gmail, Outlook e Apple Mail. Só cores do tema claro: os clientes de e-mail aplicam o
 * próprio modo escuro.
 */
const cor = cores.claro;
const fonte = tipografia.familias.texto;
const tam = tipografia.tamanhos;

const rodape =
  'Você recebe este aviso porque monitora processos no PrejuZero. Ajuste as notificações em Configurações.';

export interface Acao {
  readonly rotulo: string;
  readonly href: string;
  readonly principal?: boolean;
}

const tabela = (largura: string, estilo: CSSProperties, ...filhos: ReactNode[]) =>
  h(
    'table',
    {
      role: 'presentation',
      width: largura,
      cellPadding: 0,
      cellSpacing: 0,
      border: 0,
      style: estilo,
    },
    h('tbody', null, ...filhos),
  );

export const paragrafo = (...filhos: ReactNode[]) =>
  h(
    'p',
    {
      style: {
        margin: '0 0 16px',
        fontSize: tam.base.tamanho,
        lineHeight: `${String(tam.base.alturaLinha)}px`,
        color: cor.texto,
      },
    },
    ...filhos,
  );

export const destaque = (texto: string) => h('strong', null, texto);

/** Lista simples (ex.: itens do resumo diário). */
export const lista = (itens: readonly ReactNode[]) =>
  h(
    'ul',
    {
      style: { margin: '0 0 16px', paddingLeft: 20, color: cor.texto, fontSize: tam.base.tamanho },
    },
    ...itens.map((item, i) => h('li', { key: i, style: { marginBottom: 8 } }, item)),
  );

export const link = (href: string, texto: string) =>
  h('a', { href, style: { color: cor.primaria, textDecoration: 'underline' } }, texto);

/**
 * Botão "à prova de Outlook": a borda grossa da mesma cor faz o preenchimento, que o Outlook
 * ignora no padding de links.
 */
function botao({ rotulo, href, principal = false }: Acao) {
  const fundo = principal ? cor.primaria : cor.fundo;
  return h(
    'td',
    { style: { paddingBottom: 12 } },
    // O bloco separa os botões na versão texto (o conversor junta células de tabela).
    h(
      'div',
      null,
      h(
        'a',
        {
          href,
          style: {
            display: 'inline-block',
            backgroundColor: fundo,
            border: `12px solid ${fundo}`,
            borderLeftWidth: 20,
            borderRightWidth: 20,
            outline: principal ? 'none' : `1px solid ${cor.bordaForte}`,
            borderRadius: 8,
            color: principal ? cor.primariaTexto : cor.primaria,
            fontFamily: fonte,
            fontSize: tam.base.tamanho,
            fontWeight: tipografia.pesos.seminegrito,
            lineHeight: `${String(tam.base.alturaLinha)}px`,
            textDecoration: 'none',
          },
        },
        rotulo,
      ),
    ),
  );
}

export interface PropsDoEmail {
  readonly titulo: string;
  /** Texto de pré-visualização exibido na caixa de entrada. */
  readonly previa: string;
  readonly corpo: readonly ReactNode[];
  readonly acoes: readonly Acao[];
}

export function Email({ titulo, previa, corpo, acoes }: PropsDoEmail) {
  return h(
    'html',
    { lang: 'pt-BR', dir: 'ltr' },
    h(
      'head',
      null,
      h('meta', { httpEquiv: 'Content-Type', content: 'text/html; charset=UTF-8' }),
      h('meta', { name: 'viewport', content: 'width=device-width, initial-scale=1' }),
      h('meta', { name: 'color-scheme', content: 'light' }),
      h('title', null, titulo),
    ),
    h(
      'body',
      { style: { margin: 0, padding: 0, backgroundColor: cor.superficie, fontFamily: fonte } },
      h(
        'div',
        {
          style: { display: 'none', overflow: 'hidden', maxHeight: 0, opacity: 0 },
          'data-skip-in-text': true,
        },
        previa,
      ),
      tabela(
        '100%',
        { backgroundColor: cor.superficie },
        h(
          'tr',
          null,
          h(
            'td',
            { align: 'center', style: { padding: '24px 16px' } },
            // O Outlook ignora max-width e usa o atributo; os demais usam o CSS e encolhem no celular.
            tabela(
              '600',
              {
                width: '100%',
                maxWidth: 600,
                backgroundColor: cor.fundo,
                border: `1px solid ${cor.borda}`,
                borderRadius: 12,
              },
              h(
                'tr',
                null,
                h(
                  'td',
                  { style: { padding: 32 } },
                  h(
                    'p',
                    {
                      style: {
                        margin: '0 0 24px',
                        fontSize: tam.sm.tamanho,
                        fontWeight: tipografia.pesos.negrito,
                        color: cor.primaria,
                      },
                    },
                    'PrejuZero',
                  ),
                  h(
                    'h1',
                    {
                      style: {
                        margin: '0 0 16px',
                        fontSize: tam.xl.tamanho,
                        lineHeight: `${String(tam.xl.alturaLinha)}px`,
                        color: cor.texto,
                      },
                    },
                    titulo,
                  ),
                  h(Fragment, null, ...corpo),
                  acoes.length === 0
                    ? null
                    : h(
                        'table',
                        { role: 'presentation', cellPadding: 0, cellSpacing: 0, border: 0 },
                        // Um botão por linha: legível no celular e separado na versão texto.
                        h('tbody', null, ...acoes.map((a) => h('tr', { key: a.rotulo }, botao(a)))),
                      ),
                  h('hr', {
                    style: {
                      border: 'none',
                      borderTop: `1px solid ${cor.borda}`,
                      margin: '24px 0',
                    },
                  }),
                  h(
                    'p',
                    {
                      style: {
                        margin: 0,
                        fontSize: tam.xs.tamanho,
                        lineHeight: `${String(tam.xs.alturaLinha)}px`,
                        color: cor.textoSuave,
                      },
                    },
                    rodape,
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}
