import { test } from 'node:test';
import { deepStrictEqual, ok } from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * **Lo que un guion escribe tiene que estar en su vuelta atras.**
 *
 * Las otras dos guardas de este tema miran cosas parecidas y ninguna mira esta:
 *
 * - `restauracion-garantizada` exige que el guion **use** `conRestauracion`.
 * - `escribir-sin-leer` exige que la clave se **lea** antes de escribirla.
 *
 * Las dos son estructurales, y un guion puede cumplirlas las dos y aun asi
 * dejarle una clave escrita al usuario: **basta con que la lista de restauracion
 * este incompleta**. Leer la clave y tener `try/finally` no sirve de nada si la
 * clave no esta en lo que el `finally` devuelve.
 *
 * ## El caso que la trajo, el 2026-09-16
 *
 * `ley-ganancia-del-eq.ts` paso de EXIGIR que la banda estuviera en 1000 Hz a
 * **colocarla**. Se agrego la escritura de `i.N.eq.bK.freq` y **no** se agrego la
 * clave a `PREVIO`. Resultado: las bandas 1, 3 y 4 del canal 10 quedaron las tres
 * en 1000 Hz en vez de sus 200, 4000 y 10000 de fabrica.
 *
 * Las dos guardas de arriba estaban en verde. La clave se leia --con
 * `exigirClave`-- y el guion usaba `conRestauracion`. Se descubrio de casualidad,
 * mirando el aparato por otro motivo.
 *
 * ## Como se comprueba, y por que asi
 *
 * Se toma **el cuerpo del primer argumento de `conRestauracion`** --la vuelta
 * atras-- y se expande con la definicion de las constantes que nombra. Toda clave
 * que el guion escriba tiene que aparecer ahi.
 *
 * Es deliberadamente textual y no semantico: no intenta entender qué valor se
 * devuelve, solo que **la clave este nombrada en el camino de vuelta**. Una
 * guarda que intentara mas seria mas fragil, y lo que se perdio en el caso real
 * fue justamente la mencion.
 *
 * **Y se probo contra su caso motivador**, que es lo que este repositorio exige
 * de cualquier guarda nueva: con la linea de `PREVIO` sacada, esto falla y nombra
 * `i.*.eq.b*.freq`; con la linea puesta, pasa.
 */
const COMANDO = /\.(clearall|clearfixed|clearlive|clearpeak)$|^var\.|^SNAPSHOT|^SHOW/;

/**
 * Guiones que escriben una clave que su vuelta atras no nombra.
 * **Solo puede encoger.**
 *
 * Son dos, y las dos son deuda vieja de instrumentos que ya no se vuelven a
 * correr. Si vas a correr uno de estos, arreglalo antes.
 */
const NO_DEVUELVEN_TODO: ReadonlySet<string> = new Set([
  'p0-10b-vu/banco-en-vivo.ts',
  'p0-10b-vu/ley-envio-aux.ts',
]);

/**
 * **Cuantas escrituras el detector NO puede resolver, y por que se dice.**
 *
 * Son escrituras cuyo primer argumento es una variable de bucle o una expresion
 * --`for (const [clave, valor] of destino) … codificarSetd(clave, valor)`--. Casi
 * todas son el bucle de restauracion, o sea justo lo contrario del problema.
 *
 * **No se callan.** Una guarda que ignora en silencio lo que no entiende no tiene
 * la cobertura que aparenta, y este repositorio ya se comio una asi. El numero se
 * escribe a mano: si sube, alguien agrego una escritura que esta guarda no mira,
 * y eso hay que verlo aunque no sea un error.
 *
 * **Subio a 33 el 2026-09-20, y se miro.** La nueva es el bucle que silencia todo
 * lo que entra al general salvo el canal que se mide, en
 * `p0-2b-eq/curvas-del-ecualizador.ts`, agregado porque una corrida fallo su
 * control de cierre y se sospecho de los microfonos abiertos del usuario. Esta
 * cubierta por cuatro lados, comprobados uno por uno antes de subir el numero:
 *
 * 1. las mismas claves se arman en `MUTES_PREVIOS` **leyendo el valor previo del
 *    aparato**, no suponiendolo, y entran enteras en `A_RESTAURAR`;
 * 2. `A_RESTAURAR` es lo que devuelve el `finally` de `conRestauracion`;
 * 3. queda anotado en disco con `anotarPendiente` **antes** de la primera
 *    escritura, asi que una muerte por senal deja el rastro;
 * 4. la relectura final por HTTP incluye esas claves, y el registro en disco
 *    **solo se borra si todas coinciden**.
 *
 * Es justo la clase de escritura para la que esta guarda existe --opaca al
 * detector y con consecuencias audibles: son los microfonos de su banda-- y por
 * eso se documenta en vez de subir el numero y seguir.
 */
const OPACAS_ESPERADAS = 33;

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

/** El cuerpo de la vuelta atras, con las definiciones de las constantes que nombra. */
function textoDeVuelta(c: string): string | null {
  const i = c.indexOf('conRestauracion(');
  if (i === -1) return null;
  let nivel = 0;
  let fin = -1;
  for (let j = i + 'conRestauracion'.length; j < c.length; j++) {
    const ch = c[j]!;
    if (ch === '(') nivel++;
    else if (ch === ')') { nivel--; if (nivel === 0) { fin = j; break; } }
  }
  if (fin === -1) return null;
  const args = c.slice(i + 'conRestauracion('.length, fin);
  let anid = 0;
  let corte = args.length;
  for (let k = 0; k < args.length; k++) {
    const ch = args[k]!;
    if ('([{'.includes(ch)) anid++;
    else if (')]}'.includes(ch)) anid--;
    else if (ch === ',' && anid === 0) { corte = k; break; }
  }
  let vuelta = args.slice(0, corte);
  for (const m of vuelta.matchAll(/\b([A-Z][A-Z0-9_]{2,})\b/g)) {
    const def = c.match(new RegExp(`const\\s+${m[1]!}[^=]*=([\\s\\S]*?);\\n`, 'm'));
    if (def !== null) vuelta += `\n${def[0]}`;
  }
  return vuelta;
}

/** `const A = 'x'` y las cadenas `const B = A`. */
function aliases(c: string): Map<string, string> {
  const alias = new Map<string, string>();
  for (const m of c.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*([`'"][^`'"]+[`'"])\s*;/g)) {
    alias.set(m[1]!, normalizar(m[2]!));
  }
  // **Las cadenas de nombres importan, y no es teorico.** En el caso real la
  // escritura era `codificarSetd(RUTA_FREQ, …)` con `const RUTA_FREQ =
  // RUTA_FRECUENCIA`. Sin resolver el salto, la escritura era invisible y la
  // guarda pasaba en verde sobre el defecto que existe para cazar.
  for (let v = 0; v < 5; v++) {
    for (const m of c.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\s*;/g)) {
      const de = alias.get(m[2]!);
      if (de !== undefined && !alias.has(m[1]!)) alias.set(m[1]!, de);
    }
  }
  return alias;
}

interface Resultado {
  conVuelta: string[];
  faltan: Map<string, string[]>;
  opacas: number;
}

function clasificar(): Resultado {
  const conVuelta: string[] = [];
  const faltan = new Map<string, string[]>();
  let opacas = 0;
  for (const ruta of archivosTs(GUIONES)) {
    const c = soloCodigo(readFileSync(ruta, 'utf8'));
    if (!/\.enviar\(/.test(c)) continue;
    const rel = ruta.slice(GUIONES.length + 1);
    const alias = aliases(c);
    const escritas = new Set<string>();
    for (const m of c.matchAll(
      /codificarSet[ds]\(\s*([A-Za-z_$][\w$]*|[`'"][^`'"]+[`'"])/g,
    )) {
      const t = m[1]!;
      if (/^[`'"]/.test(t)) escritas.add(normalizar(t));
      else if (alias.has(t)) escritas.add(alias.get(t)!);
      else opacas += 1;
    }
    const vuelta = textoDeVuelta(c);
    // Sin `conRestauracion` no hay vuelta que mirar: de eso se ocupa
    // `restauracion-garantizada`, con su propia lista.
    if (vuelta === null) continue;
    conVuelta.push(rel);
    const nombradas = new Set<string>();
    for (const m of vuelta.matchAll(/([A-Za-z_$][\w$]*|[`'"][^`'"]+[`'"])/g)) {
      const t = m[1]!;
      if (/^[`'"]/.test(t)) nombradas.add(normalizar(t));
      else if (alias.has(t)) nombradas.add(alias.get(t)!);
    }
    const sin = [...escritas].filter((k) => !nombradas.has(k) && !COMANDO.test(k));
    if (sin.length > 0) faltan.set(rel, sin);
  }
  return { conVuelta, faltan, opacas };
}

test('ningun guion nuevo escribe una clave que su vuelta atras no nombra', () => {
  const { faltan } = clasificar();
  const nuevos = [...faltan.keys()].filter((f) => !NO_DEVUELVEN_TODO.has(f));
  deepStrictEqual(nuevos.map((f) => `${f}: ${faltan.get(f)!.join(', ')}`), [],
    'Estos guiones escriben claves que su bloque de restauracion no nombra. Tener '
    + '`conRestauracion` y haber leido la clave no alcanza: si la clave no esta en '
    + 'la lista que el finally devuelve, se le queda escrita al usuario.');
});

test('la lista tiene el tamaño que dice, y solo puede bajar', () => {
  deepStrictEqual(NO_DEVUELVEN_TODO.size, 2,
    'si sube, alguien agrego un guion que no devuelve todo lo que escribe; si baja, '
    + 'alguien lo arreglo y hay que actualizar el numero en el mismo commit');
});

test('el trinquete no se afloja: lo arreglado sale de la lista', () => {
  const { faltan } = clasificar();
  deepStrictEqual([...NO_DEVUELVEN_TODO].filter((f) => !faltan.has(f)), [],
    'Estos ya devuelven todo lo que escriben y siguen en la lista. Sacarlos en el '
    + 'mismo commit que los arregla.');
});

test('lo que el detector no puede resolver se cuenta, no se calla', () => {
  const { opacas } = clasificar();
  deepStrictEqual(opacas, OPACAS_ESPERADAS,
    'son escrituras cuyo primer argumento es una variable de bucle o una expresion. '
    + 'Casi todas son el propio bucle de restauracion. Si el numero sube, alguien '
    + 'agrego una escritura que esta guarda NO mira, y eso hay que verlo.');
});

test('el detector encuentra algo: no celebra el conjunto vacio', () => {
  const { conVuelta, faltan } = clasificar();
  // **El minimo se escribe a mano**, que es la regla: uno calculado de la misma
  // lista que se recorre encoge junto con ella. Eran 30 el 2026-09-16.
  ok(conVuelta.length >= 30,
    `solo ${conVuelta.length} guiones tienen vuelta atras; el detector se rompio`);
  ok(faltan.size > 0, 'si esto llega a cero, sacar la guarda del trinquete y dejar la regla');
});
