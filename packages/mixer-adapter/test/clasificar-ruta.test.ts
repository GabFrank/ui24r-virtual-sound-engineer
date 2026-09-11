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
  // **Todas estas son formas que el aparato manda de verdad**, contrastadas
  // contra el volcado. Antes habia cuatro inventadas --`m.mute`, `m.polarity`,
  // `m.eq.b1.gain`, `m.dyn.threshold`-- que pasaban porque el clasificador las
  // agarraba por prefijo: probaban el patron, no el protocolo.
  strictEqual(clasificarRuta('m.mix'), 'MASTER_FADER');
  // El general no tiene silencio: tiene `m.dim`.
  strictEqual(clasificarRuta('m.dim'), 'MASTER_MUTE');
  // El ecualizador de salida es un grafico de 31 bandas, un escalar por banda.
  strictEqual(clasificarRuta('m.eq.peak.l.0'), 'OUTPUT_EQ');
  strictEqual(clasificarRuta('m.eq.hpf.r'), 'OUTPUT_EQ');
  // El limitador del general es dual mono.
  strictEqual(clasificarRuta('m.dyn.l.threshold'), 'OUTPUT_LIMITER');
  // La polaridad se invierte por lado y se llama `invert`, no `polarity`.
  strictEqual(clasificarRuta('m.l.invert'), 'OUTPUT_POLARITY');
  strictEqual(clasificarRuta('a.5.invert'), 'OUTPUT_POLARITY');
  strictEqual(clasificarRuta('a.5.eq.peak.0'), 'OUTPUT_EQ');
  strictEqual(clasificarRuta('a.5.mute'), 'PA_BUS_MUTE');
  strictEqual(clasificarRuta('a.5.delay'), 'OUTPUT_DELAY');
});

test('clasifica los subgrupos, que no tenian patron ninguno', () => {
  // `SUBGROUP` estaba en el registro de propiedad y el clasificador no podia
  // producirlo jamas. La consola publica 612 claves `s.N.*`.
  strictEqual(clasificarRuta('s.0.mix'), 'SUBGROUP');
  strictEqual(clasificarRuta('s.3.mute'), 'SUBGROUP');
});

test('clasifica las cinco familias del supresor de realimentacion', () => {
  // Tres se agregaron el 2026-09-10 buscando «afs» en la documentacion; las dos
  // sueltas solo aparecen mirando los volcados, que es la fuente que ese mismo
  // arreglo decia estar usando.
  strictEqual(clasificarRuta('m.afs.enabled'), 'AFS2');
  strictEqual(clasificarRuta('a.1.afs.sensitivity'), 'AFS2');
  strictEqual(clasificarRuta('var.afsdata'), 'AFS2');
  strictEqual(clasificarRuta('afs.enabled'), 'AFS2');
  strictEqual(clasificarRuta('settings.afsonboot'), 'AFS2');
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
    'i.1.gate.thresh', 'i.1.mix', 'i.1.pan', 'i.1.mute',
    'hw.1.phantom', 'i.1.aux.1.value', 'p.0.mute', 'p.0.mix', 'p.0.aux.1.value',
    // **Tres de estas rutas estaban inventadas y nadie lo noto**, porque el
    // clasificador las agarraba por prefijo. Los retardos son `m.delayL`,
    // `m.delayR` y `a.B.delay` --no `.delay.time`-- y el supresor es `m.afs.*`,
    // `a.B.afs.*` y `var.afsdata`, no `afs2.*`. Una lista de muestras con rutas
    // que el aparato no manda prueba el patron, no el protocolo.
    'm.eq.peak.l.0', 'm.delayL', 'm.delayR', 'm.l.invert', 'm.dyn.l.threshold',
    'm.mix', 'm.dim', 'a.1.eq.peak.0', 'a.1.delay', 'a.1.invert', 'a.1.mute',
    'a.1.mix', 'v.1.mix', 'f.1.fxtype', 'var.currentSnapshot', 's.0.mix',
    'i.1.phantom', 'm.afs.enabled', 'a.1.afs.enabled', 'var.afsdata',
    'afs.enabled', 'settings.afsonboot', 'i.1.deesser.threshold',
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

test('toda clase del registro de propiedad la puede producir el clasificador', () => {
  // **La direccion que faltaba, y es la que dejo cuatro clases muertas.**
  //
  // El test de arriba comprueba que toda clase producida existe en el registro.
  // Nadie comprobaba lo contrario: que toda clase declarada sea alcanzable. Con
  // eso, `AFS2` vivio meses con un patron --`afs2.*`-- que la consola no manda
  // nunca, y `SUBGROUP` no tenia patron ninguno. `OUTPUT_POLARITY` y
  // `MASTER_MUTE` estaban en el mismo estado: `m.polarity` y `m.mute` no
  // existen; son `m.l.invert` y `m.dim`.
  //
  // Las cuatro se rechazaban igual --el lado seguro-- pero citando que la ruta
  // no se conoce, cuando si se conoce. El registro es lo que se lee despues de
  // un show.
  //
  // Las muestras son **formas reales**, contrastadas contra el volcado de la
  // consola. Una muestra inventada haria que este test tapara justo lo que vino
  // a destapar.
  const muestraPorClase: Record<string, string> = {
    PREAMP_GAIN: 'hw.1.gain',
    PHANTOM: 'hw.1.phantom',
    HPF: 'i.1.eq.hpf.freq',
    CHANNEL_EQ: 'i.1.eq.b1.gain',
    COMPRESSOR: 'i.1.dyn.ratio',
    GATE: 'i.1.gate.thresh',
    DEESSER: 'i.1.deesser.threshold',
    CHANNEL_FADER: 'i.1.mix',
    CHANNEL_PAN: 'i.1.pan',
    CHANNEL_MUTE: 'i.1.mute',
    MONITOR_AUX_SEND: 'a.1.mix',
    PLAYER_MUTE: 'p.0.mute',
    PLAYER_FADER: 'p.0.mix',
    PLAYER_SEND: 'p.0.aux.1.value',
    OUTPUT_EQ: 'm.eq.peak.l.0',
    OUTPUT_DELAY: 'm.delayL',
    OUTPUT_POLARITY: 'm.l.invert',
    OUTPUT_LIMITER: 'm.dyn.l.threshold',
    MASTER_FADER: 'm.mix',
    MASTER_MUTE: 'm.dim',
    PA_BUS_MUTE: 'a.1.mute',
    VCA: 'v.1.mix',
    SUBGROUP: 's.0.mix',
    FX: 'f.1.fxtype',
    SNAPSHOT: 'var.currentSnapshot',
    AFS2: 'm.afs.enabled',
    MATRIX_SEND: 'a.0.mtx.1.value',
    LINE_INPUT: 'l.0.mix',
    SAFE: 'i.0.safe',
  };

  // **`ANALYSIS_BUS_SEND` va aparte a proposito.** Es la unica clase que no
  // depende solo de la ruta: INV-008 admite un unico routing escribible --los
  // envios hacia el bus de analisis-- y cual es lo tiene que decir SPK-P0.5.
  // Sin ese dato, todo `i.N.aux.M.value` es un envio de monitor y no se escribe
  // nunca. Que sea inalcanzable SIN opciones es correcto; lo que hay que
  // comprobar es que sea alcanzable CON ellas.
  strictEqual(clasificarRuta('i.1.aux.3.value', { busDeAnalisis: 3 }), 'ANALYSIS_BUS_SEND');
  const aparte = new Set(['ANALYSIS_BUS_SEND']);

  const sinMuestra = OWNERSHIP.map((e) => e.kind)
    .filter((k) => !aparte.has(k) && !(k in muestraPorClase));
  deepStrictEqual(sinMuestra, [], 'toda clase declarada necesita una ruta real que la produzca');

  const inalcanzables = Object.entries(muestraPorClase)
    .filter(([kind, ruta]) => clasificarRuta(ruta) !== kind)
    .map(([kind, ruta]) => `${kind} (${ruta} -> ${clasificarRuta(ruta)})`);
  deepStrictEqual(inalcanzables, [], 'clases declaradas que el clasificador no produce');
});

test('las entradas de linea tienen tipo propio: nombrarlas no es autorizarlas', () => {
  // **Se clasificaron como canales y eso las ABRIO.** Una auditoria midio que 44
  // rutas de `l.*` pasaron a estar permitidas por el motor, incluida `l.0.mix`
  // -- el fader exacto que estuvo a 0 dB metiendo un tono del Bluetooth en el
  // general durante dos dias. El commit que arreglaba «la aplicacion no sabe que
  // entra al general» habilito a la aplicacion a moverlo.
  //
  // Clasificar no es autorizar. Con tipo propio el registro dice «entrada de
  // linea» en vez de «ruta desconocida», que es lo que se buscaba, y no se
  // concede ningun permiso.
  strictEqual(clasificarRuta('l.0.mix'), 'LINE_INPUT');
  strictEqual(clasificarRuta('l.1.mute'), 'LINE_INPUT');
  strictEqual(clasificarRuta('l.0.eq.b1.gain'), 'LINE_INPUT');
  strictEqual(clasificarRuta('l.0.eq.hpf.freq'), 'LINE_INPUT');
  strictEqual(clasificarRuta('l.0.aux.1.value'), 'LINE_INPUT');
  // Y la de canal sigue siendo de canal.
  strictEqual(clasificarRuta('i.0.mix'), 'CHANNEL_FADER');
});



test('un envio a monitor es mas que su nivel', () => {
  // Sólo `.value` estaba clasificado; las otras cuatro --960 claves-- caían en
  // «ruta desconocida». `.post` y `.postproc` son los dos puntos de derivación
  // que cerró el criterio 1 de SPK-P0.2a, medidos contra el aparato.
  for (const sufijo of ['value', 'mute', 'pan', 'post', 'postproc']) {
    strictEqual(clasificarRuta(`i.3.aux.2.${sufijo}`), 'MONITOR_AUX_SEND', sufijo);
  }
});

test('el bus de analisis sigue siendo la excepcion de SOLO .value', () => {
  // INV-008 admite un único routing escribible: el envío hacia el bus de
  // análisis. Ampliar el envío a monitor no puede haber ampliado esa excepción.
  const con = { busDeAnalisis: 2 };
  strictEqual(clasificarRuta('i.3.aux.2.value', con), 'ANALYSIS_BUS_SEND');
  strictEqual(clasificarRuta('i.3.aux.2.mute', con), 'MONITOR_AUX_SEND', 'el silencio NO');
  strictEqual(clasificarRuta('i.3.aux.2.post', con), 'MONITOR_AUX_SEND', 'la derivacion NO');
});

test('los envios a efectos y a la matriz dejan de ser desconocidos', () => {
  strictEqual(clasificarRuta('i.3.fx.1.value'), 'FX');
  strictEqual(clasificarRuta('i.3.fx.1.mute'), 'FX');
  strictEqual(clasificarRuta('a.0.mtx.1.value'), 'MATRIX_SEND');
  strictEqual(clasificarRuta('m.mtx.3.mute'), 'MATRIX_SEND');
  strictEqual(clasificarRuta('s.2.mtx.0.pan'), 'MATRIX_SEND');
  // El jack fisico sigue sin clasificar A PROPOSITO: mover eso manda señal a un
  // conector que uno no ve.
  strictEqual(clasificarRuta('hwoutaux.6.src'), null);
});
