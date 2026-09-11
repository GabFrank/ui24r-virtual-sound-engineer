import { deepStrictEqual, strictEqual } from 'node:assert/strict';
import { test } from 'node:test';
import { clasificarRuta, esEnvioDeMonitor } from '../src/clasificar-ruta.ts';
import { OWNERSHIP, esEscribible, ownership } from '@vse/domain';

test('INV-010: un envio a auxiliar de monitor se clasifica como tal', () => {
  // Es el caso que motiva todo este modulo: antes esta ruta podia llegar al
  // motor etiquetada como fader de canal y pasaba.
  strictEqual(clasificarRuta('i.3.aux.1.value'), 'MONITOR_AUX_SEND');
  strictEqual(clasificarRuta('i.12.aux.6.value'), 'MONITOR_AUX_SEND');
  strictEqual(esEnvioDeMonitor('i.3.aux.1.value'), true);
});

test('el patron del auxiliar gana al del canal', () => {
  // Si el orden se invirtiera, i.3.aux.1.value caeria en un patron general de
  // entrada y volveria el agujero.
  strictEqual(clasificarRuta('i.3.mix'), 'CHANNEL_FADER');
  strictEqual(clasificarRuta('i.3.aux.1.value'), 'MONITOR_AUX_SEND');
});

test('el filtro pasa altos gana al ecualizador de canal', () => {
  strictEqual(clasificarRuta('i.1.eq.hpf.freq'), 'HPF');
  strictEqual(clasificarRuta('i.1.eq.b1.gain'), 'CHANNEL_EQ');
});

test('clasifica la cadena de canal', () => {
  strictEqual(clasificarRuta('hw.3.gain'), 'PREAMP_GAIN');
  strictEqual(clasificarRuta('i.1.dyn.threshold'), 'COMPRESSOR');
  strictEqual(clasificarRuta('i.1.gate.thresh'), 'GATE');
  strictEqual(clasificarRuta('i.1.pan'), 'CHANNEL_PAN');
  strictEqual(clasificarRuta('i.1.mute'), 'CHANNEL_MUTE');
  // **Las dos rutas de fantasma existen, y acá se afirmaba que una estaba
  // inventada.** La que manda es `hw.N.phantom` --con el condensador alimentado
  // vale 1 mientras `i.N.phantom` vale 0 en el mismo instante, medido el
  // 2026-09-10-- pero la del canal tambien existe y esta en la especificacion.
  // Clasificarla deja que un intento de escribirla se rechace por la invariante
  // verdadera, INV-007, y no por «ruta desconocida».
  strictEqual(clasificarRuta('hw.1.phantom'), 'PHANTOM');
  strictEqual(clasificarRuta('i.1.phantom'), 'PHANTOM');
});

test('clasifica el general y los buses de salida', () => {
  strictEqual(clasificarRuta('m.mix'), 'MASTER_FADER');
  strictEqual(clasificarRuta('m.mute'), 'MASTER_MUTE');
  strictEqual(clasificarRuta('m.eq.b1.gain'), 'OUTPUT_EQ');
  strictEqual(clasificarRuta('m.dyn.threshold'), 'OUTPUT_LIMITER');
  strictEqual(clasificarRuta('a.5.eq.b1.gain'), 'OUTPUT_EQ');
  strictEqual(clasificarRuta('a.5.mute'), 'PA_BUS_MUTE');
});

test('clasifica el reproductor', () => {
  strictEqual(clasificarRuta('p.0.mute'), 'PLAYER_MUTE');
  strictEqual(clasificarRuta('p.1.mix'), 'PLAYER_FADER');
  strictEqual(clasificarRuta('p.0.aux.2.value'), 'PLAYER_SEND');
});

test('una ruta desconocida devuelve null, no una suposicion', () => {
  // Escribir en una ruta que el dominio no sabe clasificar es escribir a
  // ciegas: el motor lo rechaza.
  strictEqual(clasificarRuta('i.1.inventado'), null);
  strictEqual(clasificarRuta(''), null);
  strictEqual(clasificarRuta('cualquier.cosa'), null);
  strictEqual(clasificarRuta('i.mix'), null);
});

test('no confunde rutas parecidas', () => {
  strictEqual(clasificarRuta('i.3.mixer'), null);
  strictEqual(clasificarRuta('m.mixdown'), null);
});

test('INV-010: ninguna ruta de auxiliar de monitor es escribible', () => {
  // El test estatico que la invariante promete desde el principio.
  const rutas = ['i.1.aux.1.value', 'i.24.aux.6.value', 'a.1.mix'];
  for (const r of rutas) {
    const kind = clasificarRuta(r);
    strictEqual(kind !== null, true, r);
    strictEqual(esEscribible(kind!), false, r);
    strictEqual(ownership(kind!).owner, 'USER_ONLY', r);
  }
});

test('toda clase que el clasificador produce existe en el registro de propiedad', () => {
  const conocidas = new Set(OWNERSHIP.map((e) => e.kind));
  const muestras = [
    'hw.1.gain', 'i.1.eq.hpf.freq', 'i.1.eq.b1.gain', 'i.1.dyn.ratio',
    'i.1.gate.thresh', 'i.1.deesser.amount', 'i.1.mix', 'i.1.pan', 'i.1.mute',
    'hw.1.phantom', 'i.1.aux.1.value', 'p.0.mute', 'p.0.mix', 'p.0.aux.1.value',
    // **Tres de estas rutas estaban inventadas y nadie lo noto**, porque el
    // clasificador las agarraba por prefijo. Los retardos son `m.delayL`,
    // `m.delayR` y `a.B.delay` --no `.delay.time`-- y el supresor es `m.afs.*`,
    // `a.B.afs.*` y `var.afsdata`, no `afs2.*`. Una lista de muestras con rutas
    // que el aparato no manda prueba el patron, no el protocolo.
    'm.eq.b1.gain', 'm.delayL', 'm.delayR', 'm.polarity', 'm.dyn.threshold',
    'm.mix', 'm.mute', 'a.1.eq.b1.gain', 'a.1.delay', 'a.1.polarity', 'a.1.mute',
    'a.1.mix', 'v.1.mix', 'f.1.type', 'var.currentSnapshot',
    'i.1.phantom', 'm.afs.enabled', 'a.1.afs.enabled', 'var.afsdata',
  ];
  const sinClasificar = muestras.filter((m) => clasificarRuta(m) === null);
  deepStrictEqual(sinClasificar, []);
  for (const m of muestras) {
    strictEqual(conocidas.has(clasificarRuta(m)!), true, m);
  }
});

test('INV-008: el envio al bus de analisis solo existe si se dice cual es el bus', () => {
  // Es el unico routing escribible que admite la invariante, y era
  // inexpresable: todo `i.N.aux.M.value` caia en MONITOR_AUX_SEND. Cual es el
  // bus lo tiene que decir SPK-P0.5, asi que sin ese dato el lado seguro es que
  // no haya ninguno escribible.
  strictEqual(clasificarRuta('i.3.aux.6.value'), 'MONITOR_AUX_SEND');
  strictEqual(clasificarRuta('i.3.aux.6.value', { busDeAnalisis: 6 }), 'ANALYSIS_BUS_SEND');
  strictEqual(clasificarRuta('i.3.aux.5.value', { busDeAnalisis: 6 }), 'MONITOR_AUX_SEND');
});

test('el espacio de soundcheck no es un envio de bus', () => {
  // `var.mtk.*` estaba clasificado como ANALYSIS_BUS_SEND, o sea como el unico
  // routing escribible. La matriz lo da como soundcheck y multipista. Sin
  // categoria propia, cae en desconocida y se rechaza, que es lo correcto
  // mientras SPK-P0.7a no lo verifique.
  strictEqual(clasificarRuta('var.mtk.soundcheck'), null);
  strictEqual(clasificarRuta('i.1.mtkrec'), null);
});
