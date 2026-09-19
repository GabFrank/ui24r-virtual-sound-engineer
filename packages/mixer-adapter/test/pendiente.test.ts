import { test } from 'node:test';
import { deepStrictEqual, equal, notEqual, ok } from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  anotarPendiente, cerrarPendiente, leerPendiente, RUTA_PENDIENTE,
} from '../../../tools/spikes/pendiente.ts';

/**
 * **El papelito que sobrevive al proceso.**
 *
 * `conRestauracion` declara que no cubre `SIGKILL` ni un corte de energía, y era
 * cierto mientras lo único que sabía qué restaurar viviera en la memoria del
 * proceso muerto. El 2026-09-16 pasó de verdad: al cortar `banco-en-vivo.ts` la
 * restauración arrancó y al proceso lo mataron antes de que terminara de
 * escribir, y la consola quedó con el supresor apagado y un envío abierto.
 */

/** Se guarda y se repone lo que hubiera, para no pisar un pendiente real. */
function conPapelitoLimpio(cuerpo: () => void): void {
  const habia = existsSync(RUTA_PENDIENTE) ? readFileSync(RUTA_PENDIENTE, 'utf8') : null;
  rmSync(RUTA_PENDIENTE, { force: true });
  try {
    cuerpo();
  } finally {
    if (habia === null) rmSync(RUTA_PENDIENTE, { force: true });
    else writeFileSync(RUTA_PENDIENTE, habia);
  }
}

test('lo anotado se puede volver a leer, con quien lo dejo', () => {
  conPapelitoLimpio(() => {
    anotarPendiente('un-guion.ts', '192.168.0.78', [['m.afs.enabled', 1], ['i.9.mix', 0.5]]);
    const p = leerPendiente();
    notEqual(p, null);
    equal(p!.guion, 'un-guion.ts');
    equal(p!.maquina, '192.168.0.78');
    deepStrictEqual(p!.pares, [['m.afs.enabled', 1], ['i.9.mix', 0.5]]);
    ok(p!.cuando.length > 0, 'dice cuando, para que quien lo encuentre sepa de que corrida es');
  });
});

test('cerrar el papelito lo borra, y entonces no hay nada pendiente', () => {
  conPapelitoLimpio(() => {
    anotarPendiente('un-guion.ts', '192.168.0.78', [['m.afs.enabled', 1]]);
    cerrarPendiente();
    equal(leerPendiente(), null);
  });
});

/**
 * **El caso que parece un detalle y es el importante.**
 *
 * Si el papelito quedó a medio escribir --el proceso murió justo ahí-- la
 * tentación es devolver `null` y seguir. Pero `null` significa «no hay nada que
 * restaurar», que es exactamente la conclusión falsa: la consola SI quedó tocada
 * y nadie se enteraría. Tiene que devolver algo que se vea.
 */
test('un papelito ilegible NO se lee como «no hay nada pendiente»', () => {
  conPapelitoLimpio(() => {
    writeFileSync(RUTA_PENDIENTE, '{"cuando": "a medio escrib');
    const p = leerPendiente();
    notEqual(p, null, 'devolver null haria creer que la consola esta limpia');
    equal(p!.guion, '(ilegible)');
  });
});

/**
 * **El trinquete: todo guion nuevo que restaura, anota.**
 *
 * Mismo patrón que `restauracion-garantizada.test.ts`, y por el mismo motivo:
 * convertir veinte guiones de golpe es un cambio mecánico grande sobre código que
 * habla con un aparato real, y romper un instrumento en silencio es peor que la
 * deuda que arregla. La lista se declara entera y **sólo puede encoger**.
 */
const SIN_PAPELITO: ReadonlySet<string> = new Set([
  'p0-10b-vu/aplanar-canal.ts',
  'p0-10b-vu/aux-senal.ts',
  'p0-10b-vu/de-quien-es-la-fuga.ts',
  'p0-10b-vu/diferencia-entre-buses.ts',
  'p0-10b-vu/eco.ts',
  'p0-10b-vu/enlazar-estereo.ts',
  'p0-10b-vu/escala-del-bloque-de-bus.ts',
  'p0-10b-vu/ley-del-envio-a-monitor.ts',
  'p0-10b-vu/ley-del-fader-de-bus-real.ts',
  'p0-10b-vu/ley-del-fader-de-bus.ts',
  'p0-10b-vu/ley-del-fader-del-general.ts',
  'p0-10b-vu/ley-envio-aux.ts',
  'p0-10b-vu/ley-fader.ts',
  'p0-10b-vu/ley-ganancia.ts',
  'p0-10b-vu/medidor-contra-salida-real.ts',
  'p0-10b-vu/probar-escritura.ts',
  'p0-10b-vu/reconocer-auxiliar.ts',
  'p0-10b-vu/superficie-del-compresor.ts',
  'p0-2b-eq/curvas-del-ecualizador.ts',
  'p0-2b-eq/pasa-altos-y-pasa-bajos.ts',
]);

const RAIZ = join(import.meta.dirname, '..', '..', '..');
const GUIONES = join(RAIZ, 'tools', 'spikes');

function archivosTs(dir: string, salida: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) archivosTs(p, salida);
    else if (e.name.endsWith('.ts')) salida.push(p);
  }
  return salida;
}

/** El código sin comentarios: la prosa de estos archivos habla del defecto. */
function soloCodigo(texto: string): string {
  return texto.split('\n').filter((l) => {
    const t = l.trim();
    return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
  }).join('\n');
}

test('ningun guion nuevo restaura sin dejar el papelito', () => {
  const sinCubrir: string[] = [];
  for (const ruta of archivosTs(GUIONES)) {
    const codigo = soloCodigo(readFileSync(ruta, 'utf8'));
    if (!/conRestauracion\(/.test(codigo)) continue;
    const rel = ruta.slice(GUIONES.length + 1);
    if (/anotarPendiente\(/.test(codigo)) continue;
    sinCubrir.push(rel);
  }
  const nuevos = sinCubrir.filter((f) => !SIN_PAPELITO.has(f));
  deepStrictEqual(nuevos, [],
    'Estos guiones restauran pero no dejan el papelito. Si a uno lo matan de golpe, '
    + 'lo unico que sabe que hay que restaurar muere con el.\n' + nuevos.join('\n'));
});

/**
 * **El tamaño, con el número escrito.**
 *
 * Sin esto el trinquete se afloja agregando un nombre más. Es la misma guarda que
 * `restauracion-garantizada.test.ts` aprendió a tener después de que una auditoría
 * la esquivara creando un guion y poniéndolo en la lista.
 */
test('la lista sin papelito solo puede encoger', () => {
  equal(SIN_PAPELITO.size, 20,
    'si convertiste un guion, baja este numero; si subio, alguien agrego uno nuevo sin papelito');
});
