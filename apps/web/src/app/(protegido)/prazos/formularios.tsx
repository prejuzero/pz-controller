'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { PedidoDeTipoDeAto, PedidoDeVersaoDaTabela } from '@pz/contracts';
import { Botao, Campo, Selecao, SeletorData } from '@pz/ui';
import { TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Controller, useForm, type FieldError } from 'react-hook-form';

import { chaveValidacao } from '../../../formularios';

import type { z } from 'zod';

const RAMOS = ['civel', 'juizados', 'trabalhista', 'penal'] as const;
const UNIDADES = ['dias', 'horas', 'meses', 'anos'] as const;

interface PedidoDoTipo {
  codigo: string;
  nome: string;
  descricao: string;
}
type PedidoDaVersao = z.infer<typeof PedidoDeVersaoDaTabela.esquema>;

function useErro() {
  const tv = useTranslations('validacao');
  return (campo: FieldError | undefined) => campo && tv(chaveValidacao(campo.type));
}

/** Tipo de ato da taxonomia única (HU15): o código não muda depois de cadastrado. */
export function FormularioTipoDeAto({
  enviando,
  aoEnviar,
}: {
  enviando: boolean;
  aoEnviar: (pedido: PedidoDoTipo) => void;
}) {
  const t = useTranslations('tabelaPrazos');
  const erro = useErro();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PedidoDoTipo>({
    resolver: zodResolver(PedidoDeTipoDeAto.esquema.omit({ sinonimos: true })),
    defaultValues: { descricao: '' },
  });
  return (
    <form
      noValidate
      onSubmit={(evento) => void handleSubmit(aoEnviar)(evento)}
      className="grid gap-4"
    >
      <Campo
        rotulo={t('campos.codigo')}
        ajuda={t('ajudaCodigo')}
        obrigatorio
        maxLength={80}
        erro={erro(errors.codigo)}
        {...register('codigo', { setValueAs: (v: string) => v.trim() })}
      />
      <Campo
        rotulo={t('campos.nome')}
        obrigatorio
        maxLength={200}
        erro={erro(errors.nome)}
        {...register('nome', { setValueAs: (v: string) => v.trim() })}
      />
      <Campo
        rotulo={t('campos.descricao')}
        maxLength={2000}
        erro={erro(errors.descricao)}
        {...register('descricao', { setValueAs: (v: string) => v.trim() })}
      />
      <Botao type="submit" carregando={enviando} className="justify-self-end">
        {t('cadastrar')}
      </Botao>
    </form>
  );
}

/**
 * Proposta de versão com dispositivo e fonte oficial obrigatórios (CLAUDE.md, seção 4.3). O
 * conteúdo é do curador; a tela não sugere prazo nem fundamento.
 */
export function FormularioVersao({
  tipos,
  enviando,
  aoEnviar,
}: {
  tipos: readonly { codigo: string; nome: string }[];
  enviando: boolean;
  aoEnviar: (pedido: PedidoDaVersao) => void;
}) {
  const t = useTranslations('tabelaPrazos');
  const erro = useErro();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<PedidoDaVersao>({
    resolver: zodResolver(PedidoDeVersaoDaTabela.esquema),
    defaultValues: { tipoAto: tipos[0]?.codigo ?? '', ramo: 'civel', unidade: 'dias' },
  });
  return (
    <form
      noValidate
      onSubmit={(evento) => void handleSubmit(aoEnviar)(evento)}
      className="grid gap-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Controller
          control={control}
          name="tipoAto"
          render={({ field }) => (
            <Selecao
              rotulo={t('campos.tipoAto')}
              obrigatorio
              opcoes={tipos.map((tipo) => ({ valor: tipo.codigo, rotulo: tipo.nome }))}
              valor={field.value}
              aoMudar={field.onChange}
              name={field.name}
            />
          )}
        />
        <Controller
          control={control}
          name="ramo"
          render={({ field }) => (
            <Selecao
              rotulo={t('campos.ramo')}
              obrigatorio
              opcoes={RAMOS.map((ramo) => ({ valor: ramo, rotulo: t(`ramos.${ramo}`) }))}
              valor={field.value}
              aoMudar={field.onChange}
              name={field.name}
            />
          )}
        />
        <Campo
          rotulo={t('campos.dias')}
          obrigatorio
          type="number"
          inputMode="numeric"
          min={1}
          erro={erro(errors.dias)}
          {...register('dias', { valueAsNumber: true })}
        />
        <Controller
          control={control}
          name="unidade"
          render={({ field }) => (
            <Selecao
              rotulo={t('campos.unidade')}
              ajuda={t('ajudaUnidade')}
              obrigatorio
              opcoes={UNIDADES.map((u) => ({ valor: u, rotulo: t(`unidades.${u}`) }))}
              valor={field.value}
              aoMudar={field.onChange}
              name={field.name}
            />
          )}
        />
        <Controller
          control={control}
          name="vigenciaInicio"
          render={({ field }) => (
            <SeletorData
              rotulo={t('campos.vigenciaInicio')}
              obrigatorio
              valor={field.value}
              aoMudar={field.onChange}
              erro={erro(errors.vigenciaInicio)}
            />
          )}
        />
        <Controller
          control={control}
          name="vigenciaFim"
          render={({ field }) => (
            <SeletorData
              rotulo={t('campos.vigenciaFim')}
              ajuda={t('ajudaVigenciaFim')}
              valor={field.value}
              aoMudar={(valor) => {
                field.onChange(valor === '' ? undefined : valor);
              }}
              erro={erro(errors.vigenciaFim)}
            />
          )}
        />
      </div>
      <Campo
        rotulo={t('campos.fundamento')}
        ajuda={t('ajudaFundamento')}
        obrigatorio
        maxLength={500}
        erro={erro(errors.fundamento)}
        {...register('fundamento', { setValueAs: (v: string) => v.trim() })}
      />
      <Campo
        rotulo={t('campos.fonteUrl')}
        ajuda={t('ajudaFonte')}
        obrigatorio
        type="url"
        inputMode="url"
        erro={erro(errors.fonteUrl)}
        {...register('fonteUrl')}
      />
      <p
        role="note"
        className="flex gap-2 rounded-md border border-l-4 border-borda border-l-alerta p-3 text-sm"
      >
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        {t('avisoCurador')}
      </p>
      <Botao type="submit" carregando={enviando} className="justify-self-end">
        {t('propor')}
      </Botao>
    </form>
  );
}
