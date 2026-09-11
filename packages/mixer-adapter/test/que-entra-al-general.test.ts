import { test } from 'node:test';
import { strictEqual, deepStrictEqual } from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  fuentesDelGeneral, fuentesAbiertas, rutasSinNombre, loQueNoSeVe,
  SUFIJOS_LEIDOS, SUFIJOS_QUE_NO_AFECTAN_EL_CAMINO,
} from '../src/que-entra-al-general.ts';

const INVENTARIO = join(
  import.meta.dirname, '..', '..', '..',
  'docs', 'inventario', '3.4.8318-ui24-2026-09-11', 'keys-observed.txt',
);
/** Las 6732 claves que la consola manda de verdad. */
function claves(): readonly string[] {
  const c = readFileSync(INVENTARIO, 'utf8').trim().split('\n');
  // **Centinela.** Dos tests hermanos pasaban con el inventario vacio: el
  // conjunto vacio cumple cualquier cuantificador universal.
  strictEqual(c.length, 6732, 'el inventario tiene que estar y estar completo');
  return c;
}
/** Las familias de fuente: las cinco que enumera el modulo, mas los VCA. */
const FUENTE = ['i', 'l', 'p', 's', 'f', 'a', 'v'];

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
  strictEqual(h.huecos.length, h.sinMirar.length, 'la lista plana es la misma lista');
});

/**
 * **El caso testigo, que la primera declaracion de huecos no tenia.**
 *
 * El modulo entero existe porque entro sonido por `l.0`/`l.1`. La lista decia
 * `i.N.mgmask` y no `l.N.mgmask`: declaraba el punto ciego de los canales y no
 * el de la puerta por la que habia entrado el problema.
 */
test('los huecos de la entrada de linea, que son el caso testigo', () => {
  const dice = new Set(loQueNoSeVe().sinMirar);
  for (const p of ['l.N.mgmask', 'l.N.forceunmute', 'l.N.solo', 'l.N.vca',
    'l.N.subgroup', 'l.N.src', 'l.N.scsrc']) {
    strictEqual(dice.has(p), true, `${p}: la puerta por la que entro el Bluetooth`);
  }
});

/**
 * **Ni un patron inventado, ni una familia olvidada.**
 *
 * Las dos direcciones, porque la lista vieja fallaba en una sola: sus catorce
 * patrones existian todos --pasaba la comprobacion facil-- y le faltaban las
 * cuatro quintas partes de las familias.
 */
test('cada hueco declarado existe, y ninguna familia que lo tenga queda afuera', () => {
  const K = claves();
  const patrones = new Set(K.map((k) => k.replace(/\b\d+\b/g, '{n}')));
  const dice = loQueNoSeVe().sinMirar;

  const inventados = dice.filter((p) => !patrones.has(p.replace(/\bN\b/g, '{n}')));
  deepStrictEqual(inventados, [], 'patrones que la consola no manda');

  // Para cada sufijo declarado, TODA familia de fuente que lo tenga en la
  // consola tiene que estar declarada. Esta es la asercion que la version
  // vieja no habria pasado.
  const declarado = new Set(dice);
  const faltantes: string[] = [];
  // **`mix`, `mute` y `name` quedan fuera de esta regla, y hay que decir por
  // que.** Aparecen declarados --como `v.N.mix`-- porque los VCA son una
  // familia ENTERA que la enumeracion descarta, no porque sean un concepto que
  // se lee en unas familias y no en otras. Sin esta salvedad, el test exigiria
  // declarar `i.N.mix` como hueco: justo el fader que el modulo si lee.
  const sufijos = new Set(dice.flatMap((p) => {
    const m = /^[a-z]+\.N\.([a-z0-9]+)$/.exec(p);
    return m === null || SUFIJOS_LEIDOS.includes(m[1]!) ? [] : [m[1]!];
  }));
  for (const k of K) {
    const m = /^([a-z]+)\.\d+\.([a-z0-9]+)$/.exec(k);
    if (m === null || !FUENTE.includes(m[1]!) || !sufijos.has(m[2]!)) continue;
    const p = `${m[1]}.N.${m[2]}`;
    if (!declarado.has(p)) faltantes.push(p);
  }
  deepStrictEqual([...new Set(faltantes)].sort(), [], 'familias con el hueco y sin declararlo');
});

/**
 * **La cuenta cierra, o no es una declaracion de huecos.**
 *
 * Decir «estos son mis puntos ciegos» solo significa algo si lo demas esta
 * contado. Cada sufijo de una familia de fuente cae en exactamente una de tres
 * listas: los que el modulo lee, los que declara como huecos, y los que declara
 * que no cambian el camino. Un firmware que agregue uno nuevo rompe esto en vez
 * de pasar desapercibido.
 *
 * Lo que el test NO puede comprobar, y hay que decirlo: **que la clasificacion
 * sea la correcta.** Que `pan` no cambie si una fuente llega al general es un
 * juicio. Lo que se comprueba es que ningun sufijo se quede sin juicio.
 */
test('los 42 sufijos de familia fuente estan todos repartidos', () => {
  const K = claves();
  const enLaConsola = new Set<string>();
  for (const k of K) {
    const m = /^([a-z]+)\.\d+\.([a-z0-9]+)$/.exec(k);
    if (m !== null && FUENTE.includes(m[1]!)) enLaConsola.add(m[2]!);
  }
  strictEqual(enLaConsola.size, 42, 'el numero que se conto contra el inventario');

  const repartidos = new Set([
    ...SUFIJOS_LEIDOS,
    ...loQueNoSeVe().sinMirar.flatMap((p) => {
      const m = /^[a-z]+\.N\.([a-z0-9]+)$/.exec(p);
      return m === null ? [] : [m[1]!];
    }),
    ...SUFIJOS_QUE_NO_AFECTAN_EL_CAMINO.map((s) => s.sufijo),
  ]);

  const sinJuicio = [...enLaConsola].filter((s) => !repartidos.has(s)).sort();
  deepStrictEqual(sinJuicio, [], 'sufijos de la consola que nadie clasifico');

  const deMas = [...repartidos].filter((s) => !enLaConsola.has(s)).sort();
  deepStrictEqual(deMas, [], 'sufijos clasificados que la consola no tiene');

  for (const s of SUFIJOS_QUE_NO_AFECTAN_EL_CAMINO) {
    strictEqual(s.porQue.length > 0, true, `${s.sufijo} sin motivo escrito`);
  }
});

/**
 * **Control positivo.** Sin esto, los tres tests de arriba pasarian igual si
 * `loQueNoSeVe()` devolviera la lista vieja de catorce: hay que comprobar que
 * las aserciones muerden.
 */
test('control positivo: la lista vieja de catorce NO pasa las comprobaciones', () => {
  const K = claves();
  const vieja = ['i.N.subgroup', 'l.N.subgroup', 'i.N.vca', 'l.N.vca',
    'a.N.link2master', 'a.N.matrix', 'v.N.mix', 'v.N.mute',
    'i.N.solo', 'settings.soloMode', 'settings.solotype',
    'i.N.mgmask', 'mgmask', 'i.N.forceunmute'];

  const declarado = new Set(vieja);
  const sufijos = new Set(vieja.flatMap((p) => {
    const m = /^[a-z]+\.N\.([a-z0-9]+)$/.exec(p);
    return m === null || SUFIJOS_LEIDOS.includes(m[1]!) ? [] : [m[1]!];
  }));
  const faltantes = new Set<string>();
  for (const k of K) {
    const m = /^([a-z]+)\.\d+\.([a-z0-9]+)$/.exec(k);
    if (m === null || !FUENTE.includes(m[1]!) || !sufijos.has(m[2]!)) continue;
    const p = `${m[1]}.N.${m[2]}`;
    if (!declarado.has(p)) faltantes.add(p);
  }
  // **23, contado a mano y comprobado aca.** Las dos primeras versiones de este
  // test decian 38 y 35: numeros escritos de memoria, que es exactamente el
  // vicio que la tarea vino a corregir, cometido en el test que la comprueba.
  //
  // La cuenta: `subgroup` esta en f i l p y la lista vieja declaraba i y l (2
  // sin declarar); `vca` en a f i l p, declaraba i y l (3); `solo`, `mgmask` y
  // `forceunmute` estan en las SIETE familias y declaraba solo la de canales
  // (6 cada uno); `link2master` y `matrix` son de auxiliares y estaban bien
  // (0). Dos mas tres mas dieciocho.
  strictEqual(faltantes.size, 23, 'la lista vieja deja 23 familias sin declarar');
  strictEqual(faltantes.has('l.N.mgmask'), true, 'incluida la del caso testigo');
});
