import { test } from 'node:test';
import { strictEqual, deepStrictEqual } from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SafetyEngine } from '../src/engine.ts';
import { clasificarRuta } from '@vse/mixer-adapter';
import { contexto, cambioDeInventario } from './helpers.ts';

/**
 * **La guarda que faltaba: qué permite el motor sobre las claves REALES.**
 *
 * El 2026-09-11, ampliar el clasificador convirtio «ruta desconocida» --que es
 * un rechazo-- en categorias con dueño, y algunas de esas categorias son
 * escribibles. **44 rutas de entrada de linea pasaron a estar permitidas sin
 * que ningun test lo notara**, incluida `l.0.mix`: el fader que estuvo a 0 dB
 * metiendo un tono del Bluetooth en el general durante dos dias. Lo encontro
 * una auditoria contando a mano.
 *
 * Clasificar no es autorizar, y hasta ahora nada vigilaba la diferencia. Este
 * test la vigila, y lo hace contra el **inventario capturado de la consola**:
 * una lista escrita a mano mide lo que uno recuerda, no lo que el aparato
 * manda.
 *
 * **Si este test falla, no lo actualices sin mirar.** Que suba el numero
 * significa que algo que antes se rechazaba ahora se escribe, y eso es una
 * decision de producto, no un detalle de mantenimiento.
 */

const INVENTARIO = join(
  import.meta.dirname, '..', '..', '..',
  'docs', 'inventario', '3.4.8318-ui24-2026-09-11', 'keys-observed.txt',
);

function permitidas(): readonly string[] {
  const claves = readFileSync(INVENTARIO, 'utf8').trim().split('\n');
  const motor = new SafetyEngine();
  // **Se usa el arnes que ya existe, no un contexto fabricado acá.** La primera
  // version construía uno a mano con `sessionState: 'CONFIGURANDO_CANALES'` --que
  // no existe, el valor es `CHANNEL_SETUP`-- y lo forzaba con `as`. El `as` tapó
  // el error de tipos y el conteo salió de un contexto invalido.
  const ctx = contexto({ busesDeSalidaPermitidos: new Set(['m']) });
  const salida: string[] = [];
  for (const path of claves) {
    const kind = clasificarRuta(path);
    if (kind === null) continue;
    // El cambio se construye con `cambioDeInventario`, que es la MISMA funcion
    // que usa `tools/inventario/permisos.ts`. Las dos copias se separaron dos
    // veces --el contexto sin `techoPorRuta`, y la unidad `dB` para todo-- y la
    // segunda dejo a la herramienta contando 858 en vez de 930. El motivo largo
    // esta en el docblock de la funcion.
    const cambio = cambioDeInventario(kind, path);
    const v = motor.evaluar([cambio], ctx, { conexionPermiteEscribir: true, snapshotVerificado: true });
    if (v.permitido) salida.push(path);
  }
  return salida;
}

test('el inventario esta donde se lo espera y tiene las 6732 claves', () => {
  // **Sin esto, dos de los tres tests de abajo pasan con el archivo vacio**:
  // miden el conjunto vacio y lo celebran. Lo encontro una auditoria, y el
  // archivo hermano --el de cobertura-- ya tenia este centinela. El que vigila
  // lo ESCRIBIBLE no lo tenia, que es el peor de los dos para no tenerlo.
  strictEqual(readFileSync(INVENTARIO, 'utf8').trim().split('\n').length, 6732);
});

test('ninguna entrada de linea es escribible', () => {
  // `l.*` es lo que entra por las RCA. Lo decide el usuario, y la aplicacion no
  // lo toca hasta que alguien decida lo contrario a proposito.
  const deLinea = permitidas().filter((p) => p.startsWith('l.'));
  deepStrictEqual(deLinea, []);
});

test('del general solo se escriben FILTROS', () => {
  // Nada de `bypass` --que anula la correccion de sala entera--, ni `linked`,
  // ni el recall de preset, que reemplaza las 62 bandas de golpe.
  const delGeneral = permitidas().filter((p) => p.startsWith('m.'));
  const noFiltros = delGeneral.filter(
    (p) => !/\.eq\.(peak\.|b\d+\.|hpf\b|lpf\b)/.test(p),
  );
  deepStrictEqual(noFiltros, [], 'solo filtros bajo m.eq.');
});

test('la cuenta de rutas escribibles no se mueve sola', () => {
  // **Un numero que se actualiza sin mirar deja de ser una guarda.** Si este
  // test falla: contá qué entró, decidí si corresponde, y recién ahí cambiá el
  // numero -- en el mismo commit que lo justifica.
  // **El numero tiene historia, y cada salto esta contado.**
  //
  // 642 -> 666: la primera version decia 642 porque el contexto se fabricaba a
  // mano con un `sessionState` que no existe, forzado con `as`: el cast tapo el
  // error de tipos y suprimio las 24 rutas de `hw.N.gain`. Esa ganancia del
  // previo SI es trabajo de la aplicacion en configuracion de canales (ADR-026).
  //
  // 666 -> 690: ADR-027 abrio el silencio de canal para el diagnostico de
  // realimentacion. Son **exactamente +24**, los veinticuatro `i.N.mute` de la
  // consola, y el test de abajo lo comprueba por separado: si el salto hubiera
  // traido algo mas, este numero cuadraria igual y el otro no.
  // 690 -> 930: ADR-028 abrio el envio a monitor. Son **exactamente +240**, los
  // `i.N.aux.M.value` de veinticuatro canales por diez auxiliares, y nada mas.
  //
  // **Este test evito que fueran +1200.** `clasificar-ruta` mete cinco hojas
  // bajo `MONITOR_AUX_SEND` --value, mute, pan, post y postproc-- y abrir el
  // `kind` las abria las cinco. El usuario autorizo el nivel; `post` y
  // `postproc` deciden si el envio se deriva antes o despues del procesamiento,
  // o sea que escribirlas es recablear el monitor y no ajustarlo. El motor
  // ahora rechaza toda hoja que no sea `.value`.
  const n = permitidas().length;
  strictEqual(
    n, 930,
    `el motor permite ${n} rutas del inventario y se esperaban 930. `
    + 'Si subio, algo que se rechazaba ahora se escribe.',
  );
});

/**
 * El reparto completo de lo escribible, por categoria.
 *
 * **Una auditoria midio por que el total no alcanza**: intercambiar `i.N.pan`
 * (24) por `hw.N.gain` (24) deja el 930 en pie y **todas** las aserciones de
 * familia en verde, porque cada una mira su propia familia y ninguna mira el
 * conjunto. Y quedaban sin fijar seis familias grandes: el ecualizador de canal
 * (504), el del general (66), el filtro pasa-altos (48), el fader, el silencio
 * y la ganancia del previo.
 *
 * Esto fija el reparto entero. Un cambio que mueva una ruta de una categoria a
 * otra falla acá aunque el total cuadre.
 */
const REPARTO_ESPERADO: ReadonlyMap<string, number> = new Map([
  // El ecualizador del canal es la mayoria de lo escribible, y es el corazon
  // del producto: corregir el timbre de un canal es para lo que existe.
  ['CHANNEL_EQ', 504],
  // ADR-028. Veinticuatro canales por diez auxiliares.
  ['MONITOR_AUX_SEND', 240],
  // Solo los filtros del general, nada de bypass ni de recall de preset.
  ['OUTPUT_EQ', 66],
  ['HPF', 48],
  // ADR-026: la ganancia del previo, solo en configuracion de canales.
  ['PREAMP_GAIN', 24],
  ['CHANNEL_FADER', 24],
  // ADR-027: el silencio de canal, para el diagnostico de realimentacion.
  ['CHANNEL_MUTE', 24],
]);

test('el reparto de lo escribible por categoria es exactamente el declarado', () => {
  const h = new Map<string, number>();
  for (const path of permitidas()) {
    const kind = clasificarRuta(path);
    if (kind === null) continue;
    h.set(kind, (h.get(kind) ?? 0) + 1);
  }
  // Se comparan los dos mapas enteros, ordenados, para que falte y sobre se
  // vean las dos. Un `for` sobre el esperado no veria una categoria nueva.
  const orden = (m: ReadonlyMap<string, number>) => [...m].sort(([a], [b]) => a.localeCompare(b));
  deepStrictEqual(orden(h), orden(REPARTO_ESPERADO));

  // Y que la suma sea el total que el otro test vigila: si los dos numeros se
  // separan, uno de los dos se actualizo sin mirar.
  strictEqual([...REPARTO_ESPERADO.values()].reduce((a, b) => a + b, 0), 930);
});

test('lo unico que ADR-028 abrio son los niveles de envio a monitor', () => {
  // Mismo principio que el test de ADR-027: la cuenta sola no alcanza, hay que
  // mirar QUE entro.
  const niveles = permitidas().filter((p) => /^i\.\d+\.aux\.\d+\.value$/.test(p));
  strictEqual(niveles.length, 240, 'veinticuatro canales por diez auxiliares');

  // Y ninguna otra hoja del envio: ni el silencio, ni el paneo, ni las dos
  // banderas de derivacion, que son las que deciden si ecualizar mueve el
  // monitor del musico (medicion 95 del 2026-09-12).
  const otrasHojas = permitidas().filter(
    (p) => /^i\.\d+\.aux\.\d+\./.test(p) && !p.endsWith('.value'),
  );
  deepStrictEqual(otrasHojas, [], 'del envio a monitor, solo el nivel');

  // Y nada de los envios del reproductor, que INV-010 trata aparte.
  const delReproductor = permitidas().filter((p) => /^p\.\d+\.aux\./.test(p));
  deepStrictEqual(delReproductor, [], 'los envios del reproductor siguen cerrados');
});

test('lo unico que ADR-027 abrio son los silencios de canal', () => {
  // **La cuenta sola no alcanza.** Si una autorizacion trajera de contrabando
  // otra familia y quitara la misma cantidad de otra, el total cuadraria. Esto
  // mira QUE entro, no cuanto.
  const mutes = permitidas().filter((p) => /^i\.\d+\.mute$/.test(p));
  strictEqual(mutes.length, 24, 'los veinticuatro canales de la consola');
  // Y ningun otro silencio: ni el del general, ni los de bus, ni los de envio.
  const otrosSilencios = permitidas().filter(
    (p) => p.endsWith('.mute') && !/^i\.\d+\.mute$/.test(p),
  );
  deepStrictEqual(otrosSilencios, [], 'solo el silencio de canal');
});
