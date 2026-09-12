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
const SIN_CONVERTIR: ReadonlySet<string> = new Set([
  'p0-10b-vu/aux-senal.ts',
  'p0-10b-vu/barrido-testigo.ts',
  'p0-10b-vu/borrar-filtros-fijos.ts',
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
  'p0-10b-vu/puerta-vs-medidor.ts',
  'p0-10b-vu/reduccion.ts',
  'p0-10b-vu/roles-bus.ts',
  'p0-10b-vu/rta-sobre-buses.ts',
  'p0-10b-vu/ruido-rosa-por-el-aire.ts',
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
    if (!/\.enviar\(codificarSet[ds]\(/.test(codigo)) continue;
    const rel = ruta.slice(GUIONES.length + 1);
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
