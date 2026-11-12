// Carga da planilha da curadoria no piloto (decisão do usuário em 11/11/2026): importa os CSVs
// gerados de docs/curadoria/carga (tabela de prazos e calendário) como RASCUNHOS propostos pela
// curadora, pelos mesmos casos de uso da tela de importação (validação, tudo ou nada, auditoria).
// Nada passa a valer aqui: a curadora confere e aprova no portal ("Aprovar todos os rascunhos").
// Uso: pnpm piloto:carga --email <e-mail da curadora>. Rodar de novo não duplica: a tabela só é
// carregada se ainda não houver versão nenhuma; no calendário, cada evento já cadastrado é pulado.
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { TrilhaPostgres } from '@pz/auditoria';
import { EventosGlobaisPostgres, ImportarCalendario } from '@pz/calendario';
import { Banco, executarNoTenant } from '@pz/db';
import { SystemClock } from '@pz/kernel';
import { ImportarTabelaDePrazos, TabelaPostgres, TiposDeAtoPostgres } from '@pz/prazos';

import type { Uuid } from '@pz/kernel';

const { values } = parseArgs({
  options: { email: { type: 'string' }, pasta: { type: 'string' } },
});
const email = values.email?.trim().toLowerCase() ?? '';
if (email === '') {
  process.stderr.write('Uso: pnpm piloto:carga --email <e-mail da curadora>\n');
  process.exit(1);
}
const pasta = resolve(
  values.pasta ?? join(import.meta.dirname, '../../../../docs/curadoria/carga'),
);
const TENANT_PLATAFORMA = (process.env.TENANT_PLATAFORMA_ID ??
  '01a10e00-0000-7000-8000-00000000c001') as Uuid;
const url = process.env.DATABASE_URL;
if (url === undefined) throw new Error('DATABASE_URL ausente (.env).');

const banco = new Banco({ url });
const relogio = new SystemClock();
const trilha = new TrilhaPostgres();
const comProblema = (linhas: readonly { linha: number; problemas: readonly unknown[] }[]) =>
  linhas.filter((l) => l.problemas.length > 0);
const descrever = (linhas: readonly { linha: number; problemas: readonly unknown[] }[]) =>
  linhas.map((l) => `  linha ${String(l.linha)}: ${JSON.stringify(l.problemas)}`).join('\n');

try {
  await executarNoTenant(TENANT_PLATAFORMA, async () => {
    const curadora = await banco.executar((tx) =>
      tx.usuario.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } }),
    );
    if (curadora === null) {
      throw new Error(`Curadora ${email} não encontrada: rode antes pnpm piloto:curadora.`);
    }
    // O sistema carrega em nome da curadora: a trilha registra o canal "sistema" e o usuário dela.
    const autor = {
      tenantId: TENANT_PLATAFORMA,
      usuarioId: curadora.id as Uuid,
      canal: 'sistema' as const,
    };
    const versoes = await banco.executar((tx) => tx.tabelaPrazo.count());

    if (versoes > 0) {
      process.stdout.write(`Tabela de prazos: já há ${String(versoes)} versões; nada importado.\n`);
    } else {
      const csv = readFileSync(join(pasta, 'tabela-de-prazos.csv'), 'utf8');
      const r = await new ImportarTabelaDePrazos(
        banco,
        new TiposDeAtoPostgres(),
        new TabelaPostgres(),
        trilha,
        relogio,
      ).executar(autor, { csv, somentePrevia: false });
      if (!r.ok) throw r.erro;
      const ruins = comProblema(r.valor.linhas);
      if (ruins.length > 0) {
        throw new Error(`Tabela de prazos recusada (tudo ou nada):\n${descrever(ruins)}`);
      }
      process.stdout.write(`Tabela de prazos: ${String(r.valor.propostos.length)} rascunhos.\n`);
    }

    // Calendário linha a linha: o que já está cadastrado (de uma carga anterior) é pulado.
    const importar = new ImportarCalendario(banco, new EventosGlobaisPostgres(), trilha, relogio);
    for (const arquivo of readdirSync(pasta).filter((a) => /^calendario-\d+\.csv$/.test(a))) {
      const csv = readFileSync(join(pasta, arquivo), 'utf8');
      const r = await importar.executar(autor, {
        csv,
        somentePrevia: false,
        ignorarRepetidos: true,
      });
      if (!r.ok) throw r.erro;
      const ruins = comProblema(r.valor.linhas);
      if (ruins.length > 0) {
        throw new Error(`${arquivo} recusado (tudo ou nada):\n${descrever(ruins)}`);
      }
      process.stdout.write(
        `Calendário (${arquivo}): ${String(r.valor.propostos.length)} rascunhos novos; ${String(r.valor.repetidos ?? 0)} já existiam.\n`,
      );
    }
  });
  process.stdout.write('Pronto. A curadora confere e aprova no portal: Prazos e Calendário.\n');
} finally {
  await banco.encerrar();
}
