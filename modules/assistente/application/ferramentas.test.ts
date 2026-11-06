import { CatalogoDeFerramentas } from '@pz/ia';
import { NaoEncontrado, err, ok } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { ferramentasDoAssistente } from './ferramentas.js';

import type { FontesDasFerramentas } from './ferramentas.js';
import type { ContextoDaFerramenta, ExecucaoDeFerramenta } from '@pz/ia';
import type { Uuid } from '@pz/kernel';

// Dados FICTÍCIOS.
const TENANT = '01a10e00-0000-7000-8000-0000000ac001' as Uuid;
const PROCESSO = '01a10e00-0000-7000-8000-0000000ac003';
const PRAZO = '01a10e00-0000-7000-8000-0000000ac004';
const contexto: ContextoDaFerramenta = {
  tenantId: TENANT,
  usuarioId: '01a10e00-0000-7000-8000-0000000ac002' as Uuid,
  permissoes: new Set(['prazos:ler', 'publicacoes:ler', 'processos:ler']),
  canal: 'portal',
};
const prazo = {
  id: PRAZO,
  processoId: PROCESSO,
  publicacaoConteudoId: null,
  tipoAto: 'contestacao',
  ramo: 'civel',
  situacao: 'calculado',
  dias: 15,
  unidade: 'dias',
  inicio: '2027-03-03',
  vencimento: '2027-03-23',
  fimDoPrazo: '2027-03-24T03:00:00.000Z',
  fusoDoJuizo: 'America/Sao_Paulo',
  fundamento: null,
  versaoMotor: 'teste',
  versaoTabela: 1,
  vencimentoManual: false,
  origem: 'manual',
  status: 'a-confirmar',
  statusCiencia: 'pendente',
  responsavelId: null,
  jurisdicao: { tribunal: 'TJXA', lacunas: [] },
  classificacaoIncerta: false,
  motivoAjuste: null,
  versao: 1,
};

function fontes(
  chamadas: { metodo: string; tenant: string; args: unknown }[],
): FontesDasFerramentas {
  const registrar = (metodo: string, args: unknown, c: ContextoDaFerramenta) => {
    chamadas.push({ metodo, tenant: c.tenantId, args });
  };
  return {
    buscarPrazos: (f, c) => {
      registrar('buscarPrazos', f, c);
      return Promise.resolve(
        ok({ itens: [], proximoCursor: null, totalAproximado: 0, totalLimitado: false }),
      );
    },
    buscarPublicacoes: (f, c) => {
      registrar('buscarPublicacoes', f, c);
      return Promise.resolve(
        ok({ itens: [], proximoCursor: null, totalAproximado: 0, totalLimitado: false }),
      );
    },
    consultarProcesso: (id, c) => {
      registrar('consultarProcesso', id, c);
      return Promise.resolve(err(new NaoEncontrado('processo-inexistente', 'não existe')));
    },
    simularPrazo: (p, c) => {
      registrar('simularPrazo', p, c);
      return Promise.resolve(ok(prazo) as never);
    },
    consultarPrazo: (id, c) => {
      registrar('consultarPrazo', id, c);
      return Promise.resolve(ok({ ...prazo, memoria: null, parametros: {} }) as never);
    },
  };
}

function montar() {
  const chamadas: { metodo: string; tenant: string; args: unknown }[] = [];
  const auditoria: ExecucaoDeFerramenta[] = [];
  const catalogo = new CatalogoDeFerramentas(ferramentasDoAssistente(fontes(chamadas)), (_c, e) => {
    auditoria.push(e);
    return Promise.resolve();
  });
  return { catalogo, chamadas, auditoria };
}

describe('ferramentas do assistente (HU59)', () => {
  it('cinco ferramentas de leitura, sem tenant na entrada, cada uma com a permissão do endpoint', () => {
    const { catalogo } = montar();
    expect(catalogo.disponiveis(contexto).map((f) => f.nome)).toEqual([
      'buscar_prazos',
      'buscar_publicacoes',
      'consultar_processo',
      'simular_prazo',
      'explicar_memoria_calculo',
    ]);
    expect(
      catalogo.disponiveis({ permissoes: new Set(['prazos:ler']) }).map((f) => f.nome),
    ).toEqual(['buscar_prazos', 'simular_prazo', 'explicar_memoria_calculo']);
  });

  it('cada ferramenta chama a fonte com o tenant do contexto e valida a saída pelo contrato', async () => {
    const { catalogo, chamadas, auditoria } = montar();
    expect((await catalogo.executar('buscar_prazos', { tribunal: 'TJXA' }, contexto)).ok).toBe(
      true,
    );
    expect((await catalogo.executar('buscar_publicacoes', {}, contexto)).ok).toBe(true);
    const processo = await catalogo.executar('consultar_processo', { id: PROCESSO }, contexto);
    expect(!processo.ok && processo.erro.codigo).toBe('processo-inexistente');
    const simulado = await catalogo.executar(
      'simular_prazo',
      {
        processoId: PROCESSO,
        tipoAto: 'contestacao',
        meio: 'djen',
        dataDeReferencia: '2027-03-01',
      },
      contexto,
    );
    expect(simulado.ok && simulado.valor).toMatchObject({ vencimento: '2027-03-23' });
    expect((await catalogo.executar('explicar_memoria_calculo', { id: PRAZO }, contexto)).ok).toBe(
      true,
    );
    expect(chamadas.every((c) => c.tenant === TENANT)).toBe(true);
    expect(chamadas.map((c) => c.metodo)).toEqual([
      'buscarPrazos',
      'buscarPublicacoes',
      'consultarProcesso',
      'simularPrazo',
      'consultarPrazo',
    ]);
    expect(auditoria.map((a) => a.resultado)).toEqual(['ok', 'ok', 'erro', 'ok', 'ok']);
  });

  it('simular_prazo não aceita a data de vencimento vinda do modelo', async () => {
    const { catalogo } = montar();
    const r = await catalogo.executar(
      'simular_prazo',
      {
        processoId: PROCESSO,
        tipoAto: 'contestacao',
        meio: 'djen',
        dataDeReferencia: '2027-03-01',
        vencimentoConfirmado: '2027-03-23',
      },
      contexto,
    );
    expect(!r.ok && r.erro.codigo).toBe('validacao');
  });
});
