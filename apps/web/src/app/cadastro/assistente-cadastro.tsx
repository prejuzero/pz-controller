'use client';

import { Botao, Campo, Selecao } from '@pz/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';

import { useCadastrar, useEntrar } from '../../api/hooks';
import { chaveValidacao } from '../../formularios';
import { mascararCelular, mascararCpf } from '../../mascaras';
import { destinoAposEntrar, ROTA_ENTRAR } from '../../rotas';
import { OPCOES_UF } from '../../ufs';
import { AlertaFormulario } from '../_acesso/alerta-formulario';

interface Dados {
  nome: string;
  cpf: string;
  email: string;
  celular: string;
  senha: string;
  confirmacao: string;
}
interface Inscricao {
  numero: string;
  uf: string;
}
interface Progresso {
  passo: 1 | 2 | 3;
  dados: Omit<Dados, 'senha' | 'confirmacao'>;
  oabs: Inscricao[];
}

const CHAVE = 'pz:cadastro';
const VAZIO: Progresso = {
  passo: 1,
  dados: { nome: '', cpf: '', email: '', celular: '' },
  oabs: [{ numero: '', uf: '' }],
};
const MAXIMO_DE_OABS = 27;

/** Progresso do cadastro no sessionStorage, sem a senha; ausente ou bloqueado, recomeça. */
function lerProgresso(): Progresso {
  try {
    const bruto = sessionStorage.getItem(CHAVE);
    return bruto === null ? VAZIO : { ...VAZIO, ...(JSON.parse(bruto) as Progresso) };
  } catch {
    return VAZIO; // armazenamento indisponível (aba privada): o cadastro funciona sem guardar.
  }
}

function guardarProgresso(progresso: Progresso | null): void {
  try {
    if (progresso === null) sessionStorage.removeItem(CHAVE);
    else sessionStorage.setItem(CHAVE, JSON.stringify(progresso));
  } catch {
    // Sem armazenamento, só não guarda o progresso; nada a sinalizar ao usuário.
  }
}

/** Cadastro em 3 passos (HU11, meta de 3 minutos): dados → OABs → segurança (2FA). */
export function AssistenteCadastro() {
  const t = useTranslations('cadastro');
  const [progresso, setProgresso] = useState<Progresso>(lerProgresso);
  const [senha, setSenha] = useState('');
  const tituloDoPasso = useRef<HTMLHeadingElement>(null);
  const atualizar = (novo: Progresso) => {
    setProgresso(novo);
    guardarProgresso(novo);
  };
  useEffect(() => {
    tituloDoPasso.current?.focus();
  }, [progresso.passo]);

  const nomes = [t('passos.dados'), t('passos.oabs'), t('passos.seguranca')];
  return (
    <div className="grid gap-4">
      <h2 ref={tituloDoPasso} tabIndex={-1} className="text-sm font-medium outline-none">
        {t('passo', { atual: progresso.passo, total: 3, nome: nomes[progresso.passo - 1] ?? '' })}
      </h2>
      <div className="flex gap-1" aria-hidden>
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className={`h-1 flex-1 rounded ${n <= progresso.passo ? 'bg-primaria' : 'bg-borda'}`}
          />
        ))}
      </div>
      {progresso.passo === 1 ? (
        <PassoDados
          inicial={{ ...progresso.dados, senha, confirmacao: senha }}
          aoAvancar={(dados) => {
            setSenha(dados.senha);
            const { nome, cpf, email, celular } = dados;
            atualizar({ ...progresso, passo: 2, dados: { nome, cpf, email, celular } });
          }}
        />
      ) : progresso.passo === 2 ? (
        <PassoOabs
          inicial={progresso.oabs}
          aoVoltar={(oabs) => {
            atualizar({ ...progresso, passo: 1, oabs });
          }}
          aoAvancar={(oabs) => {
            atualizar({ ...progresso, passo: senha === '' ? 1 : 3, oabs });
          }}
        />
      ) : (
        <PassoSeguranca
          progresso={progresso}
          senha={senha}
          aoVoltar={() => {
            atualizar({ ...progresso, passo: 2 });
          }}
        />
      )}
      <p className="text-xs text-texto-suave">{t('progressoGuardado')}</p>
      <Link href={ROTA_ENTRAR} className="justify-self-center text-sm underline underline-offset-4">
        {t('jaTemConta')}
      </Link>
    </div>
  );
}

function PassoDados({ inicial, aoAvancar }: { inicial: Dados; aoAvancar: (dados: Dados) => void }) {
  const t = useTranslations();
  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<Dados>({ defaultValues: inicial, mode: 'onBlur' });
  const erro = (campo: keyof Dados) => {
    const e = errors[campo];
    return e && t(`validacao.${chaveValidacao(e.type)}`);
  };
  const enviar = handleSubmit(aoAvancar);
  return (
    <form noValidate onSubmit={(evento) => void enviar(evento)} className="grid gap-4">
      <Campo
        rotulo={t('cadastro.nome')}
        autoComplete="name"
        obrigatorio
        erro={erro('nome')}
        {...register('nome', { required: true, minLength: 3, maxLength: 200 })}
      />
      <Campo
        rotulo={t('cadastro.cpf')}
        inputMode="numeric"
        obrigatorio
        erro={erro('cpf')}
        {...register('cpf', {
          required: true,
          pattern: /^\d{3}\.\d{3}\.\d{3}-\d{2}$/,
          onChange: (e: { target: { value: string } }) => {
            setValue('cpf', mascararCpf(e.target.value));
          },
        })}
      />
      <Campo
        rotulo={t('cadastro.email')}
        type="email"
        autoComplete="email"
        inputMode="email"
        obrigatorio
        erro={erro('email')}
        {...register('email', { required: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ })}
      />
      <Campo
        rotulo={t('cadastro.celular')}
        type="tel"
        autoComplete="tel-national"
        inputMode="tel"
        obrigatorio
        erro={erro('celular')}
        {...register('celular', {
          required: true,
          pattern: /^\(\d{2}\) \d{5}-\d{4}$/,
          onChange: (e: { target: { value: string } }) => {
            setValue('celular', mascararCelular(e.target.value));
          },
        })}
      />
      <Campo
        rotulo={t('cadastro.senha')}
        type="password"
        autoComplete="new-password"
        ajuda={t('cadastro.ajudaSenha')}
        obrigatorio
        erro={erro('senha')}
        {...register('senha', { required: true, maxLength: 256 })}
      />
      <Campo
        rotulo={t('cadastro.confirmacao')}
        type="password"
        autoComplete="new-password"
        obrigatorio
        erro={erro('confirmacao')}
        {...register('confirmacao', {
          required: true,
          validate: { confirmacao: (valor) => valor === getValues('senha') },
        })}
      />
      <Botao type="submit">{t('cadastro.continuar')}</Botao>
    </form>
  );
}

function PassoOabs({
  inicial,
  aoVoltar,
  aoAvancar,
}: {
  inicial: Inscricao[];
  aoVoltar: (oabs: Inscricao[]) => void;
  aoAvancar: (oabs: Inscricao[]) => void;
}) {
  const t = useTranslations();
  const [oabs, setOabs] = useState(inicial.length === 0 ? VAZIO.oabs : inicial);
  const [tentou, setTentou] = useState(false);
  const mudar = (i: number, campo: keyof Inscricao, valor: string) => {
    setOabs(oabs.map((oab, j) => (j === i ? { ...oab, [campo]: valor } : oab)));
  };
  const invalida = (oab: Inscricao) => ({
    numero: !/^[\d.\-\s]{1,9}[A-Za-z]?$/.test(oab.numero.trim()),
    uf: oab.uf === '',
  });
  const avancar = () => {
    setTentou(true);
    if (oabs.every((oab) => !invalida(oab).numero && !invalida(oab).uf)) aoAvancar(oabs);
  };
  return (
    <div className="grid gap-4">
      <p className="text-sm text-texto-suave">{t('cadastro.ajudaOabs')}</p>
      {oabs.map((oab, i) => (
        <fieldset key={i} className="grid gap-3 rounded-md border border-borda p-3">
          <legend className="px-1 text-sm font-medium">
            {i === 0 ? t('cadastro.oabPrincipal') : t('cadastro.oabSuplementar', { n: i })}
          </legend>
          <div className="grid grid-cols-[1fr_6rem] gap-3">
            <Campo
              rotulo={t('cadastro.numero')}
              inputMode="numeric"
              obrigatorio
              value={oab.numero}
              maxLength={20}
              erro={tentou && invalida(oab).numero ? t('validacao.invalido') : undefined}
              onChange={(e) => {
                mudar(i, 'numero', e.target.value);
              }}
            />
            <Selecao
              rotulo={t('cadastro.uf')}
              obrigatorio
              opcoes={OPCOES_UF}
              valor={oab.uf === '' ? undefined : oab.uf}
              aoMudar={(uf) => {
                mudar(i, 'uf', uf);
              }}
              erro={tentou && invalida(oab).uf ? t('validacao.obrigatorio') : undefined}
            />
          </div>
          {i === 0 ? null : (
            <Botao
              variante="secundaria"
              className="justify-self-start"
              onClick={() => {
                setOabs(oabs.filter((_, j) => j !== i));
              }}
            >
              {t('cadastro.remover')}
            </Botao>
          )}
        </fieldset>
      ))}
      {oabs.length < MAXIMO_DE_OABS ? (
        <Botao
          variante="secundaria"
          onClick={() => {
            setOabs([...oabs, { numero: '', uf: '' }]);
          }}
        >
          {t('cadastro.adicionarSuplementar')}
        </Botao>
      ) : null}
      <div className="flex justify-between gap-2">
        <Botao
          variante="secundaria"
          onClick={() => {
            aoVoltar(oabs);
          }}
        >
          {t('cadastro.voltar')}
        </Botao>
        <Botao onClick={avancar}>{t('cadastro.continuar')}</Botao>
      </div>
    </div>
  );
}

function PassoSeguranca({
  progresso,
  senha,
  aoVoltar,
}: {
  progresso: Progresso;
  senha: string;
  aoVoltar: () => void;
}) {
  const t = useTranslations('cadastro');
  const router = useRouter();
  const cadastrar = useCadastrar();
  const entrar = useEntrar();
  const [principal, ...suplementares] = progresso.oabs;
  const criar = () => {
    if (principal === undefined) return;
    const { dados } = progresso;
    cadastrar.mutate(
      {
        nome: dados.nome.trim(),
        cpf: dados.cpf,
        email: dados.email.trim(),
        senha,
        celular: dados.celular,
        oabPrincipal: principal,
        oabsSuplementares: suplementares,
      },
      {
        onSuccess: () => {
          guardarProgresso(null);
          // Entra com a mesma senha: o próximo passo da sessão é ativar o 2FA (obrigatório).
          entrar.mutate(
            { email: dados.email.trim(), senha },
            {
              onSuccess: (sessao) => {
                router.replace(destinoAposEntrar(sessao.proximoPasso, '/'));
              },
              onError: () => {
                router.replace(ROTA_ENTRAR);
              },
            },
          );
        },
      },
    );
  };
  return (
    <div className="grid gap-4">
      <AlertaFormulario erro={cadastrar.error} seNaoAutorizado="credenciaisInvalidas" />
      <p className="text-sm">{t('segurancaTexto')}</p>
      <p className="text-sm text-texto-suave">
        {t('resumo', {
          nome: progresso.dados.nome,
          email: progresso.dados.email,
          total: progresso.oabs.length,
        })}
      </p>
      <div className="flex justify-between gap-2">
        <Botao variante="secundaria" onClick={aoVoltar} disabled={cadastrar.isPending}>
          {t('voltar')}
        </Botao>
        <Botao onClick={criar} carregando={cadastrar.isPending || entrar.isPending}>
          {t('criar')}
        </Botao>
      </div>
    </div>
  );
}
