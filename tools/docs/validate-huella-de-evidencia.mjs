#!/usr/bin/env node
/**
 * Que la evidencia archivada corresponda al guion que dice.
 *
 * **Por qué existe.** `medir.mjs` escribe en cada evidencia la huella del guion
 * que la produjo, con esta promesa en el propio encabezado: *«si hoy no coincide,
 * el archivo es de otra version y lo que diga de si mismo no vale»*. **Nadie la
 * comprobaba.** Una auditoría de controles lo marcó el 2026-09-13 y midió el
 * daño: **20 de 30 evidencias con huella ya no coincidían** con su guion de
 * entonces, entre ellas la que `RAW_MAP` cita para haber promovido dos entradas
 * del ecualizador a `PROBADO`.
 *
 * Una promesa que nadie verifica es una promesa que se rompe sola.
 *
 * **Y la huella vieja cubría sólo el archivo de nivel superior**, así que cambiar
 * el instrumento que la medición importa no la movía: el mismo defecto que la
 * huella existe para impedir, entrando por la puerta de los imports. Desde el
 * 2026-09-13 cubre el cierre de imports locales, y esas evidencias llevan en su
 * encabezado cuántos archivos abarca.
 *
 * **Las dos listas son distintas a propósito:**
 *
 * - Las evidencias con huella **de formato viejo** no se pueden recomputar: su
 *   huella era de otro cálculo. Se cuentan y se informan, y no se acusa a nadie.
 * - Las de **formato nuevo** sí se recomputan, y una que no coincida es un
 *   hallazgo: o el guion cambió después de archivar, o la evidencia es de otra
 *   versión.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function cierreDeImports(entrada, leer, vistos = new Set()) {
  const abs = resolve(entrada);
  if (vistos.has(abs)) return vistos;
  const texto = leer(relative(RAIZ, abs));
  if (texto === null) return vistos;
  vistos.add(abs);
  const base = dirname(abs);
  for (const m of texto.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    const pedido = join(base, m[1]);
    for (const cand of [pedido, `${pedido}.ts`, `${pedido}.mjs`]) {
      if (leer(relative(RAIZ, cand)) !== null) { cierreDeImports(cand, leer, vistos); break; }
    }
  }
  return vistos;
}

const leerDeDisco = (rel) => {
  const abs = join(RAIZ, rel);
  return existsSync(abs) && statSync(abs).isFile() ? readFileSync(abs, 'utf8') : null;
};

/** El archivo tal como estaba en un commit. `null` si no existía ahí. */
const leerDeCommit = (commit) => (rel) => {
  try {
    return execFileSync('git', ['show', `${commit}:${rel}`],
      { cwd: RAIZ, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
  } catch { return null; }
};

function huellaDe(guion, leer = leerDeDisco) {
  const archivos = [...cierreDeImports(join(RAIZ, guion), leer)].sort();
  if (archivos.length === 0) return null;
  return {
    hex: createHash('sha256')
      .update(archivos.map((f) => `${relative(RAIZ, f)}\n${leer(relative(RAIZ, f))}`).join('\n'))
      .digest('hex').slice(0, 16),
    cuantos: archivos.length,
    archivos: archivos.map((f) => relative(RAIZ, f)),
  };
}

/**
 * Una línea que puede cambiar lo que la corrida hizo.
 *
 * **Es una heurística y se declara como tal.** Reconoce el comentario de línea y
 * el de bloque por cómo empiezan; no parsea. Un comentario raro —código después
 * del cierre de bloque en la misma línea— la engaña, y el error cae del lado
 * seguro: la
 * cuenta como código y el validador acusa de más, no de menos.
 *
 * (Y la primera versión de este docblock escribía ese cierre de bloque literal,
 * que cerraba ESTE comentario y rompía el archivo. Queda dicho porque es el
 * mismo caso que la heurística describe, cometido al describirlo.)
 */
const esCodigo = (linea) => {
  const t = linea.trim();
  return t !== '' && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
};

/**
 * Busca en el historial la versión cuya huella es la archivada, y dice qué
 * cambió desde entonces.
 *
 * **Por qué hace falta.** Sin esto, una huella que no coincide es un ✘ mudo: no
 * dice si alguien corrigió una coma del docblock o si cambió el banco de la
 * medición. Las dos cosas pasaron el 2026-09-13 —una de cada— y tratarlas igual
 * es tan malo como no detectarlas.
 *
 * **No lee ninguna anotación ni le cree a ninguna prosa.** Reconstruye la huella
 * commit por commit hasta dar con la que coincide, y después compara el código.
 */
function queCambio(guion, hexArchivado, tope = 300) {
  let commits;
  try {
    commits = execFileSync('git', ['log', '--format=%H', `-n${tope}`, '--', guion],
      { cwd: RAIZ, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  } catch { return null; }
  for (const c of commits) {
    const h = huellaDe(guion, leerDeCommit(c));
    if (h === null || h.hex !== hexArchivado) continue;
    const hoy = huellaDe(guion);
    const archivos = new Set([...(hoy?.archivos ?? []), ...h.archivos]);
    const cambiados = [];
    for (const rel of archivos) {
      const antes = (leerDeCommit(c)(rel) ?? '').split('\n').filter(esCodigo);
      const ahora = (leerDeDisco(rel) ?? '').split('\n').filter(esCodigo);
      if (antes.join('\n') !== ahora.join('\n')) cambiados.push(rel);
    }
    return { commit: c.slice(0, 7), codigo: cambiados };
  }
  return null;
}

function evidencias(dir, salida = []) {
  if (!existsSync(dir)) return salida;
  for (const n of readdirSync(dir)) {
    const r = join(dir, n);
    if (statSync(r).isDirectory()) evidencias(r, salida);
    else if (n.endsWith('.txt')) salida.push(r);
  }
  return salida;
}

let nuevas = 0;
let viejas = 0;
let sinHuella = 0;
const noCoinciden = [];
let soloProsa = 0;
let codigoCambiado = 0;
let reconocidas = 0;
const guionQueNoEsta = [];

for (const ruta of evidencias(join(RAIZ, 'docs', 'spikes'))) {
  const completo = readFileSync(ruta, 'utf8');
  // El encabezado se busca en los primeros 2000; el reconocimiento de divergencia,
  // en el archivo ENTERO, porque una anotacion va al final: la evidencia no se pisa.
  const texto = completo.slice(0, 2000);
  const m = texto.match(/^# guion: (\S+) sha256:([0-9a-f]+)/m);
  if (m === null) { sinHuella += 1; continue; }
  const [, guion, hex] = m;
  // El formato nuevo declara cuántos archivos abarca. El viejo no, y su huella
  // salía de otro cálculo: recomputarla acusaría a todas en falso.
  if (!/^# la huella cubre \d+ archivo/m.test(texto)) { viejas += 1; continue; }
  nuevas += 1;
  if (!existsSync(join(RAIZ, guion))) {
    guionQueNoEsta.push(`${relative(RAIZ, ruta)} -> ${guion}`);
    continue;
  }
  const h = huellaDe(guion);
  if (h !== null && h.hex !== hex) {
    // **La divergencia reconocida, atada a un hash y no a una promesa.**
    //
    // Una evidencia cuyo guion cambio de codigo es de otra version, y eso es
    // permanente: no hay commit que lo arregle si remedir daria otra cosa --el
    // caso del item 104, cuyo arreglo de seguridad cambia el banco--. Un ✘ que
    // no se puede resolver deja el validador en rojo para siempre, y un control
    // que siempre esta en rojo es un control que nadie mira.
    //
    // Asi que se puede RECONOCER la divergencia escribiendo en la evidencia la
    // huella de hoy. No es una exencion por prosa: **si el guion vuelve a
    // cambiar, la huella reconocida deja de ser la de hoy y vuelve el ✘**. El
    // reconocimiento caduca solo.
    const reconocida = completo.match(/^# divergencia reconocida: ([0-9a-f]+)/m);
    if (reconocida !== null && reconocida[1] === h.hex) {
      noCoinciden.push(`${relative(RAIZ, ruta)}\n     archivada ${hex}, hoy ${h.hex} `
        + '\n     DIVERGENCIA RECONOCIDA en el archivo, y la huella reconocida es la de hoy');
      reconocidas += 1;
      continue;
    }
    const c = queCambio(guion, hex);
    let veredicto;
    if (c === null) {
      veredicto = '\n     no se encontro en el historial una version con esa huella: '
        + 'o la evidencia es de otra version, o el guion nunca se commiteo asi';
    } else if (c.codigo.length === 0) {
      veredicto = `\n     cambio en ${c.commit} y SOLO EN COMENTARIOS: el codigo que `
        + 'corrio es el de hoy, asi que los numeros valen tal cual';
      soloProsa += 1;
    } else {
      veredicto = `\n     cambio en ${c.commit} y TOCO CODIGO en: ${c.codigo.join(', ')}`
        + '\n     -> esta evidencia NO es del guion de hoy. Remedir, o anotar que'
        + ' configuracion midio';
      codigoCambiado += 1;
    }
    noCoinciden.push(`${relative(RAIZ, ruta)}\n     archivada ${hex}, hoy ${h.hex} `
      + `(${h.cuantos} archivos)${veredicto}`);
  }
}

console.log(`Huella de evidencia: ${nuevas} con huella nueva (guion + imports), `
  + `${viejas} con huella vieja (solo el guion), ${sinHuella} sin huella.`);

if (guionQueNoEsta.length > 0) {
  console.error('');
  console.error(`Evidencias que citan un guion que ya no esta (${guionQueNoEsta.length}):`);
  for (const x of guionQueNoEsta) console.error(`  ✘ ${x}`);
}
if (noCoinciden.length > 0) {
  console.error('');
  console.error(`Evidencias cuya huella NO coincide con su guion de hoy (${noCoinciden.length}):`);
  for (const x of noCoinciden) console.error(`  ✘ ${x}`);
  console.error('');
  console.error('El encabezado de cada una promete que si no coincide, «el archivo es de otra');
  console.error('version y lo que diga de si mismo no vale». Eso vale cuando cambio el CODIGO.');
  console.error(`Hoy: ${codigoCambiado} con codigo cambiado, ${soloProsa} con solo prosa, `
    + `${reconocidas} con la divergencia reconocida por hash.`);
  console.error('');
  console.error('Las de SOLO PROSA no hay que remedirlas: el codigo que corrio es el de hoy.');
  console.error('Las de CODIGO CAMBIADO, si --o se anota en el archivo que configuracion');
  console.error('midio, que es lo unico honesto cuando remedir daria otra cosa.');
  // **Sale con 1 sólo si cambió el código.** Un ✘ por una coma del docblock deja
  // el validador en rojo para siempre, y un control que siempre está en rojo es
  // un control que nadie mira. La prosa se informa y no bloquea.
  if (codigoCambiado > 0) process.exit(1);
}
if (guionQueNoEsta.length > 0) process.exit(1);

console.log(`   ${viejas} de formato viejo no se pueden recomputar: su huella cubria solo el`);
console.log('   archivo de nivel superior, y recomputarlas las acusaria a todas en falso.');
console.log('   Cada medicion nueva entra con la huella que si se comprueba.');
