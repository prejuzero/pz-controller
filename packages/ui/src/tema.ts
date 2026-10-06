import type { Tema } from '@pz/design-tokens';

/** Fixa o tema no `<html>` (os tokens trocam pelas variáveis CSS; sem `dark:` nos componentes). */
export function definirTema(tema: Tema, raiz: HTMLElement = document.documentElement): void {
  raiz.dataset.tema = tema;
}
