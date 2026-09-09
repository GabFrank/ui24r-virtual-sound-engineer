/**
 * El techo del medidor, sin cadena analogica en el medio.
 *
 * El proyecto tenia documentado que el byte se clava en 239. Ese numero se
 * midio con fuente externa y ganancia al maximo, o sea que 239 puede ser donde
 * satura la Scarlett y no donde satura el medidor. Es el mismo error que ya
 * costo el episodio de los 84,5 dB, aplicado al techo en vez de a la escala.
 *
 * Metodo: dejar el nivel PRE-fader por debajo de la saturacion --alrededor de
 * 230-- y subir el FADER, que es ganancia digital interna. Si el numero sigue
 * creciendo linealmente por encima de 239, el 239 no era del medidor.
 *
 * Toca el supresor de realimentacion del general: los tonos sostenidos le
 * ensenan filtros. Se anota m.afs.enabled y se devuelve. Autorizado por el
 * dueno del equipo para esta medicion.
 */
import { spawn } from 'node:child_process';
import { Ui24rTransport, codificarSetd, decodificarVuCanales, VU_ESCALA } from '@vse/mixer-adapter';

const CANAL = 10, N = 9;
const t = new Ui24rTransport();
const previos = new Map<string, number>();
const VIGILADAS = /^(m\.afs\.enabled|hw\.9\.gain|i\.9\.mix|i\.9\.mute)$/;
let ult: ReturnType<typeof decodificarVuCanales> = [];

t.alRecibir((l) => {
  if (l.startsWith('VU2^')) { ult = decodificarVuCanales(l.slice(4)); return; }
  const [c, r, v] = l.split('^');
  if (c === 'SETD' && r && VIGILADAS.test(r) && !previos.has(r)) previos.set(r, Number(v));
});

const bytes = (): { pre: number; ent: number; sal: number } => {
  const m = ult[CANAL - 1];
  if (!m) return { pre: -1, ent: -1, sal: -1 };
  const b = (x: number): number => Math.round(x / VU_ESCALA);
  return { pre: b(m.pre), ent: b(m.entrada), sal: b(m.salida) };
};

await t.conectar('192.168.0.78');
await new Promise((r) => setTimeout(r, 5000));

let sonando: ReturnType<typeof spawn> | null = null;
try {
  console.log(`m.afs.enabled antes = ${previos.get('m.afs.enabled')}`);
  t.enviar(codificarSetd('m.afs.enabled', 0));
  await new Promise((r) => setTimeout(r, 1500));

  sonando = spawn('afplay', ['/tmp/vse-comp.wav']);
  await new Promise((r) => setTimeout(r, 2500));

  // Ganancia tal que el PRE quede alto pero sin saturar.
  for (const g of [0.85, 0.90, 0.95, 1.0]) {
    t.enviar(codificarSetd('hw.9.gain', g));
    await new Promise((r) => setTimeout(r, 2500));
    const b = bytes();
    console.log(`  hw.9.gain=${g.toFixed(2)}  ->  pre=${b.pre}  entrada=${b.ent}`);
    // Se busca el previo mas alto que NO sature la cadena: si dos ganancias
    // seguidas dan el mismo byte, la Scarlett ya esta recortando y subir mas
    // solo mide su techo, no el del medidor.
    if (b.pre >= 225) { console.log(`  --> se usa esta, pre=${b.pre}`); break; }
  }

  console.log('');
  console.log('Ahora el FADER, que es ganancia digital: si la salida pasa de 239,');
  console.log('el 239 era de la cadena analogica y no del medidor.');
  console.log('  fader     pre   entrada   salida');
  for (const f of [0.7647058824, 0.85, 0.90, 0.95, 1.0]) {
    t.enviar(codificarSetd('i.9.mix', f));
    await new Promise((r) => setTimeout(r, 2500));
    const b = bytes();
    console.log(`  ${f.toFixed(4)}   ${String(b.pre).padStart(3)}   ${String(b.ent).padStart(5)}   ${String(b.sal).padStart(6)}`);
  }
} finally {
  if (sonando) sonando.kill();
  for (const [r, v] of previos) t.enviar(codificarSetd(r, v));
  await new Promise((r) => setTimeout(r, 2500));
  console.log('');
  console.log('restaurado:');
  for (const [r, v] of previos) console.log(`  ${r} = ${v}`);
  await t.desconectar();
}
