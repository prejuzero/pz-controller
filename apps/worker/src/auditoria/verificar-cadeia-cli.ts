// Verifica a trilha de auditoria inteira de um banco (PZ-221): o aceite da restauração de backup.
// Uso: DATABASE_URL_SISTEMA=postgresql://pz_sistema:…@host:5432/banco tsx verificar-cadeia-cli.ts
// Sai com código 1 se alguma cadeia divergir.
import { CadeiaPostgres, sha256, VerificarCadeiaCompleta } from '@pz/auditoria';
import { BancoSistema } from '@pz/db';

import { relatorioDaVerificacao } from './verificar-cadeia.js';

const url = process.env.DATABASE_URL_SISTEMA;
if (url === undefined || url === '') {
  process.stderr.write('DATABASE_URL_SISTEMA ausente.\n');
  process.exit(2);
}
const sistema = new BancoSistema({ url, maxConexoes: 2 });
try {
  const resultados = await new VerificarCadeiaCompleta(
    sistema.unidade('verificação da trilha depois da restauração do backup'),
    new CadeiaPostgres(),
    sha256,
  ).executar();
  const { integra, texto } = relatorioDaVerificacao(resultados);
  process.stdout.write(texto);
  process.exitCode = integra ? 0 : 1;
} finally {
  await sistema.encerrar();
}
