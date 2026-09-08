import type { Almacen, Documento } from '@vse/store';
import type { LogEvent, LogSink } from './tipos.ts';

/**
 * Sumidero que guarda los eventos en el almacén.
 *
 * Tres decisiones que son el sumidero entero:
 *
 * **Encola y vuelca por lotes.** `escribir()` es síncrono y guardar no lo es.
 * Escribir cada evento en cuanto llega convertiría cada registro en una espera
 * y, durante una transacción, el registro es justo lo que no puede frenar a lo
 * que registra.
 *
 * **Purga por número, no por tiempo.** Lo que hay que acotar es el espacio en
 * la tablet, y «tres días» no dice cuánto ocupa. El máximo se cuenta con
 * `contar()`, sin traer los eventos: purgar no puede costar más que registrar.
 *
 * **No lanza nunca.** Si el almacén falla, se anota el último error para que se
 * pueda ver en Ajustes y se sigue. Un registro que tumba la aplicación es peor
 * que no tener registro.
 */

export interface OpcionesSumidero {
  /** Cuántos eventos se guardan antes de que la purga empiece a borrar. */
  readonly maximo?: number;
  /** Cuántos eventos se acumulan antes de un volcado. */
  readonly lote?: number;
  /** Cada cuántos eventos guardados se comprueba si hay que purgar. */
  readonly purgarCada?: number;
}

const POR_DEFECTO = { maximo: 5000, lote: 25, purgarCada: 250 } as const;

export class SumideroPersistente implements LogSink {
  private readonly almacen: Almacen;
  private readonly maximo: number;
  private readonly lote: number;
  private readonly purgarCada: number;

  private cola: LogEvent[] = [];
  /** Los volcados se encadenan: dos a la vez escribirían el mismo id. */
  private enCurso: Promise<void> = Promise.resolve();
  private desdeLaPurga = 0;
  private contador = 0;

  private _ultimoError: string | null = null;
  /** Lo que falló al guardar, si algo falló. Ajustes lo muestra. */
  get ultimoError(): string | null { return this._ultimoError; }

  /** Cuántos eventos esperan a ser guardados. */
  get pendientes(): number { return this.cola.length; }

  constructor(almacen: Almacen, opciones: OpcionesSumidero = {}) {
    this.almacen = almacen;
    this.maximo = opciones.maximo ?? POR_DEFECTO.maximo;
    this.lote = opciones.lote ?? POR_DEFECTO.lote;
    this.purgarCada = opciones.purgarCada ?? POR_DEFECTO.purgarCada;
  }

  escribir(e: LogEvent): void {
    this.cola.push(e);
    if (this.cola.length >= this.lote) void this.volcar();
  }

  /**
   * Guarda lo que haya en cola.
   *
   * Se llama sola al llenarse el lote, y a mano antes de exportar o de cerrar
   * la sesión: son los momentos en que un evento sin guardar sí se notaría.
   */
  volcar(): Promise<void> {
    this.enCurso = this.enCurso.then(() => this.volcarAhora());
    return this.enCurso;
  }

  private async volcarAhora(): Promise<void> {
    if (this.cola.length === 0) return;
    const lote = this.cola;
    this.cola = [];
    try {
      for (const e of lote) await this.almacen.guardar('log_event', this.aDocumento(e));
      this.desdeLaPurga += lote.length;
      this._ultimoError = null;
      if (this.desdeLaPurga >= this.purgarCada) await this.purgar();
    } catch (err) {
      // Los eventos del lote se pierden a propósito: devolverlos a la cola
      // haría que un almacén roto la hiciera crecer sin límite hasta quedarse
      // sin memoria, que es peor que perder unas líneas de registro.
      this._ultimoError = String(err);
      console.warn('no se pudo guardar el registro', err);
    }
  }

  /**
   * Borra los más viejos hasta dejar `maximo`.
   *
   * Cuenta primero y solo entonces lista lo que sobra, con límite: leer los
   * cinco mil eventos para descartar cincuenta sería el gasto que esta clase
   * intenta evitar.
   */
  private async purgar(): Promise<void> {
    this.desdeLaPurga = 0;
    const total = await this.almacen.contar('log_event');
    const sobran = total - this.maximo;
    if (sobran <= 0) return;
    const viejos = await this.almacen.listar('log_event', { ordenarPor: 'id', limite: sobran });
    for (const d of viejos) await this.almacen.borrar('log_event', d.id);
  }

  /**
   * El identificador es la marca de tiempo más un contador.
   *
   * Así ordenar por `id` da el orden cronológico incluso entre eventos del
   * mismo milisegundo, que en un arranque son varios. El contador se reinicia
   * con la aplicación, pero para entonces la marca de tiempo ya es otra.
   */
  private aDocumento(e: LogEvent): Documento {
    const n = String(this.contador++).padStart(6, '0');
    return {
      id: `${e.ts}-${n}`,
      indices: {
        ts: e.ts,
        session_id: e.sessionId,
        category: e.category,
        level: e.level,
        event: e.event,
      },
      datos: e,
    };
  }
}
