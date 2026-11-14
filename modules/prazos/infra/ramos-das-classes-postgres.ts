import { Instant } from '@pz/kernel';

import type {
  RepositorioDosRamosDasClasses,
  VersaoDoRamoDaClasse,
} from '../application/ramos-das-classes.js';
import type { Ramo } from '../domain/tabela.js';
import type { Transacao } from '@pz/db';
import type { Uuid } from '@pz/kernel';

type RamoNoBanco = 'civel' | 'juizados' | 'trabalhista' | 'penal' | 'juizado_criminal';
const paraBanco = (ramo: Ramo) => ramo.replaceAll('-', '_') as RamoNoBanco;
const doBanco = (ramo: RamoNoBanco) => ramo.replaceAll('_', '-') as Ramo;

interface Linha {
  id: string;
  classe: string;
  ramo: RamoNoBanco;
  versao: number;
  fundamento: string;
  fonteUrl: string;
  status: 'rascunho' | 'aprovado';
  propostoPor: string;
  propostoEm: Date;
  aprovadoPor: string | null;
  aprovadoEm: Date | null;
}

const versao = (l: Linha): VersaoDoRamoDaClasse => ({
  id: l.id as Uuid,
  classe: l.classe,
  ramo: doBanco(l.ramo),
  versao: l.versao,
  fundamento: l.fundamento,
  fonteUrl: l.fonteUrl,
  status: l.status,
  propostoPor: l.propostoPor as Uuid,
  propostoEm: Instant.deEpochMs(l.propostoEm.getTime()),
  ...(l.aprovadoPor === null ? {} : { aprovadoPor: l.aprovadoPor as Uuid }),
  ...(l.aprovadoEm === null ? {} : { aprovadoEm: Instant.deEpochMs(l.aprovadoEm.getTime()) }),
});

/** Correspondência classe → ramo (global, só de inserção; a aprovação é a única alteração). */
export class RamosDasClassesPostgres implements RepositorioDosRamosDasClasses<Transacao> {
  async listar(tx: Transacao): Promise<VersaoDoRamoDaClasse[]> {
    const linhas = await tx.ramoDaClasse.findMany({
      orderBy: [{ classe: 'asc' }, { versao: 'asc' }],
    });
    return linhas.map(versao);
  }

  async buscar(tx: Transacao, id: Uuid): Promise<VersaoDoRamoDaClasse | undefined> {
    const l = await tx.ramoDaClasse.findUnique({ where: { id } });
    return l === null ? undefined : versao(l);
  }

  async proximaVersao(tx: Transacao, classe: string): Promise<number> {
    const { _max } = await tx.ramoDaClasse.aggregate({ where: { classe }, _max: { versao: true } });
    return (_max.versao ?? 0) + 1;
  }

  async inserir(tx: Transacao, v: VersaoDoRamoDaClasse): Promise<boolean> {
    const n = await tx.$executeRaw`
      INSERT INTO ramo_da_classe (id, classe, ramo, versao, fundamento, fonte_url, status,
        proposto_por, proposto_em)
      VALUES (${v.id}::uuid, ${v.classe}, ${paraBanco(v.ramo)}::ramo_processual, ${v.versao},
        ${v.fundamento}, ${v.fonteUrl}, 'rascunho', ${v.propostoPor}::uuid,
        ${new Date(v.propostoEm.epochMs)})
      ON CONFLICT (classe, versao) DO NOTHING`;
    return n === 1;
  }

  async aprovar(tx: Transacao, id: Uuid, por: Uuid, em: Instant): Promise<boolean> {
    const { count } = await tx.ramoDaClasse.updateMany({
      where: { id, status: 'rascunho' },
      data: { status: 'aprovado', aprovadoPor: por, aprovadoEm: new Date(em.epochMs) },
    });
    return count === 1;
  }

  async ramoAprovado(tx: Transacao, classe: string): Promise<Ramo | undefined> {
    const l = await tx.ramoDaClasse.findFirst({
      where: { classe, status: 'aprovado' },
      orderBy: { versao: 'desc' },
      select: { ramo: true },
    });
    return l === null ? undefined : doBanco(l.ramo);
  }
}
