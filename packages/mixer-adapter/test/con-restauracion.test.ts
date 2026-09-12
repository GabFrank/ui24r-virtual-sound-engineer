import { test } from 'node:test';
import { strictEqual, ok, rejects } from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { conRestauracion } from '../../../tools/spikes/con-restauracion.ts';

/**
 * **Que la consola vuelva a su estado pase lo que pase.**
 *
 * Ninguno de los diez guiones de medición tenía `try/finally`: cualquier caída
 * a mitad de camino dejaba escritos umbrales, envíos, faderes y
 * `m.afs.enabled = 0`. Lo encontró una auditoría de instrumentos.
 *
 * Y el caso de la señal no es hipotético: al escribir el módulo, una corrida de
 * prueba pasada por `head -4` murió cuando `head` cerró la tubería y dejó
 * `i.9.aux.2.value` en 0,8 sobre la consola del usuario. **`finally` no corre
 * cuando el proceso recibe una señal**, así que tapar sólo la excepción habría
 * dejado abierta exactamente la puerta por la que se colaron los 0,8.
 *
 * De ahí que el test de la señal sea un **subproceso de verdad**: es la única
 * forma de probar que la restauración corre cuando alguien corta con Ctrl-C, y
 * probarlo con un espía dentro del mismo proceso probaría otra cosa.
 */

test('restaura al terminar bien', async () => {
  const pasos: string[] = [];
  const v = await conRestauracion(
    () => { pasos.push('restaurado'); },
    async () => { pasos.push('cuerpo'); return 7; },
  );
  strictEqual(v, 7);
  strictEqual(pasos.join(' '), 'cuerpo restaurado');
});

test('restaura al fallar, y propaga la excepcion', async () => {
  const pasos: string[] = [];
  await rejects(
    () => conRestauracion(
      () => { pasos.push('restaurado'); },
      async () => { throw new Error('la medicion se cayo'); },
    ),
    /la medicion se cayo/,
  );
  // **Primero restaura y después propaga.** Si fuera al revés, quien atrape la
  // excepción vería la consola a medio escribir.
  strictEqual(pasos.join(' '), 'restaurado');
});

test('restaura una sola vez', async () => {
  let n = 0;
  await conRestauracion(() => { n += 1; }, async () => {});
  strictEqual(n, 1);
});

test('una restauracion que falla se informa y no tapa el resultado', async () => {
  // La medición pudo haber salido bien y la restauración fallar --el socket se
  // cayó justo ahí--. Perder el resultado además no ayuda a nadie, y lo que sí
  // hace falta es que quede dicho por la salida de error.
  const v = await conRestauracion(
    () => { throw new Error('no pude restaurar'); },
    async () => 42,
  );
  strictEqual(v, 42);
});

test('restaura cuando llega una señal, que es lo que finally no cubre', async () => {
  // Un subproceso real: arranca, avisa que está en el cuerpo, y espera. El
  // padre le manda SIGINT **en cuanto ve el aviso** y comprueba que alcanzó a
  // restaurar.
  //
  // La señal se manda mirando la salida y no durmiendo un tiempo fijo: un
  // tiempo fijo hace un test que falla en una máquina cargada, y un test que
  // falla a veces se apaga.
  const dir = mkdtempSync(join(tmpdir(), 'vse-restauracion-'));
  const guion = join(dir, 'guion.mjs');
  const modulo = join(import.meta.dirname, '..', '..', '..', 'tools', 'spikes', 'con-restauracion.ts');
  writeFileSync(guion, `
    const { conRestauracion } = await import(${JSON.stringify(modulo)});
    await conRestauracion(
      () => { console.log('RESTAURADO'); },
      async () => {
        console.log('EN-EL-CUERPO');
        await new Promise((r) => setTimeout(r, 30000));
      },
    );
  `);

  const hijo = spawn(process.execPath, ['--experimental-strip-types', guion],
    { stdio: ['ignore', 'pipe', 'ignore'] });
  let salida = '';
  const fin = new Promise<void>((resolver) => {
    hijo.stdout.on('data', (d: Buffer) => {
      salida += d.toString();
      if (salida.includes('EN-EL-CUERPO')) hijo.kill('SIGINT');
    });
    hijo.on('close', () => resolver());
  });
  await fin;

  ok(salida.includes('EN-EL-CUERPO'), `el guion no arrancó. Salida:\n${salida}`);
  ok(salida.includes('RESTAURADO'),
    `la señal no disparó la restauración. Salida:\n${salida}`);
});
