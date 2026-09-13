import { test } from 'node:test';
import { deepStrictEqual, ok } from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * **Una clave que un guion escribe y nunca leyo no se puede restaurar.**
 *
 * No es una inferencia sobre la intencion: es un hecho. Si el guion nunca
 * pregunto cuanto valia, no tiene con que devolverla, y lo que ponga al terminar
 * sale de su cabeza. Eso deja la consola en un estado que **nunca existio**, que
 * es peor que dejarla escrita: nadie se entera.
 *
 * **Por que hace falta otra guarda.** `restaurar-sin-adivinar` ya cierra la forma
 * `?? valor` --una suposicion disfrazada de lectura-- pero busca el `??`, y la
 * otra mitad de la deuda usa **literales**: `codificarSetd('hw.9.gain',
 * 0.2508445026)`. El valor era cierto en un banco de hace dias.
 *
 * Y esta noche costo caro de la forma mas directa: al restaurar el supresor del
 * general con un valor escrito a mano se plantaron cuatro filtros, y limpiarlos
 * se llevo tres del usuario. **No se escribieron de vuelta** justamente por esta
 * regla: el Q no estaba en ningun registro, y restaurar con un valor inferido es
 * lo que esta guarda existe para impedir.
 *
 * **Los disparadores quedan afuera, con su razon.** `m.afs.clearall`,
 * `clearfixed`, `clearlive` y `var.rta` no son estado: se escriben para pedir
 * algo, no para fijar un valor, y no hay nada que devolver. Confundirlos con
 * estado haria que la guarda acuse lo que no puede arreglarse.
 */
const COMANDO = /\.(clearall|clearfixed|clearlive|clearpeak)$|^var\.|^SNAPSHOT|^SHOW/;

/**
 * Guiones que escriben alguna clave de estado sin leerla. **Solo puede encoger.**
 *
 * Convertir veintiuno de golpe es un cambio mecanico grande sobre codigo que
 * habla con un aparato real, y romper un instrumento en silencio es peor que la
 * deuda que arregla. La lista impide que crezca y obliga a sacar de ella lo que
 * se convierta, en el mismo commit.
 */
const ESCRIBEN_SIN_LEER: ReadonlySet<string> = new Set([
  'p0-10b-vu/borrar-filtros-fijos.ts',
  'p0-10b-vu/bytes-del-bus-de-efecto.ts',
  'p0-10b-vu/calibrar-medidor-de-reduccion.ts',
  'p0-10b-vu/donde-esta-el-pre.ts',
  'p0-10b-vu/eq-vs-medidor.ts',
  'p0-10b-vu/ley-de-la-razon.ts',
  'p0-10b-vu/ley-envio-aux.ts',
  'p0-10b-vu/ley-envio-fx.ts',
  'p0-10b-vu/ley-ganancia.ts',
  'p0-10b-vu/leyes-del-compresor.ts',
  'p0-10b-vu/limpiar-supresor-del-general.ts',
  'p0-10b-vu/post-y-postproc.ts',
  'p0-10b-vu/preparar-lazo.ts',
  'p0-10b-vu/puerta-vs-medidor.ts',
  'p0-10b-vu/reduccion.ts',
  'p0-10b-vu/rta-sobre-buses.ts',
  'p0-10b-vu/subgrupo-pre-o-post.ts',
  'p0-10b-vu/techo-medidor.ts',
  'p0-10b-vu/umbral-por-sustitucion.ts',
]);

const RAIZ = join(import.meta.dirname, '..', '..', '..');
const GUIONES = join(RAIZ, 'tools', 'spikes');

function archivosTs(dir: string, salida: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) archivosTs(p, salida);
    else if (e.name.endsWith('.ts')) salida.push(p);
  }
  return salida;
}

const soloCodigo = (t: string): string => t.split('\n').filter((l) => {
  const x = l.trim();
  return !x.startsWith('//') && !x.startsWith('*') && !x.startsWith('/*');
}).join('\n');

/** `i.${n}.aux.${a}.value` y `i.9.aux.4.value` son la misma clave para esto. */
const normalizar = (k: string): string =>
  k.replace(/\$\{[^}]*\}/g, '*').replace(/^[`'"]|[`'"]$/g, '');

function clasificar(): { escriben: string[]; sinLeer: Map<string, string[]> } {
  const escriben: string[] = [];
  const sinLeer = new Map<string, string[]>();
  for (const ruta of archivosTs(GUIONES)) {
    const codigo = soloCodigo(readFileSync(ruta, 'utf8'));
    if (!/\.enviar\(/.test(codigo)) continue;
    const rel = ruta.slice(GUIONES.length + 1);
    escriben.push(rel);
    const esc = new Set([...codigo.matchAll(/codificarSet[ds]\(\s*([`'"][^`'"]+[`'"])/g)]
      .map((m) => normalizar(m[1]!)));
    const lei = new Set([...codigo.matchAll(
      /(?:exigirClave\([^,]+,\s*|\.get\(\s*)([`'"][^`'"]+[`'"])/g,
    )].map((m) => normalizar(m[1]!)));
    const faltan = [...esc].filter((k) => !lei.has(k) && !COMANDO.test(k));
    if (faltan.length > 0) sinLeer.set(rel, faltan);
  }
  return { escriben, sinLeer };
}

test('ningun guion nuevo escribe una clave de estado que no leyo', () => {
  const { sinLeer } = clasificar();
  const nuevos = [...sinLeer.keys()].filter((f) => !ESCRIBEN_SIN_LEER.has(f));
  deepStrictEqual(nuevos.map((f) => `${f}: ${sinLeer.get(f)!.join(', ')}`), [],
    'Estos guiones escriben claves de estado que nunca leyeron del aparato. Sin la '
    + 'lectura no hay con que restaurarlas, y lo que pongan al terminar sale de su '
    + 'cabeza.');
});

test('la lista tiene el tamaño que dice, y solo puede bajar', () => {
  deepStrictEqual(ESCRIBEN_SIN_LEER.size, 19,
    'si sube, alguien agrego un guion que escribe a ciegas; si baja, alguien lo '
    + 'convirtio y hay que actualizar el numero en el mismo commit');
});

test('el trinquete no se afloja: lo convertido sale de la lista', () => {
  const { sinLeer } = clasificar();
  const yaNoEstan = [...ESCRIBEN_SIN_LEER].filter((f) => !sinLeer.has(f));
  deepStrictEqual(yaNoEstan, [],
    'Estos ya leen todo lo que escriben (o dejaron de escribir) y siguen en la '
    + 'lista. Sacarlos en el mismo commit que los convierte.');
});

test('el detector encuentra algo: no celebra el conjunto vacio', () => {
  const { escriben, sinLeer } = clasificar();
  ok(escriben.length > 70, `solo ${escriben.length} guiones escriben; el detector se rompio`);
  ok(sinLeer.size > 0, 'si esto llega a cero, sacar la guarda del trinquete y dejar la regla');
});
