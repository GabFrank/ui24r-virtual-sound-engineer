/**
 * El camino de error que comparten los validadores de documentación.
 *
 * **Por qué vive en su propio archivo.** Estaba adentro de `validate-numeros.mjs`
 * y una auditoría midió el precio: `tools/docs/` no tiene suite y `lint:tools`
 * mira sólo archivos `.ts`, así que el camino de error era **código que nunca se
 * ejecutaba en su propio camino**. Dos defectos sembrados adentro lo demostraron:
 * un contador olvidado dejaba la guarda en verde con tres comprobaciones menos, y
 * un error de programación adentro de un `catch` reproducía exactamente el stack
 * de `node:fs` que todo esto vino a sacar. Acá se puede importar, y
 * `test/guarda.test.mjs` lo ejerce.
 *
 * Y sirve para lo que sigue: siete de los doce `validate-*.mjs` todavía mueren
 * con el ENOENT crudo de Node. Este módulo es de dónde van a sacar su mensaje.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

/**
 * Un problema que la guarda **sabe explicar**: se cuenta y se imprime como
 * frase, sin stack.
 *
 * Es deliberadamente distinto de «la cifra no cuadra». Un documento que miente se
 * corrige; una comprobación que no se pudo hacer obliga a decidir otra cosa
 * --mover la ruta, reescribir el patrón, o aceptar que esa cifra se quedó sin
 * quien la mire--.
 */
export class ProblemaDeLaGuarda extends Error {}

/**
 * Las tres lecturas que una guarda necesita, atadas a la raíz del repositorio y
 * con su error ya traducido.
 */
export function lectorDe(raiz) {
  const leer = (r) => {
    try {
      return readFileSync(join(raiz, r), 'utf8');
    } catch (e) {
      if (e?.code === 'ENOENT') {
        throw new ProblemaDeLaGuarda(
          `${r} no existe, y esta guarda cuenta algo que vive ahí.\n` +
          '  O se movió y hay que actualizar la ruta acá, o se borró y la cifra que\n' +
          '  sostenía dejó de tener quien la compruebe. Las dos cosas hay que decidirlas.',
        );
      }
      throw new ProblemaDeLaGuarda(`no se pudo leer ${r}: ${e?.message ?? e}`);
    }
  };

  const listar = (r) => {
    try {
      return readdirSync(join(raiz, r));
    } catch (e) {
      if (e?.code === 'ENOENT') {
        throw new ProblemaDeLaGuarda(
          `la carpeta ${r} no existe, y esta guarda cuenta lo que hay adentro.\n` +
          '  Si se movió, hay que actualizar la ruta acá; si se vació, la cifra que\n' +
          '  contaba dejó de significar lo mismo.',
        );
      }
      throw new ProblemaDeLaGuarda(`no se pudo listar ${r}: ${e?.message ?? e}`);
    }
  };

  /**
   * Corre una expresión contra un módulo TypeScript del repositorio y devuelve
   * el entero que imprime.
   *
   * **Existe porque contar texto no es contar.** La primera versión de la guarda
   * de rutas medidas contaba líneas `  medido(` con una expresión regular, y una
   * auditoría mostró lo que eso deja pasar: `raw-map.ts` ya promueve entradas a
   * `PROBADO` por otro camino --`{ ...deLaConsola(...), estado: 'PROBADO' }`-- y
   * una entrada así no la veía; al revés, colapsar una llamada a una sola línea
   * disparaba una falsa alarma sin cambiar una coma de la semántica.
   */
  const contarEjecutando = (modulo, expresion) => {
    let salida;
    try {
      salida = execFileSync(
        process.execPath,
        ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e',
          `const m = await import(${JSON.stringify(join(raiz, modulo))});\n`
          + `process.stdout.write(String(${expresion}));`],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      );
    } catch (e) {
      // Ejecutar abre una superficie que leer texto no tenía: el módulo puede no
      // existir, no compilar, o dejar de exportar la función. Las tres daban el
      // stack del proceso hijo, que no dice qué cifra quedó sin comprobar.
      //
      // **El error va, aunque no esté entre las primeras líneas.** Quedándose con
      // las tres primeras se veían la ruta, el código y el caret, y el `TypeError`
      // --lo único que dice qué pasó-- quedaba afuera por una línea.
      const lineas = String(e?.stderr ?? e?.message ?? e).trim().split('\n')
        .filter((l) => l.trim() !== '');
      const iError = lineas.findIndex((l) => /^[A-Za-z]*Error\b/.test(l.trim()));
      const detalle = (iError === -1 ? lineas.slice(0, 3) : [...lineas.slice(0, 2), lineas[iError]])
        .join('\n    ');
      throw new ProblemaDeLaGuarda(
        `no se pudo contar \`${expresion}\` sobre ${modulo}.\n` +
        `    ${detalle}\n` +
        '  Esta cifra se cuenta ejecutando el módulo, no leyendo su texto. Si el\n' +
        '  módulo se movió o dejó de exportar lo que se llama acá, hay que decidir\n' +
        '  quién cuenta esa cifra ahora.',
      );
    }
    const n = Number(salida.trim());
    if (!Number.isInteger(n)) {
      throw new ProblemaDeLaGuarda(
        `contar \`${expresion}\` sobre ${modulo} devolvió «${salida.trim()}», que no es un entero.`,
      );
    }
    return n;
  };

  return { leer, listar, contarEjecutando };
}

/**
 * **El centinela: una guarda que no vio nada no está en verde, está ciega.**
 *
 * Se midió el 2026-09-15 y es peor que morirse con un stack. Con la carpeta
 * `packages/` entera borrada, `validate-limites` imprimía «6 reglas, ninguna
 * violada» y salía con 0. `validate-huella-de-evidencia` hacía lo mismo sin
 * `docs/spikes`. Las dos decían la verdad literal --no encontraron ninguna
 * violación-- y la conclusión que el lector saca es falsa.
 *
 * Es la misma forma que `validate-numeros` ya corrigió con su piso, y la misma
 * que `rutas-de-los-tests.test.ts` tapa con `deepStrictEqual(claves.length,
 * 6732)`: **el mínimo se escribe a mano**. Un mínimo calculado de la misma lista
 * que se recorre encoge junto con ella y no es un mínimo.
 *
 * @param visto   cuántas cosas miró de verdad esta corrida
 * @param minimo  cuántas tiene que haber mirado, escrito a mano
 * @param que     qué son, para el mensaje: «documentos», «paquetes»…
 */
export function centinela(visto, minimo, que) {
  if (visto >= minimo) return;
  throw new ProblemaDeLaGuarda(
    `esta guarda miró ${visto} ${que} y tendría que haber mirado al menos ${minimo}.\n` +
    '  No encontrar problemas mirando de menos no es estar en verde: es estar\n' +
    '  ciega. O la fuente se movió, o el mínimo quedó viejo porque el proyecto\n' +
    '  encogió a propósito. Las dos hay que decidirlas, y ninguna es seguir.',
  );
}

/**
 * Corre `fn`. Si tira un `ProblemaDeLaGuarda`, llama a `alFallar` con él y
 * devuelve `false`; si no, devuelve `true`.
 *
 * **Cualquier otro error sigue subiendo, y es a propósito.** Un defecto de
 * programación de la guarda no se disfraza de comprobación que no se pudo hacer:
 * el stack es lo correcto ahí, porque el que tiene que arreglarlo es el que
 * escribió la guarda.
 */
export function intentar(fn, alFallar) {
  try {
    fn();
    return true;
  } catch (e) {
    if (!(e instanceof ProblemaDeLaGuarda)) throw e;
    alFallar(e);
    return false;
  }
}
