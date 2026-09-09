/**
 * El detector de realimentacion contra el espectro de verdad.
 *
 * Un test sintetico solo comprueba que mi campana pasa mi regla. Esto lo corre
 * sobre lo que manda la consola, con dos fuentes que tienen que dar respuestas
 * distintas:
 *
 *   - Canal 10, tono de 1 kHz sostenido -> es lo mas parecido a una
 *     realimentacion que se puede provocar sin provocar una: una banda
 *     estrecha que no cae. TIENE que salir.
 *   - Canales 21/22, musica -> se mueve todo el tiempo. NO deberia salir, o
 *     como mucho de a ratos.
 *
 * Toma prestado el analizador con `tomarAnalizador()`, que lee `var.rta` antes
 * de escribir y lo devuelve a lo que habia (ADR-025).
 */
import { spawn } from 'node:child_process';
import { Ui24rTransport, decodificarEspectro, hayEspectro } from '@vse/mixer-adapter';
import { VigilanteDeRealimentacion } from '@vse/assistants';
import { tomarAnalizador } from './analizador.ts';

const maquina = process.argv[2] ?? '192.168.0.78';

const t = new Ui24rTransport();
const analizador = tomarAnalizador(t);
const vigilante = new VigilanteDeRealimentacion();

let mirando = '';
let tramas = 0;
const avisos = new Map<number, { hz: number; veces: number; maxMs: number }>();

t.alRecibir((l) => {
  if (!l.startsWith('RTA^')) return;
  const bandas = decodificarEspectro(l.slice(4));
  if (!hayEspectro(bandas)) return;
  tramas++;
  for (const c of vigilante.observar(bandas, Date.now())) {
    const previo = avisos.get(c.banda) ?? { hz: c.hz, veces: 0, maxMs: 0 };
    avisos.set(c.banda, { hz: c.hz, veces: previo.veces + 1, maxMs: Math.max(previo.maxMs, c.sostenidaMs) });
  }
});

await t.conectar(maquina);
await new Promise((r) => setTimeout(r, 5000));

async function mirar(fuente: string, etiqueta: string, segundos: number): Promise<void> {
  mirando = fuente;
  tramas = 0;
  avisos.clear();
  vigilante.reiniciar();
  analizador.apuntarA(fuente);
  await new Promise((r) => setTimeout(r, 1500));
  vigilante.reiniciar();
  await new Promise((r) => setTimeout(r, segundos * 1000));

  console.log(`\n${etiqueta}  (var.rta = ${fuente}, ${tramas} tramas en ${segundos} s)`);
  if (avisos.size === 0) { console.log('  sin candidatas'); return; }
  const orden = [...avisos].sort((a, b) => b[1].veces - a[1].veces).slice(0, 6);
  for (const [banda, a] of orden) {
    console.log(`  banda ${String(banda).padStart(3)}  ${a.hz.toFixed(0).padStart(6)} Hz`
      + `  avisada en ${String(a.veces).padStart(4)} tramas, sostenida hasta ${(a.maxMs / 1000).toFixed(1)} s`);
  }
}

try {
  const tono = spawn('afplay', ['/tmp/vse-comp.wav']);
  await mirar('i.9', 'CANAL 10 — tono sostenido (deberia salir)', 12);
  tono.kill();
  await mirar('i.20', 'CANAL 21 — musica (no deberia salir, o poco)', 12);
} finally {
  analizador.devolver();
  await new Promise((r) => setTimeout(r, 1500));
  console.log(`\nvar.rta devuelto a ${JSON.stringify(analizador.anterior)} (mirando era ${JSON.stringify(mirando)})`);
  await t.desconectar();
}
