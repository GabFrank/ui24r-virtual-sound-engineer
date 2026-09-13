import { test } from 'node:test';
import { deepStrictEqual, ok } from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * **Ningún guion nuevo escribe a la consola sin restauración garantizada.**
 *
 * Una auditoría de instrumentos encontró que ninguno de los diez guiones de la
 * tanda de mediciones tenía `try/finally`: cualquier caída a mitad de camino
 * dejaba escritos umbrales, relaciones, envíos, faderes, el ecualizador y
 * `m.afs.enabled = 0`. Al contar sobre el árbol entero resultaron ser
 * **cuarenta y siete guiones que escriben, y cero con restauración
 * garantizada** — el auditor dijo diez porque sólo le dieron diez a leer.
 *
 * Y no es hipotético. Escribiendo el módulo que arregla esto, una corrida de
 * prueba pasada por `head -4` murió cuando `head` cerró la tubería y dejó
 * `i.9.aux.2.value` en 0,8 sobre la consola del usuario, contra el 0 que la
 * restauración verificada de la medición anterior había dejado. Un envío a un
 * auxiliar, abierto, por una prueba de un argumento.
 *
 * **Por qué esto es un trinquete y no una prohibición.** Convertir cuarenta y
 * siete guiones de golpe es un cambio mecánico grande sobre código que habla
 * con un aparato real, y romper un instrumento en silencio es peor que la deuda
 * que arregla. Así que la lista de abajo existe, se declara entera, y **sólo
 * puede encoger**: un guion nuevo que escriba sin `conRestauracion` falla acá, y
 * uno de la lista que se convierta tiene que salir de la lista en el mismo
 * commit.
 *
 * Una lista que puede crecer es una lista que no sirve. Ésta no puede.
 *
 * **Lo que este test NO ve**, en dos partes:
 *
 * - Que la restauración restaure *lo correcto*. Eso lo cubre por otro lado
 *   `restaurar-sin-adivinar.test.ts` --que la lea en vez de suponerla-- y no hay
 *   forma estática de cubrirlo entero.
 * - Un `process.exit()` **dentro** del cuerpo envuelto, que termina el proceso
 *   sin correr la restauración igual que una señal. Está declarado en el
 *   docblock de `con-restauracion.ts` con la regla que lo evita: si hay que
 *   abortar, se lanza, porque la excepción sí pasa por la restauración.
 */

const RAIZ = join(import.meta.dirname, '..', '..', '..');
const GUIONES = join(RAIZ, 'tools', 'spikes');

/**
 * Guiones que escriben a la consola y todavía no usan `conRestauracion`.
 *
 * **Sólo puede encoger.** Cada vez que uno se convierta, sale de acá.
 */
/**
 * Lo que NO es un guion: el código que **es** la restauración.
 *
 * `tools/spikes/restaurar.ts` escribe a la consola —es lo único que hace— y no
 * puede usar `conRestauracion` porque usarse a sí misma sería circular.
 *
 * **La primera versión de esta exención era estructural** —«un guion abre la
 * consola con un `await` en el nivel superior»— y parecía más limpia que una
 * lista de nombres. Una auditoría la rompió en un intento: envolviendo el cuerpo
 * en `async function principal() { … } void principal();` el guion escribe igual,
 * muere igual, y pasaba los dos tests. **Un criterio que cualquiera esquiva sin
 * proponérselo no es un criterio.**
 *
 * Una exención por nombre con su razón escrita es una línea que alguien puede
 * revisar. La regla estructural era una que nadie iba a volver a mirar.
 */
const ES_LA_RESTAURACION: ReadonlySet<string> = new Set(['restaurar.ts']);

const SIN_CONVERTIR: ReadonlySet<string> = new Set([
  'auditoria/05-testigo-y-fader.ts',
  'auditoria/06-gain-y-techo.ts',
  'auditoria/07-gain-fino-techo.ts',
  'auditoria/08-gain-fino-v2.ts',
  'auditoria/09-gain-definitivo.ts',
  'auditoria/10-bloque-entrada.ts',
  'auditoria/11-rta-sonda.ts',
  'auditoria/12-rta-escala.ts',
  'auditoria/13-cola-vu2.ts',
  'auditoria/14-cola-final-y-gr.ts',
  'auditoria/15-rta-balistica.ts',
  'auditoria/16-final.ts',
  'auditoria/17-main-bytes.ts',
  'auditoria/18-linein-cola.ts',
  'auditoria/19-restaurar.ts',
  'auditoria/20-limpieza.ts',
  'auditoria/21-var-rta.ts',
  'auditoria/estado.ts',
  'p0-10b-vu/analizador.ts',
  'p0-10b-vu/barrido-testigo.ts',
  'p0-10b-vu/borrar-filtros-fijos.ts',
  'p0-10b-vu/borrar-instantanea-real.ts',
  'p0-10b-vu/bytes-del-bus-de-efecto.ts',
  'p0-10b-vu/cadencia-difusion.ts',
  'p0-10b-vu/calibrar-medidor-de-reduccion.ts',
  'p0-10b-vu/cola-secciones.ts',
  'p0-10b-vu/cola-sub-fx.ts',
  'p0-10b-vu/concurrencia-real.ts',
  'p0-10b-vu/donde-esta-el-pre.ts',
  'p0-10b-vu/dos-clientes.ts',
  'p0-10b-vu/encender-fantasma.ts',
  'p0-10b-vu/eq-vs-medidor.ts',
  'p0-10b-vu/escribir.ts',
  'p0-10b-vu/hay-pendrive.ts',
  'p0-10b-vu/latencia-snapshotlist.ts',
  'p0-10b-vu/ley-de-la-razon.ts',
  'p0-10b-vu/ley-envio-fx.ts',
  'p0-10b-vu/ley-fader.ts',
  'p0-10b-vu/ley-ganancia.ts',
  'p0-10b-vu/ley-rta-por-frecuencia.ts',
  'p0-10b-vu/leyes-del-compresor.ts',
  'p0-10b-vu/limpiar-afs-automaticos.ts',
  'p0-10b-vu/limpiar-supresor-del-general.ts',
  'p0-10b-vu/post-y-postproc.ts',
  'p0-10b-vu/preparar-lazo.ts',
  'p0-10b-vu/probar-escritura.ts',
  'p0-10b-vu/puerta-vs-medidor.ts',
  'p0-10b-vu/puntero-snapshot.ts',
  'p0-10b-vu/reduccion.ts',
  'p0-10b-vu/restaurar.ts',
  'p0-10b-vu/roles-bus.ts',
  'p0-10b-vu/rta-limpiar.ts',
  'p0-10b-vu/rta-sobre-buses.ts',
  'p0-10b-vu/rta-unidad.ts',
  'p0-10b-vu/ruido-rosa-por-el-aire.ts',
  'p0-10b-vu/shows.ts',
  'p0-10b-vu/subgrupo-pre-o-post.ts',
  'p0-10b-vu/techo-medidor.ts',
  'p0-10b-vu/testigo-dentro-del-tic.ts',
  'p0-10b-vu/tono-por-el-aire.ts',
  'p0-10b-vu/tres-clientes.ts',
  'p0-10b-vu/umbral-por-sustitucion.ts',
  'p0-2a/capacidades-que-faltan.ts',
  'p0-5/control-positivo-del-analizador.ts',
  'p0-5/donde-vive-una-realimentacion.ts',
  'p0-5/espectro-del-general.ts',
  'p0-5/lazo-por-el-previo.ts',
  'p0-8/alcance-recall.ts',
  'p0-8/eco-del-puntero.ts',
  'p0-8/retencion-y-borrado.ts',
  'p0-9/agrupacion-arrastre.ts',
  'p0-9/avalancha-real.ts',
  'p0-9/presencia-dos-clientes.ts',
  'p0-9/recall-diez-veces.ts',
  'p0-9/testigo-en-el-tic.ts',
]);


function archivosTs(dir: string, salida: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) archivosTs(p, salida);
    else if (e.name.endsWith('.ts')) salida.push(p);
  }
  return salida;
}

/** El código sin comentarios: la prosa de estos archivos habla del defecto. */
function soloCodigo(texto: string): string {
  return texto.split('\n').filter((l) => {
    const t = l.trim();
    return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
  }).join('\n');
}


function clasificar(): { escriben: string[]; conRestauracion: string[] } {
  const escriben: string[] = [];
  const conRestauracion: string[] = [];
  for (const ruta of archivosTs(GUIONES)) {
    const codigo = soloCodigo(readFileSync(ruta, 'utf8'));
    // **`.enviar(` a secas, no sólo `.enviar(codificarSetd(`.**
    //
    // El filtro anterior veía una sola forma de escribir y **32 guiones usaban
    // otras**: con plantilla, con la orden en una variable, con `SETS^var.rta^`.
    // Ninguno estaba en la lista y ninguno usaba `conRestauracion`. Entre ellos,
    // dos que **borran instantáneas reales**. Un detector que reconoce un modismo
    // y no un efecto cuenta lo que sabe buscar, no lo que pasa.
    if (!/\.enviar\(/.test(codigo)) continue;
    const rel = ruta.slice(GUIONES.length + 1);
    if (ES_LA_RESTAURACION.has(rel)) continue;
    escriben.push(rel);
    if (/conRestauracion\(/.test(codigo)) conRestauracion.push(rel);
  }
  return { escriben, conRestauracion };
}

test('ningun guion nuevo escribe a la consola sin restauracion garantizada', () => {
  const { escriben, conRestauracion } = clasificar();
  const sinCubrir = escriben.filter((f) => !conRestauracion.includes(f));
  const nuevos = sinCubrir.filter((f) => !SIN_CONVERTIR.has(f));
  deepStrictEqual(nuevos, [],
    'Estos guiones escriben a la consola y no usan conRestauracion. Un guion nuevo '
    + 'tiene que usarla: si el proceso muere, la consola queda escrita.\n'
    + nuevos.join('\n'));
});

/**
 * **El tamaño, con el número escrito.**
 *
 * Sin esto el trinquete se aflojaba agregando un nombre más: una auditoría lo
 * probó creando un guion que escribe sin `conRestauracion`, poniéndolo en la
 * lista, y viendo los dos tests en verde. El test que se llamaba «la lista sólo
 * encoge» comprobaba **la dirección contraria** —que un guion convertido salga—
 * y nada fijaba el tamaño.
 *
 * Cada conversión baja este número. Subirlo deja de ser una línea más en una
 * lista de setenta y cinco y pasa a ser un cambio que se ve en la revisión.
 */
test('la lista de pendientes tiene el tamaño que dice, y solo puede bajar', () => {
  deepStrictEqual(SIN_CONVERTIR.size, 75,
    'si esto sube, alguien agregó un guion que escribe sin restauración garantizada. '
    + 'Si baja, alguien convirtió uno y hay que actualizar el número en el mismo commit.');
});

test('el trinquete no puede aflojarse: la lista de pendientes solo encoge', () => {
  const { escriben, conRestauracion } = clasificar();
  const sinCubrir = new Set(escriben.filter((f) => !conRestauracion.includes(f)));

  // **Un guion que ya se convirtio tiene que salir de la lista**, en el mismo
  // commit. Si se queda, la lista deja de decir la verdad y el dia que alguien
  // la mire para saber cuanto falta va a contar de mas.
  const yaConvertidos = [...SIN_CONVERTIR].filter((f) => !sinCubrir.has(f));
  deepStrictEqual(yaConvertidos, [],
    'Estos ya usan conRestauracion (o dejaron de escribir) y siguen en SIN_CONVERTIR. '
    + 'Sacarlos de la lista en el mismo commit que los convierte.\n'
    + yaConvertidos.join('\n'));

  // Y el centinela: si el detector se rompe y no encuentra ningun guion que
  // escriba, los dos tests de arriba pasan celebrando el conjunto vacio. Es el
  // mismo centinela que el test de las rutas escribibles ya tiene.
  ok(escriben.length > 20,
    `solo se detectaron ${escriben.length} guiones que escriben, y son decenas: `
    + 'el detector esta roto y estos tests no estan probando nada');
});
