'use client';

import { Check, ChevronDown } from 'lucide-react';
import { Select } from 'radix-ui';

import { mensagens } from '../mensagens.js';
import { cn } from '../utilitarios.js';

import { classesEntrada, EnvoltorioCampo, type RotuloCampoProps } from './campo.js';

export interface OpcaoSelecao {
  valor: string;
  rotulo: string;
  desabilitada?: boolean;
}

export interface SelecaoProps extends RotuloCampoProps {
  opcoes: readonly OpcaoSelecao[];
  valor?: string | undefined;
  aoMudar?: ((valor: string) => void) | undefined;
  marcador?: string | undefined;
  desabilitada?: boolean | undefined;
  name?: string | undefined;
  className?: string | undefined;
}

/** Lista de seleção única (Radix Select): setas, Home/End e busca por digitação. */
export function Selecao({
  opcoes,
  valor,
  aoMudar,
  marcador = mensagens.selecione,
  desabilitada,
  name,
  ...campo
}: SelecaoProps) {
  return (
    <EnvoltorioCampo {...campo}>
      {({ id, descricao, invalido }) => (
        <Select.Root
          {...(valor === undefined ? {} : { value: valor })}
          {...(aoMudar === undefined ? {} : { onValueChange: aoMudar })}
          {...(name === undefined ? {} : { name })}
          disabled={desabilitada ?? false}
          required={campo.obrigatorio ?? false}
        >
          <Select.Trigger
            id={id}
            aria-describedby={descricao}
            aria-invalid={invalido || undefined}
            className={cn(
              classesEntrada,
              'flex items-center justify-between gap-2 data-placeholder:text-texto-suave',
            )}
          >
            <Select.Value placeholder={marcador} />
            <Select.Icon>
              <ChevronDown className="size-4 text-texto-suave" aria-hidden />
            </Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Content
              position="popper"
              sideOffset={4}
              className="z-50 max-h-72 min-w-(--radix-select-trigger-width) overflow-hidden rounded-md border border-borda bg-superficie-elevada text-texto shadow-md"
            >
              <Select.Viewport className="p-1">
                {opcoes.map((opcao) => (
                  <Select.Item
                    key={opcao.valor}
                    value={opcao.valor}
                    disabled={opcao.desabilitada ?? false}
                    className="relative flex cursor-default items-center rounded-sm py-1.5 pr-8 pl-2 text-sm outline-none select-none data-disabled:opacity-50 data-highlighted:bg-primaria-suave data-highlighted:text-texto"
                  >
                    <Select.ItemText>{opcao.rotulo}</Select.ItemText>
                    <Select.ItemIndicator className="absolute right-2">
                      <Check className="size-4" aria-hidden />
                    </Select.ItemIndicator>
                  </Select.Item>
                ))}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>
      )}
    </EnvoltorioCampo>
  );
}
