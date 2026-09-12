import { test } from 'node:test';
import { deepStrictEqual } from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * **Ninguna ruta que la consola no manda, en ningún lado, salvo las declaradas.**
 *
 * El defecto ya apareció cuatro veces: se escribe una ruta a mano, el
 * clasificador la agarra por prefijo, y el código o el test pasa **probando el
 * patrón y no el protocolo**. Así vivieron meses `m.eq.b1.gain`,
 * `m.delay.time`, `afs2.enable` e `i.24.aux.6.value` --un canal que esta consola
 * no tiene-- y así llegó a producción `m.mute`, que el panel de telemetría
 * traducía a «el silencio general» cuando el general no tiene silencio.
 *
 * **La primera versión de esta guarda no habría visto ese último**, y una
 * auditoría lo midió: atrapaba 3 de 10 formas de colar una ruta. Barría sólo
 * `packages/` --el bug vivía en `apps/`--, miraba sólo comillas simples, y
 * **salteaba los prefijos de fuente**, que es la clase exacta del bug que decía
 * haber cerrado.
 *
 * Ahora barre **código y tests, en todo el repositorio**, mira las tres formas
 * de literal, y **valida los índices contra los rangos reales** en vez de
 * saltearlos. Medido con ocho formas de colar una ruta inventada: **atrapa
 * siete**. La que falta está declarada abajo, con su precio.
 */

const RAIZ = join(import.meta.dirname, '..', '..', '..');
const INVENTARIO = join(RAIZ, 'docs', 'inventario', '3.4.8318-ui24-2026-09-11', 'keys-observed.txt');

/**
 * Hasta dónde llega el índice de cada familia, según el inventario.
 *
 * Se calcula, no se escribe: una tabla a mano envejece con el firmware.
 */
function rangos(claves: readonly string[]): ReadonlyMap<string, number> {
  const max = new Map<string, number>();
  for (const k of claves) {
    const m = /^([a-z]+)\.(\d+)\b/.exec(k);
    if (m === null) continue;
    const n = Number(m[2]);
    if (n > (max.get(m[1]!) ?? -1)) max.set(m[1]!, n);
  }
  return max;
}

/**
 * Rutas fabricadas **a propósito**, cada una con su motivo.
 *
 * Una lista de excepciones sin motivo se convierte en el lugar donde se esconde
 * lo que molesta. Si algo entra acá, entra con su razón escrita.
 */
const DELIBERADAS = new Map<string, string>([
  ['a.30.eq.peak.12', 'el borde del prefijo: `a.30` no es `a.3`, y hay que probarlo'],
  ['m.eq.b3.gain', 'la clausula de Q de INV-004 solo se dispara sobre un parametrico '
    + 'de salida, que la Ui24R no tiene. El test dice cual es la forma que la activa'],
  ['m.eq.easy', 'una asercion NEGATIVA: que una ruta inexistente en el general se '
    + 'rechace. Existe como `l.N.eq.easy` y `i.N.eq.easy`, no como `m.eq.easy`'],
  ['i.mix', 'una ruta MAL FORMADA a proposito: familia sin indice de canal'],

  // **Las cinco de abajo existen para probar que NO se escriben.** Son las que
  // pasaban la lista blanca de ADR-028 cuando era `/^i\.\d+\.aux\.\d+\.value$/`
  // con `\d+` sin cota, y las encontro una auditoria de seguridad. Que no esten
  // en el inventario es exactamente el punto: el motor tiene que rechazarlas.
  //
  // Este test las atrapo al agregarlas, que es la interaccion buena entre dos
  // guardas: una impide inventar rutas y la otra prueba que las inventadas se
  // rechacen, asi que la segunda tiene que declararse ante la primera.
  ['i.24.aux.0.value', 'esta consola tiene 24 canales, 0 a 23. Prueba que el canal '
    + 'fuera de rango se rechace en vez de escribirse a ciegas'],
  ['i.99.aux.99.value', 'los dos indices fuera de rango a la vez'],
  ['i.3.aux.10.value', 'hay 10 auxiliares, 0 a 9: el borde de arriba'],
  ['i.03.aux.1.value', 'el ALIAS con cero a la izquierda. Es la misma ruta que suena '
    + 'en la sala y el estado por ruta se indexa por cadena cruda, asi que con la '
    + 'guarda vieja esquivaba el techo puesto en `i.3.aux.1.value`'],
  ['i.0003.aux.0000000001.value', 'el mismo alias llevado al extremo'],
]);

/** Los archivos donde puede esconderse una ruta: código y pruebas, no compilados. */
function fuentes(dir: string, salida: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === 'dist' || n === '.git' || n === 'android') continue;
    const r = join(dir, n);
    if (statSync(r).isDirectory()) fuentes(r, salida);
    else if (/\.ts$/.test(n) && !/\.d\.ts$/.test(n)) salida.push(r);
  }
  return salida;
}

test('ninguna ruta fabricada, ni en los tests ni en el codigo', () => {
  const claves = readFileSync(INVENTARIO, 'utf8').trim().split('\n');
  // **Centinela.** Sin esto, un inventario vacío haría que este test celebrara
  // el conjunto vacío — que es como pasaban dos tests hermanos hasta hace un
  // rato.
  deepStrictEqual(claves.length, 6732, 'el inventario tiene que estar y estar completo');

  const reales = new Set(claves);
  const tope = rangos(claves);
  const patrones = new Set([...reales].map((k) => k.replace(/\b\d+\b/g, '{n}')));

  // Las tres formas de literal, no sólo la comilla simple.
  const formas = [/'([a-z]+\.[a-zA-Z0-9_.{}]*[a-zA-Z0-9}])'/g,
    /"([a-z]+\.[a-zA-Z0-9_.{}]*[a-zA-Z0-9}])"/g,
    /`([a-z]+\.[a-zA-Z0-9_.{}]*[a-zA-Z0-9}])`/g];

  /**
   * Qué tiene forma de ruta de la consola y qué es JavaScript.
   *
   * **La primera versión de este filtro miraba sólo la familia**, y al ampliar
   * el barrido a `apps/` se llenó de `f.id`, `a.icono`, `f.asignado`: accesos a
   * propiedades de un parámetro que se llama `f` o `a`. Con ese ruido la guarda
   * se desactiva en una semana.
   *
   * Lo que distingue a una ruta es la **forma**: una familia con índice
   * --`i.8.mix`-- o una de las familias planas, que no lo llevan.
   */
  const CON_INDICE = /^(i|l|hw|a|s|f|p|v|hwoutaux|hwouthp|hwouthpdsp|hwoutm|casc|usbdaw|mg|vg)\.(\d+|\{n\}|[NBM])(\.|$)/;
  // **`m.id` no es una ruta**: es una plantilla de Angular iterando integrantes.
  // Las familias planas se reconocen por su segundo tramo real --`m.mix`,
  // `m.eq.…`, `var.rta`-- y no por «empieza con m y tiene un punto», que atrapa
  // cualquier acceso a una propiedad de una variable llamada `m`.
  const SEGUNDO_REAL = new Set(
    [...reales].filter((k) => /^(m|var|settings|iso|mtk|automix|afs)\./.test(k))
      .map((k) => k.split('.').slice(0, 2).join('.')),
  );
  const PLANAS = (r: string): boolean => {
    // Las familias de nombre largo no chocan con variables: `var.inventado` o
    // `settings.loquesea` son rutas, y si no existen hay que decirlo.
    if (/^(var|settings|iso|mtk|automix|afs)\./.test(r)) return true;
    // **`m.` es la única que choca**, porque `m` es un nombre de variable muy
    // común --`@for (m of integrantes)`-- y `m.id` no es una ruta. Para esa se
    // exige que el segundo tramo exista de verdad.
    //
    // **El precio, dicho y no escondido**: con esta regla, `m.inventado` pasa
    // sin que nadie lo note. Se midió: de ocho formas de colar una ruta, la
    // guarda atrapa siete, y ésta es la que falta. Separar «ruta del general con
    // tramo inventado» de «propiedad de una variable llamada m» exige entender
    // plantillas de Angular, y no vale ese precio hoy.
    if (/^m\./.test(r)) return SEGUNDO_REAL.has(r.split('.').slice(0, 2).join('.'));
    return false;
  };
  const familias = { test: (r: string) => CON_INDICE.test(r) || PLANAS(r) };
  const sospechosas = new Set<string>();

  /**
   * El código sin sus comentarios.
   *
   * **Una ruta en un comentario es documentación; una en el código es una
   * afirmación.** Este proyecto documenta su historia nombrando las rutas que
   * resultaron falsas --`m.eq.b1.gain`, `m.delay.time`, `i.24`-- y esa prosa es
   * justamente lo que hay que conservar. Barrerla junto con el código llenaba la
   * lista de aciertos convertidos en falsos positivos.
   *
   * La guarda mira lo que el programa **hace**, no lo que dice de sí mismo.
   */
  const sinComentarios = (t: string): string =>
    t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  for (const f of [...fuentes(join(RAIZ, 'packages')), ...fuentes(join(RAIZ, 'apps'))]) {
    // **La guarda no se audita a sí misma.** Su lista de deliberadas nombra
    // rutas falsas por definición, y los motivos que las acompañan también.
    if (f.endsWith('rutas-de-los-tests.test.ts')) continue;
    const texto = sinComentarios(readFileSync(f, 'utf8'));
    for (const forma of formas) {
      for (const m of texto.matchAll(forma)) {
        const ruta = m[1]!;
        if (!familias.test(ruta) || reales.has(ruta) || DELIBERADAS.has(ruta)) continue;
        const donde = f.slice(RAIZ.length + 1);

        // **Los prefijos de fuente se VALIDAN, no se saltean.** `i.24` no es
        // una clave, pero tampoco existe: los canales llegan a `i.23`. Saltearlos
        // era dejar pasar la clase exacta del bug que esta guarda cerró.
        const pre = /^([a-z]+)\.(\d+)$/.exec(ruta);
        if (pre !== null) {
          const max = tope.get(pre[1]!);
          if (max !== undefined && Number(pre[2]) <= max) continue;
          sospechosas.add(`${ruta}  (indice fuera de rango)  ${donde}`);
          continue;
        }

        // **Un patrón se valida contra los patrones reales**, en vez de
        // eximirse. `loQueNoSeVe()` está hecho entero de éstos y nadie los
        // contrastaba: sus catorce declaraciones existían por casualidad.
        //
        // Los marcadores conviven --`{n}` en unos archivos, `N` o `B` en
        // otros-- así que se normalizan antes de comparar.
        if (/[{]n[}]|\b[NBM]\b/.test(ruta)) {
          const normal = ruta.replace(/[{]n[}]|\b[NBM]\b/g, '{n}');
          if (patrones.has(normal)) continue;
          sospechosas.add(`${ruta}  (patron que no existe)  ${donde}`);
          continue;
        }
        // Rutas inválidas a propósito: el nombre lo dice.
        if (/inventad|desconocid|falsa/.test(ruta)) continue;
        // Un índice fuera de rango con sufijo: `i.24.aux.6.value`.
        const conIndice = /^([a-z]+)\.(\d+)\./.exec(ruta);
        const razon = conIndice !== null && (tope.get(conIndice[1]!) ?? Infinity) < Number(conIndice[2])
          ? 'indice fuera de rango' : 'no existe en la consola';
        sospechosas.add(`${ruta}  (${razon})  ${donde}`);
      }
    }
  }

  deepStrictEqual(
    [...sospechosas].sort(), [],
    'rutas que la consola no manda. O es un descuido, o entra en DELIBERADAS con su motivo.',
  );
});
