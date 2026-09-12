/**
 * Qué rutas pasan el motor de seguridad, contra el inventario real.
 *
 * Existe porque clasificar una ruta **no es autorizarla**, y el 2026-09-11 se
 * confundieron las dos cosas: ampliar el clasificador convirtió «ruta
 * desconocida» --que es un rechazo-- en una categoría con dueño, y algunas de
 * esas categorías son escribibles.
 */
import { readFileSync } from 'node:fs';
import { SafetyEngine } from '../../packages/safety/src/engine.ts';
import { clasificarRuta } from '../../packages/mixer-adapter/src/clasificar-ruta.ts';
import { contexto } from '../../packages/safety/test/helpers.ts';

const claves = readFileSync('docs/inventario/3.4.8318-ui24-2026-09-11/keys-observed.txt', 'utf8').trim().split('\n');
// **Sin `as`.** La primera version ponia `sessionState: 'CONFIGURANDO_CANALES'`
// --que no existe; el valor es `CHANNEL_SETUP`-- y lo forzaba con un cast. El
// cast tapo el error y el conteo salio de un contexto invalido.
// **Un solo contexto, el del test, y no una copia.** Acá había una copia escrita
// a mano, y la copia se quedó sin `techoPorRuta` cuando ADR-028 lo agregó al
// contexto: esta herramienta lanzaba `TypeError: Cannot read properties of
// undefined (reading 'get')` en el primer envío a monitor del inventario. O sea
// que la única pieza que muestra *cuáles* rutas entran --el test muestra
// cuántas-- quedó muerta justo desde el commit que abrió 240 rutas nuevas.
//
// Nadie lo vio porque `tools/inventario` no es un espacio de trabajo y
// `npm run lint` corre por espacio de trabajo. `tsc` lo decía (TS2741) y nadie
// le preguntaba.
//
// Guardarlo con una guarda habría sido el arreglo chico. El arreglo es que no
// haya dos: **la herramienta y el test miden la misma puerta o no sirven para
// compararse**, y dos definiciones del contexto pueden separarse en silencio,
// que es exactamente lo que pasó. Las magnitudes vienen del mismo lugar por la
// misma razón: el motor juzga el tope y el techo contra `magnitudPropuesta`, así
// que pasarlas distintas mide otra puerta.
const ctx = contexto({ busesDeSalidaPermitidos: new Set(['m']) });
const e = new SafetyEngine();
const permitidas: string[] = [];
for (const path of claves) {
  const kind = clasificarRuta(path);
  if (kind === null) continue;
  // Las magnitudes también faltaban. **No son un relleno**: el motor juzga el
  // tope y el techo contra `magnitudPropuesta`, así que una herramienta que no
  // las pase mide otra puerta que la que corre. Van con el mismo valor que el
  // test guarda, para que las dos cuenten lo mismo.
  const v = e.evaluar([{
    kind, path, unidad: 'dB', valorPropuesto: 1, valorEsperado: 0,
    magnitudPropuesta: 1, magnitudEsperada: 0,
  }], ctx, { conexionPermiteEscribir: true, snapshotVerificado: true });
  if (v.permitido) permitidas.push(path);
}
console.log(`rutas que el motor PERMITE escribir: ${permitidas.length}`);
console.log('');
console.log('por prefijo de ruta:');
const fam = new Map<string, number>();
for (const p of permitidas) { const f = p.split('.')[0]!; fam.set(f, (fam.get(f) ?? 0) + 1); }
for (const [f, n] of [...fam].sort((a, b) => b[1] - a[1])) console.log(`  ${f.padEnd(10)} ${String(n).padStart(4)}`);
// **Y por categoría, que es lo que las decisiones nombran.** Un ADR abre un
// `kind`, no un prefijo: el reparto por prefijo no dice si lo que entró es el
// ecualizador o el paneo. Es el mismo reparto que fija
// `que-permite-el-motor.test.ts`, y tenerlo acá sirve para mirarlo cuando ese
// test falla.
console.log('');
console.log('por categoria de parametro:');
const porKind = new Map<string, number>();
for (const p of permitidas) {
  const k = clasificarRuta(p);
  if (k !== null) porKind.set(k, (porKind.get(k) ?? 0) + 1);
}
for (const [k, n] of [...porKind].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(20)} ${String(n).padStart(4)}`);
console.log('');
console.log('las de entrada de linea y las del general:');
for (const p of permitidas.filter((x) => x.startsWith('l.') || x.startsWith('m.'))) console.log(`  ${p}`);
