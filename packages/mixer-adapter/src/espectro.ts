/**
 * El espectro que la consola manda en `RTA`, decodificado.
 *
 * Durante meses este flujo se usó como latido y la carga se tiraba a la basura.
 * Medido el 2026-09-09: es el **analizador de espectro de la consola**, y es la
 * única información de frecuencia que el proyecto tiene sin motor de audio ni
 * micrófono de medición.
 *
 * **Lo que mide y lo que no.** Mide la señal de un canal —el que `var.rta`
 * esté apuntando—, no la sala. La respuesta del recinto sigue necesitando un
 * micrófono: ningún canal de la consola escucha lo que pasa en el aire.
 */
import { base64ABytes } from './protocol.ts';

/** Bandas por trama. Medido: 122, y cubren toda la banda audible. */
export const RTA_BANDAS = 122;

/**
 * Decibeles por byte del analizador.
 *
 * Medido con un tono de 1 kHz a niveles conocidos, leyendo la banda 67: los
 * pasos de 6 dB dieron **16,0 bytes exactos** cuatro veces seguidas. El único
 * que se desvió —15,4— es el más bajo, pegado al piso de ruido.
 *
 * **No es la escala del medidor de nivel**, que son 0,333 dB por byte. Son dos
 * escalas distintas y mezclarlas da errores de un 12 %.
 */
export const RTA_DB_POR_BYTE = 0.375;

/** La banda del tono de 1 kHz, que es el ancla de la ley. */
const RTA_BANDA_1K = 67;

/** Bandas por octava. Medido: cada octava son exactamente 12. */
const RTA_BANDAS_POR_OCTAVA = 12;

/**
 * La frecuencia central de una banda.
 *
 * Ley medida con tonos de 63 Hz a 16 kHz: `banda = 67 + 12·log2(f/1000)`, o
 * sea un doceavo de octava por banda —un semitono—. Banda 0 son ~20,9 Hz y la
 * 121, ~22,6 kHz.
 */
export function frecuenciaDeBanda(banda: number): number {
  return 1000 * Math.pow(2, (banda - RTA_BANDA_1K) / RTA_BANDAS_POR_OCTAVA);
}

/** La banda donde cae una frecuencia. Es la inversa de `frecuenciaDeBanda`. */
export function bandaDeFrecuencia(hz: number): number {
  return RTA_BANDA_1K + RTA_BANDAS_POR_OCTAVA * Math.log2(hz / 1000);
}

/**
 * Las bandas de una trama `RTA`, en decibeles relativos.
 *
 * **Relativos a qué no está medido.** El byte es lineal en decibeles y el paso
 * está calibrado, pero a qué nivel absoluto corresponde el byte 0 no se
 * comprobó. Sirve para comparar bandas entre sí y una banda consigo misma en
 * el tiempo, que es lo que necesita la detección de realimentación. No sirve
 * para decir «esta banda está a −20 dBFS».
 *
 * Un arreglo vacío significa trama sin fuente elegida: `var.rta` vacía deja el
 * analizador apagado y la consola manda ceros.
 */
export function decodificarEspectro(base64: string): number[] {
  // `base64ABytes` y no `Buffer`: esto corre también dentro de la aplicación,
  // que se compila para el navegador y no tiene `Buffer`. La primera versión
  // lo usaba y rompió la compilación de Angular, no los tests —que sí corren
  // en Node y no lo habrían notado nunca.
  return base64ABytes(base64).map((b) => b * RTA_DB_POR_BYTE);
}

/** Si la trama trae algo: con el analizador apagado llegan todos ceros. */
export function hayEspectro(bandas: readonly number[]): boolean {
  return bandas.some((db) => db > 0);
}

/**
 * Si la trama tiene el largo que la ley de bandas supone.
 *
 * **La primera trama de cada sesión mide 128 bandas y no 122.** Aparece en las
 * tres capturas archivadas de SPK-P0.1: `{128: 1, 122: 147/904/144}`. Llega en
 * ceros, así que hasta ahora no hizo daño, pero `frecuenciaDeBanda` ancla en
 * «banda 67 = 1 kHz» y con otro largo el índice deja de significar lo mismo.
 *
 * No se sabe por qué la primera es distinta. Mientras no se sepa, lo honesto es
 * poder preguntarlo antes de interpretar, en vez de asumir que siempre son 122.
 */
export function largoEsperado(bandas: readonly number[]): boolean {
  return bandas.length === RTA_BANDAS;
}
