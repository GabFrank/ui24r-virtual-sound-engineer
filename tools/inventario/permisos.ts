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
import type { ContextoSeguridad } from '../../packages/safety/src/types.ts';

const claves = readFileSync('docs/inventario/3.4.8318-ui24-2026-09-11/keys-observed.txt', 'utf8').trim().split('\n');
// **Sin `as`.** La primera version ponia `sessionState: 'CONFIGURANDO_CANALES'`
// --que no existe; el valor es `CHANNEL_SETUP`-- y lo forzaba con un cast. El
// cast tapo el error y el conteo salio de un contexto invalido.
const ctx: ContextoSeguridad = {
  sessionState: 'CHANNEL_SETUP', nivelAutonomia: 'ASSISTED',
  acumuladoPorRuta: new Map(), rutasConMedicionPosterior: new Set(), rutasYaTocadas: new Set(),
  hayTakeDeSoundcheckActivo: false, busesDeSalidaPermitidos: new Set(['m']),
  confianza: 'HIGH', aprobacionExplicita: true,
};
const e = new SafetyEngine();
const permitidas: string[] = [];
for (const path of claves) {
  const kind = clasificarRuta(path);
  if (kind === null) continue;
  const v = e.evaluar([{ kind, path, unidad: 'dB', valorPropuesto: 1, valorEsperado: 0 }],
    ctx, { conexionPermiteEscribir: true, snapshotVerificado: true });
  if (v.permitido) permitidas.push(path);
}
console.log(`rutas que el motor PERMITE escribir: ${permitidas.length}`);
const fam = new Map<string, number>();
for (const p of permitidas) { const f = p.split('.')[0]!; fam.set(f, (fam.get(f) ?? 0) + 1); }
for (const [f, n] of [...fam].sort((a, b) => b[1] - a[1])) console.log(`  ${f.padEnd(10)} ${String(n).padStart(4)}`);
console.log('');
console.log('las de entrada de linea y las del general:');
for (const p of permitidas.filter((x) => x.startsWith('l.') || x.startsWith('m.'))) console.log(`  ${p}`);
