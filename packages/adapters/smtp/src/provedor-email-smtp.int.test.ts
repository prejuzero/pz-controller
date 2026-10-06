import { verificarContratoEmail } from '@pz/integracoes/contrato';
import { SystemClock } from '@pz/kernel';
import { GenericContainer, Wait } from 'testcontainers';
import { afterAll, beforeAll } from 'vitest';

import { DESCRITOR_SMTP, ProvedorEmailSmtp } from './provedor-email-smtp.js';

import type { ConfiguracaoSmtp } from './provedor-email-smtp.js';
import type { StartedTestContainer } from 'testcontainers';

let mailpit: StartedTestContainer;
let api = '';
const abertos: ProvedorEmailSmtp[] = [];

beforeAll(async () => {
  // Mesma imagem do ambiente local (infra/docker/compose.yml).
  mailpit = await new GenericContainer('axllent/mailpit:v1.31.4')
    .withExposedPorts(1025, 8025)
    .withWaitStrategy(Wait.forHttp('/readyz', 8025))
    .start();
  api = `http://${mailpit.getHost()}:${String(mailpit.getMappedPort(8025))}/api/v1`;
}, 300_000);

afterAll(async () => {
  for (const provedor of abertos) provedor.encerrar();
  await mailpit.stop();
});

function criar(ajustes: Partial<ConfiguracaoSmtp> = {}): ProvedorEmailSmtp {
  const provedor = new ProvedorEmailSmtp(
    {
      host: mailpit.getHost(),
      porta: mailpit.getMappedPort(1025),
      tls: false,
      exigirStartTls: false,
      remetente: 'PrejuZero <nao-responda@prejuzero.local>',
      ...ajustes,
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

verificarContratoEmail('SMTP (Mailpit)', {
  descritor: DESCRITOR_SMTP,
  criar: () => criar(),
  criarInalcancavel: () => criar({ host: '127.0.0.1', porta: 1 }),
  recebido: async (assunto) => {
    const busca = (await (
      await fetch(`${api}/search?query=${encodeURIComponent(`subject:"${assunto}"`)}`)
    ).json()) as {
      messages: Mensagem[];
    };
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
