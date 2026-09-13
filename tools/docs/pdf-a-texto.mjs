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

/**
 * ¿Este flujo es texto, o son píxeles?
 *
 * **El filtro anterior aceptaba cualquier flujo que contuviera los bytes `TJ` o
 * `Tj`, y eso es casi cualquier cosa.** Dos bytes concretos aparecen por azar en
 * datos binarios todo el tiempo. Resultado medido sobre el manual de la Ui24R:
 * **el 51,6 % del texto extraído eran datos de imagen descomprimidos** —corridas
 * de `ÿÿÿÖÔÛÛÛÝÝÝ`, que son valores de píxeles blancos y grises— y el centinela
 * los daba por buenos porque `ÿ`, `Ö`, `Û` y `Ý` caen dentro de `À-ÿ`.
 *
 * **Dos criterios, y los dos separan sin ambigüedad.** Medido sobre los 125
 * flujos que el filtro viejo aceptaba:
 *
 * | | flujos | proporción de ASCII imprimible |
 * |---|---|---|
 * | con `BT`…`ET` | 123 | **1,000** en todos |
 * | sin `BT`…`ET` | 2 | 0,139 y 0,207 |
 *
 * Un flujo de contenido de PDF es texto plano: operadores y literales. Un flujo
 * de imagen es binario. No hay zona gris, así que el umbral se pone lejos de los
 * dos grupos y no en el medio de nada.
 */
const RATIO_ASCII_MINIMO = 0.9;

function esFlujoDeTexto(inflado) {
  if (!/\bBT\b/.test(inflado) || !/\bET\b/.test(inflado)) return false;
  let imprimibles = 0;
  for (let i = 0; i < inflado.length; i++) {
    const k = inflado.charCodeAt(i);
    if ((k >= 32 && k < 127) || k === 9 || k === 10 || k === 13) imprimibles += 1;
  }
  return inflado.length > 0 && imprimibles / inflado.length >= RATIO_ASCII_MINIMO;
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
    if (esFlujoDeTexto(inflado)) {
      paginas += 1;
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
/**
 * La tabla de caracteres de fuente, **verificada contra el contexto uno por uno**.
 *
 * Un PDF compuesto con fuentes en subconjunto no guarda «f-i»: guarda el código
 * del glifo de la ligadura, y leído como latin1 sale un carácter acentuado al
 * azar. Lo mismo con comillas tipográficas, viñetas y símbolos.
 *
 * **Esto no es un decodificador de PDF: es una tabla para ESTE documento**, y
 * cada entrada se comprobó mirando dónde aparece. Un manual compuesto con otras
 * fuentes necesita la suya, y el centinela de abajo lo va a delatar.
 *
 * | Código | Aparece en | Es |
 * |---|---|---|
 * | `Ü` | «Ürst», «modiÜcation», «SpeciÜcations», «ConÜguration» | ligadura **fi** |
 * | `Ý` | «Ýame», «inÝuences», «Ýoating» | ligadura **fl** |
 * | `Ó` | «userÓs», «CanadaÓs», «dÓIndustrie» | apóstrofo |
 * | `Ò` | abre donde `Ó` cierra: «ÒscuiwlanÓ», «ÒNETWORKÓ» | comilla simple de apertura |
 * | `Ñ` | «ÐMY OUTÑ», y **«1/4Ñ»** como marca de pulgada | comilla doble de cierre |
 * | `Ð` | abre donde `Ñ` cierra: «ÐSoundcraft Ui24Ñ» | comilla doble de apertura |
 * | `§` | «dbx§, Digitech§, Lexicon§» — tres marcas registradas | ® |
 * | `¤` | encabeza «Read these instructions», «WARNING:» | viñeta |
 *
 */
const CARACTERES_DE_FUENTE = [
  [/\u00DC/g, 'fi'],
  [/\u00DD/g, 'fl'],
  [/\u00D3/g, "'"],
  [/\u00D2/g, "'"],
  [/\u00D1/g, '"'],
  [/\u00D0/g, '"'],
  [/\u00A7/g, '(R)'],
  [/\u00A4/g, '*'],
];

/**
 * Texto escrito con la fuente **corrida 29 lugares**, en un byte por carácter.
 *
 * `repararUtf16Corrido` ya conocía este corrimiento, pero sólo lo deshacía en los
 * tramos que venían en UTF-16. Hay otros que vienen en un byte, y se perdían:
 * `7KH` es `The`, `<RX` es `You`, `$8;` es `AUX` — sumando 29 a cada código sale
 * la palabra. Son de las palabras más frecuentes del manual.
 *
 * **Se aplica token por token y sólo cuando el resultado es una palabra**, que es
 * lo que lo vuelve seguro: si un token ya es texto normal, no se toca; si al
 * correrlo no sale una palabra, tampoco. No hay forma de que esto rompa texto que
 * estaba bien.
 */
function correr29(token) {
  let salida = '';
  for (let i = 0; i < token.length; i++) {
    salida += String.fromCharCode(token.charCodeAt(i) + 29);
  }
  return salida;
}

/**
 * **Ya limpio** quiere decir letras de punta a punta, con a lo sumo un signo de
 * puntuación al final.
 *
 * No se usa `esPalabra` acá, y la diferencia importa: `esPalabra` le saca los
 * signos de los dos bordes antes de mirar —para que `page.` cuente como palabra
 * en la métrica— y con eso `7DS` pasa por palabra, porque al quitarle el `7`
 * queda `DS`. Resultado: «7DS the More» se quedaba sin reparar cuando era «Tap
 * the More». Para decidir si hay que correr un token hace falta el criterio
 * estricto.
 */
const YA_LIMPIO = /^[A-Za-z][A-Za-z'-]*[.,;:!?)]?$/;

function repararCorrimientoDeUnByte(t) {
  return t.replace(/\S+/g, (token) => {
    if (token.length < 2 || YA_LIMPIO.test(token)) return token;
    const corrido = correr29(token);
    return /^[A-Za-z]{2,}$/.test(corrido) ? corrido : token;
  });
}

function repararCaracteresDeFuente(t) {
  let r = t;
  for (const [re, con] of CARACTERES_DE_FUENTE) r = r.replace(re, con);
  // Los códigos de control que dejan las fuentes de iconos: no son texto y no
  // hay con qué reemplazarlos. Se sacan para que no ensucien el conteo.
  return r.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '');
}

function repararUtf16Corrido(t) {
  // Un tramo es UTF-16BE si tiene NUL en las posiciones pares, varias veces.
  return t.replace(/(?:\u0000[\s\S]){4,}/g, (tramo) => {
    let salida = '';
    for (let i = 1; i < tramo.length; i += 2) {
      const codigo = tramo.charCodeAt(i);
      // **El espacio de verdad no se corre, y por eso el manual estaba lleno de
      // «=».** El corrimiento de 29 es de la FUENTE: su código 0x03 es el
      // espacio, y 0x03+29 = 0x20, que sale bien. Pero un tramo así también trae
      // espacios Unicode de verdad —0x0020— y 0x20+29 = 0x3D, que es `=`.
      //
      // Medido sobre el manual de la Ui24R: los `=` pasaban de 775 a **7 317**
      // justo en este paso, y quedaban 6 505 haciendo de separador de palabra.
      // «Tablet/PC/Smartphone = Controlled = Digital = Mixer». La versión
      // anterior los limpiaba después con un reemplazo de ` = ` por espacio, que
      // es tapar el síntoma: acá se arregla donde se produce, y un `=` que
      // sobreviva es un signo de igual de verdad.
      salida += codigo === 0x20 ? ' ' : String.fromCharCode(codigo + 29);
    }
    return salida;
  });
}

/**
 * El orden importa: primero los tramos UTF-16, después la tabla de caracteres de
 * fuente, y **al final el corrimiento de un byte**, que decide token por token si
 * lo que tiene delante ya está limpio. Si corriera antes, vería tokens que
 * todavía tienen ligaduras sin resolver y los dejaría pasar.
 *
 * **Y los marcadores de flujo se ponen DESPUÉS de reparar.** Cuando iban antes,
 * la reparación del corrimiento los agarraba: `===` no es una palabra, y correrlo
 * 29 da `ZZZ`, que sí lo es. El extractor corrompía su propia salida —«ZZZ [flujo
 * de texto Nz ZZZ»— y encima esos tokens entraban en la cuenta de palabras.
 */
const reparar = (x) => repararCorrimientoDeUnByte(
  repararCaracteresDeFuente(repararUtf16Corrido(x)),
);
const texto = partes
  .map((p, i) => `\n\n=== [flujo de texto ${i + 1}] ===\n${reparar(p)}`)
  .join('')
  // El BOM de UTF-16, que queda suelto cuando el tramo era de un solo carácter.
  .replace(/þÿ|\ufeff/g, ' ')
  // Los PDF dejan mucho espacio de posicionamiento.
  .replace(/[ \t]{2,}/g, ' ')
  .replace(/\n{3,}/g, '\n\n');

/**
 * **Un centinela contra el éxito falso, que cuenta PALABRAS y no caracteres.**
 *
 * El anterior medía qué proporción de los caracteres caía en `[A-Za-zÀ-ÿ0-9]`, y
 * eso **incluye el rango acentuado donde viven los caracteres corruptos**. Con el
 * manual de la Ui24R declaró «79 % legible» mientras el 51,6 % del archivo eran
 * datos de imagen —corridas de `ÿÿÿÖÔÛÛÛ`, valores de píxeles— y sólo el 38 % de
 * los tokens eran palabras. Un control que sólo podía confirmar.
 *
 * Contar palabras no se deja engañar por eso: una corrida de `ÿÿÿ` no es una
 * palabra, y `conÜguration` tampoco. El umbral se fija sobre lo que un documento
 * técnico en inglés da de verdad, con margen.
 */
const PROPORCION_MINIMA_DE_PALABRAS = 0.6;

/**
 * ¿Este token es una palabra?
 *
 * Se le sacan los signos de los bordes antes de mirar: `page.` y `screen.` son
 * palabras, y la primera versión de esta medida las rechazaba por el punto final.
 * Eso no medía el texto, medía la puntuación.
 */
function esPalabra(w) {
  const nucleo = w.replace(/^[^A-Za-z]+/, '').replace(/[^A-Za-z]+$/, '');
  return /^[A-Za-z][A-Za-z'-]*$/.test(nucleo) && nucleo.length >= 2;
}

// **Los marcadores que este mismo extractor inserta no entran en la cuenta.**
// Los `=== [flujo de texto N] ===` son suyos, no del manual: contarlos sería
// medirse a sí mismo y el resultado mejoraría al agregar más marcadores.
const tokens = texto
  .replace(/^=== \[flujo de texto \d+\] ===$/gm, '')
  .split(/\s+/)
  .filter(Boolean);
const palabras = tokens.filter(esPalabra).length;
const proporcion = tokens.length === 0 ? 0 : palabras / tokens.length;
if (proporcion < PROPORCION_MINIMA_DE_PALABRAS) {
  console.error(`ERROR: solo el ${(proporcion * 100).toFixed(0)} % de los tokens son `
    + `palabras (${palabras} de ${tokens.length}). El PDF probablemente use fuentes con `
    + 'codificacion propia que esta tabla no cubre, y lo que saldria seria basura con '
    + 'forma de texto. No se imprime.');
  // **Y se muestra QUE no es palabra, que es lo unico que permite arreglarlo.**
  // Un centinela que dice «fallo» y no dice con que, obliga a quien lo lea a
  // rehacer el analisis desde cero para saber si el umbral esta mal o el texto.
  const noPalabras = tokens.filter((w) => !/^[A-Za-z][A-Za-z'-]+$/.test(w));
  const cuenta = new Map();
  for (const w of noPalabras) cuenta.set(w, (cuenta.get(w) ?? 0) + 1);
  console.error('los 25 tokens no-palabra mas frecuentes:');
  for (const [w, n] of [...cuenta].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
    console.error(`   x${String(n).padStart(4)}  ${JSON.stringify(w)}`);
  }
  process.exit(1);
}

console.error(`${paginas} flujos de texto, ${texto.length} caracteres, `
  + `${palabras} palabras de ${tokens.length} tokens (${(proporcion * 100).toFixed(0)} %)`);
process.stdout.write(texto);
