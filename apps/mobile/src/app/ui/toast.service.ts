import { Injectable, signal } from '@angular/core';

export type TonoDeAviso = 'info' | 'ok' | 'aviso' | 'error';

export interface Aviso {
  readonly id: number;
  readonly texto: string;
  readonly tono: TonoDeAviso;
}

const DURACION_MS: Readonly<Record<TonoDeAviso, number>> = {
  info: 3200,
  ok: 3200,
  aviso: 5000,
  // Un error no se va solo: si desaparece antes de que el usuario levante la
  // vista del escenario, no existió.
  error: 0,
};

/**
 * Avisos efímeros.
 *
 * Deliberadamente no sirven para nada de lo que dependa la seguridad: un
 * rechazo del motor de seguridad se muestra en la pantalla, con su invariante
 * y su explicación, no en un mensaje que se desvanece.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private siguienteId = 1;
  private readonly _avisos = signal<readonly Aviso[]>([]);
  readonly avisos = this._avisos.asReadonly();

  mostrar(texto: string, tono: TonoDeAviso = 'info'): void {
    const id = this.siguienteId++;
    this._avisos.update((a) => [...a, { id, texto, tono }]);
    const ms = DURACION_MS[tono];
    if (ms > 0) setTimeout(() => this.descartar(id), ms);
  }

  ok(texto: string): void { this.mostrar(texto, 'ok'); }
  error(texto: string): void { this.mostrar(texto, 'error'); }

  descartar(id: number): void {
    this._avisos.update((a) => a.filter((x) => x.id !== id));
  }
}
