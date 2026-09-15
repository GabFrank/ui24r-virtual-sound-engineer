import { test } from 'node:test';
import { deepStrictEqual } from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * **Ningún guion restaura la consola a un valor que supuso.**
 *
 * El defecto que esta guarda cierra, encontrado por una auditoría de
 * instrumentos el 2026-09-12: `estadoPorHttp` devuelve un **mapa vacío** ante
 * cualquier falla —el `fetch` que no conecta, el cuerpo nulo, el plazo que
 * corta antes del primer trozo—. Cuatro guiones del compresor leían así
 * `m.afs.enabled`, caían al valor por omisión `'1'` con `??`, imprimían
 * «estaba en 1» **como si lo hubieran medido**, y al restaurar **encendían** el
 * supresor de realimentación.
 *
 * Lo que eso le hace al usuario: deja encendido el único de cuarenta y cinco
 * campos que una instantánea **no** devuelve, en el bus general, después de una
 * medición que él no vio. Y el registro de la corrida dice que lo restauró.
 *
 * **Por qué un test y no una nota en el módulo.** Porque es la tercera vez que
 * la misma forma aparece en este proyecto —«un control que sólo puede
 * confirmar»— y las dos anteriores tenían su nota escrita. `?? valor` no es un
 * valor por omisión cuando lo que sigue es una escritura a la consola: es una
 * suposición disfrazada de lectura. La forma de que no vuelva es que algo falle
 * cuando vuelva.
 *
 * **Las dos formas que busca**, que son las dos en que un valor supuesto llega
 * al cable:
 *
 * 1. **Directa.** El `??` está dentro de la escritura:
 *    `codificarSetd('k', previos.get('k') ?? 0)`.
 * 2. **Por variable.** El `??` se guarda y la variable se escribe después:
 *    `const afsAntes = crudo.get('m.afs.enabled') ?? 1; … codificarSetd(…, afsAntes)`.
 *
 * **Y lo que deja pasar a propósito: imprimir.** `previos.get('k') ?? 'sin
 * dato'` dentro de un `console.log` es honesto —dice que no hay dato— y no
 * escribe nada. La primera versión de esta guarda los marcaba a todos porque
 * miraba si la clave se escribía *en algún lado del archivo*, y eso dio nueve
 * falsos positivos sobre dieciocho hallazgos: un control que marca lo inocuo
 * junto con lo peligroso se apaga, y entonces no protege de nada.
 *
 * **Lo que NO ve**, declarado para que nadie lo crea más fuerte de lo que es: un
 * guion que lea en un archivo y escriba en otro; y una variable que pase por un
 * intermediario antes de la escritura. La lista de exentos es explícita y corta,
 * y cada exención tiene que decir por qué.
 */

const RAIZ = join(import.meta.dirname, '..', '..', '..');
const GUIONES = join(RAIZ, 'tools', 'spikes');

/**
 * Claves que un guion puede leer con valor por omisión sin que sea una
 * suposición peligrosa.
 *
 * Vacía a propósito. Si alguna vez hace falta una, va acá **con su razón**, no
 * relajando el criterio: una exención con nombre se puede discutir; un criterio
 * más flojo, no.
 */
const EXENTAS: ReadonlyMap<string, string> = new Map();

function archivosTs(dir: string): string[] {
  const salida: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) salida.push(...archivosTs(p));
    else if (e.name.endsWith('.ts')) salida.push(p);
  }
  return salida;
}

/**
 * Las líneas de código, sin comentarios, **con su número de archivo**.
 *
 * El número va pegado porque la primera versión informaba el índice dentro del
 * arreglo filtrado, o sea un número que no existe en ningún archivo. Un
 * hallazgo con la ubicación equivocada cuesta más que ninguno: manda a mirar
 * otra línea y hace dudar del hallazgo entero.
 */
function soloCodigo(texto: string): { n: number; texto: string }[] {
  return texto.split('\n')
    .map((texto, i) => ({ n: i + 1, texto }))
    .filter(({ texto: l }) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    });
}

test('ningún guion restaura una clave cuyo valor previo supuso con ??', () => {
  const culpables: string[] = [];

  for (const ruta of archivosTs(GUIONES)) {
    const lineas = soloCodigo(readFileSync(ruta, 'utf8'));
    const codigo = lineas.map((l) => l.texto).join('\n');
    const rel = ruta.slice(RAIZ.length + 1);

    // Los argumentos de cada escritura, para buscar variables adentro.
    const argumentosEscritos = [...codigo.matchAll(/codificarSet[ds]\(([^;]*?)\)\s*[),;]/g)]
      .map((m) => m[1]!).join('\n');

    for (const { n: i, texto: linea } of lineas) {
      const lectura = /\.get\(\s*(?:'([^']+)'|`([^`]+)`)\s*\)\s*\?\?/.exec(linea);
      if (lectura === null) continue;
      const clave = (lectura[1] ?? lectura[2]!).replace(/\$\{[^}]*\}/g, '');
      if (EXENTAS.has(clave)) continue;

      // Forma 1: el ?? está dentro de la escritura, en esta misma línea.
      if (/codificarSet[ds]\(/.test(linea)) {
        culpables.push(
          `${rel}:${i} escribe ${JSON.stringify(clave)} con un valor supuesto `
          + 'por ?? en la misma linea. Usar exigirClave().',
        );
        continue;
      }

      // Forma 2: se guarda en una variable y la variable se escribe después.
      const asignacion = /^\s*const\s+([A-Za-z_$][\w$]*)\s*=/.exec(linea);
      if (asignacion === null) continue;
      const nombre = asignacion[1]!;
      if (new RegExp(`\\b${nombre}\\b`).test(argumentosEscritos)) {
        culpables.push(
          `${rel}:${i} ${nombre} sale de ${JSON.stringify(clave)} con ?? y despues `
          + 'se escribe a la consola. Usar exigirClave().',
        );
      }
    }
  }

  deepStrictEqual(culpables, [],
    'Un guion que restaura una clave tiene que haberla leido, no supuesto:\n'
    + culpables.join('\n'));
});

test('la lectura exigente existe y tiene un umbral de credibilidad', () => {
  const texto = readFileSync(join(GUIONES, 'canal-muerto.ts'), 'utf8');
  // El umbral tiene que ser un número de al menos tres cifras: el volcado de
  // esta consola trae del orden de 6600 claves, y lo que hay que distinguir es
  // «leí» de «no leí». Un umbral de 1 o de 0 no distinguiría nada.
  const m = /CLAVES_MINIMAS_PLAUSIBLES = (\d+)/.exec(texto);
  deepStrictEqual(m !== null, true, 'falta CLAVES_MINIMAS_PLAUSIBLES en canal-muerto.ts');
  deepStrictEqual(Number(m![1]) >= 100, true,
    `el umbral de credibilidad es ${m![1]}, y con eso una lectura fallida pasa por real`);
  deepStrictEqual(/export async function estadoPorHttpExigido/.test(texto), true,
    'falta estadoPorHttpExigido, que es la que puede fallar');
  deepStrictEqual(/export function exigirClave/.test(texto), true,
    'falta exigirClave, que distingue la clave ausente de la lectura fallida');
});
