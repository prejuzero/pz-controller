import type { Permissao } from './permissoes.js';

/**
 * Perfis semeados pela migração `20261009000000_perfis` (o banco é a fonte em produção; o teste de
 * integração garante que esta cópia e o banco não divergem). Servem aos testes sem banco e à
 * matriz de autorização. MVP: advogado, admin_plataforma e curador (HU13,
 * migração `20261011000000_perfil_curador`); processos na HU12 (`20261016000000_processos_clientes`);
 * F2 já modelados.
 */
export const PERFIS_PADRAO = {
  advogado: [
    'conta:gerir',
    'prazos:ler',
    'prazos:confirmar',
    'prazos:ajustar',
    'publicacoes:ler',
    'calendario:ler',
    'calendario:gerir',
    'relatorios:exportar',
    'processos:ler',
    'processos:gerir',
    'escritorio:exportar',
    'escritorio:encerrar',
  ],
  admin_plataforma: ['conta:gerir', 'admin:tenants', 'admin:impersonar', 'admin:filas'],
  admin_escritorio: [
    'conta:gerir',
    'prazos:ler',
    'prazos:confirmar',
    'prazos:ajustar',
    'publicacoes:ler',
    'calendario:ler',
    'calendario:gerir',
    'relatorios:exportar',
    'usuarios:gerir',
    'processos:ler',
    'processos:gerir',
    'escritorio:exportar',
    'escritorio:encerrar',
  ],
  colaborador: ['conta:gerir', 'prazos:ler', 'publicacoes:ler', 'calendario:ler', 'processos:ler'],
  curador: ['conta:gerir', 'curadoria:calendario', 'curadoria:tabela-prazos'],
} as const satisfies Record<string, readonly Permissao[]>;

export type CodigoPerfil = keyof typeof PERFIS_PADRAO;
