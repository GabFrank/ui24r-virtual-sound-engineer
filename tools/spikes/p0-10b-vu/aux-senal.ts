import { spawn } from 'node:child_process';
import { Ui24rTransport, codificarSetd, decodificarVuBuses, dbDeMedidor } from '@vse/mixer-adapter';
import { exigirClave } from '../canal-muerto.ts';
const t = new Ui24rTransport();
let ult: ReturnType<typeof decodificarVuBuses> | null = null;
const previos = new Map<string, number>();
t.alRecibir((l) => {
  if (l.startsWith('VU2^')) { ult = decodificarVuBuses(l.slice(4)); return; }
  const [c, r, v] = l.split('^');
  if (c === 'SETD' && r && /^i\.9\.aux\.0\.value$/.test(r) && !previos.has(r)) previos.set(r, Number(v));
});
await t.conectar('192.168.0.78');
await new Promise((r) => setTimeout(r, 5000));
// Fuente propia: la musica de 21/22 se apago, y sin senal la prueba no dice nada.
const sonando = spawn('afplay', ['/tmp/vse-comp.wav']);
await new Promise((r) => setTimeout(r, 2500));
const db = (x: number): string => { const v = dbDeMedidor(x); return Number.isFinite(v) ? v.toFixed(1) : '-inf'; };
const mostrar = (etiqueta: string): void => {
  const a = ult?.auxiliares[0];
  console.log(`${etiqueta.padEnd(34)} aux 1: pre=${(a ? db(a.pre) : '?').padStart(6)}  post=${(a ? db(a.post) : '?').padStart(6)}`);
};
try {
  mostrar('envio en 0 (reposo)');
  t.enviar(codificarSetd('i.9.aux.0.value', 0.85));
  await new Promise((r) => setTimeout(r, 3000));
  mostrar('envio del canal 10 (tono) al aux 1');
} finally {
  sonando.kill();
  // **Se exige la clave en vez de suponerla.** Un `?? valor` antes de una
  // escritura no es un valor por omision: es una suposicion disfrazada de
  // lectura, y con una lectura HTTP fallida --que devuelve un mapa vacio--
  // restauraba la consola a un numero inventado. Auditoria del 2026-09-12.
  t.enviar(codificarSetd('i.9.aux.0.value', Number(exigirClave(previos, 'i.9.aux.0.value'))));
  await new Promise((r) => setTimeout(r, 1500));
  console.log(`restaurado: i.9.aux.0.value = ${previos.get('i.9.aux.0.value')}`);
  await t.desconectar();
}
