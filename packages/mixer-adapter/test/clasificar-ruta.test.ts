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
    'i.1.phantom', 'i.1.aux.1.value', 'p.0.mute', 'p.0.mix', 'p.0.aux.1.value',
    'm.eq.b1.gain', 'm.delay.time', 'm.polarity', 'm.dyn.threshold', 'm.mix',
    'm.mute', 'a.1.eq.b1.gain', 'a.1.delay.time', 'a.1.polarity', 'a.1.mute',
    'a.1.mix', 'v.1.mix', 'f.1.type', 'var.mtk.soundcheck',
    'var.currentSnapshot', 'afs2.enable',
  ];
  const sinClasificar = muestras.filter((m) => clasificarRuta(m) === null);
  deepStrictEqual(sinClasificar, []);
  for (const m of muestras) {
    strictEqual(conocidas.has(clasificarRuta(m)!), true, m);
  }
});
