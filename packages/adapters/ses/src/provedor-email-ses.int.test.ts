import { verificarContratoEmail } from '@pz/integracoes/contrato';
import { SystemClock } from '@pz/kernel';
import { GenericContainer, Wait } from 'testcontainers';
import { afterAll, beforeAll } from 'vitest';

import { criarProvedorEmailSes, DESCRITOR_SES } from './provedor-email-ses.js';

import type { ProvedorEmailSmtp } from '@pz/adapter-smtp';
import type { StartedTestContainer } from 'testcontainers';

let mailpit: StartedTestContainer;
let api = '';
const abertos: ProvedorEmailSmtp[] = [];

beforeAll(async () => {
  // Mailpit no lugar do endpoint SMTP do SES, aceitando as credenciais (como o SES faz).
  mailpit = await new GenericContainer('axllent/mailpit:v1.31.4')
    .withEnvironment({ MP_SMTP_AUTH_ACCEPT_ANY: '1', MP_SMTP_AUTH_ALLOW_INSECURE: '1' })
    .withExposedPorts(1025, 8025)
    .withWaitStrategy(Wait.forHttp('/readyz', 8025))
    .start();
  api = `http://${mailpit.getHost()}:${String(mailpit.getMappedPort(8025))}/api/v1`;
}, 300_000);

afterAll(async () => {
  for (const provedor of abertos) provedor.encerrar();
  await mailpit.stop();
});

function criar(host: string, porta: number): ProvedorEmailSmtp {
  const provedor = criarProvedorEmailSes(
    {
      regiao: 'sa-east-1',
      usuario: 'usuario-smtp-teste',
      senha: 'senha-smtp-teste',
      remetente: 'PrejuZero <nao-responda@prejuzero.local>',
      endpoint: { host, porta, tls: false },
    },
    new SystemClock(),
  );
  abertos.push(provedor);
  return provedor;
}

interface Mensagem {
  ID: string;
  Subject: string;
  To: { Address: string }[];
}

verificarContratoEmail('SES (interface SMTP, Mailpit)', {
  descritor: DESCRITOR_SES,
  criar: () => criar(mailpit.getHost(), mailpit.getMappedPort(1025)),
  criarInalcancavel: () => criar('127.0.0.1', 1),
  recebido: async (assunto) => {
    const busca = (await (
      await fetch(`${api}/search?query=${encodeURIComponent(`subject:"${assunto}"`)}`)
    ).json()) as { messages: Mensagem[] };
    const [mensagem] = busca.messages;
    if (mensagem === undefined) return undefined;
    const completa = (await (await fetch(`${api}/message/${mensagem.ID}`)).json()) as {
      HTML: string;
      Text: string;
    };
    return {
      para: mensagem.To.map((d) => d.Address),
      assunto: mensagem.Subject,
      html: completa.HTML,
      texto: completa.Text,
    };
  },
});
