#!/usr/bin/env node
/**
 * Recolector de claves de la Soundcraft Ui24R — fase de sólo observación.
 *
 * **Qué hace y qué NO hace.** Lee el estado que la consola publica por HTTP,
 * escucha el canal de control sin mandarle órdenes, y construye un inventario
 * con la procedencia de cada clave. **No escribe ningún parámetro, no hace
 * barridos de nombres, no prueba si una clave existe mandándola, y no carga ni
 * guarda instantáneas.**
 *
 * **Lo único que emite, dicho por adelantado.** El apretón de manos de
 * socket.io 0.9 —un GET a `/socket.io/1/` para obtener el identificador de
 * sesión, que es de un solo uso— y `ALIVE` una vez por segundo. `ALIVE` es el
 * latido que el protocolo exige: sin él la consola se calla a los pocos
 * segundos. **No se manda `INIT`.** Esas emisiones quedan registradas como
 * salientes y contadas aparte, nunca como evidencia de publicación.
 *
 * **Por qué una conexión propia y no la sesión del navegador.** No hay una
 * sesión oficial abierta en esta máquina: la consola se opera desde una tablet
 * y desde su pantalla. Abrir una conexión de sólo escucha es la única forma de
 * ver el canal de control, y queda declarado como tal.
 *
 * Uso:
 *   node tools/inventario/recolector.mjs <ip> <segundos> <carpetaSalida> <carpetaPrivada>
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parse } from 'acorn';
import { Ui24rTransport } from '@vse/mixer-adapter';

const [ip = '192.168.0.78', segundosArg = '90', salida = 'inventario', privada = 'privado'] = process.argv.slice(2);
const SEGUNDOS = Number(segundosArg);
mkdirSync(salida, { recursive: true });
mkdirSync(privada, { recursive: true });

const sha = (t) => createHash('sha256').update(t).digest('hex');
const ahora = () => new Date().toISOString();

/** Un GET con metadata, sin seguir adivinando rutas. */
function traer(ruta, maxSegundos = 10) {
  const url = `http://${ip}${ruta}`;
  const t0 = ahora();
  let cuerpo = '';
  let cabeceras = '';
  let codigoSalida = 0;
  try {
    const salidaCurl = execFileSync('curl', [
      '-s', '-i', '--max-time', String(maxSegundos), '-L', '-w', '\n@@FINAL@@%{url_effective}|%{http_code}|%{content_type}\n', url,
    ], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
    cuerpo = salidaCurl;
  } catch (e) {
    // curl sale con 28 en los flujos que no cierran. Los datos ya llegaron.
    codigoSalida = e.status ?? 28;
    cuerpo = String(e.stdout ?? '');
  }
  const marca = cuerpo.lastIndexOf('@@FINAL@@');
  let urlFinal = url; let http = null; let tipo = null;
  if (marca >= 0) {
    const [u, c, ct] = cuerpo.slice(marca + 9).trim().split('|');
    urlFinal = u ?? url; http = Number(c); tipo = ct ?? null;
    cuerpo = cuerpo.slice(0, marca);
  }
  const corte = cuerpo.indexOf('\r\n\r\n');
  if (corte >= 0) { cabeceras = cuerpo.slice(0, corte); cuerpo = cuerpo.slice(corte + 4); }
  return { url, urlFinal, http, tipo, cabeceras, cuerpo, en: t0, codigoSalida, sha256: sha(cuerpo) };
}

// ---------------------------------------------------------------- 1. identidad
console.log(`=== 1. Identidad, ${ahora()} ===`);
const raiz = traer('/');
console.log(`  GET /                 ${raiz.http} ${raiz.tipo ?? ''} ${raiz.cuerpo.length} bytes`);
const apreton = traer('/socket.io/1/');
console.log(`  GET /socket.io/1/     ${apreton.http} (apreton, identificador de un solo uso)`);

// ------------------------------------------- 2. la inicializacion HTTP, por AST
console.log('');
console.log('=== 2. js/initparams.js ===');
const init = traer('/js/initparams.js', 20);
console.log(`  ${init.urlFinal}`);
console.log(`  HTTP ${init.http}, ${init.tipo ?? 'sin tipo'}, ${init.cuerpo.length} bytes, sha256 ${init.sha256.slice(0, 16)}…`);
writeFileSync(join(privada, 'initparams.original.js'), init.cuerpo);

/**
 * Nombres y tipos del diccionario de parametros, por AST.
 *
 * **No se evalua nada.** El prompt lo pide y ademas es lo correcto: ejecutar
 * este archivo en la sesion operativa sustituiria el estado del cliente. Se
 * recorre el arbol y se leen las propiedades de PRIMER NIVEL de `dataValue`, sin
 * aplanar objetos internos: aplanarlos fabricaria claves que el protocolo no
 * tiene.
 */
function extraerDelAst(fuente) {
  const claves = new Map();
  let curSetup = null;
  let errorAst = null;
  let arbol = null;
  try {
    arbol = parse(fuente, { ecmaVersion: 'latest', sourceType: 'script' });
  } catch (e) { errorAst = String(e.message); return { claves, curSetup, errorAst, netConfigPresente: false }; }

  const tipoDe = (nodo) => {
    if (nodo.type === 'Literal') {
      if (nodo.value === null) return 'null';
      return typeof nodo.value;
    }
    if (nodo.type === 'ObjectExpression') return 'object';
    if (nodo.type === 'ArrayExpression') return 'array';
    if (nodo.type === 'UnaryExpression' && nodo.operator === '-') return tipoDe(nodo.argument);
    if (nodo.type === 'Identifier' && nodo.name === 'undefined') return 'undefined';
    return 'expresion_no_resuelta';
  };
  const nombreProp = (p) => (p.key.type === 'Literal' ? String(p.key.value) : p.key.name);

  let netConfigPresente = false;
  const visitar = (nodo, padre) => {
    if (nodo === null || typeof nodo !== 'object') return;
    if (Array.isArray(nodo)) { for (const x of nodo) visitar(x, padre); return; }
    if (nodo.type === 'AssignmentExpression' || nodo.type === 'VariableDeclarator') {
      const destino = nodo.left ?? nodo.id;
      const valor = nodo.right ?? nodo.init;
      const nombre = destino?.type === 'Identifier' ? destino.name : null;
      if (nombre === 'dataValue' && valor?.type === 'ObjectExpression') {
        for (const p of valor.properties) {
          if (p.type !== 'Property') continue;
          claves.set(nombreProp(p), tipoDe(p.value));
        }
      }
      if (nombre === 'curSetup' && valor?.type === 'ObjectExpression') {
        curSetup = {};
        for (const p of valor.properties) {
          if (p.type !== 'Property') continue;
          curSetup[nombreProp(p)] = p.value.type === 'Literal' ? p.value.value : 'expresion_no_resuelta';
        }
      }
      if (nombre === 'netConfig') netConfigPresente = true;
    }
    for (const k of Object.keys(nodo)) {
      if (k === 'type' || k === 'start' || k === 'end' || k === 'loc') continue;
      visitar(nodo[k], nodo);
    }
  };
  visitar(arbol, null);
  return { claves, curSetup, errorAst, netConfigPresente };
}

const ast = extraerDelAst(init.cuerpo);
console.log(`  AST: ${ast.errorAst ? `ERROR ${ast.errorAst}` : 'parseado sin ejecutar'}`);
console.log(`  claves de primer nivel en dataValue: ${ast.claves.size}`);
console.log(`  curSetup: ${ast.curSetup ? JSON.stringify(ast.curSetup) : 'no encontrado'}`);
console.log(`  netConfig presente en el archivo: ${ast.netConfigPresente ? 'si (NO se publica su contenido)' : 'no'}`);

// --------------------------------------------------- 3. el volcado HTTP /raw
console.log('');
console.log('=== 3. GET /raw ===');
const crudo = traer('/raw', 12);
writeFileSync(join(privada, 'raw.original.txt'), crudo.cuerpo);
const deRaw = new Map();
let lineasRaw = 0;
const otrosRaw = new Map();
for (const linea of crudo.cuerpo.split('\n')) {
  if (linea.trim() === '') continue;
  lineasRaw++;
  const p = linea.split('^');
  if ((p[0] === 'SETD' || p[0] === 'SETS') && p[1] !== undefined) {
    const anterior = deRaw.get(p[1]) ?? new Set();
    anterior.add(p[0] === 'SETD' ? 'number' : 'string');
    deRaw.set(p[1], anterior);
  } else {
    const tipo = p[0] ?? '(vacio)';
    otrosRaw.set(tipo, (otrosRaw.get(tipo) ?? 0) + 1);
  }
}
console.log(`  ${lineasRaw} lineas, ${deRaw.size} claves distintas, sha256 ${crudo.sha256.slice(0, 16)}…`);
console.log(`  mensajes que no son claves: ${[...otrosRaw].map(([k, v]) => `${k}×${v}`).join(' ') || 'ninguno'}`);

// ------------------------------------------ 4. el canal de control, escuchando
console.log('');
console.log(`=== 4. Canal de control, ${SEGUNDOS} s de escucha pasiva ===`);
const t = new Ui24rTransport();
const eventos = [];
const recibidas = new Map();
const porTipo = new Map();
const desconocidos = new Map();
let initsRecibidos = 0;
let clavesInit = new Map();
const t0 = Date.now();

t.alRecibir((linea) => {
  const en = new Date().toISOString();
  const p = linea.split('^');
  const tipo = p[0] ?? '(vacio)';
  porTipo.set(tipo, (porTipo.get(tipo) ?? 0) + 1);

  if ((tipo === 'SETD' || tipo === 'SETS') && p[1] !== undefined) {
    const s = recibidas.get(p[1]) ?? new Set();
    s.add(tipo === 'SETD' ? 'number' : 'string');
    recibidas.set(p[1], s);
    eventos.push({ en, dir: 'in', tipo, clave: p[1], tipoValor: tipo === 'SETD' ? 'number' : 'string' });
    return;
  }
  if (tipo === 'INIT') {
    initsRecibidos++;
    try {
      const json = JSON.parse(linea.slice(linea.indexOf('^') + 1));
      for (const [k, v] of Object.entries(json)) clavesInit.set(k, Array.isArray(v) ? 'array' : (v === null ? 'null' : typeof v));
      eventos.push({ en, dir: 'in', tipo, claves: Object.keys(json).length });
    } catch (e) { eventos.push({ en, dir: 'in', tipo, error: 'json no parseable' }); }
    return;
  }
  // VU2, RTA y compañia: se cuentan, no se guardan uno por uno.
  if (tipo === 'VU2' || tipo === 'RTA' || tipo === 'VUA') return;
  desconocidos.set(tipo, (desconocidos.get(tipo) ?? 0) + 1);
  eventos.push({ en, dir: 'in', tipo, largo: linea.length });
});

await t.conectar(ip);
eventos.push({ en: ahora(), dir: 'out', tipo: 'HANDSHAKE', nota: 'GET /socket.io/1/ y apertura del WebSocket' });
let latidos = 0;
const contarLatidos = setInterval(() => { latidos++; }, 1000);
await new Promise((r) => setTimeout(r, SEGUNDOS * 1000));
clearInterval(contarLatidos);
await t.desconectar();
eventos.push({ en: ahora(), dir: 'out', tipo: 'ALIVE', nota: `latido del protocolo, ~${latidos} veces` });

console.log(`  duracion real: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log(`  INIT recibidos: ${initsRecibidos}${initsRecibidos === 0 ? '  <-- NO se capturo ningun INIT' : ` (${clavesInit.size} claves)`}`);
console.log(`  claves por SETD/SETS: ${recibidas.size}`);
console.log(`  tipos de mensaje: ${[...porTipo].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join(' ')}`);
console.log(`  no identificados: ${desconocidos.size === 0 ? 'ninguno' : [...desconocidos].map(([k, v]) => `${k}×${v}`).join(' ')}`);
console.log(`  emitido por nosotros: apreton de socket.io + ${latidos} ALIVE. Ningun comando de parametro.`);

// **Los datos crudos van a la carpeta PRIVADA, no a la compartible.**
// `curSetup` trae `uniqueid`, que identifica la unidad física, y la primera
// versión de esto lo dejó en la carpeta que se comparte. Lo encontró el chequeo
// de sensibles justo antes de entregar, que existe exactamente para eso.
writeFileSync(join(privada, 'datos-recolector.json'), JSON.stringify({
  identidad: { raiz: { http: raiz.http, tipo: raiz.tipo, bytes: raiz.cuerpo.length, sha256: raiz.sha256, en: raiz.en } ,
               apreton: { http: apreton.http, en: apreton.en } },
  initparams: { url: init.url, urlFinal: init.urlFinal, http: init.http, tipo: init.tipo, bytes: init.cuerpo.length,
                sha256: init.sha256, en: init.en, errorAst: ast.errorAst, netConfigPresente: ast.netConfigPresente,
                curSetup: ast.curSetup, claves: [...ast.claves.entries()] },
  raw: { http: crudo.http, bytes: crudo.cuerpo.length, sha256: crudo.sha256, en: crudo.en, lineas: lineasRaw,
         claves: [...deRaw.entries()].map(([k, v]) => [k, [...v]]), otros: [...otrosRaw.entries()] },
  control: { segundos: SEGUNDOS, initsRecibidos, clavesInit: [...clavesInit.entries()],
             recibidas: [...recibidas.entries()].map(([k, v]) => [k, [...v]]),
             porTipo: [...porTipo.entries()], desconocidos: [...desconocidos.entries()], latidos },
  eventos,
}, null, 2));
console.log('');
console.log(`datos crudos del recolector en ${join(privada, 'datos-recolector.json')} (privado: trae uniqueid)`);
console.log(`originales sin redactar en ${privada}/ (NO se comparten)`);
