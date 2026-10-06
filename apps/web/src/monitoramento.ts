import { z } from 'zod';

const Dsn = z.url({ protocol: /^https$/ }).optional();

type Iniciar = (opcoes: { dsn: string; sendDefaultPii: false; tracesSampleRate: number }) => void;

/** Sentry no navegador só com DSN configurado (sem serviço externo no ambiente local). */
export function iniciarMonitoramento(dsnBruto: string | undefined, iniciar: Iniciar): boolean {
  const dsn = Dsn.parse(dsnBruto === '' ? undefined : dsnBruto);
  if (dsn === undefined) return false;
  // Sem IP, cookies nem corpo de requisição: nada de dado pessoal ou sigiloso (CLAUDE.md, seção 3).
  iniciar({ dsn, sendDefaultPii: false, tracesSampleRate: 0 });
  return true;
}
