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
  /** Si alguna lectura llegó a buen puerto. Decide qué se puede seguir viendo. */
  private readonly _hayValor = signal(false);
  private readonly leer: () => Promise<T>;
  /** Número de la última lectura pedida, para descartar respuestas viejas. */
  private peticion = 0;

  /** El último valor leído. Antes de la primera lectura, el inicial. */
  readonly valor: Signal<T>;
  readonly estado: Signal<EstadoDeCarga>;

  /**
   * Un fallo que impide mostrar algo: falló y no hay valor previo.
   *
   * Si ya había uno, el fallo **no** es bloqueante: se sigue mostrando lo que
   * había y el aviso va aparte. Vaciar una lista que estaba en pantalla porque
   * una recarga falló pierde información que todavía servía.
   */
  readonly problema: Signal<string | null>;

  /** Un fallo al recargar, con algo ya en pantalla. Va como aviso discreto. */
  readonly avisoDeRecarga: Signal<string | null>;

  /** Está leyendo y todavía no hay nada que mostrar. */
  readonly cargando: Signal<boolean>;

  /** Está releyendo con algo ya en pantalla: no se tapa lo que hay. */
  readonly recargando: Signal<boolean>;

  constructor(inicial: T, leer: () => Promise<T>) {
    this._valor = signal<T>(inicial);
    this.leer = leer;
    this.valor = this._valor.asReadonly();
    this.estado = this._estado.asReadonly();
    this.problema = computed(() => (this._hayValor() ? null : this._error()));
    this.avisoDeRecarga = computed(() => (this._hayValor() ? this._error() : null));
    this.cargando = computed(() => this._estado() === 'cargando' && !this._hayValor());
    this.recargando = computed(() => this._estado() === 'cargando' && this._hayValor());
  }

  async recargar(): Promise<void> {
    // Cada lectura lleva número: si se piden dos y la vieja contesta última,
    // su respuesta pisaría a la nueva. Pasa al navegar de una banda a otra, y
    // el resultado sería la banda equivocada con estado «listo».
    const mia = ++this.peticion;
    this._estado.set('cargando');
    this._error.set(null);
    try {
      const v = await this.leer();
      if (mia !== this.peticion) return;
      this._valor.set(v);
      this._hayValor.set(true);
      this._estado.set('listo');
    } catch (e) {
      if (mia !== this.peticion) return;
      // El valor anterior se conserva a propósito, y `_hayValor` sigue en
      // `true`: el fallo se muestra como aviso al lado de lo que ya había.
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
  private readonly _leidoAlgunaVez = signal(false);
  private peticion = 0;

  /** Está leyendo y el formulario todavía no tiene nada. */
  readonly cargando: Signal<boolean> = computed(
    () => this._cargando() && !this._leidoAlgunaVez());
  readonly problema: Signal<string | null> = this._problema.asReadonly();

  /**
   * Lee y, si la lectura sigue siendo la vigente, la aplica.
   *
   * Son dos funciones y no una a propósito. Con una sola —el closure que leía
   * y escribía el formulario— el número de orden se comprobaba **después** de
   * que las escrituras ya habían ocurrido: ordenaba las banderas de carga y no
   * los datos. El caso concreto: ir de `/perfiles/bandas/A` a
   * `/perfiles/bandas/B` con un almacén lento; si la lectura de A resolvía
   * última, el formulario quedaba con los datos de A bajo la ruta de B, sin
   * aviso de cambios sin guardar —porque la entidad de referencia también era
   * A— y al guardar se escribía sobre A.
   *
   * Separadas, quien llama no puede equivocarse: las escrituras están dentro
   * del guardia por construcción.
   */
  async correr<T>(leer: () => Promise<T>, aplicar: (valor: T) => void): Promise<void> {
    const mia = ++this.peticion;
    this._cargando.set(true);
    this._problema.set(null);
    try {
      const valor = await leer();
      if (mia !== this.peticion) return;
      aplicar(valor);
      this._leidoAlgunaVez.set(true);
    } catch (e) {
      if (mia !== this.peticion) return;
      this._problema.set(mensajeDe(e));
    } finally {
      if (mia === this.peticion) this._cargando.set(false);
    }
  }
}

/**
 * Una escritura que puede fallar.
 *
 * Las pantallas de edición hacían `await repos.guardarX(...)` sin captura. Si
 * el almacén fallaba, la promesa quedaba rechazada sin manejar: no aparecía el
 * aviso de éxito, no aparecía ningún error, no se navegaba, y al usuario le
 * parecía que el botón no había hecho nada — **con lo que acababa de escribir
 * todavía sin guardar**. Es el caso caro: leer y fallar se reintenta, escribir
 * y fallar pierde trabajo.
 *
 * Devuelve si salió bien, para que quien llama decida si navegar o quedarse.
 */
export async function intentarGuardar(
  accion: () => Promise<void>,
  avisar: (mensaje: string) => void,
  queSeEstabaHaciendo: string,
): Promise<boolean> {
  try {
    await accion();
    return true;
  } catch (e) {
    // Sin la coletilla de «lo que escribiste sigue acá»: esto también se usa
    // para borrar y para cerrar una sesión, donde no dice nada cierto.
    avisar(`No se pudo ${queSeEstabaHaciendo}. ${mensajeDe(e)}`);
    return false;
  }
}
