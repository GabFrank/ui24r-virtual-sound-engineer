/**
 * Validación de lo que escribe el usuario.
 *
 * Vive en el dominio y no en los formularios por dos motivos. Uno: la misma
 * regla se aplica al crear y al importar, y una regla escrita dos veces se
 * convierte en dos reglas distintas. Dos: acá se puede probar sin montar una
 * pantalla.
 *
 * Cada validador devuelve `null` cuando está bien, o el mensaje que se le
 * muestra al usuario. El mensaje forma parte de la regla: decir «valor
 * inválido» obliga a adivinar qué se esperaba.
 */

export type ResultadoValidacion = string | null;

export const LARGO_NOMBRE_MIN = 2;
export const LARGO_NOMBRE_MAX = 60;

export function validarNombre(valor: string, que = 'El nombre'): ResultadoValidacion {
  const v = valor.trim();
  if (v.length === 0) return `${que} no puede quedar vacío.`;
  if (v.length < LARGO_NOMBRE_MIN) return `${que} necesita al menos ${LARGO_NOMBRE_MIN} caracteres.`;
  if (v.length > LARGO_NOMBRE_MAX) return `${que} no puede superar los ${LARGO_NOMBRE_MAX} caracteres.`;
  return null;
}

export function validarUnico(
  valor: string,
  existentes: readonly string[],
  que = 'Ese nombre',
): ResultadoValidacion {
  // Se compara sin distinguir mayúsculas ni acentos: dos locales llamados
  // «Bar Central» y «bar central» son el mismo lugar, y tenerlos separados
  // parte el historial en dos por un descuido de tipeo.
  const norm = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  return existentes.some((e) => norm(e) === norm(valor))
    ? `${que} ya está en uso.`
    : null;
}

export interface RangoNumerico {
  readonly min: number;
  readonly max: number;
  readonly unidad: string;
}

export function validarNumero(
  valor: string | number,
  rango: RangoNumerico,
  que = 'El valor',
): ResultadoValidacion {
  const n = typeof valor === 'number' ? valor : Number(String(valor).replace(',', '.'));
  if (!Number.isFinite(n)) return `${que} tiene que ser un número.`;
  if (n < rango.min || n > rango.max) {
    return `${que} tiene que estar entre ${rango.min} y ${rango.max} ${rango.unidad}.`;
  }
  return null;
}

/** Dimensiones de una sala. Los topes descartan errores de unidad. */
export const RANGO_DIMENSION: RangoNumerico = { min: 1, max: 200, unidad: 'metros' };

/**
 * Rango útil de un sistema de amplificación.
 *
 * El mínimo en 20 Hz y el máximo en 22 kHz son los límites de la audición.
 * Un sistema declarado desde 5 Hz no existe, y aceptarlo haría que el
 * asistente propusiera correcciones en una banda donde el equipo no entrega
 * nada.
 */
export const RANGO_FRECUENCIA: RangoNumerico = { min: 20, max: 22_000, unidad: 'hercios' };

export function validarRangoUtil(desde: number, hasta: number): ResultadoValidacion {
  const a = validarNumero(desde, RANGO_FRECUENCIA, 'La frecuencia inferior');
  if (a !== null) return a;
  const b = validarNumero(hasta, RANGO_FRECUENCIA, 'La frecuencia superior');
  if (b !== null) return b;
  if (desde >= hasta) return 'La frecuencia inferior tiene que ser menor que la superior.';
  // Menos de una octava de rango útil no describe un sistema de refuerzo: es
  // casi seguro un error de tipeo, y con ese dato el asistente de sala
  // trabajaría sobre una banda irreal.
  if (hasta / desde < 2) return 'El rango útil declarado es menor que una octava. Revisá los valores.';
  return null;
}

/**
 * Dirección de la consola.
 *
 * Se guarda la dirección completa del WebSocket y no solo la máquina, porque
 * la ruta exacta del protocolo todavía no está confirmada —depende del spike
 * SPK-P0.1— y porque así el mismo campo sirve para apuntar al simulador
 * durante el desarrollo. Cuando el spike cierre, se podrá derivar la ruta y
 * este campo pasará a pedir solo la máquina.
 */
export function validarUrlDeConsola(valor: string): ResultadoValidacion {
  const v = valor.trim();
  if (v.length === 0) return 'Falta la dirección de la consola.';
  if (!/^wss?:\/\//.test(v)) {
    return 'Tiene que empezar por ws:// o wss://. Por ejemplo, ws://10.10.1.1.';
  }
  try {
    // eslint-disable-next-line no-new
    new URL(v);
  } catch {
    return 'Esa dirección no se entiende.';
  }
  return null;
}

/** Reúne los errores de un formulario. Vacío significa que se puede guardar. */
export function reunirErrores(
  campos: Readonly<Record<string, ResultadoValidacion>>,
): Readonly<Record<string, string>> {
  const errores: Record<string, string> = {};
  for (const [campo, error] of Object.entries(campos)) {
    if (error !== null) errores[campo] = error;
  }
  return errores;
}
