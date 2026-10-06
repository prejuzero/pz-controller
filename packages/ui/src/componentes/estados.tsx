import { CircleAlert, Inbox, Lock } from 'lucide-react';

import { mensagens } from '../mensagens.js';

import { Botao } from './botao.js';

import type { ReactNode } from 'react';

interface EstadoBaseProps {
  icone: ReactNode;
  titulo: ReactNode;
  descricao?: ReactNode;
  acao?: ReactNode;
  papel?: 'alert' | undefined;
}

function EstadoBase({ icone, titulo, descricao, acao, papel }: EstadoBaseProps) {
  return (
    <div
      role={papel}
      className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-borda-forte px-6 py-10 text-center"
    >
      <span className="text-texto-suave [&_svg]:size-8" aria-hidden>
        {icone}
      </span>
      <div className="grid gap-1">
        <p className="text-base font-semibold text-texto">{titulo}</p>
        {descricao === undefined ? null : (
          <p className="max-w-md text-sm text-texto-suave">{descricao}</p>
        )}
      </div>
      {acao}
    </div>
  );
}

export interface EstadoVazioProps {
  titulo?: ReactNode;
  descricao?: ReactNode;
  /** Próximo passo (ex.: botão "Cadastrar OAB"). */
  acao?: ReactNode;
}

/** Estado "vazio": nada a mostrar ainda, com o próximo passo quando houver. */
export function EstadoVazio({
  titulo = mensagens.estados.vazioTitulo,
  descricao,
  acao,
}: EstadoVazioProps) {
  return <EstadoBase icone={<Inbox />} titulo={titulo} descricao={descricao} acao={acao} />;
}

export interface EstadoErroProps {
  titulo?: ReactNode;
  descricao?: ReactNode;
  aoTentarNovamente?: (() => void) | undefined;
}

/** Estado "erro": o usuário sempre sabe que algo falhou (CLAUDE.md, §2: nada falha em silêncio). */
export function EstadoErro({
  titulo = mensagens.estados.erroTitulo,
  descricao = mensagens.estados.erroDescricao,
  aoTentarNovamente,
}: EstadoErroProps) {
  return (
    <EstadoBase
      papel="alert"
      icone={<CircleAlert />}
      titulo={titulo}
      descricao={descricao}
      acao={
        aoTentarNovamente === undefined ? undefined : (
          <Botao variante="secundaria" onClick={aoTentarNovamente}>
            {mensagens.estados.tentarNovamente}
          </Botao>
        )
      }
    />
  );
}

export interface EstadoSemPermissaoProps {
  titulo?: ReactNode;
  descricao?: ReactNode;
}

/** Estado "sem permissão": o perfil não acessa o conteúdo (resposta 403 da API). */
export function EstadoSemPermissao({
  titulo = mensagens.estados.semPermissaoTitulo,
  descricao = mensagens.estados.semPermissaoDescricao,
}: EstadoSemPermissaoProps) {
  return <EstadoBase icone={<Lock />} titulo={titulo} descricao={descricao} />;
}
