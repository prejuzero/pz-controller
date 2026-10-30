import { formatarNumeroCnj, lerNumeroCnj } from '@pz/kernel';

import type { ConsultarProcesso } from '@pz/cadastro';
import type { TenantsPostgres, UsuariosComPermissaoPostgres } from '@pz/identidade';
import type { LocalDate, Uuid } from '@pz/kernel';
import type { ConteudoDoResumo, FontesDoResumo } from '@pz/notificacoes';
import type { BuscarPrazos, FiltroDaBuscaDePrazos } from '@pz/prazos';
import type { ListarPublicacoes } from '@pz/publicacoes';

const LIMITE = 50;
const ABERTOS = ['a-confirmar', 'pendente'] as const;
const PROXIMOS_DIAS = 7;

const dataBr = (iso: string) => {
  const [ano, mes, dia] = iso.split('-');
  return `${dia ?? ''}/${mes ?? ''}/${ano ?? ''}`;
};
const cnj = (digitos: string) => {
  const partes = lerNumeroCnj(digitos);
  return partes === undefined ? digitos : formatarNumeroCnj(partes);
};

/**
 * Fontes do resumo diário (HU31), pelas APIs públicas de identidade, prazos, publicações e
 * cadastro. Só composição: a regra do resumo está no módulo notificacoes.
 */
export function fontesDoResumo<Transacao>(deps: {
  tenants: TenantsPostgres;
  usuarios: UsuariosComPermissaoPostgres;
  prazos: BuscarPrazos<unknown>;
  publicacoes: ListarPublicacoes<unknown>;
  processos: ConsultarProcesso<unknown>;
  urlDoPortal: string;
}): FontesDoResumo<Transacao> {
  const link = (caminho: string) => new URL(caminho, deps.urlDoPortal).toString();
  const numero = async (processoId: Uuid) => {
    const r = await deps.processos.executar(processoId);
    return r.ok ? r.valor.numeroCnj : 'sem número';
  };
  const itens = async (filtro: Omit<FiltroDaBuscaDePrazos, 'campoData' | 'ordem' | 'limite'>) => {
    const r = await deps.prazos.executar({
      ...filtro,
      campoData: 'vencimento',
      ordem: 'asc',
      limite: LIMITE,
    });
    if (!r.ok) throw r.erro;
    return Promise.all(
      r.valor.itens.map(async (p) => ({
        numeroProcesso: await numero(p.processoId),
        vencimento: p.vencimento === null ? '' : dataBr(p.vencimento),
        link: link(`/prazos/${p.id}`),
      })),
    );
  };
  return {
    tenants: async (tx) => {
      const ativos: Uuid[] = [];
      let apos: Uuid | undefined;
      for (;;) {
        const pagina = await deps.tenants.listar(tx as never, {
          limite: 500,
          ...(apos === undefined ? {} : { apos }),
        });
        ativos.push(
          ...pagina
            .filter((t) => t.tipo !== 'plataforma' && t.encerradoEm === undefined)
            .map((t) => t.id),
        );
        const ultimo = pagina.at(-1);
        if (ultimo === undefined || pagina.length < 500) return ativos;
        apos = ultimo.id;
      }
    },
    usuarios: (tx) => deps.usuarios.listar(tx as never, 'prazos:ler'),
    conteudo: async (usuarioId: Uuid, dia: LocalDate): Promise<ConteudoDoResumo> => {
      const doUsuario = { responsavelIds: [usuarioId], status: [...ABERTOS] };
      const novas = await deps.publicacoes.executar({ novas: 'true', limite: String(LIMITE) });
      if (!novas.ok) throw novas.erro;
      return {
        vencemHoje: await itens({ ...doUsuario, de: dia, ate: dia }),
        proximos: await itens({
          ...doUsuario,
          de: dia.maisDias(1),
          ate: dia.maisDias(PROXIMOS_DIAS),
        }),
        semCiencia: await itens({ ...doUsuario, statusCiencia: ['pendente'], de: dia }),
        intimacoes: novas.valor.itens.map((p) => ({
          numeroProcesso: p.numeroCnj === null ? 'sem número' : cnj(p.numeroCnj),
          link: link(`/publicacoes/${p.id}`),
        })),
      };
    },
  };
}
