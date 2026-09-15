#!/usr/bin/env node
/**
 * Construye los entregables del inventario a partir de `_datos.json`.
 *
 * Separado del recolector a propósito: el recolector toca la consola una sola
 * vez y deja la evidencia cruda; esto se puede volver a correr cuantas veces
 * haga falta sin tocar nada.
 *
 * **Lo que NO sale en la entrega compartible**: valores. Sólo nombres, tipos y
 * procedencia. El identificador único de la unidad, la configuración de red y
 * cualquier clave con `pass` en el nombre se inventarían por su nombre y su
 * valor se omite.
 *
 * Uso: node tools/inventario/entregables.mjs <carpeta> <carpetaPrivada>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [carpeta = 'inventario', privada = 'privado'] = process.argv.slice(2);
const d = JSON.parse(readFileSync(join(privada, 'datos-recolector.json'), 'utf8'));

const ip = new Map(d.initparams.claves);
const raw = new Map(d.raw.claves.map(([k, v]) => [k, v]));
const ctrl = new Map(d.control.recibidas.map(([k, v]) => [k, v]));

const FIRMWARE = '3.4.8318-ui24';
const CAPTURA = d.raw.en.slice(0, 10);

/** Valores que no se publican aunque su clave sí se inventaríe. */
const SENSIBLE = /pass|password|uniqueid|ssid|wpa|key$/i;

const union = [...new Set([...ip.keys(), ...raw.keys(), ...ctrl.keys()])].sort();

/** La familia y los índices de una clave, sin inventar continuidad. */
function descomponer(clave) {
  const partes = clave.split('.');
  const familia = partes[0];
  const indices = [];
  for (const p of partes) if (/^\d+$/.test(p)) indices.push(Number(p));
  const patron = partes.map((p) => (/^\d+$/.test(p) ? '{n}' : p)).join('.');
  return { familia, indices, patron };
}

const registros = union.map((clave) => {
  const tipos = new Set([...(ip.get(clave) ? [ip.get(clave)] : []), ...(raw.get(clave) ?? []), ...(ctrl.get(clave) ?? [])]);
  const origenes = [];
  if (ip.has(clave)) origenes.push('http_initial_state');
  if (raw.has(clave)) origenes.push('http_raw_stream');
  if (ctrl.has(clave)) origenes.push(...[...(ctrl.get(clave) ?? [])].map((t) => (t === 'string' ? 'received_SETS' : 'received_SETD')));
  const { familia, indices, patron } = descomponer(clave);
  return {
    key: clave,
    family: familia,
    pattern: patron,
    indicesObserved: indices,
    typesObserved: [...tipos].sort(),
    origins: [...new Set(origenes)].sort(),
    firstSeenAt: d.raw.en,
    lastSeenAt: d.control.recibidas.some(([k]) => k === clave) ? d.eventos[d.eventos.length - 1]?.en ?? null : d.raw.en,
    sessionIds: ['sesion-1'],
    evidenceIds: ['initparams.js', '/raw', 'control-90s'].filter((_, i) =>
      [ip.has(clave), raw.has(clave), ctrl.has(clave)][i]),
    receivedUpdateCount: null,
    sentUpdateCount: 0,
    publicationStatus: ctrl.has(clave) || raw.has(clave) ? 'published_observed' : 'http_only',
    writability: 'not_tested',
    valueRedacted: SENSIBLE.test(clave),
    notes: [],
  };
});

writeFileSync(join(carpeta, 'keys-observed.json'), JSON.stringify({
  firmware: FIRMWARE,
  capturedAt: d.raw.en,
  schema: 'ui24r-key-inventory/1',
  counts: { unique: registros.length, byOrigin: {
    http_initial_state: ip.size, http_raw_stream: raw.size, control_channel: ctrl.size,
  } },
  keys: registros,
}, null, 2));

writeFileSync(join(carpeta, 'keys-observed.txt'), union.join('\n') + '\n');

// --- familias y patrones
const porFamilia = new Map();
const porPatron = new Map();
for (const r of registros) {
  porFamilia.set(r.family, (porFamilia.get(r.family) ?? 0) + 1);
  porPatron.set(r.pattern, (porPatron.get(r.pattern) ?? 0) + 1);
}
const familias = [...porFamilia].sort((a, b) => b[1] - a[1]);
const patrones = [...porPatron].sort((a, b) => b[1] - a[1]);

writeFileSync(join(carpeta, 'capture-metadata.json'), JSON.stringify({
  firmware: FIRMWARE,
  model: 'ui24', type: '8ch', flavour: '1', schema: '6',
  capabilities: d.initparams.curSetup ? Object.fromEntries(
    Object.entries(d.initparams.curSetup).filter(([k]) => k !== 'uniqueid')) : null,
  note: 'uniqueid omitido a propósito: identifica la unidad física.',
  transport: { protocol: 'socket.io 0.9, protocolo 1', wrapper: '3:::<mensaje>', handshake: 'GET /socket.io/1/' },
  sessions: [{
    id: 'sesion-1', startedAt: d.eventos.find((e) => e.tipo === 'HANDSHAKE')?.en ?? null,
    durationSeconds: d.control.segundos, initReceived: d.control.initsRecibidos,
    reconnections: 0,
  }],
  httpSources: [
    { path: '/js/initparams.js', status: d.initparams.http, contentType: d.initparams.tipo,
      bytes: d.initparams.bytes, sha256: d.initparams.sha256, at: d.initparams.en, parsedWith: 'acorn AST, sin evaluar' },
    { path: '/raw', status: d.raw.http, bytes: d.raw.bytes, sha256: d.raw.sha256, at: d.raw.en,
      note: 'flujo que no cierra; curl sale con 28 y los datos ya llegaron' },
  ],
  emittedByCollector: {
    handshake: 1, ALIVE: d.control.latidos, parameterWrites: 0,
    note: 'ALIVE es el latido que el protocolo exige. No se envió INIT ni ningún comando de parámetro.',
  },
  counts: {
    uniqueKeysObserved: registros.length,
    fromHttpInitialState: ip.size, fromHttpRawStream: raw.size, fromControlChannel: ctrl.size,
    onlyLocal: 0, onlySent: 0,
    families: familias.length, patterns: patrones.length,
    messageTypes: Object.fromEntries(d.control.porTipo),
  },
}, null, 2));

// --- eventos redactados
const lineas = d.eventos.map((e) => JSON.stringify({ ...e, sesion: 'sesion-1' }));
lineas.push(JSON.stringify({ resumen: 'telemetria de alta frecuencia', politica: 'VU2, RTA y VUA se cuentan y no se guardan uno por uno: son medidores, no claves de estado', conteos: Object.fromEntries(d.control.porTipo) }));
writeFileSync(join(carpeta, 'capture-events-redacted.jsonl'), lineas.join('\n') + '\n');

console.log(`claves únicas: ${registros.length}`);
console.log(`familias: ${familias.length}`);
console.log(`patrones normalizados: ${patrones.length}`);
console.log('');
console.log('familias por tamaño:');
for (const [f, n] of familias) console.log(`  ${f.padEnd(12)} ${String(n).padStart(5)}`);
writeFileSync(join(privada, 'familias.json'), JSON.stringify({ familias, patrones: patrones.slice(0, 200) }, null, 2));
