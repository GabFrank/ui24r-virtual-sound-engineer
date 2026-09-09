/**
 * Que hay en `var.rta` antes de tocarlo, y si se puede devolver a eso.
 *
 * `var.rta` elige la fuente del analizador y es **global**: no hay una por
 * cliente. Tocarla le cambia la pantalla al operador (R-28).
 *
 * La regla de la fase de mediciones es anotar el valor anterior antes de
 * escribir. Las sondas del analizador no la cumplian: restauraban a cadena
 * vacia, que es una **reconstruccion**, no lo que habia. Esto mide que habia
 * de verdad y si la restauracion devuelve a ese estado.
 */
import { Ui24rTransport } from '@vse/mixer-adapter';

const maquina = process.argv[2] ?? '192.168.0.78';
const t = new Ui24rTransport();
const vistas: string[] = [];
t.alRecibir((l) => {
  if (l.startsWith('SETS^var.rta^') || l.startsWith('SETD^var.rta^')) vistas.push(l);
});

await t.conectar(maquina);
await new Promise((r) => setTimeout(r, 6000));
console.log(`en el volcado, lineas de var.rta: ${vistas.length}`);
for (const v of vistas) console.log(`  ${v}`);
if (vistas.length === 0) {
  console.log('  --> la clave NO viene en el volcado. El estado de reposo es "ausente",');
  console.log('      que no es lo mismo que "cadena vacia": son dos cosas distintas y');
  console.log('      hasta ahora se restauraba a la segunda sin haber comprobado nada.');
}
await t.desconectar();
