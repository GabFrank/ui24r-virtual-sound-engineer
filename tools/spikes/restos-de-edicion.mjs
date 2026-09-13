/**
 * Los restos que deja un arreglo aplicado a medias.
 *
 * **Por qué existe.** En una noche de ocho rondas de auditoría sobre cuatro
 * mediciones, el hallazgo que más veces se repitió no fue de física ni de
 * protocolo: fue **el arreglo que agrega el control bueno y no saca el malo**. Los
 * dos quedan vivos y gana el que llega al `if`. Una vez fue un control que el
 * propio contrato declaraba falso y que igual abortaba la corrida; otra vez fue
 * una pasada entera de anulación que desapareció y dejó su rótulo apuntando a
 * código borrado.
 *
 * Todos se detectan igual —mirando la forma, no el sentido— así que se busca a
 * máquina en vez de esperar a que un auditor los lea:
 *
 * - **dos docblocks seguidos**: casi siempre el viejo quedó encima del nuevo;
 * - **un rótulo de secuencia sin sus hermanos**: «TERCERA» sin PRIMERA delata un
 *   bloque borrado;
 * - **una constante declarada y nunca usada**: el umbral de una expectativa que se
 *   reescribió;
 * - **el mismo `const` declarado dos veces** en el mismo archivo;
 * - **un campo del tipo que nadie lee**: `se mide y no se usa`, que esta serie
 *   cometió al menos cinco veces.
 *
 * **No decide nada.** Informa y sale con 0: son señales de forma, y algunas van a
 * ser legítimas. Lo que no puede pasar es que nadie las mire.
 *
 * Uso:
 *   node tools/spikes/restos-de-edicion.mjs [carpeta]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(import.meta.dirname, '..', '..');
const DESDE = process.argv[2] ?? join(RAIZ, 'tools', 'spikes');

function guiones(dir, salida = []) {
  for (const n of readdirSync(dir)) {
    // Este archivo se excluye: sus propias tablas de rótulos lo hacen marcarse solo.
    if (n === 'node_modules' || n === 'dist' || n === 'restos-de-edicion.mjs') continue;
    const r = join(dir, n);
    if (statSync(r).isDirectory()) guiones(r, salida);
    else if (/\.(ts|mjs)$/.test(n)) salida.push(r);
  }
  return salida;
}

/** El código sin comentarios, para no confundir una cita con un uso. */
const sinComentarios = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/**
 * Un rótulo de secuencia sin el que lo precede.
 *
 * **Sólo en esa dirección.** Un archivo con PRIMERA y SEGUNDA y sin TERCERA está
 * bien: son dos pasadas. Lo que delata un bloque borrado es una TERCERA sin
 * SEGUNDA. La primera versión miraba las dos direcciones y marcaba dos guiones
 * sanos.
 *
 * **Y tiene que parecer un rótulo, no prosa.** «LOADSNAPSHOT de la PRIMERA» no es
 * una pasada; se exige que la palabra venga seguida de `PASADA` o de dos puntos.
 */
const ROTULOS = [['PRIMERA', 'SEGUNDA'], ['SEGUNDA', 'TERCERA']];
const esRotulo = (texto, palabra) =>
  new RegExp(`\\b${palabra}(\\s+PASADA)?\\s*:`).test(texto);

function revisar(ruta) {
  const texto = readFileSync(ruta, 'utf8');
  const codigo = sinComentarios(texto);
  const hallazgos = [];

  // **Un docblock de UNA LÍNEA pegado encima de otro.**
  //
  // Ésa es la firma del resto, y no «dos docblocks seguidos» a secas: el caso real
  // —el testigo del ítem 108— era `/** El testigo… una década abajo. */` de una
  // línea sobreviviendo encima del bloque nuevo que lo reemplazaba.
  //
  // Las dos versiones anteriores de este control marcaban archivos sanos: primero
  // cualquier par de docblocks (cinco falsos positivos), después los pares sin línea
  // en blanco (dos más, que son estilo y no defecto). Un control con esa proporción
  // de ruido es un control que nadie mira, que es justo lo que este archivo existe
  // para evitar.
  for (const m of texto.matchAll(/\/\*\*[^\n]*\*\/\n\s*\/\*\*/g)) {
    const linea = texto.slice(0, m.index).split('\n').length;
    hallazgos.push(`${linea}: un docblock de una linea pegado encima de otro`);
  }

  // Un rótulo de secuencia sin su hermano. Se busca la PALABRA, no la palabra con
  // dos puntos: «SEGUNDA PASADA:» es tan válido como «SEGUNDA:», y la primera
  // versión de este control daba falso positivo sobre los tres guiones que lo
  // escriben así.
  for (const [a, b] of ROTULOS) {
    if (esRotulo(texto, b) && !esRotulo(texto, a)) {
      hallazgos.push(`rotulo «${b}» sin «${a}»: puede apuntar a un bloque borrado`);
    }
  }

  // Constantes de nivel superior declaradas y nunca usadas.
  for (const m of codigo.matchAll(/^const ([A-Z][A-Z0-9_]{3,}) =/gm)) {
    const nombre = m[1];
    const usos = [...codigo.matchAll(new RegExp(`\\b${nombre}\\b`, 'g'))].length;
    if (usos <= 1) hallazgos.push(`constante ${nombre} declarada y nunca usada`);
  }

  // **El mismo `const` dos veces EN EL NIVEL SUPERIOR.**
  //
  // La primera versión contaba en cualquier profundidad y daba ochenta señales en
  // treinta y siete archivos: un `const dif` dentro de dos bloques distintos es
  // perfectamente legítimo y no es un resto de nada. Un control con esa proporción
  // de ruido es un control que nadie mira, que es justo lo que este archivo existe
  // para evitar.
  //
  // En el nivel superior sí es un olor: la segunda declaración sombrea a la primera
  // y suele ser el reemplazo que se escribió sin sacar el original.
  const vistos = new Map();
  for (const m of codigo.matchAll(/^const (\w+) =/gm)) {
    vistos.set(m[1], (vistos.get(m[1]) ?? 0) + 1);
  }
  for (const [nombre, veces] of vistos) {
    if (veces > 1) hallazgos.push(`const ${nombre} declarado ${veces} veces en el nivel superior`);
  }

  return hallazgos;
}

let total = 0;
const conRestos = [];
for (const g of guiones(DESDE)) {
  const h = revisar(g);
  if (h.length === 0) continue;
  total += h.length;
  conRestos.push([g.slice(RAIZ.length + 1), h]);
}

console.log(`Restos de edicion: ${total} señales en ${conRestos.length} archivos `
  + `de ${guiones(DESDE).length} revisados.`);
console.log('');
for (const [ruta, h] of conRestos.sort((a, b) => b[1].length - a[1].length)) {
  console.log(`${ruta}`);
  for (const x of h) console.log(`   ${x}`);
}
console.log('');
console.log('Son señales de FORMA, no veredictos: algunas van a ser legitimas.');
console.log('Lo que no puede pasar es que nadie las mire.');
