import { test } from 'node:test';
import { strictEqual, deepStrictEqual } from 'node:assert/strict';
import { fuentesDelGeneral, fuentesAbiertas, rutasSinNombre, loQueNoSeVe } from '../src/que-entra-al-general.ts';

/**
 * El caso que le da sentido a este modulo es real y costo dos dias: un receptor
 * Bluetooth enchufado a `l.0`/`l.1`, abiertas a 0 dB, metiendo un tono continuo
 * en el general mientras se media su espectro. El estado de abajo es el que la
 * consola tenia esa noche.
 */
function consolaDeEsaNoche() {
  const num = new Map<string, number>([
    // El condensador: abierto en el fader pero SILENCIADO.
    ['i.8.mix', 0.5021742138], ['i.8.mute', 1],
    // Un canal normal, sonando.
    ['i.0.mix', 0.5916673729], ['i.0.mute', 0],
    // **Las entradas de linea, abiertas a 0 dB.** La puerta que nadie miraba.
    ['l.0.mix', 0.7647058824], ['l.0.mute', 0],
    ['l.1.mix', 0.7647058824], ['l.1.mute', 0],
    // El reproductor, con el fader abajo del todo.
    ['p.0.mix', 0], ['p.0.mute', 0],
    // Un subgrupo silenciado.
    ['s.0.mix', 0.7647058824], ['s.0.mute', 1],
    // El general y un auxiliar: son SALIDAS, no fuentes.
    ['m.mix', 0.7643020595], ['a.3.mix', 0.5],
  ]);
  const txt = new Map<string, string>([
    ['i.0.name', 'PRUEBA'], ['i.8.name', 'VOZ JOSE'],
  ]);
  return {
    rutas: [...num.keys(), ...txt.keys()],
    leer: (r: string) => num.get(r) ?? null,
    leerTexto: (r: string) => txt.get(r) ?? null,
  };
}

test('enumera las fuentes del general, incluidas las entradas de linea', () => {
  const c = consolaDeEsaNoche();
  const f = fuentesDelGeneral(c.rutas, c.leer, c.leerTexto);
  deepStrictEqual(f.map((x) => x.ruta), ['i.0', 'i.8', 'l.0', 'l.1', 'p.0', 's.0']);
});

test('el general y los auxiliares NO son fuentes: son salidas', () => {
  // Los dos tienen `mix` y entrarian por el mismo camino. Se descartan a
  // proposito, no por omision.
  const c = consolaDeEsaNoche();
  const f = fuentesDelGeneral(c.rutas, c.leer, c.leerTexto);
  strictEqual(f.some((x) => x.ruta === 'm'), false);
  strictEqual(f.some((x) => x.ruta === 'a.3'), false);
});

test('las entradas de linea salen como lo que son, con su clase propia', () => {
  const c = consolaDeEsaNoche();
  const f = fuentesDelGeneral(c.rutas, c.leer, c.leerTexto);
  const l0 = f.find((x) => x.ruta === 'l.0')!;
  strictEqual(l0.clase, 'ENTRADA_DE_LINEA');
  strictEqual(l0.abierta, true, 'a 0 dB y sin silenciar');
});

test('el silencio y el fader en cero se informan por separado', () => {
  // Un fader en cero es silencio efectivo pero NO es un silencio: se sube sin
  // tocar un boton. Quien lea decide.
  const c = consolaDeEsaNoche();
  const f = fuentesDelGeneral(c.rutas, c.leer, c.leerTexto);
  const condensador = f.find((x) => x.ruta === 'i.8')!;
  strictEqual(condensador.silenciada, true);
  strictEqual(condensador.fader > 0, true, 'su fader NO esta abajo');
  strictEqual(condensador.abierta, false);

  const reproductor = f.find((x) => x.ruta === 'p.0')!;
  strictEqual(reproductor.silenciada, false, 'no esta silenciado');
  strictEqual(reproductor.fader, 0);
  strictEqual(reproductor.faderDb, -Infinity, 'el fondo absoluto');
  strictEqual(reproductor.abierta, false);
});

test('lo que puede estar sonando esa noche: el canal 1 y las DOS entradas de linea', () => {
  // **La respuesta que habria ahorrado dos dias.**
  const c = consolaDeEsaNoche();
  const abiertas = fuentesAbiertas(fuentesDelGeneral(c.rutas, c.leer, c.leerTexto));
  deepStrictEqual(abiertas.map((x) => x.ruta), ['i.0', 'l.0', 'l.1']);
});

test('el nombre sale de la consola cuando lo hay, y null cuando no', () => {
  const c = consolaDeEsaNoche();
  const f = fuentesDelGeneral(c.rutas, c.leer, c.leerTexto);
  strictEqual(f.find((x) => x.ruta === 'i.0')!.nombre, 'PRUEBA');
  strictEqual(f.find((x) => x.ruta === 'l.0')!.nombre, null, 'las RCA no tienen nombre puesto');
});

test('dice que rutas no sabe nombrar, en vez de dar a entender que las entiende todas', () => {
  const sin = rutasSinNombre(['i.0.mix', 'l.0.mix', 'hwoutaux.6.src', 'inventada.0.cosa']);
  deepStrictEqual(sin, ['hwoutaux.6.src', 'inventada.0.cosa']);
});


test('el fader se informa en decibeles, sin umbral inventado', () => {
  // **Aca habia un `FADER_CERRADO = 0.001` sin cita ni medicion**, y una
  // auditoria mostro que a los dos lados de ese numero hay -90 dB: 0,0009 daba
  // «cerrada» y 0,002 «abierta», aportando lo mismo. Ademas 0,001 es el corte de
  // PANTALLA de la consola, contra el que `conversiones.ts` ya advertia.
  const num = new Map([['i.0.mix', 0.002], ['i.0.mute', 0], ['i.1.mix', 0], ['i.1.mute', 0]]);
  const f = fuentesDelGeneral([...num.keys()], (r) => num.get(r) ?? null, () => null);
  const casi = f.find((x) => x.ruta === 'i.0')!;
  const cero = f.find((x) => x.ruta === 'i.1')!;
  strictEqual(Math.round(casi.faderDb), -90, 'un fader de 0,002 esta en -90 dB');
  strictEqual(cero.faderDb, -Infinity, 'el cero exacto es el fondo');
  strictEqual(casi.abierta, true, 'puede entrar algo, aunque sea a -90');
  strictEqual(cero.abierta, false);
});

test('declara lo que NO puede ver, en la salida y no en un comentario', () => {
  // Una lista que no declara sus huecos invita a creer que no los tiene, que es
  // el error que este modulo vino a corregir.
  const h = loQueNoSeVe();
  strictEqual(h.sinMirar.includes('v.N.mix'), true, 'los VCA');
  strictEqual(h.sinMirar.includes('i.N.subgroup'), true, 'el enrutamiento');
  strictEqual(h.sinMirar.includes('i.N.mgmask'), true, 'los grupos de silencio');
  strictEqual(h.porQue.length >= 4, true, 'cada hueco con su consecuencia');
});
