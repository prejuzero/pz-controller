'use client';

import { cn } from '@pz/ui';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';

import { useBuscaRapida } from '../../../api/hooks';

const ESPERA_MS = 250;

/** Texto estável depois de uma pausa na digitação (evita uma requisição por tecla). */
function useComEspera(valor: string): string {
  const [estavel, setEstavel] = useState(valor);
  useEffect(() => {
    const espera = setTimeout(() => {
      setEstavel(valor);
    }, ESPERA_MS);
    return () => {
      clearTimeout(espera);
    };
  }, [valor]);
  return estavel;
}

/**
 * Busca rápida do topo (HU28, RF49): número CNJ completo vai direto ao processo; senão, até 8
 * sugestões. Combobox ARIA operável só pelo teclado; "/" ou Ctrl+K levam o foco ao campo.
 */
export function BuscaRapida() {
  const t = useTranslations('cabecalho');
  const router = useRouter();
  const idLista = useId();
  const campo = useRef<HTMLInputElement>(null);
  const [texto, setTexto] = useState('');
  const [aberta, setAberta] = useState(false);
  const [ativo, setAtivo] = useState(-1);
  const consulta = useComEspera(texto);
  const sugestoes = useBuscaRapida(consulta);
  const itens = sugestoes.data?.itens ?? [];

  useEffect(() => {
    const atalho = (evento: KeyboardEvent) => {
      const alvo = evento.target as HTMLElement | null;
      const digitando =
        alvo !== null &&
        (alvo.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(alvo.tagName));
      if (
        (evento.key === 'k' && (evento.ctrlKey || evento.metaKey)) ||
        (evento.key === '/' && !digitando)
      ) {
        evento.preventDefault();
        campo.current?.focus();
      }
    };
    window.addEventListener('keydown', atalho);
    return () => {
      window.removeEventListener('keydown', atalho);
    };
  }, []);

  const destino = (item: (typeof itens)[number]) =>
    item.tipo === 'processo' ? `/processos/${item.id}` : `/publicacoes/${item.id}`;

  const ir = (href: string) => {
    setAberta(false);
    setTexto('');
    router.push(href);
  };

  const enviar = () => {
    const escolhido = itens[ativo];
    if (escolhido !== undefined) {
      ir(destino(escolhido));
      return;
    }
    const exato = sugestoes.data?.processoExato;
    if (exato !== undefined && exato !== null && consulta === texto) {
      ir(`/processos/${exato}`);
      return;
    }
    const digitos = texto.replace(/\D/g, '');
    const porNumero = /^[\d.\-\s]+$/.test(texto) && digitos.length > 0;
    const busca = new URLSearchParams(porNumero ? { numeroCnj: digitos } : { palavraChave: texto });
    ir(`/busca?${busca.toString()}`);
  };

  const mostrar = aberta && texto.trim().length >= 2 && itens.length > 0;

  return (
    <form
      role="search"
      className="relative hidden flex-1 sm:block"
      onSubmit={(evento) => {
        evento.preventDefault();
        if (texto.trim().length > 0) enviar();
      }}
    >
      <label htmlFor="busca-rapida" className="sr-only">
        {t('buscaRapida')}
      </label>
      <input
        ref={campo}
        id="busca-rapida"
        type="search"
        role="combobox"
        aria-expanded={mostrar}
        aria-controls={idLista}
        aria-autocomplete="list"
        aria-activedescendant={mostrar && ativo >= 0 ? `${idLista}-${String(ativo)}` : undefined}
        autoComplete="off"
        value={texto}
        placeholder={t('buscaRapida')}
        onChange={(evento) => {
          setTexto(evento.target.value);
          setAtivo(-1);
          setAberta(true);
        }}
        onBlur={() => {
          setAberta(false);
        }}
        onKeyDown={(evento) => {
          if (evento.key === 'ArrowDown' && itens.length > 0) {
            evento.preventDefault();
            setAberta(true);
            setAtivo((i) => (i + 1) % itens.length);
          } else if (evento.key === 'ArrowUp' && itens.length > 0) {
            evento.preventDefault();
            setAtivo((i) => (i <= 0 ? itens.length - 1 : i - 1));
          } else if (evento.key === 'Escape') {
            setAberta(false);
            setAtivo(-1);
          }
        }}
        className="h-10 w-full max-w-md rounded-md border border-borda bg-fundo px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-foco"
      />
      <ul
        id={idLista}
        role="listbox"
        aria-label={t('sugestoes')}
        hidden={!mostrar}
        className="absolute top-11 z-40 w-full max-w-md rounded-md border border-borda bg-superficie-elevada p-1 shadow-lg"
      >
        {itens.map((item, i) => (
          <li
            key={`${item.tipo}-${item.id}`}
            id={`${idLista}-${String(i)}`}
            role="option"
            aria-selected={i === ativo}
            className={cn(
              'cursor-pointer rounded-sm px-3 py-2 text-sm',
              i === ativo && 'bg-primaria-suave',
            )}
            // mousedown antes do blur do campo: o clique não se perde ao fechar a lista.
            onMouseDown={(evento) => {
              evento.preventDefault();
              ir(destino(item));
            }}
          >
            <span className="block font-medium">
              {t(`tiposDeSugestao.${item.tipo}`)}: {item.titulo}
            </span>
            <span className="block truncate text-xs text-texto-suave">{item.detalhe}</span>
          </li>
        ))}
      </ul>
    </form>
  );
}
