#!/usr/bin/env node
/**
 * Saca el texto de un PDF, con lo que trae Node y nada más.
 *
 * **Por qué existe.** Para leer el manual de la consola hacía falta `poppler`, y
 * Homebrew lo condiciona a una versión más nueva de las herramientas de Xcode:
 * una descarga grande en la máquina del usuario para leer un PDF. Node trae
 * `zlib`, que es el 90 % del trabajo.
 *
 * **Lo que hace y lo que no.** Infla los flujos de contenido y junta lo que
 * pasa por los operadores de texto (`Tj`, `TJ`, `'`, `"`). Eso alcanza para un
 * manual compuesto con fuentes de codificación estándar.
 *
 * **No** arma columnas ni respeta el orden visual de la página: devuelve el
 * texto en el orden en que el PDF lo dibuja, que casi siempre es el de lectura
 * pero no siempre. Y **no** resuelve fuentes con codificación propia: si un PDF
 * usa un subconjunto con su propio CMap, lo que salga va a ser ilegible — y se
 * va a **ver** ilegible, que es lo importante. Un extractor que devuelve basura
 * con forma de texto sería peor que uno que falla.
 *
 * Uso:
 *   node tools/docs/pdf-a-texto.mjs <archivo.pdf> [> salida.txt]
 */
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const ruta = process.argv[2];
if (ruta === undefined) {
  console.error('uso: node tools/docs/pdf-a-texto.mjs <archivo.pdf>');
  process.exit(2);
}

const d = readFileSync(ruta);

/** Los octales y las barras que un literal de PDF puede traer. */
function desescapar(s) {
  return s
    .replace(/\\([nrtbf])/g, (_, c) =>
      ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' })[c])
    .replace(/\\([0-7]{1,3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)))
    .replace(/\\(.)/g, '$1');
}

/**
 * Las cadenas de un flujo de contenido, en el orden en que se dibujan.
 *
 * **Los saltos se deducen de los operadores de línea**, no de los espacios: un
 * PDF no tiene renglones, tiene posiciones. `Td`, `TD`, `T*` y `'` mueven a otra
 * línea, así que ahí va un salto.
 */
function textoDelFlujo(t) {
  const salida = [];
  // Un solo recorrido: literales `(...)`, hexadecimales `<...>`, y los
  // operadores que mueven de línea.
  const re = /\((?:\\.|[^\\()])*\)|<[0-9A-Fa-f\s]*>|\bT[dD*]\b|\bTJ\b|\bTj\b|'|"/g;
  let m;
  while ((m = re.exec(t)) !== null) {
    const s = m[0];
    if (s.startsWith('(')) {
      salida.push(desescapar(s.slice(1, -1)));
    } else if (s.startsWith('<')) {
      const hex = s.slice(1, -1).replace(/\s/g, '');
      let acc = '';
      for (let i = 0; i + 1 < hex.length; i += 2) {
        acc += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
      }
      salida.push(acc);
    } else if (s === 'Td' || s === 'TD' || s === 'T*' || s === "'" || s === '"') {
      salida.push('\n');
    }
  }
  return salida.join('');
}

let paginas = 0;
const partes = [];
let i = 0;
while ((i = d.indexOf('stream', i)) !== -1) {
  let s = i + 6;
  if (d[s] === 13) s += 1;
  if (d[s] === 10) s += 1;
  const fin = d.indexOf('endstream', s);
  if (fin === -1) break;
  try {
    const inflado = inflateSync(d.subarray(s, fin)).toString('latin1');
    if (/\bTJ\b|\bTj\b/.test(inflado)) {
      paginas += 1;
      partes.push(`\n\n=== [flujo de texto ${paginas}] ===\n`);
      partes.push(textoDelFlujo(inflado));
    }
  } catch {
    // Los que no inflan son imágenes o fuentes incrustadas. No son texto.
  }
  i = fin + 9;
}

/**
 * Repara los tramos que el PDF escribe en UTF-16 con la fuente corrida.
 *
 * **Lo que parecía «letras separadas por espacios» era otra cosa.** Los tramos
 * raros vienen como **UTF-16BE**: cada carácter ocupa dos bytes y el alto es
 * cero, así que leídos como latin1 salen como `\0 6 \0 2 \0 8`. El `þÿ` que
 * aparecía suelto era el BOM, `FE FF`.
 *
 * Y encima la fuente está **corrida 29 lugares**: el código 0x36 es la `S` de
 * `SOUNDCRAFT`, y 0x03 es el espacio. Sumando 29 a cada código del texto
 * decodificado sale la palabra.
 *
 * Las dos cosas juntas explican todo lo ilegible del archivo. La primera
 * versión de esta función buscaba corridas de letras separadas por espacios y
 * no encontraba ninguna, porque el separador era un NUL: **estaba reparando un
 * síntoma que no existía**. Lo delató mirar los códigos de los caracteres en vez
 * de la representación.
 */
function repararUtf16Corrido(t) {
  // Un tramo es UTF-16BE si tiene NUL en las posiciones pares, varias veces.
  return t.replace(/(?:\u0000[\s\S]){4,}/g, (tramo) => {
    let salida = '';
    for (let i = 1; i < tramo.length; i += 2) {
      salida += String.fromCharCode(tramo.charCodeAt(i) + 29);
    }
    return salida;
  });
}

const texto = repararUtf16Corrido(partes.join(''))
  // El BOM de UTF-16, que queda suelto cuando el tramo era de un solo carácter.
  .replace(/þÿ|\ufeff/g, ' ')
  // Los PDF dejan mucho espacio de posicionamiento.
  .replace(/[ \t]{2,}/g, ' ')
  .replace(/\n{3,}/g, '\n\n');

// **Un centinela contra el éxito falso.** Si el PDF usa fuentes con
// codificación propia, esto devuelve caracteres sin sentido con forma de texto,
// y quien lo lea después va a citar basura. Se mide qué proporción es legible.
const legibles = (texto.match(/[A-Za-zÀ-ÿ0-9]/g) ?? []).length;
const proporcion = texto.length === 0 ? 0 : legibles / texto.length;
if (proporcion < 0.35) {
  console.error(`ERROR: solo el ${(proporcion * 100).toFixed(0)} % de lo extraido son `
    + 'caracteres legibles. El PDF probablemente use fuentes con codificacion propia, '
    + 'y lo que saldria seria basura con forma de texto. No se imprime.');
  process.exit(1);
}

console.error(`${paginas} flujos de texto, ${texto.length} caracteres, `
  + `${(proporcion * 100).toFixed(0)} % legibles`);
process.stdout.write(texto);
