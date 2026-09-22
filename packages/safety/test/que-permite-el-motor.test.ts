import { test } from 'node:test';
import { strictEqual, deepStrictEqual } from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SafetyEngine } from '../src/engine.ts';
import { clasificarRuta } from '@vse/mixer-adapter';
import { contexto, cambioDeInventario, cambioDePuntaAPunta } from './helpers.ts';

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

function claves(): readonly string[] {
  return readFileSync(INVENTARIO, 'utf8').trim().split('\n');
}

function permitidas(): readonly string[] {
  const motor = new SafetyEngine();
  // **Se usa el arnes que ya existe, no un contexto fabricado acá.** La primera
  // version construía uno a mano con `sessionState: 'CONFIGURANDO_CANALES'` --que
  // no existe, el valor es `CHANNEL_SETUP`-- y lo forzaba con `as`. El `as` tapó
  // el error de tipos y el conteo salió de un contexto invalido.
  const ctx = contexto({ busesDeSalidaPermitidos: new Set(['m']) });
  const salida: string[] = [];
  for (const path of claves()) {
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

/**
 * **El control que distingue «el tope corre» de «la puerta quedo abierta».**
 *
 * El censo de arriba propone un movimiento de CERO --el mismo crudo en los dos
 * extremos-- porque lo que mide es la puerta de permiso. Eso deja una pregunta
 * sin contestar, y es justo la que ADR-039 vino a cerrar: las 240 rutas que
 * vuelven, ¿vuelven porque el tope en octavas las acota, o porque el tope dejo
 * de correr?
 *
 * Acá se propone el movimiento MAS GRANDE que el tramo medido de cada ruta
 * admite --de un extremo al otro del crudo barrido-- con el par crudo/magnitud
 * atado por la ley, para que lo unico que pueda rechazarlo sea el tope. Si
 * alguna pasa, el freno de esa hoja no esta conectado.
 */
function permitidasDePuntaAPunta(): readonly string[] {
  const motor = new SafetyEngine();
  const ctx = contexto({ busesDeSalidaPermitidos: new Set(['m']) });
  const salida: string[] = [];
  for (const path of claves()) {
    const kind = clasificarRuta(path);
    if (kind === null) continue;
    const cambio = cambioDePuntaAPunta(kind, path);
    if (cambio === null) continue;
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
  // **930 -> 834 el 2026-09-13, y esto BAJA porque algo dejo de escribirse.** Son
  // exactamente -96: las cuatro rutas con ley medida --`eq.b1.freq`, `eq.b1.q`,
  // `eq.lpf.freq` y `eq.hpf.freq`-- por veinticuatro canales. Se reparten en -72
  // de CHANNEL_EQ y -24 de HPF.
  //
  // **No se cayeron: nunca habian sido escribibles, y este numero lo tapaba.** El
  // arnes declaraba `unidad: 'dB'` para TODA ruta, y con eso pasaban una puerta
  // que con la unidad honesta rechazan. `LIMITES.CHANNEL_EQ` pone su tope en dB y
  // la ley medida de `eq.b1.freq` esta en Hz; `LIMITES.HPF` lo pone en octavas y
  // la de `eq.hpf.freq` esta en Hz. El motor rechaza con INV-004 --«comparar los
  // dos numeros seria comparar especies distintas»-- y **tiene razon**: un tope de
  // 4 dB no acota un salto de frecuencia.
  //
  // Salio a la luz al arreglar `entrada()`, que no resolvia ninguna ruta concreta
  // (ver `canonizar-ruta.test.ts`). Con la tabla resolviendo, el arnes tuvo que
  // declarar la unidad de verdad, y ahi se vio.
  //
  // **La causa es de modelo y no de medicion**: `LIMITES` da UNA unidad por
  // `kind`, y `CHANNEL_EQ` cubre hojas en Hz, en dB y en Q. Mientras eso siga asi,
  // medir mas leyes del ecualizador no las hace escribibles.
  // Ver `docs/backlog/hallazgo-un-kind-una-unidad-y-las-hojas-no-coinciden.md`.
  //
  // **834 -> 690 el 2026-09-21, y BAJA por exactamente el mismo motivo que la vez
  // anterior.** Son exactamente -144: las seis rutas que el item 121 midio
  // --`eq.b2.freq`, `eq.b2.q`, `eq.b3.freq`, `eq.b3.q`, `eq.b4.freq`, `eq.b4.q`--
  // por veinticuatro canales, todas en CHANNEL_EQ.
  //
  // **Y tampoco se cayeron: nunca habian sido escribibles.** Lo que las contaba
  // era el arnes con su `unidad: 'dB'` para todo, igual que en el salto anterior.
  // Con la ley medida, el motor las rechaza por INV-004 --sus leyes estan en Hz
  // y en Q, el tope de `CHANNEL_EQ` esta en dB-- exactamente como rechaza las de
  // la banda 1 desde el 2026-09-13.
  //
  // **Es la prediccion de arriba cumpliendose al pie de la letra**: «mientras eso
  // siga asi, medir mas leyes del ecualizador no las hace escribibles». Se
  // midieron, y no las hizo. Lo que desbloquea mover una banda no es otra
  // medicion: es resolver `un kind, una unidad`.
  //
  // **690 -> 930 el 2026-09-21b, y esto SUBE porque ADR-039 se construyo.** Son
  // exactamente +240, y son las mismas que habian bajado en los dos saltos de
  // arriba: las ocho hojas de frecuencia y Q de las cuatro bandas (192), mas
  // `eq.lpf.freq` (24) y `eq.hpf.freq` (24), por veinticuatro canales. Las
  // cuatro ganancias nunca se cayeron y no se cuentan de nuevo.
  //
  // **Lo que cambio no es una medicion sino el modelo**, que es exactamente lo
  // que este mismo comentario predijo dos parrafos mas arriba. El freno viaja
  // con la hoja: la unidad de la magnitud sigue siendo la de la ley --Hz y Q--
  // y se agrega una **escala del movimiento** en la que se cuenta el tope, que
  // en la frecuencia son octavas y en el Q octavas de ancho de banda. Las dos
  // guardas que se contradecian --INV-004 pedia la unidad de la familia, `atar`
  // la de la hoja-- vuelven a pedir lo mismo.
  //
  // **Y no vuelven con el freno aflojado**: el test de punta a punta de mas
  // abajo propone sobre cada una el movimiento mas grande que su tramo medido
  // admite y las rechaza a las 240. Si el censo diera 930 y ese otro tambien,
  // el tope no estaria corriendo.
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
 * (432), el del general (66), el filtro pasa-altos (24), el fader, el silencio
 * y la ganancia del previo.
 *
 * Esto fija el reparto entero. Un cambio que mueva una ruta de una categoria a
 * otra falla acá aunque el total cuadre.
 */
const REPARTO_ESPERADO: ReadonlyMap<string, number> = new Map([
  // El ecualizador del canal es la mayoria de lo escribible, y es el corazon
  // del producto: corregir el timbre de un canal es para lo que existe.
  // -72 el 2026-09-13: `eq.b1.freq`, `eq.b1.q` y `eq.lpf.freq` de los 24 canales
  // tienen ley medida en Hz y en Q, y el tope de este `kind` esta en dB. El motor
  // las rechaza por INV-004 y siempre las habria rechazado: lo que las contaba
  // era el arnes, que declaraba dB para todo.
  // -144 mas el 2026-09-21, por lo mismo: el item 121 midio la frecuencia y el Q
  // de las bandas 2, 3 y 4, o sea seis rutas por canal. Medirlas no las abre;
  // las saca de la cuenta, que es lo honesto.
  // **+216 el 2026-09-21b, con ADR-039 construida**: vuelven las ocho hojas de
  // frecuencia y Q de las cuatro bandas (192) y `eq.lpf.freq` (24), ahora con un
  // tope que significa algo --octavas y octavas de ancho de banda--. 288 + 216.
  ['CHANNEL_EQ', 504],
  // ADR-028. Veinticuatro canales por diez auxiliares.
  ['MONITOR_AUX_SEND', 240],
  // Solo los filtros del general, nada de bypass ni de recall de preset.
  ['OUTPUT_EQ', 66],
  // -24 por lo mismo: `eq.hpf.freq` tiene ley medida en Hz y el tope esta en
  // octavas. Queda `eq.hpf.slope`, que no tiene ley y sigue pasando.
  // **+24 el 2026-09-21b**: `eq.hpf.freq` vuelve, y con ella corre por primera
  // vez el tope de una octava que el anexo B pidio el 2026-09-07 --el primer
  // commit del repositorio-- y que nunca pudo compararse con nada.
  // **La pendiente sigue rigiendose por su familia y no cambio de conducta**:
  // el arreglo va en la hoja `eq.hpf.freq` justamente para no tocarla.
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

test('lo unico que ADR-039 abrio son la frecuencia y el ancho del ecualizador', () => {
  // **La cuenta sola no alcanza**, igual que con ADR-027 y ADR-028: si el salto
  // trajera de contrabando otra familia y quitara la misma cantidad de otra, el
  // total cuadraria. Esto mira QUE entro.
  const p = permitidas();
  const bandas = p.filter((x) => /^i\.\d+\.eq\.b[1-4]\.(freq|q)$/.test(x));
  strictEqual(bandas.length, 192, 'ocho hojas por canal: freq y q de las cuatro bandas');
  const lpf = p.filter((x) => /^i\.\d+\.eq\.lpf\.freq$/.test(x));
  strictEqual(lpf.length, 24);
  const hpf = p.filter((x) => /^i\.\d+\.eq\.hpf\.freq$/.test(x));
  strictEqual(hpf.length, 24);

  // Y las cuatro ganancias, que NUNCA se cayeron: estan desde antes y no se
  // cuentan como parte de las 240.
  const ganancias = p.filter((x) => /^i\.\d+\.eq\.b[1-4]\.gain$/.test(x));
  strictEqual(ganancias.length, 96);

  // **Lo que ADR-039 NO abrio y comparte prefijo.** El compresor tiene el mismo
  // defecto de forma --cinco hojas en tres monedas-- y la escala del movimiento
  // de su relacion, que no tiene unidad, es una decision propia que sigue
  // pendiente. La puerta no se retoca: medido en el aparato del usuario.
  deepStrictEqual(p.filter((x) => /^i\.\d+\.(dyn|comp|gate|deesser)\./.test(x)), [],
    'el compresor y la puerta no son de esta pieza');

  // **La banda 5 pasa, y pasaba antes: no es de ADR-039 y no es un permiso
  // nuevo.** Sus tres hojas no tienen ley medida, asi que el arnes les declara
  // la unidad de la familia --dB-- y el tope de 4 dB las deja pasar, igual que
  // a toda hoja sin ley. Lo que se midio de la banda 5 es que **no mueve el
  // audio**: con el tono presente y 80,5 dB sobre el piso, barrer su crudo de 0
  // a 1 movio 0,00 dB sobre 39 puntos, y por eso no tiene entrada en `RAW_MAP`.
  // Se fija la cuenta para que el dia que alguien le agregue una ley esto lo
  // diga en vez de esconderlo dentro del total.
  strictEqual(p.filter((x) => /^i\.\d+\.eq\.b5\./.test(x)).length, 72,
    'tres hojas por canal, sin ley medida y sin relacion con ADR-039');
});

/**
 * **Las 240 vuelven con el freno puesto, no con la puerta abierta.**
 *
 * Es el control positivo del censo: con el movimiento mas grande que su tramo
 * medido admite, **ninguna** ruta con ley medida pasa. Un censo de 930 con esto
 * tambien en 930 significaria que el tope de la hoja no esta corriendo.
 */
test('ADR-039: de punta a punta del tramo medido no pasa ninguna', () => {
  const pasan = permitidasDePuntaAPunta();
  deepStrictEqual(pasan, [], 'el tramo entero de una hoja medida no es un paso');

  // **Centinela**: que el barrido de arriba haya mirado algo. Sin esto celebra
  // el conjunto vacio si `cambioDePuntaAPunta` deja de construir cambios --por
  // ejemplo si `entrada()` vuelve a no resolver rutas concretas, que es
  // exactamente lo que paso el 2026-09-13--.
  let conLey = 0;
  for (const path of claves()) {
    const kind = clasificarRuta(path);
    if (kind !== null && cambioDePuntaAPunta(kind, path) !== null) conLey++;
  }
  strictEqual(conLey, 965, 'rutas del inventario con ley medida y clase conocida');

  // **Y el rechazo tiene que ser POR EL TOPE sobre las 240 que ADR-039 abrio**,
  // no por otra regla que de el mismo veredicto. Es la diferencia entre «el
  // freno en octavas corre» y «esto se rechaza por algun otro motivo».
  const DE_LA_039 = /^i\.\d+\.eq\.(b[1-4]\.(freq|q)|(h|l)pf\.freq)$/;
  const motor = new SafetyEngine();
  const ctx = contexto({ busesDeSalidaPermitidos: new Set(['m']) });
  let mirados = 0;
  let porElTope = 0;
  for (const path of claves()) {
    if (!DE_LA_039.test(path)) continue;
    const kind = clasificarRuta(path);
    if (kind === null) continue;
    const cambio = cambioDePuntaAPunta(kind, path);
    if (cambio === null) continue;
    mirados++;
    const v = motor.evaluar([cambio], ctx, { conexionPermiteEscribir: true, snapshotVerificado: true });
    if (!v.permitido && v.rechazos.some((r) => r.codigo === 'DELTA_EXCEDIDO')) porElTope++;
  }
  strictEqual(mirados, 240, 'las mismas 240 que el censo recupero');
  strictEqual(porElTope, 240, 'y las 240 se rechazan por el tope en octavas');
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
