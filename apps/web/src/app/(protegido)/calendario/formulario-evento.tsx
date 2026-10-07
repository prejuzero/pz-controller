'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { PedidoDeEventoDoCalendario } from '@pz/contracts';
import { Botao, Campo, Selecao, SeletorData } from '@pz/ui';
import { TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Controller, useForm, useWatch, type FieldError } from 'react-hook-form';

import { chaveValidacao } from '../../../formularios';

type Pedido = PedidoDeEventoDoCalendario;
type Abrangencia = Pedido['abrangencia'];
type CampoDeLocal = 'uf' | 'municipioIbge' | 'tribunal' | 'comarca';

const TIPOS = ['feriado', 'recesso', 'portaria', 'indisponibilidade'] as const;

/** Campos de local exigidos por abrangência (espelha modules/calendario/domain/evento.ts). */
const CAMPOS_POR_ABRANGENCIA: Record<Abrangencia, readonly CampoDeLocal[]> = {
  nacional: [],
  uf: ['uf'],
  municipio: ['uf', 'municipioIbge'],
  tribunal: ['tribunal'],
  comarca: ['tribunal', 'comarca'],
};

/** Campo opcional vazio não vai para a API (o Zod rejeitaria UF ou IBGE em branco). */
const vazioComoAusente = (valor: unknown) => (valor === '' ? undefined : valor);

/**
 * Evento do calendário com ato normativo e link oficial (CLAUDE.md, seção 4.3). Serve à curadoria
 * (calendário global) e ao escritório (feriados locais, sem a abrangência nacional).
 */
export function FormularioEvento({
  abrangencias,
  rotuloEnviar,
  enviando,
  aoEnviar,
}: {
  abrangencias: readonly Abrangencia[];
  rotuloEnviar: string;
  enviando: boolean;
  aoEnviar: (pedido: Pedido) => void;
}) {
  const t = useTranslations('calendario');
  const tv = useTranslations('validacao');
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<Pedido>({
    resolver: zodResolver(PedidoDeEventoDoCalendario.esquema),
    defaultValues: { abrangencia: abrangencias[0] ?? 'comarca', tipo: 'feriado' },
  });
  const erro = (campo: FieldError | undefined) => campo && tv(chaveValidacao(campo.type));
  // useWatch em vez de watch(): compatível com o React Compiler.
  const visiveis = CAMPOS_POR_ABRANGENCIA[useWatch({ control, name: 'abrangencia' })];

  const enviar = handleSubmit((pedido) => {
    // Só os campos de local da abrangência escolhida: um valor esquecido de outra não vai junto.
    const { uf, municipioIbge, tribunal, comarca, ...resto } = pedido;
    const local = { uf, municipioIbge, tribunal, comarca };
    aoEnviar({ ...resto, ...Object.fromEntries(visiveis.map((campo) => [campo, local[campo]])) });
  });

  return (
    <form noValidate onSubmit={(evento) => void enviar(evento)} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Controller
          control={control}
          name="abrangencia"
          render={({ field }) => (
            <Selecao
              rotulo={t('campos.abrangencia')}
              obrigatorio
              opcoes={abrangencias.map((a) => ({ valor: a, rotulo: t(`abrangencias.${a}`) }))}
              valor={field.value}
              aoMudar={field.onChange}
              name={field.name}
            />
          )}
        />
        <Controller
          control={control}
          name="tipo"
          render={({ field }) => (
            <Selecao
              rotulo={t('campos.tipo')}
              obrigatorio
              opcoes={TIPOS.map((tipo) => ({ valor: tipo, rotulo: t(`tipos.${tipo}`) }))}
              valor={field.value}
              aoMudar={field.onChange}
              name={field.name}
            />
          )}
        />
        {visiveis.includes('uf') ? (
          <Campo
            rotulo={t('campos.uf')}
            ajuda={t('ajudaUf')}
            obrigatorio
            maxLength={2}
            autoCapitalize="characters"
            erro={erro(errors.uf)}
            {...register('uf', {
              setValueAs: (v: string) => vazioComoAusente(v.trim().toUpperCase()),
            })}
          />
        ) : null}
        {visiveis.includes('municipioIbge') ? (
          <Campo
            rotulo={t('campos.municipioIbge')}
            ajuda={t('ajudaIbge')}
            obrigatorio
            inputMode="numeric"
            maxLength={7}
            erro={erro(errors.municipioIbge)}
            {...register('municipioIbge', { setValueAs: vazioComoAusente })}
          />
        ) : null}
        {visiveis.includes('tribunal') ? (
          <Campo
            rotulo={t('campos.tribunal')}
            obrigatorio
            maxLength={20}
            erro={erro(errors.tribunal)}
            {...register('tribunal', {
              setValueAs: (v: string) => vazioComoAusente(v.trim().toUpperCase()),
            })}
          />
        ) : null}
        {visiveis.includes('comarca') ? (
          <Campo
            rotulo={t('campos.comarca')}
            obrigatorio
            maxLength={200}
            erro={erro(errors.comarca)}
            {...register('comarca', { setValueAs: vazioComoAusente })}
          />
        ) : null}
        <Controller
          control={control}
          name="inicio"
          render={({ field }) => (
            <SeletorData
              rotulo={t('campos.inicio')}
              obrigatorio
              valor={field.value}
              aoMudar={field.onChange}
              erro={erro(errors.inicio)}
            />
          )}
        />
        <Controller
          control={control}
          name="fim"
          render={({ field }) => (
            <SeletorData
              rotulo={t('campos.fim')}
              obrigatorio
              valor={field.value}
              aoMudar={field.onChange}
              erro={erro(errors.fim)}
            />
          )}
        />
      </div>
      <Campo
        rotulo={t('campos.descricao')}
        obrigatorio
        maxLength={500}
        erro={erro(errors.descricao)}
        {...register('descricao')}
      />
      <Campo
        rotulo={t('campos.atoNormativo')}
        ajuda={t('ajudaAto')}
        obrigatorio
        maxLength={500}
        erro={erro(errors.atoNormativo)}
        {...register('atoNormativo')}
      />
      <Campo
        rotulo={t('campos.urlAto')}
        ajuda={t('ajudaUrl')}
        obrigatorio
        type="url"
        inputMode="url"
        erro={erro(errors.urlAto)}
        {...register('urlAto')}
      />
      <p
        role="note"
        className="flex gap-2 rounded-md border border-l-4 border-borda border-l-alerta p-3 text-sm"
      >
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        {t('avisoRecalculo')}
      </p>
      <Botao type="submit" carregando={enviando} className="justify-self-end">
        {rotuloEnviar}
      </Botao>
    </form>
  );
}
