import { composeStories } from '@storybook/react-vite';

type ModuloStories = Parameters<typeof composeStories>[0];
// O tipo de composeStories depende do módulo concreto; aqui só usamos id, nome e run.
type HistoriaComposta = Pick<Historia, 'id' | 'run'> & { storyName: string };

export interface Historia {
  id: string;
  nome: string;
  run: (contexto?: { globals: Record<string, unknown> }) => Promise<void>;
}

/** Todas as stories do pacote: cada uma vira caso de teste (acessibilidade, teclado e visual). */
export function todasAsHistorias(): Historia[] {
  const modulos = import.meta.glob<ModuloStories>('../**/*.stories.tsx', { eager: true });
  return Object.values(modulos).flatMap((modulo) =>
    Object.values(composeStories(modulo) as Record<string, HistoriaComposta>).map((historia) => ({
      id: historia.id,
      nome: `${String(modulo.default.title)} › ${historia.storyName}`,
      run: historia.run,
    })),
  );
}
