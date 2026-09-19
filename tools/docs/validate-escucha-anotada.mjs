#!/usr/bin/env node
/**
 * La aplicación guarda lo que escucha, y anota en la transacción cuál fue.
 *
 * **El defecto que cierra, que estuvo abierto y en verde.** El motor de seguridad
 * exige una medición entre un cambio y el siguiente sobre el mismo parámetro y la
 * resuelve contra la tabla `measurement`, pidiendo el identificador exacto que la
 * transacción declara en `medicionPosteriorId`. Hasta el 2026-09-19 la aplicación
 * medía después de aplicar —para contarle al usuario si había servido—, **tiraba
 * la ventana y no anotaba nada**, así que el segundo ajuste sobre el mismo canal
 * se rechazaba siempre con `SIN_MEDICION_INTERMEDIA`.
 *
 * Son **dos mitades y ninguna sirve sola**: una tabla llena de mediciones con
 * `medicionPosteriorId` en nulo da el mismo veredicto que la tabla vacía, y una
 * transacción que anota un identificador que no se guardó, también. Por eso esta
 * guarda mira las dos.
 *
 * **Por qué hace falta una guarda y no alcanza con un test.** Las dos mitades son
 * una línea cada una, en un servicio y en un componente de Angular. Los tests de
 * la cadena —`la-escucha-se-guarda-y-se-anota.test.ts`— prueban el mapeo, el SQL
 * real y el veredicto del motor, y **siguen pasando enteros si alguien borra
 * cualquiera de las dos llamadas**: probarían la maquinaria con nadie usándola.
 * Un test del servicio necesitaría montar el inyector de Angular, que este
 * repositorio no monta en ningún test. La guarda mira lo único que importa: **que
 * producción siga llamando**.
 *
 * Es del mismo género que `validate-mediciones-al-historial.mjs`, y por el mismo
 * motivo escrito: una comprobación que llega después del hecho es un reproche, no
 * una guarda. Ésta corre con `verificar`.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { centinela, intentar, ProblemaDeLaGuarda } from './guarda.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Dónde se mira: **`apps/` y `packages/` enteros**, no una lista de carpetas.
 *
 * Lo aprendió la guarda de al lado por la vía cara: listaba tres carpetas a mano,
 * una auditoría movió el archivo con el defecto a un paquete que no estaba en la
 * lista, y **la guarda salió en verde con el defecto puesto**. Una guarda que sólo
 * mira donde el defecto ya estuvo no protege del defecto que se mueve.
 */
const ZONAS = ['apps', 'packages'];

/**
 * Las dos mitades, cada una con lo que hay que encontrar y qué se rompe si no
 * está.
 *
 * **Se busca la LLAMADA y no el nombre**, y la primera versión de esta guarda
 * buscaba el nombre: contaba dos aciertos de `anotarEscucha` —la definición del
 * método y la llamada del componente— así que **borrar la llamada dejaba uno y la
 * guarda seguía en verde con el defecto puesto**. Es el agujero que esta guarda
 * dice tapar, cometido al escribirla, y es la tercera vez en el repositorio: una
 * guarda que no cubre su caso motivador es decorado.
 *
 * El punto de adelante es lo que las distingue: una llamada a un método es
 * `this.algo.anotarEscucha(`, y **una definición nunca lleva punto**.
 *
 * Renombrar una de estas funciones deja la guarda sin nada que mirar, y eso **no
 * la deja en verde**: el conteo en cero es un error, que es la decisión correcta
 * —quien renombra tiene que decir quién protege ahora ese cableado—.
 */
const MITADES = [
  {
    que: 'guardar la escucha',
    // La define el asistente de captura y la llama él mismo, así que basta con que
    // la llamada exista: lo que se vigila es que el resultado de la captura siga
    // pasando por ahí.
    patron: /\.\s*guardarLaEscucha\s*\(/,
    porque:
      'nadie guarda la ventana que se acaba de escuchar. Sin fila en `measurement` el ' +
      'motor no tiene qué resolver, y el ajuste siguiente sobre el mismo canal se ' +
      'rechaza con SIN_MEDICION_INTERMEDIA aunque el músico haya tocado.',
  },
  {
    que: 'anotar la escucha en la transacción',
    patron: /\.\s*anotarEscucha\s*\(/,
    porque:
      'nadie le dice al motor cuál fue la medición. El motor no busca «alguna ' +
      'medición posterior»: resuelve el identificador que la transacción declara, así ' +
      'que sin anotarlo la tabla llena da el mismo veredicto que la tabla vacía.',
  },
];

/**
 * Y la tercera comprobación, que no es una llamada sino el contenido.
 *
 * `anotarEscucha` podría existir, llamarse, y **no escribir el campo**: quedaría
 * un nombre que promete algo que no hace, que es la forma de defecto que este
 * repositorio ya encontró en un test cuyo nombre afirmaba lo que no probaba.
 */
const CAMPO = 'medicionPosteriorId';

/** Los `.ts` de una carpeta, recursivo, sin `node_modules` ni tests. */
function archivos(dir) {
  const salida = [];
  let entradas;
  try {
    entradas = readdirSync(dir);
  } catch {
    throw new ProblemaDeLaGuarda(
      `la zona '${relative(RAIZ, dir)}' no existe. Si se movió, hay que actualizar ` +
      'ZONAS en esta guarda: si no, deja de mirar y nadie se entera.',
    );
  }
  for (const e of entradas) {
    const ruta = join(dir, e);
    if (statSync(ruta).isDirectory()) {
      if (e === 'node_modules' || e === 'test' || e === 'dist') continue;
      salida.push(...archivos(ruta));
    } else if (e.endsWith('.ts') && !e.endsWith('.test.ts')) {
      salida.push(ruta);
    }
  }
  return salida;
}

/**
 * El texto sin comentarios.
 *
 * **Es lo que impide que la guarda se satisfaga con una mención.** La guarda de al
 * lado se conformaba con una línea de comentario que nombrara la función: se podía
 * renombrar la función de verdad, dejar el comentario, y la guarda volvía a verde
 * comprobando cero llamadas.
 */
function sinComentarios(texto) {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const problemas = [];

const ok = intentar(() => {
  let mirados = 0;
  const encontrados = new Map(MITADES.map((m) => [m.que, 0]));
  let campoEscrito = 0;

  for (const zona of ZONAS) {
    for (const ruta of archivos(join(RAIZ, zona))) {
      mirados++;
      const texto = sinComentarios(readFileSync(ruta, 'utf8'));

      for (const mitad of MITADES) {
        for (const linea of texto.split('\n')) {
          if (mitad.patron.test(linea)) {
            encontrados.set(mitad.que, encontrados.get(mitad.que) + 1);
          }
        }
      }

      // El campo, escrito y no sólo declarado. `packages/safety` lo declara y lo
      // nace en nulo: lo que hace falta es que **la aplicación** lo escriba.
      if (zona === 'apps' && texto.includes(CAMPO)) campoEscrito++;
    }
  }

  // **El centinela, porque una guarda que no vio nada no está en verde: está
  // ciega.** El mínimo va a mano: uno calculado de lo que se recorre encoge junto
  // con ello y no es un mínimo.
  centinela(mirados, 100, 'archivos de producción');

  for (const mitad of MITADES) {
    if (encontrados.get(mitad.que) === 0) {
      problemas.push(
        `nadie llama a lo que hace «${mitad.que}» en producción: ${mitad.porque}`,
      );
    }
  }

  if (campoEscrito === 0) {
    problemas.push(
      `ningún archivo de la aplicación menciona ${CAMPO}. El campo lo declara el ` +
      'paquete de seguridad y nace en nulo; quien lo tiene que escribir es la ' +
      'aplicación, cuando la escucha ocurre.',
    );
  }

  console.log(
    `guarda de la escucha: ${mirados} archivo(s) de producción, ` +
    MITADES.map((m) => `${m.que}: ${encontrados.get(m.que)} llamada(s)`).join(', ') +
    `, ${CAMPO} en ${campoEscrito} archivo(s) de la aplicación.`,
  );
}, (e) => problemas.push(e.message));

if (problemas.length > 0) {
  console.error(`guarda de la escucha: ${problemas.length} problema(s).`);
  for (const p of problemas) console.error(`  - ${p}`);
  process.exit(1);
}

if (!ok) process.exit(1);
