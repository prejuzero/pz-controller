import type { ConsultaDeUsoDeIa, LinhaDeUsoDeIa } from '../application/uso-ia.js';
import type { LocalDate } from '@pz/kernel';

/** Uso de IA em memória, para testes sem banco. */
export class UsoDeIaEmMemoria implements ConsultaDeUsoDeIa<unknown> {
  readonly linhas: LinhaDeUsoDeIa[] = [];

  porPeriodo(_tx: unknown, de: LocalDate, ate: LocalDate): Promise<LinhaDeUsoDeIa[]> {
    return Promise.resolve(
      this.linhas
        .filter((l) => !l.dia.ehAntesDe(de) && !l.dia.ehDepoisDe(ate))
        .sort(
          (a, b) =>
            a.dia.comparar(b.dia) ||
            a.tarefa.localeCompare(b.tarefa) ||
            a.modelo.localeCompare(b.modelo),
        ),
    );
  }
}
