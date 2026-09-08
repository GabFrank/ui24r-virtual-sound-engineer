import { Injectable, inject, signal } from '@angular/core';
import { SumideroPersistente, aJsonl, leerEventos, type FiltroRegistro, type LogEvent }
  from '@vse/logging';
import { ALMACEN } from './almacen/almacen';
import { Logger } from './logger';

/**
 * Conecta el registro con el almacén y deja leerlo.
 *
 * El sumidero se agrega en el arranque y no en el constructor del registro
 * porque antes de abrir el almacén no hay dónde guardar, y los primeros
 * eventos —los del propio arranque— tienen que salir igual por consola.
 */
@Injectable({ providedIn: 'root' })
export class RegistroService {
  private readonly almacen = inject(ALMACEN);
  private readonly log = inject(Logger);
  private sumidero: SumideroPersistente | null = null;

  /** Lo que falló al guardar el registro, si algo falló. Ajustes lo muestra. */
  readonly ultimoError = signal<string | null>(null);

  conectar(): void {
    if (this.sumidero !== null) return;
    this.sumidero = new SumideroPersistente(this.almacen);
    this.log.agregarSink(this.sumidero);
  }

  /**
   * Guarda lo que haya en cola.
   *
   * Se llama antes de leer o exportar: si no, lo último que pasó —que es
   * justo lo que se está buscando— todavía está en memoria.
   */
  async volcar(): Promise<void> {
    if (this.sumidero === null) return;
    await this.sumidero.volcar();
    this.ultimoError.set(this.sumidero.ultimoError);
  }

  async eventos(filtro: FiltroRegistro = {}): Promise<readonly LogEvent[]> {
    await this.volcar();
    return leerEventos(this.almacen, filtro);
  }

  /** Los eventos como `events.jsonl`, que es lo que pide docs/logging.md. */
  async exportarJsonl(filtro: FiltroRegistro = {}): Promise<string> {
    return aJsonl(await this.eventos(filtro));
  }
}
