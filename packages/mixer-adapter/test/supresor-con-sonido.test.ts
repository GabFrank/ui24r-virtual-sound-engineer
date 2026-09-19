import { test } from 'node:test';
import { deepStrictEqual, ok } from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * **Un guion que hace sonar algo y deja el supresor del general encendido le
 * planta filtros permanentes al usuario.**
 *
 * El supresor de realimentación no distingue un tono sostenido de un acople: es
 * la misma señal —mucha energía, una frecuencia, no se va—. Con `m.afs.enabled`
 * en 1, cualquier corrida con tono le planta al general una notch de −18 dB en
 * la frecuencia del estímulo. Eso es atenuación real sobre la PA del usuario, y
 * queda ahí después de que el guion termine.
 *
 * **Y no se puede deshacer barato.** Se probó el 2026-09-13 sobre el filtro que
 * plantó la 104: `clearlive` no lo borró, `clearfixed` tampoco, **sólo
 * `clearall`** —y `clearall` se lleva la pila entera, incluidos los filtros que
 * el usuario plantó en sus fechas—. Evidencia:
 * `docs/spikes/SPK-P0.10b-vu2/evidence/limpiar-supresor-tras-la-104-2026-09-13.txt`.
 * O sea: el precio de olvidarse es que el usuario pierde su trabajo de ring-out.
 * Ya pasó dos veces.
 *
 * **Por qué el general y no el bus que se mide.** El guion de la 104 razonó con
 * cuidado sobre el supresor del auxiliar por el que iba el tono —lo exigió
 * apagado y abortaba si no— y se olvidó de que el mismo tono llega al general,
 * porque el canal tiene `i.N.mix` sin mutear. El bus que se mide es el que se
 * mira; el general es el que cobra.
 *
 * La guarda es estructural: si el archivo hace sonar algo, tiene que escribir
 * `m.afs.enabled` en 0 en algún lado. No verifica que lo restaure —de eso se
 * ocupa `restauracion-garantizada`— sino que lo haya mirado.
 */
/**
 * **Hacer sonar algo es LANZAR el reproductor, no nombrarlo.**
 *
 * Esto decia `/\bafplay\b/`, y el 2026-09-17 marco a `reparar-pendiente.ts`, que
 * nombra `afplay` **para matarlo** --justo lo contrario de hacer ruido--. Ese
 * guion habia tenido que aprender a callar todo antes de restaurar, porque
 * encendio el supresor con un reproductor huerfano sonando y planto un filtro.
 *
 * Marcarlo por eso habria sido pedirle que apague el supresor a un guion cuyo
 * trabajo es **devolverlo a como estaba**. El detector se afina: suena el que
 * hace `spawn('afplay', ...)`.
 */
const SUENA = /spawn\(\s*['"]afplay['"]/;
const APAGA = /m\.afs\.enabled['"]?\s*,\s*0\b|m\.afs\.enabled\^0/;

/**
 * Guiones que hacen sonar algo sin apagar el supresor del general.
 * **Sólo puede encoger.**
 *
 * Son cuarenta y cuatro, y casi todos son instrumentos de una corrida vieja que ya
 * no se vuelven a correr. Convertirlos de golpe es un cambio mecánico grande
 * sobre código que le habla a un aparato real; la lista impide que crezca y
 * obliga a sacar de ella lo que se arregle, en el mismo commit.
 *
 * **El que importa es el guion que se va a correr de nuevo.** Si vas a correr
 * uno de esta lista, arreglalo antes: el costo de no hacerlo lo paga el usuario.
 */
const SUENAN_SIN_APAGAR: ReadonlySet<string> = new Set([
  'auditoria/04-escala-medidor.ts', 'auditoria/05-testigo-y-fader.ts',
  'auditoria/06-gain-y-techo.ts', 'auditoria/07-gain-fino-techo.ts',
  'auditoria/08-gain-fino-v2.ts', 'auditoria/09-gain-definitivo.ts',
  'auditoria/10-bloque-entrada.ts', 'auditoria/11-rta-sonda.ts',
  'auditoria/12-rta-escala.ts', 'auditoria/13-cola-vu2.ts',
  'auditoria/14-cola-final-y-gr.ts', 'auditoria/15-rta-balistica.ts',
  'auditoria/16-final.ts', 'auditoria/17-main-bytes.ts',
  'p0-10b-vu/aux-senal.ts', 'p0-10b-vu/balistica.ts',
  'p0-10b-vu/bytes-del-bus-de-efecto.ts', 'p0-10b-vu/cola-secciones.ts',
  'p0-10b-vu/cola-sub-fx.ts', 'p0-10b-vu/cola-vu2.ts',
  'p0-10b-vu/diferencia-entre-buses.ts', 'p0-10b-vu/donde-esta-el-pre.ts',
  'p0-10b-vu/eq-vs-medidor.ts', 'p0-10b-vu/escala-del-bloque-de-bus.ts',
  'p0-10b-vu/ley-envio-aux.ts',
  'p0-10b-vu/ley-envio-fx.ts',
  'p0-10b-vu/linealidad.ts',
  'p0-10b-vu/post-y-postproc.ts', 'p0-10b-vu/prueba-tono.ts',
  'p0-10b-vu/puerta-vs-medidor.ts', 'p0-10b-vu/realimentacion-real.ts',
  'p0-10b-vu/reconocer-auxiliar.ts', 'p0-10b-vu/reduccion.ts',
  'p0-10b-vu/roles-bus.ts', 'p0-10b-vu/rta-bandas.ts',
  'p0-10b-vu/rta-encendido.ts', 'p0-10b-vu/rta-general.ts',
  'p0-10b-vu/rta-integracion.ts', 'p0-10b-vu/rta-unidad.ts',
  'p0-10b-vu/rta-vs-vu.ts', 'p0-10b-vu/rta.ts',
  'p0-10b-vu/subgrupo-pre-o-post.ts',
  'p0-5/control-positivo-del-analizador.ts',
]);


/**
 * **La única excepción que NO es deuda vieja: el guion que mide el supresor.**
 *
 * Esta lista se agregó el 2026-09-16 y es la primera vez que el trinquete cede.
 * Por eso cede de esta forma y no de la otra: **`SUENAN_SIN_APAGAR` sigue
 * intacta en 44 y sigue pudiendo sólo encoger.** Subirle el número habría
 * convertido «sólo puede encoger» en «puede crecer cuando conviene», y esa
 * frase, una vez escrita, no se vuelve a cerrar.
 *
 * **Por qué existe la excepción.** La regla es: si un guion hace sonar algo,
 * tiene que apagar el supresor. Hay exactamente una clase de guion para la que
 * eso es imposible sin destruir la medición — **el que mide al supresor**. Un
 * supresor apagado no aprende en ningún modo, así que apagarlo garantizaría de
 * antemano el resultado que se busca, y la corrida sería la versión cara de
 * medir sobre silencio.
 *
 * **El usuario lo autorizó sabiendo esto.** Se le explicó que correr el ítem 111
 * exigía hacer crecer, por primera vez, el trinquete que existe porque su
 * consola perdió filtros dos veces. Contestó «hacela, aflojá la guarda». La
 * decisión es suya y queda escrita acá, que es donde alguien la va a buscar.
 *
 * **Y la excepción trae su propia guarda**, más abajo: un guion de esta lista
 * tiene que **exigir** `m.afs.enabled` en 1 y no escribirlo. Si alguna vez uno
 * de acá lo apaga, o deja de comprobarlo, el test falla: entrar en esta lista no
 * es quedar libre, es cambiar una obligación por otra.
 */
const MIDEN_EL_SUPRESOR: ReadonlySet<string> = new Set([
  'p0-10b-vu/lock-aprende-o-no.ts',
  // **El segundo entró el mismo día, y por un motivo que no existía la semana
  // pasada.** El 111 midió que en LOCK no aprende y dejó declarado su punto
  // flojo: el control positivo era histórico. Este guion lo vuelve concurrente
  // —comprueba que ESTE estímulo, HOY, haga aprender al modo que se sabe que
  // aprende—, y sin él la conclusión del 111 no se puede distinguir de «el
  // estímulo era flojo».
  //
  // Se pudo correr porque la pila está vacía: limpiar después ya no se lleva el
  // trabajo de ring-out del usuario, que era el argumento por el que no se hacía.
  // El usuario decidió con esa información: «sí, probalo ahora».
  'p0-10b-vu/live-planta-o-no.ts',
]);

/** Que exija el supresor encendido, en vez de apagarlo. */
const EXIGE_ENCENDIDO = /m\.afs\.enabled['"]?\)?\s*\)?[\s\S]{0,80}!==\s*1|enabled\s*!==\s*1/;

const RAIZ = new URL('../../../tools/spikes/', import.meta.url).pathname;

function guiones(dir = RAIZ, prefijo = ''): string[] {
  const xs: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) xs.push(...guiones(join(dir, e.name), `${prefijo}${e.name}/`));
    else if (e.name.endsWith('.ts')) xs.push(`${prefijo}${e.name}`);
  }
  return xs;
}

function clasificar(): { suenan: string[]; sinApagar: string[] } {
  const suenan: string[] = [];
  const sinApagar: string[] = [];
  for (const rel of guiones()) {
    const txt = readFileSync(join(RAIZ, rel), 'utf8');
    if (!SUENA.test(txt)) continue;
    suenan.push(rel);
    if (!APAGA.test(txt)) sinApagar.push(rel);
  }
  return { suenan, sinApagar };
}

test('ningun guion NUEVO hace sonar algo con el supresor del general encendido', () => {
  const { sinApagar } = clasificar();
  deepStrictEqual(
    sinApagar.filter((f) => !SUENAN_SIN_APAGAR.has(f) && !MIDEN_EL_SUPRESOR.has(f)), [],
    'Estos guiones hacen sonar un estimulo y no apagan `m.afs.enabled`. El supresor '
    + 'le planta al general una notch de -18 dB en la frecuencia del estimulo, y '
    + 'sacarla exige `clearall`, que se lleva los filtros del usuario.');
});

test('la lista tiene el tamaño que dice, y solo puede bajar', () => {
  // **Bajo de 44 a 43 el 2026-09-17, y no porque se arreglara un guion.** Al
  // afinar el detector --suena el que LANZA `afplay`, no el que lo nombra--
  // `auditoria/wav.ts` dejo de contar: solo lo menciona en un comentario, «para
  // barridos sin re-lanzar afplay». Nunca hizo sonar nada. El trinquete pidio
  // sacarlo, que es exactamente lo que tiene que pedir cuando algo deja de
  // calificar.
  deepStrictEqual(SUENAN_SIN_APAGAR.size, 43,
    'si sube, alguien agrego un guion que suena sin apagar el supresor; si baja, '
    + 'alguien lo arreglo y hay que actualizar el numero en el mismo commit');
});

test('el trinquete no se afloja: lo arreglado sale de la lista', () => {
  const { sinApagar } = clasificar();
  const enRegla = new Set(sinApagar);
  deepStrictEqual([...SUENAN_SIN_APAGAR].filter((f) => !enRegla.has(f)), [],
    'Estos ya apagan el supresor (o dejaron de sonar) y siguen en la lista. '
    + 'Sacarlos en el mismo commit que los arregla.');
});

test('el detector encuentra algo: no celebra el conjunto vacio', () => {
  const { suenan, sinApagar } = clasificar();
  // El minimo bajo con el detector afinado: antes contaba menciones.
  ok(suenan.length > 45, `solo ${suenan.length} guiones suenan; el detector se rompio`);
  ok(sinApagar.length > 0, 'si esto llega a cero, sacar la guarda y dejar la regla');
});

test('la excepcion que mide el supresor esta acotada, y exige el supresor encendido', () => {
  // **El tamaño se escribe a mano, igual que el de la otra lista.** Si sube,
  // alguien agregó un segundo guion que suena con el supresor encendido, y eso
  // es una decisión del usuario, no un detalle de implementación.
  deepStrictEqual(MIDEN_EL_SUPRESOR.size, 2,
    'si sube, alguien sumó otro guion que suena con el supresor encendido: es una '
    + 'decisión del usuario y tiene que quedar escrita, no aparecer en un diff');

  for (const rel of MIDEN_EL_SUPRESOR) {
    const txt = readFileSync(join(RAIZ, rel), 'utf8');
    ok(EXIGE_ENCENDIDO.test(txt),
      `${rel} está en la lista de los que miden el supresor y no comprueba que esté `
      + 'ENCENDIDO. Entrar en esta lista no es quedar libre: es cambiar la obligación '
      + 'de apagarlo por la de exigirlo prendido y abortar si no lo está.');
    ok(!APAGA.test(txt),
      `${rel} apaga m.afs.enabled. Entonces no mide al supresor y no tiene por qué `
      + 'estar en esta lista: sacalo y dejá que la regla normal lo cubra.');
  }
});

test('la excepcion no tapa guiones que ya no existen', () => {
  for (const rel of MIDEN_EL_SUPRESOR) {
    ok(guiones().includes(rel),
      `${rel} está en la lista y no existe. Una excepción a una guarda de seguridad `
      + 'que apunta a la nada es una puerta abierta sin motivo.');
  }
});
