import { Conflito, err, gerarUuidV7, ok, Proibido, Validacao } from '@pz/kernel';

import { contarCaracteres } from './credenciais.js';
import { PERMISSOES, somenteLeitura } from './permissoes.js';

import type { Permissao } from './permissoes.js';
import type { Sessao } from './sessao.js';
import type { Clock, Result, Uuid } from '@pz/kernel';

/** Teto da impersonação (HU07): vence sozinha, sem renovação; outra exige novo motivo. */
export const DURACAO_DA_IMPERSONACAO_MS = 60 * 60 * 1000;
export const MOTIVO_MINIMO = 10;
export const MOTIVO_MAXIMO = 500;

export function iniciarImpersonacao(
  sessao: Sessao,
  tenantId: Uuid,
  motivo: string,
  relogio: Clock,
): Result<Sessao, Validacao | Proibido | Conflito> {
  const texto = motivo.trim();
  const tamanho = contarCaracteres(texto);
  if (tamanho < MOTIVO_MINIMO || tamanho > MOTIVO_MAXIMO) {
    return err(
      new Validacao([
        {
          campo: 'motivo',
          mensagem: `Informe o motivo com ${String(MOTIVO_MINIMO)} a ${String(MOTIVO_MAXIMO)} caracteres.`,
        },
      ]),
    );
  }
  if (tenantId === sessao.tenantId) {
    return err(new Validacao([{ campo: 'tenantId', mensagem: 'Este já é o seu tenant.' }]));
  }
  // Só no portal, com 2FA: token de dispositivo (app, MCP, integrador) não impersona.
  if (sessao.nivel !== 'completo' || sessao.dispositivoId !== undefined) {
    return err(new Proibido('impersonacao-so-no-portal', 'Impersonação só pelo portal.'));
  }
  if (sessao.impersonacao !== undefined) {
    return err(
      new Conflito('impersonacao-ativa', 'Encerre a impersonação atual antes de iniciar outra.'),
    );
  }
  const agora = relogio.agora();
  return ok({
    ...sessao,
    impersonacao: {
      id: gerarUuidV7(relogio),
      tenantId,
      motivo: texto,
      iniciadaEm: agora,
      expiraEm: agora.maisMs(DURACAO_DA_IMPERSONACAO_MS),
    },
  });
}

/** Tenant em que a requisição roda (RLS): o acessado durante a impersonação. */
export function tenantEfetivo(sessao: Sessao): Uuid {
  return sessao.impersonacao?.tenantId ?? sessao.tenantId;
}

/**
 * Durante a impersonação valem só as permissões de leitura do catálogo, mais a de impersonar
 * (para encerrar). Conferido a cada requisição: quem perdeu `admin:impersonar` perde tudo.
 */
export function permissoesNaImpersonacao(reais: ReadonlySet<Permissao>): ReadonlySet<Permissao> {
  if (!reais.has('admin:impersonar')) return new Set();
  return new Set<Permissao>([...somenteLeitura(PERMISSOES), 'admin:impersonar']);
}
