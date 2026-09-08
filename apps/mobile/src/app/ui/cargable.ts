import { computed, signal, type Signal } from '@angular/core';

/**
 * Algo que se lee de un sitio que puede tardar o fallar.
 *
 * Existe porque las pantallas leían con un `await` suelto dentro de un
 * `effect`, sin bandera de carga y sin captura: mientras el almacén contestaba
 * se veía la lista vacía, y si el almacén fallaba se seguía viendo la lista
 * vacía. «Todavía no hay ninguna banda» y «no pude leer las bandas» son cosas
 * distintas, y la reacción de quien lo lee también: ante la primera se crea
 * una banda, y crear una segunda banda cuando ya existía es un daño que la
 * pantalla provocó.
 *
 * Guarda el último valor bueno mientras recarga, para que una recarga no
 * vacíe una lista que ya estaba en pantalla.
 */
export type EstadoDeCarga = 'cargando' | 'listo' | 'error';

export class Cargable<T> {
  private readonly _valor: ReturnType<typeof signal<T>>;
  private readonly _estado = signal<EstadoDeCarga>('cargando');
  private readonly _error = signal<string | null>(null);
  private readonly leer: () => Promise<T>;

  /** El último valor leído. Antes de la primera lectura, el inicial. */
  readonly valor: Signal<T>;
  readonly estado: Signal<EstadoDeCarga>;

  /**
   * El mensaje de error, o `null`. Se consulta antes que `cargando` porque un
   * fallo importa más que el hecho de estar reintentando.
   */
  readonly problema: Signal<string | null>;

  /** Está leyendo y todavía no hay nada que mostrar. */
  readonly cargando: Signal<boolean>;

  constructor(inicial: T, leer: () => Promise<T>) {
    this._valor = signal<T>(inicial);
    this.leer = leer;
    this.valor = this._valor.asReadonly();
    this.estado = this._estado.asReadonly();
    this.problema = computed(() => this._error());
    this.cargando = computed(() => this._estado() === 'cargando');
  }

  async recargar(): Promise<void> {
    this._estado.set('cargando');
    this._error.set(null);
    try {
      this._valor.set(await this.leer());
      this._estado.set('listo');
    } catch (e) {
      // El valor anterior se conserva a propósito: si la lista ya estaba en
      // pantalla, vaciarla al fallar una recarga pierde información que
      // todavía era buena.
      this._error.set(mensajeDe(e));
      this._estado.set('error');
    }
  }
}

/**
 * Un error legible.
 *
 * «[object Object]» no le sirve a nadie, y el texto crudo de una excepción del
 * almacén tampoco: se dice qué pasó y se deja el detalle para el registro.
 */
export function mensajeDe(e: unknown): string {
  if (e instanceof Error && e.message.trim() !== '') return e.message;
  return 'No se pudieron leer los datos guardados.';
}

/**
 * Lo mismo, para una pantalla que reparte lo leído en varias señales.
 *
 * Las pantallas de edición copian la entidad en un campo por control, porque
 * el formulario no guarda en cada tecla. Ahí no hay un único valor que
 * envolver, pero el problema es el mismo: mientras se lee no hay que decir que
 * no existe, y si falla la lectura no hay que mostrar un formulario vacío que
 * al guardar pisaría lo que sí estaba guardado.
 */
export class Lectura {
  private readonly _cargando = signal(true);
  private readonly _problema = signal<string | null>(null);

  readonly cargando: Signal<boolean> = this._cargando.asReadonly();
  readonly problema: Signal<string | null> = this._problema.asReadonly();

  async correr(leer: () => Promise<void>): Promise<void> {
    this._cargando.set(true);
    this._problema.set(null);
    try {
      await leer();
    } catch (e) {
      this._problema.set(mensajeDe(e));
    } finally {
      this._cargando.set(false);
    }
  }
}
