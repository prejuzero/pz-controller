import { gerarUuidV7, Instant } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { AuditarEvento, EVENTOS_AUDITADOS } from './eventos.js';
import { EntradaDeAuditoria } from './portas.js';

import type { OrigemDaAuditoria, TrilhaDeAuditoria } from './portas.js';

const registrados: { entrada: EntradaDeAuditoria; origem: OrigemDaAuditoria }[] = [];
const trilha: TrilhaDeAuditoria<string> = {
  registrar: (_tx, entrada, origem) => {
    registrados.push({ entrada, origem });
    return Promise.resolve();
  },
};
const evento = (tipo: string, payload: Record<string, string>) => ({
  id: gerarUuidV7(),
  tipo,
  versao: 1,
  tenantId: gerarUuidV7(),
  agregadoId: 'x',
  ocorridoEm: Instant.deEpochMs(0),
  payload,
});

describe('eventos de domínio na trilha (HU08)', () => {
  it('cada evento auditado vira registro válido do catálogo, com o usuário como origem', async () => {
    const usuarioId = gerarUuidV7();
    const auditar = new AuditarEvento(trilha);
    for (const tipo of EVENTOS_AUDITADOS) {
      await auditar.executar(
        'tx',
        evento(tipo, {
          usuarioId,
          dispositivoId: gerarUuidV7(),
          tipoCliente: 'mobile',
          motivo: 'usuario',
          bloqueadaAte: 'x',
          tokenCifrado: 'segredo',
          notificacaoId: gerarUuidV7(),
          detalhe: 'segredo',
          entidade: 'publicacao',
          entidadeId: gerarUuidV7(),
          campo: 'tipoAto',
          valorSugerido: 'ficticio-a',
          valorCorrigido: 'ficticio-b',
        }),
      );
    }
    expect(registrados).toHaveLength(EVENTOS_AUDITADOS.length);
    for (const { entrada, origem } of registrados) {
      expect(EntradaDeAuditoria.parse(entrada)).toEqual(entrada);
      expect(origem).toEqual({ canal: 'evento', usuarioId });
      expect(JSON.stringify(entrada)).not.toContain('segredo'); // token e detalhe fora da trilha
    }
  });

  it('evento sem mapeamento falha (vai para a DLQ, nada some em silêncio)', async () => {
    await expect(
      new AuditarEvento(trilha).executar('tx', evento('Desconhecido', {})),
    ).rejects.toThrow('sem mapeamento');
  });
});
