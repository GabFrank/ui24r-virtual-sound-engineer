/**
 * Los puntos de retorno que la aplicación crea antes de escribir.
 *
 * INV-001 no deja que ninguna transacción pase a APPLYING sin una instantánea
 * verificada en la lista releída de la consola. Es la red: si algo sale mal,
 * hay dónde volver.
 *
 * **La aplicación guarda en su propio show y nunca en los del usuario.** Es la
 * decisión más importante de este archivo y está sostenida por el tipo: no hay
 * forma de pedir que se guarde en otro show, porque el show no es un parámetro.
 * Los shows del usuario —con sus instantáneas, sus nombres y su trabajo— no se
 * tocan ni por error ni a propósito.
 *
 * **Y no hay forma de borrar.** El protocolo tiene `DELETESNAPSHOT` y este
 * módulo no lo construye: la retención de INV-003 es una decisión que todavía
 * no se tomó, y hasta que se tome, acumular instantáneas es preferible a
 * borrar la equivocada. Un test lo fija.
 *
 * Gramática, leída del `mixer.html` de la consola y confirmada contra el manual
 * del firmware 3.5:
 *
 *     CREATESHOW^<show>
 *     SAVESNAPSHOT^<show>^<instantánea>
 *     SNAPSHOTLIST^<show>          → la consola responde con la lista
 */

/**
 * El show donde la aplicación guarda lo suyo.
 *
 * Separado de los del usuario a propósito. Si algún día alguien mira la consola
 * y ve un show llamado `VSE` lleno de instantáneas con fecha, va a saber
 * exactamente qué son y de dónde salieron.
 */
export const SHOW_DE_LA_APLICACION = 'VSE';

const PREFIJO = 'VSE_AUTO_';

/**
 * El nombre de una instantánea automática.
 *
 * **La marca va en milisegundos y no en una fecha legible**, y eso es
 * deliberado: la retención de INV-003 lee la fecha de acá para decidir qué
 * borrar, y un nombre que no se puede fechar es uno que no se borra nunca.
 */
export function nombreDeInstantanea(ahoraMs: number): string {
  return `${PREFIJO}${Math.trunc(ahoraMs)}`;
}

/** Si un nombre de la lista es una instantánea nuestra. */
export function esDeLaAplicacion(nombre: string): boolean {
  return /^VSE_AUTO_\d+$/.test(nombre);
}

/** Cuándo se creó, leído del nombre. `null` si el nombre no es de los nuestros. */
export function fechaDeInstantanea(nombre: string): Date | null {
  if (!esDeLaAplicacion(nombre)) return null;
  return new Date(Number(nombre.slice(PREFIJO.length)));
}

/**
 * El comando para crear el show de la aplicación.
 *
 * Se manda siempre antes de guardar: la consola lo ignora si ya existe, y
 * preguntar primero costaría otra vuelta de red para el mismo resultado.
 */
export function comandoCrearShow(): string {
  return `CREATESHOW^${SHOW_DE_LA_APLICACION}`;
}

/**
 * El comando para guardar una instantánea nuestra.
 *
 * **No recibe el show**, y ese es el punto: no hay manera de que un llamador
 * distraído —o un llamador nuevo dentro de un año— guarde encima del trabajo
 * del usuario.
 *
 * El nombre se sanea igual que lo hace el cliente de la consola, que reemplaza
 * `^` por `_`: es el separador del protocolo y dejarlo pasar partiría el
 * mensaje en dos.
 */
export function comandoGuardar(nombre: string): string {
  return `SAVESNAPSHOT^${SHOW_DE_LA_APLICACION}^${nombre.replace(/\^/g, '_')}`;
}

/**
 * Devuelve la etiqueta de «instantánea actual» a lo que era.
 *
 * **Guardar una instantánea cambia cuál es la actual**, y eso no estaba
 * previsto: se descubrió midiendo el 2026-09-09, cuando `var.currentSnapshot`
 * pasó de «Prueba asistente» a la automática que la aplicación acababa de
 * crear.
 *
 * Importa de verdad. Si el operador toca «actualizar instantánea actual» en su
 * consola después de que la aplicación guardó una, estaría escribiendo sobre la
 * automática en vez de sobre la suya, y perdería su trabajo sin enterarse.
 *
 * **Se escribe solo la etiqueta, nunca se carga la instantánea.** Cargarla
 * aplicaría todo su contenido y cambiaría el estado entero de la consola, que
 * es lo contrario de restaurar. Comprobado: después de devolver la etiqueta el
 * volcado queda idéntico al inicial, clave por clave.
 */
export function comandoDevolverEtiqueta(nombre: string): string {
  return `SETS^var.currentSnapshot^${nombre}`;
}

/** El comando para pedir la lista, que es con lo que se verifica. */
export function comandoListar(): string {
  return `SNAPSHOTLIST^${SHOW_DE_LA_APLICACION}`;
}

/**
 * Las instantáneas nuestras que trae una respuesta `SNAPSHOTLIST`.
 *
 * La consola responde `SNAPSHOTLIST^<show>^<nombre>^<nombre>…`. Se filtran las
 * que no son nuestras: si el usuario guardó algo a mano en este show, no es un
 * punto de retorno que la aplicación pueda usar ni borrar.
 */
export function instantaneasDeLaLista(linea: string): readonly string[] {
  if (!linea.startsWith('SNAPSHOTLIST^')) return [];
  const partes = linea.split('^');
  // [0] es el verbo y [1] el show; de [2] en adelante van los nombres.
  return partes.slice(2).filter((n) => n !== '' && esDeLaAplicacion(n));
}
