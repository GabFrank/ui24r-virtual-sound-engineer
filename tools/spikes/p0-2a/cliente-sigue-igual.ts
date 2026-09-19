/**
 * ¿El cliente de la consola sigue diciendo lo que dice nuestro extracto?
 *
 * **Qué compara.** Baja `mixer.html` de la consola y contrasta **cada función de
 * conversión** del extracto archivado
 * —`docs/spikes/SPK-P0.2a/evidence/tablas-conversion-ui24r.js`— contra la que la
 * consola sirve hoy. No sube el cliente entero a ningún lado: es código del
 * fabricante y este repositorio es público. Sólo informa si coinciden, y deja la
 * huella de lo que se bajó.
 *
 * **Por qué hace falta.** Ese extracto se tomó el 2026-09-08, de otra dirección
 * —`192.168.0.49`— y **nadie volvió a comprobar que siguiera valiendo**. De él
 * cuelgan todas las leyes de presentación del proyecto, que es la mitad de lo que
 * la aplicación necesita para hablarle al usuario en unidades reales. Un extracto
 * que se da por vigente sin comprobarlo es exactamente la clase de afirmación que
 * `protocolo-de-verificacion.md` describe: concordancia interna sin procedencia.
 *
 * **Y hay un caso concreto que lo vuelve urgente.** La tabla de conversión declaró
 * durante meses que la ganancia del ecualizador de canal era ±15 dB. El extracto
 * archivado tiene, en líneas consecutivas, `VtoEQGAIN15` y `VtoEQGAIN20`. El ítem
 * 108 midió el 2026-09-16 contra el filtro real y dio `40·V − 20`, o sea la
 * segunda. La respuesta estaba archivada desde el 2026-09-08 y se leyó la función
 * de al lado.
 *
 * **Lo que esto NO dice, y conviene tenerlo claro.** Que el cliente diga una
 * fórmula no la convierte en la ley del aparato: es lo que la **pantalla
 * muestra**, no necesariamente lo que el audio hace. Este proyecto ya tiene el
 * contraejemplo: `VtoTHRESH` y `VtoRATIO` están en este mismo archivo y la
 * medición 97 los **refutó** contra el comportamiento real. Por eso las fórmulas
 * del cliente entran como `INFERIDO` y no como `PROBADO`, y por eso el 108 se
 * midió igual aunque la fórmula ya estuviera a la vista.
 *
 * **No escribe nada en la consola.** Es un `GET` de una página estática, el mismo
 * que hace cualquier navegador al abrir la mesa.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-2a/cliente-sigue-igual.ts 192.168.0.78
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { argTexto } from '../argumentos.ts';

const maquina = argTexto(2, '192.168.0.78');
const EXTRACTO = 'docs/spikes/SPK-P0.2a/evidence/tablas-conversion-ui24r.js';

/**
 * Las funciones de un texto, con su cuerpo, contando llaves.
 *
 * **Se cuentan llaves en vez de usar una expresión regular con `[^}]*`.** La
 * versión ingenua corta en la primera llave de cierre, así que se come cualquier
 * función con un `if` adentro y las declara distintas sin serlo: un falso
 * positivo en una guarda que existe para avisar de cambios reales es la forma más
 * rápida de que alguien la apague.
 */
function funciones(texto: string): Map<string, string> {
  const d = new Map<string, string>();
  const re = /function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null) {
    const nombre = m[1]!;
    if (d.has(nombre)) continue;
    let prof = 0;
    for (let j = m.index + m[0].length - 1; j < Math.min(m.index + 4000, texto.length); j++) {
      if (texto[j] === '{') prof++;
      else if (texto[j] === '}') {
        prof--;
        if (prof === 0) { d.set(nombre, texto.slice(m.index, j + 1)); break; }
      }
    }
  }
  return d;
}

/** Sin espacios: el minificador del fabricante puede reformatear sin cambiar nada. */
const desnudo = (s: string): string => s.replace(/\s+/g, '');

const res = await fetch(`http://${maquina}/mixer.html`);
if (!res.ok) throw new Error(`la consola ${maquina} contesto ${res.status} a /mixer.html`);
const vivo = await res.text();
const huella = createHash('sha256').update(vivo).digest('hex');

const archivado = readFileSync(EXTRACTO, 'utf8');
const a = funciones(archivado);
const v = funciones(vivo);

console.log(`=== EL CLIENTE DE ${maquina} CONTRA EL EXTRACTO ARCHIVADO ===`);
console.log('');
console.log(`   extracto:  ${EXTRACTO}`);
console.log(`   servido:   http://${maquina}/mixer.html  (${vivo.length} bytes)`);
console.log(`   sha256:    ${huella}`);
console.log('');

const comunes = [...a.keys()].filter((n) => v.has(n)).sort();
const distintas = comunes.filter((n) => desnudo(a.get(n)!) !== desnudo(v.get(n)!));
const ausentes = [...a.keys()].filter((n) => !v.has(n)).sort();

console.log(`   funciones en el extracto:        ${a.size}`);
console.log(`   de esas, presentes en la consola: ${comunes.length}`);
console.log(`   identicas:                        ${comunes.length - distintas.length}`);
console.log(`   distintas:                        ${distintas.length}`);
console.log(`   ausentes en la consola:           ${ausentes.length}`);
console.log('');

for (const n of distintas) {
  console.log(`   ✘ ${n} CAMBIO`);
  console.log(`      archivado: ${a.get(n)!.replace(/\s+/g, ' ').slice(0, 160)}`);
  console.log(`      hoy:       ${v.get(n)!.replace(/\s+/g, ' ').slice(0, 160)}`);
}
for (const n of ausentes) console.log(`   ✘ ${n} ya no esta en el cliente`);

console.log('');
if (distintas.length === 0 && ausentes.length === 0) {
  console.log('   EL EXTRACTO SIGUE VALIENDO. Las leyes de presentacion que cuelgan de el');
  console.log('   describen lo que esta consola muestra hoy.');
} else {
  console.log('   EL EXTRACTO QUEDO VIEJO. Hay que rehacerlo, y revisar todo lo que');
  console.log('   afirma sobre las funciones que cambiaron.');
  process.exitCode = 1;
}
console.log('');
console.log('   Recordatorio: que el cliente diga una formula es lo que la PANTALLA');
console.log('   muestra, no lo que el audio hace. Entran como INFERIDO. La medicion 97');
console.log('   refuto VtoTHRESH y VtoRATIO de este mismo archivo.');
