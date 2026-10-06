import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Junta classes do Tailwind; em conflito, vale a última (padrão do shadcn/ui). */
export function cn(...classes: ClassValue[]): string {
  return twMerge(clsx(classes));
}
