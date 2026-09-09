// Estado de la consola simulada. Los nombres y niveles son los de una banda
// real, para que las pantallas se vean como se van a ver de verdad.
//
// `idx` es el indice de la RUTA del protocolo, que es de base cero: el canal 1
// de la consola es `i.0.mix`. Estuvo de base uno hasta el 2026-09-08, y como el
// adaptador cargaba el mismo error los dos se cancelaban: contra el simulador
// la aplicacion se veia bien, y contra la consola real mostraba el medidor de
// un canal junto al nombre y la ganancia del siguiente.

export const CANALES = [
  { idx: 0,  nombre: 'VOZ PRINCIPAL', gainDb: 34, faderDb: -2.5,  nivelBase: -18, dinamica: 9 },
  { idx: 1,  nombre: 'CORO 1',        gainDb: 32, faderDb: -6.0,  nivelBase: -24, dinamica: 7 },
  { idx: 2,  nombre: 'CORO 2',        gainDb: 32, faderDb: -6.5,  nivelBase: -25, dinamica: 7 },
  { idx: 3,  nombre: 'GUITARRA AC',   gainDb: 26, faderDb: -4.0,  nivelBase: -20, dinamica: 6 },
  { idx: 4,  nombre: 'GUITARRA EL',   gainDb: 22, faderDb: -5.5,  nivelBase: -21, dinamica: 5 },
  { idx: 5,  nombre: 'BAJO',          gainDb: 18, faderDb: -3.0,  nivelBase: -16, dinamica: 4 },
  { idx: 6,  nombre: 'CAJON',         gainDb: 28, faderDb: -4.5,  nivelBase: -19, dinamica: 12 },
  { idx: 7,  nombre: 'CONGA',         gainDb: 30, faderDb: -7.0,  nivelBase: -23, dinamica: 11 },
  { idx: 8,  nombre: 'SHAKER',        gainDb: 38, faderDb: -9.0,  nivelBase: -28, dinamica: 8 },
  { idx: 9,  nombre: 'FLAUTA',        gainDb: 33, faderDb: -5.0,  nivelBase: -22, dinamica: 8 },
  { idx: 10, nombre: 'TECLADO L',     gainDb: 12, faderDb: -6.0,  nivelBase: -22, dinamica: 5 },
  { idx: 11, nombre: 'TECLADO R',     gainDb: 12, faderDb: -6.0,  nivelBase: -22, dinamica: 5 },
  // Una Ui24R tiene veinticuatro entradas, no doce. Estuvo en doce hasta el
  // 2026-09-08, y como el adaptador tambien leia doce fijos los dos errores se
  // cancelaban: el camino que descubre cuantas entradas hay no se ejercitaba
  // nunca contra el simulador, y los canales 21 y 22 --las RCA, la fuente con
  // la que se prueba con musica-- no existian aca.
  //
  // Las que siguen van sin nombre a proposito: en una consola real las
  // entradas sin usar llegan con el nombre vacio, y la aplicacion tiene que
  // saber mostrarlas como "CANAL N".
  { idx: 12, nombre: '',             gainDb: -6, faderDb: -Infinity, nivelBase: -100, dinamica: 0 },
  { idx: 13, nombre: '',             gainDb: -6, faderDb: -Infinity, nivelBase: -100, dinamica: 0 },
  { idx: 14, nombre: 'MARACA',       gainDb: 36, faderDb: -8.0,  nivelBase: -27, dinamica: 9 },
  { idx: 15, nombre: '',             gainDb: -6, faderDb: -Infinity, nivelBase: -100, dinamica: 0 },
  { idx: 16, nombre: '',             gainDb: -6, faderDb: -Infinity, nivelBase: -100, dinamica: 0 },
  { idx: 17, nombre: 'DJEMBE',       gainDb: 30, faderDb: -6.0,  nivelBase: -21, dinamica: 10 },
  { idx: 18, nombre: '',             gainDb: -6, faderDb: -Infinity, nivelBase: -100, dinamica: 0 },
  { idx: 19, nombre: '',             gainDb: -6, faderDb: -Infinity, nivelBase: -100, dinamica: 0 },
  // Las dos ultimas parejas son las entradas de linea. En la consola real la
  // musica de fondo entra por aca, y no tienen ganancia de previo.
  { idx: 20, nombre: 'RCA L',        gainDb: -6, faderDb: -11.6, nivelBase: -26, dinamica: 6 },
  { idx: 21, nombre: 'RCA R',        gainDb: -6, faderDb: -11.5, nivelBase: -26, dinamica: 6 },
  { idx: 22, nombre: '',             gainDb: -6, faderDb: -Infinity, nivelBase: -100, dinamica: 0 },
  { idx: 23, nombre: '',             gainDb: -6, faderDb: -Infinity, nivelBase: -100, dinamica: 0 },
];

/**
 * Las leyes salen del adaptador, no de aca.
 *
 * Antes este archivo tenia las suyas: una curva de fader con una pendiente
 * inventada de 2,2 y una ganancia lineal de -6 a 57. Las dos estan falsadas
 * --ver la cabecera de `conversiones.ts`-- y el efecto era que el simulador
 * declaraba un fader en -2,5 dB y la aplicacion mostraba -10,5. Ocho a once
 * decibeles de error en todo lo que se mirara contra el simulador, que es
 * justo lo que un simulador existe para no hacer.
 *
 * Mantener una segunda copia de una ley medida es lo que permite que derive.
 * Por eso ahora se importan, aunque obligue a arrancar el simulador con
 * `--experimental-strip-types`: el costo de arranque es preferible a dos
 * verdades distintas sobre el mismo aparato.
 */
import { dbAFader, dbAGanancia } from '../../../packages/mixer-adapter/src/conversiones.ts';

export { dbAFader };
export const gainANormalizado = dbAGanancia;

/**
 * Canales con proceso dinamico puesto, como en una consola de show de verdad.
 *
 * `comprimeDb` es cuanta reduccion emite el simulador para ese canal. La voz
 * principal aprieta de verdad; la guitarra tiene compresor puesto que no llega
 * a actuar, que es el caso que distingue "hay compresor" de "hay compresor
 * actuando" y el que hace que el asistente NO se calle.
 *
 * Esto reproduce nuestra hipotesis, no la consola: un test que pase contra el
 * simulador no cierra ninguna invariante.
 */
export const PROCESO = new Map([
  [0,  { compresor: true,  comprimeDb: 6,   puerta: false, deesser: true  }], // VOZ PRINCIPAL
  [1,  { compresor: true,  comprimeDb: 2.5, puerta: false, deesser: false }], // CORO 1
  [3,  { compresor: true,  comprimeDb: 0,   puerta: false, deesser: false }], // GUITARRA AC
  [5,  { compresor: true,  comprimeDb: 4,   puerta: false, deesser: false }], // BAJO
  [6,  { compresor: false, comprimeDb: 0,   puerta: true,  deesser: false }], // CAJON
  [7,  { compresor: false, comprimeDb: 0,   puerta: true,  deesser: false }], // CONGA
]);

export function estadoInicial() {
  const estado = new Map();
  for (const c of CANALES) {
    estado.set(`i.${c.idx}.mix`, dbAFader(c.faderDb));
    estado.set(`i.${c.idx}.mute`, 0);
    estado.set(`i.${c.idx}.pan`, 0.5);
    estado.set(`hw.${c.idx}.gain`, gainANormalizado(c.gainDb));
    estado.set(`hw.${c.idx}.phantom`, c.idx <= 3 ? 1 : 0);  // los cuatro primeros

    // Ojo con la polaridad, que no es la misma en las tres: `bypass = 1` es
    // PUENTEADO --o sea inactivo-- y `enabled = 1` es ACTIVO.
    const p = PROCESO.get(c.idx);
    estado.set(`i.${c.idx}.dyn.bypass`, p?.compresor ? 0 : 1);
    estado.set(`i.${c.idx}.gate.enabled`, p?.puerta ? 1 : 0);
    estado.set(`i.${c.idx}.gate.bypass`, 0);
    estado.set(`i.${c.idx}.deesser.enabled`, p?.deesser ? 1 : 0);
  }
  estado.set('m.mix', dbAFader(0));
  estado.set('m.mute', 0);
  estado.set('var.mtk.soundcheck', 0);
  estado.set('p.0.mute', 1);
  estado.set('p.1.mute', 1);
  return estado;
}

export function nombres() {
  return CANALES.map((c) => [`i.${c.idx}.name`, c.nombre]);
}

/**
 * De que previo viene cada canal, que la consola manda como texto.
 *
 * Medido el 2026-09-09: `hw.0` a `hw.19` en los canales 1 a 20 y **`none`** en
 * los cuatro ultimos, que son las entradas de linea y de medios y no tienen
 * previo detras.
 *
 * El simulador no lo mandaba, y eso importa mas ahora que el adaptador dejo de
 * suponer enrutamiento identidad: sin `src`, la aplicacion contra el simulador
 * no sabria de donde leer ninguna ganancia. Va con el reparto de fabrica --que
 * es la identidad-- porque es el estado en el que esta la consola de prueba;
 * para ejercitar un repatcheo se cambia esta linea y nada mas.
 */
export function fuentes() {
  return CANALES.map((c) => [
    `i.${c.idx}.src`,
    c.idx <= 19 ? `hw.${c.idx}` : 'none',
  ]);
}
