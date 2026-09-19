#!/usr/bin/env node
/**
 * Ningún servicio de producción le pasa la lista vacía al historial de sesión.
 *
 * **El defecto que cierra, que estuvo abierto y en verde.** `historialDeLaSesion`
 * resuelve `medicionPosteriorId` contra la lista de mediciones que recibe, y con
 * eso decide si entre un paso y el siguiente **se escuchó de verdad**. Los dos
 * servicios de producción le pasaban `[]`, así que ninguna ruta quedaba nunca con
 * escucha comprobada y **el segundo paso de cualquier rampa se rechazaba**. Una
 * cuña se levanta en pasos de 2 dB escuchando entre uno y otro: el segundo no
 * llegaba nunca.
 *
 * **Por qué hace falta una guarda y no alcanza con un test.** La corrección es
 * cambiar un argumento en dos archivos. Un test del historial prueba que el
 * historial usa las mediciones —y sigue pasando aunque alguien vuelva a poner
 * `[]` en el servicio—; un test del servicio necesitaría montar el inyector de
 * Angular, que este repositorio no monta en ningún test. La guarda mira lo único
 * que importa: **qué se le pasa desde producción**.
 *
 * Y es del género que el proyecto ya tiene escrito: una comprobación que llega
 * después del hecho es un reproche, no una guarda. Ésta corre con `verificar`.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Dónde se mira: **`apps/` y `packages/` enteros**, no una lista de carpetas.
 *
 * Los tests quedan afuera a propósito —ahí `[]` es el caso a probar— y también
 * `node_modules` y `dist`.
 *
 * **La primera versión listaba tres carpetas a mano, y eso era un agujero.** Una
 * auditoría del 2026-09-19 copió el servicio con `[]` a un paquete que no estaba
 * en la lista, borró el original, y la guarda salió **en verde con el defecto
 * puesto**. Una guarda que sólo mira donde el defecto ya estuvo no protege del
 * defecto que se mueve, que es la mitad de las veces que se mueve un archivo.
 */
const ZONAS = ['apps', 'packages'];

const LLAMADA = 'historialDeLaSesion(';

/**
 * El segundo argumento de la llamada, en crudo.
 *
 * Se recorta por paréntesis balanceados y no con una expresión regular: el
 * primer argumento suele ser un `await this.diario.deLaSesion(sessionId)`, que
 * trae sus propios paréntesis, y un patrón perezoso cortaría en el lugar
 * equivocado y miraría el texto de al lado.
 */
function segundoArgumento(texto, desde) {
  let i = desde + LLAMADA.length;
  let nivel = 1;
  const args = [];
  let actual = '';
  for (; i < texto.length && nivel > 0; i++) {
    const c = texto[i];
    if (c === '(' || c === '[' || c === '{') nivel++;
    else if (c === ')' || c === ']' || c === '}') {
      nivel--;
      if (nivel === 0) break;
    }
    if (c === ',' && nivel === 1) { args.push(actual); actual = ''; continue; }
    actual += c;
  }
  args.push(actual);
  return args.length >= 2 ? args[1].trim() : null;
}

/**
 * Las formas de «lista vacía» que esta guarda reconoce.
 *
 * **La primera versión comparaba contra `'[]'` y nada más**, y una auditoría
 * adversarial del 2026-09-19 la burló por cinco vías: `[ ]` con un espacio,
 * `[] as readonly Measurement[]`, `new Array()`, un `[]` con un comentario
 * pegado, y una variable local que valiera `[]`. Cinco formas del mismo defecto y
 * la guarda cazaba una: **exactamente la que ya había ocurrido**.
 *
 * Es el defecto que el propio proyecto tiene nombrado —una guarda que cubre su
 * caso motivador y nada más es decorado— cometido al escribir la guarda.
 *
 * **Lo que sigue sin cazar, dicho con todas las letras:** una variable local que
 * valga `[]`, o cualquier expresión que devuelva una lista vacía en tiempo de
 * ejecución. Para eso haría falta analizar el flujo, no el texto. Lo que esta
 * guarda sí garantiza es que **escribir el vacío en el sitio de la llamada** se
 * ve, que es la forma en que el defecto ocurrió y la forma en que un descuido
 * vuelve a ocurrir.
 */
const VACIOS = new Set(['[]', 'newArray()', 'newArray<>()', 'Array()', '[...[]]']);

/**
 * Deja el argumento en su forma comparable: sin comentarios, sin espacios y sin
 * la aserción de tipo de la cola.
 */
function normalizar(arg) {
  if (arg === null) return null;
  let t = arg
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .trim();
  // `x as T`, `x as readonly T[]`, `x satisfies T`, `<T>x`.
  t = t.replace(/\s+(as|satisfies)\s+[^,]*$/, '').trim();
  t = t.replace(/^<[^>]*>/, '').trim();
  return t.replace(/\s+/g, '');
}

/** Los `.ts` de una carpeta, recursivo, sin `node_modules` ni tests. */
function archivos(dir) {
  const salida = [];
  let entradas;
  try {
    entradas = readdirSync(dir);
  } catch {
    // Una zona que no existe **es un error y no un silencio**: si alguien mueve
    // una carpeta, la guarda tiene que decirlo en vez de dejar de mirar. Es el
    // defecto que `validate-cifras-medidas` pagó con una cita rota.
    throw new Error(
      `la zona '${relative(RAIZ, dir)}' no existe. Si se movió, hay que ` +
      `actualizar ZONAS en esta guarda: si no, deja de mirar y nadie se entera.`,
    );
  }
  for (const e of entradas) {
    const ruta = join(dir, e);
    if (statSync(ruta).isDirectory()) {
      if (e === 'node_modules' || e === 'test') continue;
      salida.push(...archivos(ruta));
    } else if (e.endsWith('.ts') && !e.endsWith('.test.ts')) {
      salida.push(ruta);
    }
  }
  return salida;
}

let mirados = 0;
const problemas = [];

for (const zona of ZONAS) {
  for (const ruta of archivos(join(RAIZ, zona))) {
    // **Los comentarios se quitan antes de buscar.** El centinela de abajo se
    // satisfacía con una sola línea de comentario que mencionara la función:
    // renombrando la función de verdad y dejando la mención, la guarda volvía a
    // verde comprobando cero llamadas. Es el mismo «contador olvidado» que esta
    // guarda dice estar evitando, cometido adentro.
    const texto = readFileSync(ruta, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    let desde = 0;
    for (;;) {
      const i = texto.indexOf(LLAMADA, desde);
      if (i === -1) break;
      desde = i + 1;
      // La definición de la función no es una llamada.
      if (/(function|export)\s*$/.test(texto.slice(Math.max(0, i - 20), i))) continue;
      mirados++;
      const arg = normalizar(segundoArgumento(texto, i));
      if (arg === null) {
        problemas.push(`${relative(RAIZ, ruta)}: la llamada no tiene segundo argumento.`);
      } else if (VACIOS.has(arg)) {
        problemas.push(
          `${relative(RAIZ, ruta)}: le pasa la lista vacía de mediciones al historial. ` +
          `Con la lista vacía ninguna ruta queda con escucha comprobada y el segundo ` +
          `paso de cualquier rampa se rechaza. Hay que pasarle las mediciones de la ` +
          `sesión (MedicionesService.deLaSesion).`,
        );
      }
    }
  }
}

// **Que la guarda no se quede sin nada que mirar.** Si un refactor renombra la
// función, los bucles de arriba no encuentran nada y el script sale en verde
// habiendo comprobado cero cosas. Es el defecto del contador olvidado que una
// auditoría ya midió en `tools/docs/`.
if (mirados === 0) {
  console.error(
    'guarda de mediciones: cero llamadas a historialDeLaSesion en las zonas miradas. ' +
    'O se renombró la función, o se movió el código: en los dos casos esta guarda ' +
    'dejó de proteger y hay que actualizarla.',
  );
  process.exit(1);
}

if (problemas.length > 0) {
  console.error(`guarda de mediciones: ${problemas.length} problema(s).`);
  for (const p of problemas) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(`guarda de mediciones: ${mirados} llamada(s) revisada(s), ninguna con lista vacía.`);
