// Seeds de desenvolvimento (`pnpm db:seed`): dados fictícios para o ambiente local, idempotentes.
// Usa o papel pz_sistema, porque criar tenants é operação do cadastro (cliente sistema, ADR-003).
// Nunca use dados reais de clientes aqui (CLAUDE.md, seção 3).
import { argon2, createHash, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';

import { protecaoDeCampos, ProvedorChavesLocal } from '@pz/integracoes';
import pg from 'pg';

const url =
  process.env.DATABASE_URL_SISTEMA ??
  'postgresql://pz_sistema:pz_sistema_local@127.0.0.1:5432/prejuzero';

// CPF só cifrado (HU37, ADR-021): as mesmas chaves da api e do worker (CHAVE_CIFRAGEM e
// CHAVES_DE_DADOS do .env). Sem a chave, o seed para: um CPF que a api não decifra quebraria o perfil.
function protecaoDoAmbiente() {
  const mestra = process.env.CHAVE_CIFRAGEM;
  if (mestra === undefined || mestra === '') {
    throw new Error(
      'CHAVE_CIFRAGEM ausente: defina no .env (openssl rand -base64 32) e rode de novo.',
    );
  }
  const lista = process.env.CHAVES_DE_DADOS;
  return protecaoDeCampos(
    new ProvedorChavesLocal(mestra, lista === undefined || lista === '' ? undefined : lista),
    mestra,
  );
}

const TENANT_DEMONSTRACAO = '01a10e00-0000-7000-8000-00000000d001';
const USUARIO_DEMONSTRACAO = '01a10e00-0000-7000-8000-00000000d002';
const ADVOGADO_DEMONSTRACAO = '01a10e00-0000-7000-8000-00000000d003';
const OAB_DEMONSTRACAO = '01a10e00-0000-7000-8000-00000000d004';
// Colaboradora FICTÍCIA do escritório (HU41): recebe prazos delegados.
const USUARIO_COLABORADORA = '01a10e00-0000-7000-8000-00000000d005';
// Plataforma FICTÍCIA: dois curadores (HU13/HU15, aprovação por quatro olhos) e um administrador
// (HU39, painel da plataforma).
const TENANT_PLATAFORMA = '01a10e00-0000-7000-8000-00000000c001';
/**
 * Publicações FICTÍCIAS capturadas só pelo nome do escritório (HU42), para conferir no portal. O
 * seed as devolve a "pendente" a cada execução (o E2E confirma uma e descarta a outra).
 */
const PUBLICACOES_PELO_NOME = [
  {
    id: '01a10e00-0000-7000-8000-00000000d101',
    numero: '10000058820268260100',
    idExterno: 'seed-nome-1',
  },
  {
    id: '01a10e00-0000-7000-8000-00000000d102',
    numero: '10000067320268260100',
    idExterno: 'seed-nome-2',
  },
];
const USUARIOS_PLATAFORMA = [
  {
    id: '01a10e00-0000-7000-8000-00000000c002',
    nome: 'Curadoria Um',
    email: 'curadoria1@prejuzero.local',
    perfil: 'curador',
  },
  {
    id: '01a10e00-0000-7000-8000-00000000c003',
    nome: 'Curadoria Dois',
    email: 'curadoria2@prejuzero.local',
    perfil: 'curador',
  },
  {
    id: '01a10e00-0000-7000-8000-00000000c004',
    nome: 'Administração Local',
    email: 'admin@prejuzero.local',
    perfil: 'admin_plataforma',
  },
];

// Senha só do ambiente local (fictícia); troque por SENHA_DEMONSTRACAO se quiser outra.
const SENHA = process.env.SENHA_DEMONSTRACAO ?? 'demonstracao local 2026';

/** Mesmo formato e parâmetros do HasherArgon2 do módulo identidade (PHC, OWASP). */
async function hashArgon2id(senha: string): Promise<string> {
  const sal = randomBytes(16);
  const hash = await promisify(argon2)('argon2id', {
    message: Buffer.from(senha.normalize('NFC'), 'utf8'),
    nonce: sal,
    memory: 19_456,
    passes: 2,
    parallelism: 1,
    tagLength: 32,
  });
  const b64 = (dados: Buffer) => dados.toString('base64').replace(/=+$/, '');
  return `$argon2id$v=19$m=19456,t=2,p=1$${b64(sal)}$${b64(hash)}`;
}

const cliente = new pg.Client({ connectionString: url });
await cliente.connect();
try {
  await cliente.query('BEGIN');
  await cliente.query(
    `INSERT INTO tenant (id, nome, tipo) VALUES ($1, 'Escritório Demonstração', 'escritorio')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_DEMONSTRACAO],
  );
  await cliente.query(
    `INSERT INTO usuario (id, tenant_id, nome, email)
     VALUES ($1, $2, 'Pessoa Demonstração', 'demonstracao@prejuzero.local')
     ON CONFLICT (id) DO NOTHING`,
    [USUARIO_DEMONSTRACAO, TENANT_DEMONSTRACAO],
  );
  // Titular do escritório (HU07, HU41): advoga e administra a equipe. Com RLS forçado, a
  // atribuição roda no contexto do tenant.
  await cliente.query(`SELECT set_config('app.tenant_id', $1, true)`, [TENANT_DEMONSTRACAO]);
  await cliente.query(
    `INSERT INTO usuario_perfil (tenant_id, usuario_id, perfil)
     VALUES ($1, $2, 'advogado'), ($1, $2, 'admin_escritorio')
     ON CONFLICT DO NOTHING`,
    [TENANT_DEMONSTRACAO, USUARIO_DEMONSTRACAO],
  );
  // Advogado e OAB FICTÍCIOS (HU11): CPF gerado só para a demonstração, OAB inexistente.
  const protecao = protecaoDoAmbiente();
  const cpf = '52998224725';
  await cliente.query(
    `INSERT INTO advogado (id, tenant_id, usuario_id, nome, cpf_cifrado, cpf_indice, celular)
     VALUES ($1, $2, $3, 'Pessoa Demonstração', $4, $5, '11900000000')
     ON CONFLICT DO NOTHING`,
    [
      ADVOGADO_DEMONSTRACAO,
      TENANT_DEMONSTRACAO,
      USUARIO_DEMONSTRACAO,
      protecao.cifrar(cpf),
      protecao.indice(cpf),
    ],
  );
  await cliente.query(
    `INSERT INTO oab (id, tenant_id, advogado_id, numero, uf, tipo)
     VALUES ($1, $2, $3, '999999', 'SP', 'principal')
     ON CONFLICT DO NOTHING`,
    [OAB_DEMONSTRACAO, TENANT_DEMONSTRACAO, ADVOGADO_DEMONSTRACAO],
  );
  await cliente.query('UPDATE usuario SET senha_hash = $2 WHERE id = $1 AND senha_hash IS NULL', [
    USUARIO_DEMONSTRACAO,
    await hashArgon2id(SENHA),
  ]);
  await cliente.query(
    `INSERT INTO usuario (id, tenant_id, nome, email, email_verificado_em)
     VALUES ($1, $2, 'Colaboradora Demonstração', 'colaboradora@prejuzero.local', now())
     ON CONFLICT (id) DO NOTHING`,
    [USUARIO_COLABORADORA, TENANT_DEMONSTRACAO],
  );
  await cliente.query(
    `INSERT INTO usuario_perfil (tenant_id, usuario_id, perfil) VALUES ($1, $2, 'colaborador')
     ON CONFLICT DO NOTHING`,
    [TENANT_DEMONSTRACAO, USUARIO_COLABORADORA],
  );
  await cliente.query('UPDATE usuario SET senha_hash = $2 WHERE id = $1 AND senha_hash IS NULL', [
    USUARIO_COLABORADORA,
    await hashArgon2id(SENHA),
  ]);
  // Ainda no contexto do escritório de demonstração: o destinatário tem RLS forçado.
  await cliente.query(`SELECT set_config('app.tenant_id', $1, true)`, [TENANT_DEMONSTRACAO]);
  for (const [i, p] of PUBLICACOES_PELO_NOME.entries()) {
    const teor = `FICTÍCIO: intimação de teste ${String(i + 1)} da parte ré ESCRITÓRIO DEMONSTRAÇÃO, capturada pelo nome. Processo ${p.numero}.`;
    const {
      rows: [conteudo],
    } = await cliente.query<{ conteudo_id: string; capturado_em: Date }>(
      `SELECT conteudo_id, capturado_em FROM pz_registrar_publicacao(
         $1, 'djen', $2, $3, CURRENT_DATE - 1, $4, $5,
         'https://comunicaapi.pje.jus.br/api/v1/comunicacao/ficticio/certidao',
         '{"siglaTribunal":"TJSP","tipoComunicacao":"Intimação"}'::jsonb, 'seed')`,
      [p.id, p.idExterno, createHash('sha256').update(teor).digest('hex'), p.numero, teor],
    );
    if (conteudo === undefined) throw new Error('publicação do seed não registrada');
    await cliente.query(
      `INSERT INTO publicacao_destinatario (tenant_id, conteudo_id, conteudo_capturado_em, conferencia)
       VALUES ($1, $2, $3, 'pendente')
       ON CONFLICT (tenant_id, conteudo_id) DO UPDATE
         SET conferencia = 'pendente', processo_id = NULL, oab_id = NULL,
             conferida_em = NULL, conferida_por = NULL, lida_em = NULL, lida_por = NULL`,
      [TENANT_DEMONSTRACAO, conteudo.conteudo_id, conteudo.capturado_em],
    );
  }
  await cliente.query(
    `INSERT INTO tenant (id, nome, tipo) VALUES ($1, 'PrejuZero (curadoria local)', 'plataforma')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_PLATAFORMA],
  );
  await cliente.query(`SELECT set_config('app.tenant_id', $1, true)`, [TENANT_PLATAFORMA]);
  for (const usuario of USUARIOS_PLATAFORMA) {
    await cliente.query(
      `INSERT INTO usuario (id, tenant_id, nome, email) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [usuario.id, TENANT_PLATAFORMA, usuario.nome, usuario.email],
    );
    await cliente.query(
      `INSERT INTO usuario_perfil (tenant_id, usuario_id, perfil) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [TENANT_PLATAFORMA, usuario.id, usuario.perfil],
    );
    await cliente.query('UPDATE usuario SET senha_hash = $2 WHERE id = $1 AND senha_hash IS NULL', [
      usuario.id,
      await hashArgon2id(SENHA),
    ]);
  }
  await cliente.query('COMMIT');
  process.stdout.write(
    `Seeds aplicados (tenant ${TENANT_DEMONSTRACAO}; login demonstracao@prejuzero.local; curadoria1 e curadoria2@prejuzero.local; admin@prejuzero.local).\n`,
  );
} catch (erro) {
  await cliente.query('ROLLBACK');
  throw erro;
} finally {
  await cliente.end();
}
