import { CalendarDays } from 'lucide-react';
import { Popover } from 'radix-ui';
import { useState } from 'react';
import { DayPicker } from 'react-day-picker';
import { ptBR } from 'react-day-picker/locale';

import { mensagens } from '../mensagens.js';
import { cn } from '../utilitarios.js';

import { classesEntrada, EnvoltorioCampo, type RotuloCampoProps } from './campo.js';

const DATA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Converte a data jurídica (AAAA-MM-DD, o formato de LocalDate na API) para o Date do calendário,
 * à meia-noite local. Só serve para exibir: nenhuma data de prazo é calculada aqui (CLAUDE.md, §3).
 */
export function deDataIso(valor: string): Date | undefined {
  const partes = DATA_ISO.exec(valor);
  if (partes === null) return undefined;
  const [, ano, mes, dia] = partes.map(Number) as [number, number, number, number];
  const data = new Date(ano, mes - 1, dia);
  return data.getMonth() === mes - 1 ? data : undefined;
}

export function paraDataIso(data: Date): string {
  const dois = (n: number) => String(n).padStart(2, '0');
  return `${String(data.getFullYear())}-${dois(data.getMonth() + 1)}-${dois(data.getDate())}`;
}

/** DD/MM/AAAA, como o advogado lê. */
export function formatarDataBr(valor: string): string | undefined {
  const partes = DATA_ISO.exec(valor);
  return partes === null ? undefined : `${partes[3] ?? ''}/${partes[2] ?? ''}/${partes[1] ?? ''}`;
}

export interface SeletorDataProps extends RotuloCampoProps {
  /** Data no formato AAAA-MM-DD (LocalDate). */
  valor?: string | undefined;
  aoMudar?: ((valor: string | undefined) => void) | undefined;
  marcador?: string | undefined;
  desabilitado?: boolean | undefined;
  className?: string | undefined;
}

/** Seletor de data em pt-BR: semana começa no domingo, navegação por teclado no calendário. */
export function SeletorData({
  valor,
  aoMudar,
  marcador = mensagens.selecioneData,
  desabilitado,
  ...campo
}: SeletorDataProps) {
  const [aberto, setAberto] = useState(false);
  const selecionada = valor === undefined ? undefined : deDataIso(valor);
  const exibida = valor === undefined ? undefined : formatarDataBr(valor);
  return (
    <EnvoltorioCampo {...campo}>
      {({ id, descricao, invalido }) => (
        <Popover.Root open={aberto} onOpenChange={setAberto}>
          <Popover.Trigger
            id={id}
            disabled={desabilitado ?? false}
            aria-describedby={descricao}
            aria-invalid={invalido || undefined}
            className={cn(
              classesEntrada,
              'flex items-center justify-between gap-2 text-left',
              exibida === undefined && 'text-texto-suave',
            )}
          >
            {exibida ?? marcador}
            <CalendarDays className="size-4 text-texto-suave" aria-hidden />
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              sideOffset={4}
              align="start"
              className="z-50 rounded-md border border-borda bg-superficie-elevada p-3 text-texto shadow-md"
            >
              <DayPicker
                mode="single"
                locale={ptBR}
                selected={selecionada}
                {...(selecionada === undefined ? {} : { defaultMonth: selecionada })}
                onSelect={(data) => {
                  aoMudar?.(data === undefined ? undefined : paraDataIso(data));
                  setAberto(false);
                }}
                autoFocus
                classNames={{
                  months: 'relative',
                  month_caption:
                    'flex h-9 items-center justify-center text-sm font-medium capitalize',
                  nav: 'absolute inset-x-0 top-0 flex justify-between',
                  button_previous:
                    'inline-flex size-9 items-center justify-center rounded-md hover:bg-superficie',
                  button_next:
                    'inline-flex size-9 items-center justify-center rounded-md hover:bg-superficie',
                  chevron: 'size-4 fill-texto',
                  weekday: 'size-9 text-xs font-normal text-texto-suave',
                  day: 'p-0 text-center text-sm',
                  day_button: 'size-9 rounded-md hover:bg-superficie',
                  selected: '[&>button]:bg-primaria [&>button]:text-primaria-texto',
                  today: 'font-semibold underline',
                  outside: 'text-texto-suave',
                  disabled: 'opacity-50',
                }}
              />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      )}
    </EnvoltorioCampo>
  );
}
