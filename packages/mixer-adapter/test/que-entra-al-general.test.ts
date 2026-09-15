import { test } from 'node:test';
import { strictEqual, deepStrictEqual } from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  fuentesDelGeneral, fuentesAbiertas, rutasSinNombre, loQueNoSeVe,
  SUFIJOS_LEIDOS, SUFIJOS_QUE_NO_AFECTAN_EL_CAMINO, GRUPOS_QUE_NO_AFECTAN_EL_CAMINO,
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

/** Un patron declarado, normalizado a la forma del inventario. */
function comoInventario(p: string): string {
  return p.replace(/\b[NM]\b/g, '{n}');
}

test('declara lo que NO puede ver, en la salida y no en un comentario', () => {
  const h = loQueNoSeVe();
  strictEqual(h.sinMirar.includes('v.N.mix'), true, 'los VCA');
  strictEqual(h.sinMirar.includes('i.N.subgroup'), true, 'el enrutamiento');
  strictEqual(h.sinMirar.includes('i.N.mgmask'), true, 'los grupos de silencio');
  // **146, contado.** Un centinela de cantidad, porque una auditoria midio que
  // 17 de los 18 huecos sueltos se podian BORRAR con la suite en verde: eran
  // justo los que el commit presumia de haber agregado, y ninguna asercion los
  // sujetaba. Si este numero cambia, que sea a proposito.
  strictEqual(h.huecos.length, 146, 'la cuenta de huecos declarados');
});

/**
 * **Ningun hueco declarado puede desaparecer en silencio.**
 *
 * Esta es la asercion que faltaba: la lista de huecos sueltos no la sujetaba
 * nada, asi que se podia vaciar entera sin que ningun test se enterara. Cada
 * testigo de aca es una clase distinta de hueco que la primera version no
 * tenia, y borrar cualquiera rompe esto.
 */
test('los huecos sueltos y de grupo estan sujetos uno por uno', () => {
  const dice = new Set(loQueNoSeVe().sinMirar);
  for (const p of [
    // El envio a efectos: la segunda puerta al general, la que faltaba.
    'i.N.fx.M.value', 'i.N.fx.M.post', 's.N.fx.M.mute',
    // El envio a auxiliares: estaba declarada la salida y no la entrada.
    'i.N.aux.M.value', 'i.N.aux.M.post', 'f.N.aux.M.postproc',
    'a.N.mtx.*',
    // Lo que se mueve solo.
    'i.N.gate.*', 'i.N.dyn.*', 'a.N.afs.*', 'automix.a.on', 'automix.time',
    // Lo suelto, que es lo que no sujetaba nada.
    'settings.soloMode', 'settings.solotype', 'settings.multiplesolo', 'settings.solovol',
    'settings.auxsendpoint', 'settings.auxmutelink', 'settings.mtxsendpoint',
    'hwoutm.N.src', 'hwoutaux.N.src', 'mgmask', 'mg.N.name', 'vg.N', 'vg.N.name',
    'v.N.mute', 'v.N.name', 'casc.N.src', 'settings.cascade.enabled',
    'var.cascade.connected', 'usbdaw.N.src', 'iso.ch', 'm.dim', 'm.safe',
    'var.unsaved.mutegroups', 'var.unsaved.chsafes',
  ]) {
    strictEqual(dice.has(p), true, `${p}: declarado y sin nadie que lo sujete`);
  }
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
    'l.N.subgroup', 'l.N.src', 'l.N.scsrc', 'l.N.stereoIndex',
    'l.N.fx.M.value', 'l.N.aux.M.post']) {
    strictEqual(dice.has(p), true, `${p}: la puerta por la que entro el Bluetooth`);
  }
});

test('ni un patron inventado: todo lo declarado existe en la consola', () => {
  const K = claves();
  const patrones = new Set(K.map((k) => k.replace(/\b\d+\b/g, '{n}')));
  const inventados = loQueNoSeVe().sinMirar.filter((p) => {
    // Un grupo entero --`i.N.gate.*`-- existe si la consola manda algo debajo.
    if (p.endsWith('.*')) {
      const pre = p.slice(0, -1).replace(/\bN\b/g, '{n}');
      return ![...patrones].some((q) => q.startsWith(pre));
    }
    return !patrones.has(comoInventario(p));
  });
  deepStrictEqual(inventados, [], 'patrones que la consola no manda');
});

/**
 * **Ninguna familia que tenga el hueco queda afuera.** Las dos direcciones,
 * porque la lista vieja fallaba en una sola: sus catorce patrones existian
 * todos --pasaba la comprobacion facil-- y le faltaban las cuatro quintas
 * partes de las familias.
 */
test('ninguna familia que tenga un hueco declarado queda sin declarar', () => {
  const K = claves();
  const dice = loQueNoSeVe().sinMirar;
  const declarado = new Set(dice);
  // `mix`, `mute` y `name` quedan fuera de esta regla: aparecen declarados
  // --como `v.N.mix`-- porque los VCA son una familia ENTERA que la enumeracion
  // descarta, no porque sean un concepto que se lee en unas familias y no en
  // otras. Sin la salvedad, el test exigiria declarar `i.N.mix` como hueco.
  const sufijos = new Set(dice.flatMap((p) => {
    const m = /^[a-z]+\.N\.([A-Za-z0-9]+)$/.exec(p);
    return m === null || SUFIJOS_LEIDOS.includes(m[1]!) ? [] : [m[1]!];
  }));
  const grupos = new Set(dice.flatMap((p) => {
    const m = /^[a-z]+\.N\.([a-z]+)\.(M\.|\*)/.exec(p);
    return m === null ? [] : [m[1]!];
  }));

  const faltantes = new Set<string>();
  for (const k of K) {
    const m = /^([a-z]+)\.\d+\.(.+)$/.exec(k);
    if (m === null || !FUENTE.includes(m[1]!)) continue;
    const fam = m[1]!, resto = m[2]!;
    if (!resto.includes('.')) {
      if (sufijos.has(resto) && !declarado.has(`${fam}.N.${resto}`)) faltantes.add(`${fam}.N.${resto}`);
      continue;
    }
    const g = resto.split('.')[0]!;
    if (!grupos.has(g)) continue;
    const hoja = `${fam}.N.${g}.${resto.slice(g.length + 1).replace(/\b\d+\b/g, 'M')}`;
    if (!declarado.has(hoja) && !declarado.has(`${fam}.N.${g}.*`)) faltantes.add(hoja);
  }
  deepStrictEqual([...faltantes].sort(), [], 'familias u hojas con el hueco y sin declararlo');
});

/**
 * **La cuenta cierra por los DOS ejes, o no es una declaracion de huecos.**
 *
 * La primera version contaba solo el primero --los sufijos de un tramo-- y por
 * eso se le escapo el envio a efectos, que es la segunda puerta al general y
 * tiene la misma forma que el subgrupo, que si estaba declarado.
 *
 * Y contaba 42 sufijos donde hay 43: el numero no salia de la consola, salia de
 * un `[a-z0-9]+` que no admite mayusculas, y `stereoIndex` --que este proyecto
 * YA MIDIO-- se colaba por ahi. Un firmware que agregue un sufijo camelCase
 * tenia que romper el test y no lo rompia.
 */
test('los dos ejes cierran: 43 sufijos y 9 grupos, todos con juicio', () => {
  const K = claves();
  const sufijos = new Set<string>();
  const grupos = new Set<string>();
  for (const k of K) {
    const m = /^([a-z]+)\.\d+\.(.+)$/.exec(k);
    if (m === null || !FUENTE.includes(m[1]!)) continue;
    const resto = m[2]!;
    if (resto.includes('.')) grupos.add(resto.split('.')[0]!);
    // **`[A-Za-z0-9]+`, con mayusculas.** Con `[a-z0-9]+` daban 42 y el 43.o
    // quedaba invisible para la contabilidad ENTERA, no solo para el conteo.
    else if (/^[A-Za-z0-9]+$/.test(resto)) sufijos.add(resto);
  }
  strictEqual(sufijos.size, 43, 'sufijos de un tramo en las familias de fuente');
  // **9, contado.** Escribi 10 de memoria y el test lo atrapo: es la tercera
  // vez en la misma jornada que un numero sale de la cabeza en vez de del
  // inventario. Que lo atrape el test es exactamente para lo que esta.
  strictEqual(grupos.size, 9, 'segundos tramos en las familias de fuente');

  const dice = loQueNoSeVe().sinMirar;
  const ciegosSimples = new Set(dice.flatMap((p) => {
    const m = /^[a-z]+\.N\.([A-Za-z0-9]+)$/.exec(p);
    return m === null ? [] : [m[1]!];
  }));
  const ciegosGrupo = new Set(dice.flatMap((p) => {
    const m = /^[a-z]+\.N\.([a-z]+)\.(M\.|\*)/.exec(p);
    return m === null ? [] : [m[1]!];
  }));
  const noAfectan = new Set(SUFIJOS_QUE_NO_AFECTAN_EL_CAMINO.map((s) => s.sufijo));
  const noAfectanGrupo = new Set(GRUPOS_QUE_NO_AFECTAN_EL_CAMINO.map((g) => g.grupo));

  const repartidos = new Set([...SUFIJOS_LEIDOS, ...ciegosSimples, ...noAfectan]);
  deepStrictEqual(
    [...sufijos].filter((s) => !repartidos.has(s)).sort(), [],
    'sufijos de la consola que nadie clasifico',
  );
  deepStrictEqual(
    [...repartidos].filter((s) => !sufijos.has(s)).sort(), [],
    'sufijos clasificados que la consola no tiene',
  );
  deepStrictEqual(
    [...grupos].filter((g) => !ciegosGrupo.has(g) && !noAfectanGrupo.has(g)).sort(), [],
    'segundos tramos que nadie clasifico',
  );

  for (const s of SUFIJOS_QUE_NO_AFECTAN_EL_CAMINO) {
    strictEqual(s.porQue.length > 0, true, `${s.sufijo} sin motivo escrito`);
  }
  for (const g of GRUPOS_QUE_NO_AFECTAN_EL_CAMINO) {
    strictEqual(g.porQue.length > 0, true, `${g.grupo} sin motivo escrito`);
  }
});

/**
 * **La disyuncion, que es la mitad que faltaba.**
 *
 * El test de arriba hace UNION de conjuntos, asi que una clasificacion que se
 * contradice a si misma pasaba: poner `pan` en los conceptos DEJANDOLO en «no
 * afecta el camino» daba verde. «Cada uno en exactamente una de las listas» no
 * estaba comprobado; lo midio una auditoria.
 */
test('nada esta en dos listas a la vez', () => {
  const dice = loQueNoSeVe().sinMirar;
  const ciegos = new Set(dice.flatMap((p) => {
    const m = /^[a-z]+\.N\.([A-Za-z0-9]+)$/.exec(p);
    return m === null ? [] : [m[1]!];
  }));
  const noAfectan = SUFIJOS_QUE_NO_AFECTAN_EL_CAMINO.map((s) => s.sufijo);
  deepStrictEqual(
    noAfectan.filter((s) => ciegos.has(s) && !SUFIJOS_LEIDOS.includes(s)), [],
    'un sufijo declarado hueco Y declarado inocuo: la clasificacion se contradice',
  );
  deepStrictEqual(
    SUFIJOS_LEIDOS.filter((s) => noAfectan.includes(s)), [],
    'un sufijo que se lee no puede estar ademas en «no afecta el camino»',
  );
  const ciegosGrupo = new Set(dice.flatMap((p) => {
    const m = /^[a-z]+\.N\.([a-z]+)\.(M\.|\*)/.exec(p);
    return m === null ? [] : [m[1]!];
  }));
  deepStrictEqual(
    GRUPOS_QUE_NO_AFECTAN_EL_CAMINO.map((g) => g.grupo).filter((g) => ciegosGrupo.has(g)), [],
    'un grupo declarado hueco Y declarado inocuo',
  );
  deepStrictEqual(
    [...new Set(dice)].length, dice.length, 'y ningun patron declarado dos veces',
  );
});

/**
 * **Una clase de hueco no puede desaparecer sin que se note.**
 *
 * Antes esto era `porQue.length >= 4`, calibrado justo para no morder: borrar
 * el automix entero --dos conceptos y tres claves sueltas-- dejaba la suite en
 * verde, porque el quinto parrafo se empuja siempre. Ahora cada clase presente
 * tiene que tener su parrafo, con su palabra dentro.
 */
test('cada clase de hueco presente trae su parrafo, y se le nota', () => {
  const h = loQueNoSeVe();
  const clases = new Set(h.huecos.map((x) => x.clase));
  deepStrictEqual(
    [...clases].sort(), ['AUTOMATICO', 'CAMINO', 'DESCONOCIDO', 'SILENCIO'],
    'las cuatro clases tienen que estar representadas',
  );
  const texto = h.porQue.join(' ').toLowerCase();
  for (const [clase, palabra] of [
    ['CAMINO', 'enrutamiento'], ['SILENCIO', 'silencio'],
    ['AUTOMATICO', 'automix'], ['DESCONOCIDO', 'nombre no es una medición'],
  ] as const) {
    strictEqual(
      texto.includes(palabra.toLowerCase()), true,
      `la clase ${clase} esta declarada y su motivo no se menciona`,
    );
  }
  strictEqual(h.porQue.length, 5, 'una frase por clase, mas la de la contabilidad');
});
