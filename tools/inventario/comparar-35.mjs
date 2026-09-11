#!/usr/bin/env node
/**
 * Compara lo observado en la consola real (3.4.8318-ui24) contra el inventario
 * estático de 3.5.8328.
 *
 * **Las dos fuentes no son equivalentes y el informe no las trata como si lo
 * fueran.** Una es tráfico de una consola encendida; la otra, nombres extraídos
 * de un ZIP sin ejecutar el servidor. Una diferencia entre ellas no demuestra un
 * cambio de versión.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [carpeta, md, privada] = process.argv.slice(2);
const d = JSON.parse(readFileSync(join(privada, 'datos-recolector.json'), 'utf8'));
const observadas = new Set(d.raw.claves.map(([k]) => k));

const texto = readFileSync(md, 'utf8');
/** Nombres entre acentos graves al principio de una fila de tabla. */
const literales = new Set();
for (const m of texto.matchAll(/^\| `([^`]+)`/gm)) literales.add(m[1]);

/**
 * Los que parecen una clave del PROTOCOLO, no una ruta de propiedades del
 * cliente.
 *
 * **La primera versión de este filtro no distinguía**, y metía `this.algo`,
 * `selectedStrip.x`, `dynPage.y` y `eq.z` como si fueran familias nuevas del
 * aparato. Son accesos JavaScript de la interfaz. El encargo pide justamente
 * conservar esa diferencia —claves globales contra bindings de widgets— así que
 * se filtra por familia conocida y el resto va a su propio cajón.
 */
const FAMILIAS_DEL_PROTOCOLO = new Set([
  // Documentadas en la tabla de familias del propio inventario 3.5
  'i', 'hw', 'l', 'p', 'f', 's', 'a', 'v', 'm', 'settings', 'var', 'automix',
  'iso', 'hwoutm', 'hwoutaux', 'hwouthp', 'hwouthpdsp', 'usba', 'casc', 'mtk',
  // Observadas en esta consola y no listadas allá
  'usbdaw', 'vg', 'mg', 'afs',
]);
const formaDeClave = (s) => /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9_]+)+$/.test(s) && !s.includes('%') && !s.includes('{');
const todas = [...literales].filter(formaDeClave).sort();
const candidatas = todas.filter((k) => FAMILIAS_DEL_PROTOCOLO.has(k.split('.')[0]));
const rutasDelCliente = todas.filter((k) => !FAMILIAS_DEL_PROTOCOLO.has(k.split('.')[0]));

const normal = (k) => k.replace(/\b\d+\b/g, 'n');
const patronesObservados = new Set([...observadas].map(normal));

const literal = candidatas.filter((k) => observadas.has(k));
const porPatron = candidatas.filter((k) => !observadas.has(k) && patronesObservados.has(normal(k)));
const soloEn35 = candidatas.filter((k) => !observadas.has(k) && !patronesObservados.has(normal(k)));

const familiasObservadas = new Set([...observadas].map((k) => k.split('.')[0]));
const familias35 = new Set(candidatas.map((k) => k.split('.')[0]));
const familiasSoloEn35 = [...familias35].filter((f) => !familiasObservadas.has(f)).sort();
const familiasSoloObservadas = [...familiasObservadas].filter((f) => !familias35.has(f)).sort();

const salida = `# Comparación con el inventario estático 3.5.8328

**Las dos fuentes no son equivalentes, y esta comparación no las trata como si
lo fueran.** Lo observado sale de una consola encendida con firmware
\`3.4.8318-ui24\`; el inventario 3.5 sale de un ZIP analizado estáticamente, sin
ejecutar el servidor ni ver una unidad. Una diferencia entre las dos **no
demuestra un cambio de versión**: puede ser una ruta heredada, una condicional
que no se dio, un nombre de otro modelo, o simplemente algo que no estaba activo
en el momento de la captura.

## Cifras

| | |
|---|---|
| Claves observadas en la consola 3.4 | **${observadas.size}** |
| Nombres literales en el documento 3.5 que tienen forma de clave | **${candidatas.length}** |
| Coincidencia **literal** | **${literal.length}** |
| Coincidencia **por patrón** (mismo nombre con otro índice) | **${porPatron.length}** |
| Referenciadas en 3.5 y **no observadas** en esta captura | **${soloEn35.length}** |

Los conjuntos no se suman entre sí: el documento 3.5 mezcla nombres literales,
sufijos, expresiones sin resolver y cadenas candidatas del binario, y acá sólo se
tomaron las que tienen forma de clave completa.

## Familias

**Sólo en el documento 3.5**, no observadas acá: ${familiasSoloEn35.length === 0 ? '_ninguna_' : familiasSoloEn35.map((f) => `\`${f}\``).join(', ')}

**Sólo observadas en la consola**, no inventariadas en 3.5: ${familiasSoloObservadas.length === 0 ? '_ninguna_' : familiasSoloObservadas.map((f) => `\`${f}\``).join(', ')}

## Referenciadas en 3.5 y no observadas en esta captura

**Esto no significa «introducidas en 3.5».** Significa que no aparecieron en los
${d.control.segundos} segundos de escucha ni en el volcado HTTP de esta unidad,
con esta configuración y en este momento.

${soloEn35.length === 0 ? '_Ninguna._' : soloEn35.map((k) => `- \`${k}\``).join('\n')}

## Qué haría falta para convertir esto en una comparación de versiones

Una captura **equivalente** de una consola con 3.5.8328 encendida: mismo método,
misma duración, misma configuración de capacidades. Sin eso, lo único que se
puede afirmar es lo que dice cada fila de arriba, con su calificativo.

También ayudaría una captura de 3.4 con **otras condiciones activas** —cascada
conectada, multipista grabando, soundcheck encendido, efectos en uso— porque
varias de las no observadas pertenecen a modos que esta captura no ejerció.

## Rutas de propiedades del cliente, apartadas a propósito

El documento 3.5 mezcla claves del protocolo con accesos JavaScript de la
interfaz —\`this.algo\`, \`selectedStrip.x\`, \`dynPage.y\`— y con sufijos
relativos. **${rutasDelCliente.length}** nombres con forma de clave caen en ese
grupo y no entran en las cifras de arriba: son bindings de widgets, no
parámetros publicados. Familias: ${[...new Set(rutasDelCliente.map((k) => k.split('.')[0]))].sort().map((f) => `\`${f}\``).join(', ')}

Meterlos en el conteo habría inflado el inventario con nombres que el aparato no
manda nunca, que es exactamente lo que el encargo pide no hacer.

## Lo que este documento NO hace

- No usa los 1.437 nombres obtenidos en 3.5 mediante sondas de reset. Ese
  conjunto se generó con sustitutos de setters y capacidades hipotéticas: es
  evidencia del cliente, no publicación real.
- No construye claves combinando familias con sufijos.
- No convierte un patrón con \`%d\` o \`{expresión}\` en una clave concreta.
`;
writeFileSync(join(carpeta, 'COMPARACION-ESTATICA-3.5.md'), salida);
console.log(`literales con forma de clave en 3.5: ${candidatas.length}`);
console.log(`  coincidencia literal:   ${literal.length}`);
console.log(`  coincidencia por patron: ${porPatron.length}`);
console.log(`  no observadas aca:       ${soloEn35.length}`);
console.log(`familias solo en 3.5: ${familiasSoloEn35.join(' ') || 'ninguna'}`);
console.log(`familias solo observadas: ${familiasSoloObservadas.join(' ') || 'ninguna'}`);
console.log(`rutas de propiedades del cliente, apartadas: ${rutasDelCliente.length}`);
