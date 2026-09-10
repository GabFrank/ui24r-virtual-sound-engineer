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
 * **Se puede borrar, pero solo las propias y solo las fechables.** Al principio
 * este módulo no construía `DELETESNAPSHOT` en absoluto, porque la retención
 * parecía una decisión pendiente. No lo era: INV-003 ya la tenía decidida
 * —máximo 20 automáticas, solo nombres `VSE_`— y el dominio ya tenía
 * `snapshotsABorrar()` con sus tests. Lo que faltaba era conectarlo.
 *
 * El borrado va con tres guardas, y ninguna es un comentario pidiendo cuidado:
 *
 * 1. El **show no es un parámetro**, igual que al guardar.
 * 2. Solo se construye el comando para nombres que se puedan **fechar**, o sea
 *    los que la aplicación creó sola. Una instantánea guardada a mano en el
 *    show `VSE` no se toca: no es de nadie más que del usuario.
 * 3. Qué borrar lo decide el dominio, no este archivo.
 *
 * Sin esto, con una instantánea por aplicación de ganancia, una sesión de
 * veinte canales deja sesenta y la consola termina llena.
 *
 * Gramática, leída del `mixer.html` de la consola y confirmada contra el manual
 * del firmware 3.5:
 *
 *     CREATESHOW^<show>
 *     SAVESNAPSHOT^<show>^<instantánea>
 *     SNAPSHOTLIST^<show>          → la consola responde con la lista
 */

/**
 * El show y el nombrado **salen del dominio**, no se redefinen acá.
 *
 * Este archivo llegó a tener su propia copia de `VSE`, del prefijo y de la
 * lectura de la fecha, escrita sin buscar antes. Los valores coincidían de
 * casualidad, y dos copias de la misma regla es exactamente lo que hizo que la
 * ley del fader del simulador derivara ocho decibeles de la del adaptador.
 *
 * El dominio manda porque ahí vive la **política de retención** (INV-003), que
 * lee la fecha del nombre para decidir qué borrar: si el nombrado se separa, la
 * retención empieza a no reconocer lo que la aplicación crea.
 */
export {
  SHOW_RESERVADO as SHOW_DE_LA_APLICACION,
  nombreSnapshotAutomatica,
  fechaDeSnapshotAutomatica as fechaDeInstantanea,
} from '@vse/domain';

import {
  SHOW_RESERVADO, nombreSnapshotAutomatica, fechaDeSnapshotAutomatica,
} from '@vse/domain';

/**
 * El nombre de una instantánea automática, a partir de milisegundos.
 *
 * Envuelve al del dominio, que toma una fecha. La marca va en milisegundos y no
 * en algo legible a propósito: la retención lee la fecha de ahí, y un nombre que
 * no se puede fechar es uno que no se borra nunca.
 */
export function nombreDeInstantanea(ahoraMs: number): string {
  return nombreSnapshotAutomatica(new Date(Math.trunc(ahoraMs)));
}

/**
 * Si un nombre de la lista es una **automática** nuestra.
 *
 * Más estrecho que `esSnapshotDeLaApp` del dominio, que acepta cualquier `VSE_`.
 * Acá interesa distinguir las que la aplicación creó sola —fechables, y por lo
 * tanto sujetas a retención— de una que el usuario haya guardado a mano en el
 * mismo show.
 */
export function esDeLaAplicacion(nombre: string): boolean {
  return fechaDeSnapshotAutomatica(nombre) !== null;
}

/**
 * El comando para crear el show de la aplicación.
 *
 * Se manda siempre antes de guardar: la consola lo ignora si ya existe, y
 * preguntar primero costaría otra vuelta de red para el mismo resultado.
 */
export function comandoCrearShow(): string {
  return `CREATESHOW^${SHOW_RESERVADO}`;
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
  return `SAVESNAPSHOT^${SHOW_RESERVADO}^${nombre.replace(/\^/g, '_')}`;
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

/**
 * El comando para borrar una instantánea **propia y fechable**.
 *
 * Devuelve `null` para cualquier otra cosa, y ese `null` es la guarda: un
 * nombre que no se puede fechar no es una automática nuestra, y borrar lo que
 * el usuario guardó a mano sería el peor fallo posible de esta aplicación.
 *
 * Se comprueba acá y no solo en quien llama porque la lista viene de la
 * consola: si alguien guardó algo a mano en el show `VSE`, va a estar en esa
 * lista, y la única defensa que no depende de que el llamador se acuerde es
 * que el comando no se pueda construir.
 */
export function comandoBorrar(nombre: string): string | null {
  if (fechaDeSnapshotAutomatica(nombre) === null) return null;
  return `DELETESNAPSHOT^${SHOW_RESERVADO}^${nombre}`;
}

/** El comando para pedir la lista, que es con lo que se verifica. */
export function comandoListar(): string {
  return `SNAPSHOTLIST^${SHOW_RESERVADO}`;
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
