import { Instant, LocalDate } from '@pz/kernel';
import { z } from 'zod';

/** Data jurídica (sem hora) no modelo canônico: sempre `LocalDate`, nunca `Date` (ADR-013). */
export const DataJuridica = z.custom<LocalDate>((valor) => valor instanceof LocalDate, {
  message: 'esperado LocalDate',
});

/** Instante no modelo canônico: sempre `Instant` (UTC). */
export const Instante = z.custom<Instant>((valor) => valor instanceof Instant, {
  message: 'esperado Instant',
});

export const UFS = [
  'AC',
  'AL',
  'AM',
  'AP',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MG',
  'MS',
  'MT',
  'PA',
  'PB',
  'PE',
  'PI',
  'PR',
  'RJ',
  'RN',
  'RO',
  'RR',
  'RS',
  'SC',
  'SE',
  'SP',
  'TO',
] as const;
export const Uf = z.enum(UFS);
export type Uf = z.infer<typeof Uf>;

/** Inscrição na OAB: número e seccional. Validação completa fica no value object do cadastro. */
export const Oab = z.object({ numero: z.string().regex(/^\d{1,8}$/), uf: Uf }).strict();
export type Oab = z.infer<typeof Oab>;

/**
 * Número único do processo no formato da Resolução CNJ 65/2008 (NNNNNNN-DD.AAAA.J.TR.OOOO).
 * Aqui só o formato; o dígito verificador é conferido pelo value object do cadastro.
 */
export const NumeroCnj = z.string().regex(/^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/);
export type NumeroCnj = z.infer<typeof NumeroCnj>;

/** Janela de busca por data de disponibilização, inclusiva nas duas pontas. */
export const JanelaDeBusca = z
  .object({ inicio: DataJuridica, fim: DataJuridica })
  .strict()
  .refine((janela) => !janela.fim.ehAntesDe(janela.inicio), {
    message: 'o fim da janela não pode ser anterior ao início',
  });
export type JanelaDeBusca = z.infer<typeof JanelaDeBusca>;

/** Endereço público para o usuário abrir (e-mail, push, mensagem): sempre HTTPS (CLAUDE.md, 12). */
export const LinkHttps = z.url({ protocol: /^https$/ });

/** Situação de um adaptador, exibida na saúde e no painel de integrações. */
export const SaudeAdaptador = z
  .object({
    estado: z.enum(['operacional', 'degradado', 'indisponivel']),
    verificadoEm: Instante,
    detalhe: z.string().max(500).optional(),
  })
  .strict();
export type SaudeAdaptador = z.infer<typeof SaudeAdaptador>;
