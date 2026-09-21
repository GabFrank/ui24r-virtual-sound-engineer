/**
 * Los preajustes de la consola, preguntados por el protocolo. **SÓLO LEE.**
 *
 * **Qué contesta.** Tres preguntas que el hallazgo de los preajustes dejó
 * abiertas el 2026-09-20 y que decidían el diseño de la pieza 2: si el
 * protocolo deja **listar** los preajustes, si deja **leer** el contenido de
 * uno, y --como consecuencia de leerlos-- con qué curvas trabaja el usuario de
 * verdad. Guardar (`WRITEPRESET`), renombrar y borrar existen en el mismo
 * vocabulario y **este guion no los usa**: escribir en el aparato de alguien es
 * otra decisión y va por su camino.
 *
 * **La gramática sale del cliente que sirve la propia consola** --`mixer.html`,
 * el objeto `PRESETS`-- y es la misma que el manual técnico archivado describe:
 *
 *   PRESETLIST^<categoria>            -> PRESETLIST^<categoria>^<item>^<item>…
 *   READPRESET^<categoria>^<nombre>   -> READPRESET^<categoria>^<nombre>^<JSON>
 *
 * Los nombres vuelven con prefijo: `f:` los de fábrica, `u:` los del usuario.
 *
 * **Por qué se decodifica acá.** Un preajuste guarda el crudo 0…1 de cada
 * parámetro, que no le dice nada a nadie. Las leyes que lo pasan a hercios,
 * decibeles y Q son las **medidas contra este aparato** y viven en `RAW_MAP`
 * (`i.N.eq.b1.freq`, `i.N.eq.b1.q`, `i.N.eq.bK.gain`); se repiten abajo para que
 * el archivo de evidencia se pueda leer solo, con la advertencia de que la
 * frecuencia y el Q están medidos **en la banda 1 solamente**.
 *
 * Uso: `node tools/spikes/p0-2b-eq/preajustes.ts [ip]`
 */
import { Cliente, dormir } from '../auditoria/cliente.ts';
import { soloLectura } from '../solo-lectura.ts';

const IP_POR_DEFECTO = '192.168.0.78';
const ip = process.argv[2] ?? IP_POR_DEFECTO;

// Las categorías que el cliente de la consola nombra al abrir su gestor de
// preajustes: `new PRESET_MENU2(null, "<categoria>", …)`.
const CATEGORIAS = [
  'ch', 'eqch', 'dynch', 'gate', 'digi',
  'eqaux', 'dynaux', 'eqm', 'dynm', 'chm',
  'afs', 'fxrev', 'fxroom', 'fxcho', 'fxdel',
];

// Las tres leyes medidas del ecualizador de canal. Ver `RAW_MAP`.
const aHz = (v: number) => 20 * Math.pow(1102.5, v);
const aQ = (v: number) => 0.05 * Math.pow(300, v);
const aDb = (v: number) => 40 * v - 20;

process.env.UI24R_HOST = ip;
const c = new Cliente();
// **La conexión no puede escribir.** No es una promesa del comentario: `pedir`
// rechaza cualquier orden que no esté en la lista de las que piden datos.
const lector = soloLectura(c);
const lineas: string[] = [];
c.al((l) => lineas.push(l));

async function preguntar(orden: string, prefijo: string, esperaMs = 1500): Promise<string | null> {
  const desde = lineas.length;
  lector.pedir(orden);
  const limite = Date.now() + esperaMs;
  while (Date.now() < limite) {
    await dormir(50);
    const hit = lineas.slice(desde).find((l) => l.startsWith(prefijo));
    if (hit !== undefined) return hit;
  }
  return null;
}

console.log(`=== PREAJUSTES DE LA CONSOLA, LEÍDOS POR EL PROTOCOLO ===`);
console.log(`consola: ${ip}`);
console.log(`fecha:   ${new Date().toISOString()}`);
console.log(`espera por respuesta: 1500 ms · categorías preguntadas: ${CATEGORIAS.length}`);
console.log(`escrituras: NINGUNA. Sólo PRESETLIST y READPRESET.`);
console.log('');

await c.conectar('preajustes');
// La consola manda su estado entero al conectar; se le deja terminar.
await dormir(2000);
console.log(`líneas recibidas en el volcado inicial: ${lineas.length}`);
console.log('');

const delUsuario: { categoria: string; nombre: string }[] = [];

console.log('=== 1. LISTAR: PRESETLIST^<categoria> ===');
for (const cat of CATEGORIAS) {
  const r = await preguntar(`PRESETLIST^${cat}`, `PRESETLIST^${cat}^`);
  if (r === null) {
    console.log(`${cat.padEnd(7)} | SIN RESPUESTA en 1500 ms`);
    continue;
  }
  const partes = r.split('^').slice(2).filter((s) => s !== '');
  const fab = partes.filter((p) => p.startsWith('f:')).map((p) => p.slice(2));
  const usr = partes.filter((p) => p.startsWith('u:')).map((p) => p.slice(2));
  const otros = partes.filter((p) => !p.startsWith('f:') && !p.startsWith('u:'));
  console.log(`${cat.padEnd(7)} | fábrica ${String(fab.length).padStart(3)} | usuario ${String(usr.length).padStart(3)}` +
    (otros.length > 0 ? ` | sin prefijo ${otros.length}: ${otros.join(', ')}` : ''));
  if (usr.length > 0) console.log(`${' '.repeat(9)} del usuario: ${usr.join(' · ')}`);
  for (const n of usr) delUsuario.push({ categoria: cat, nombre: n });
}
console.log('');

console.log('=== 2. LEER: READPRESET^<categoria>^u:<nombre> ===');
console.log(`preajustes propios encontrados: ${delUsuario.length}`);
console.log('');
for (const { categoria, nombre } of delUsuario) {
  const r = await preguntar(`READPRESET^${categoria}^u:${nombre}`, `READPRESET^${categoria}^`);
  if (r === null) {
    console.log(`--- ${categoria} / ${nombre}: SIN RESPUESTA en 1500 ms`);
    continue;
  }
  const partes = r.split('^');
  const crudo = partes[3];
  console.log(`--- ${categoria} / ${nombre}`);
  if (crudo === undefined) {
    console.log(`    respuesta sin cuerpo: ${r}`);
    continue;
  }
  let datos: Record<string, unknown>;
  try {
    datos = JSON.parse(crudo) as Record<string, unknown>;
  } catch {
    console.log(`    cuerpo que no es JSON: ${crudo.slice(0, 200)}`);
    continue;
  }
  console.log(`    claves: ${Object.keys(datos).length}`);
  console.log(`    crudo:  ${JSON.stringify(datos)}`);
  if (categoria === 'eqch' || categoria === 'ch') {
    const hpf = datos['.eq.hpf.freq'];
    if (typeof hpf === 'number') {
      console.log(`    pasa-altos: ${hpf === 0 ? 'apagado' : `${Math.min(aHz(hpf), 1000).toFixed(0)} Hz`}`);
    }
    for (let b = 1; b <= 4; b++) {
      const f = datos[`.eq.b${b}.freq`];
      const g = datos[`.eq.b${b}.gain`];
      const q = datos[`.eq.b${b}.q`];
      if (typeof f !== 'number' || typeof g !== 'number' || typeof q !== 'number') continue;
      console.log(`    banda ${b}: ${aHz(f).toFixed(0).padStart(6)} Hz  ` +
        `${aDb(g) >= 0 ? '+' : ''}${aDb(g).toFixed(1).padStart(5)} dB  Q ${aQ(q).toFixed(2)}`);
    }
  }
}

console.log('');
console.log('=== FIN. Ninguna clave de la consola fue escrita. ===');
c.cerrar();
process.exit(0);
