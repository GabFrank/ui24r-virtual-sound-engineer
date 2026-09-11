import { test } from 'node:test';
import { strictEqual, deepStrictEqual } from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SafetyEngine } from '../src/engine.ts';
import { clasificarRuta } from '@vse/mixer-adapter';
import type { CambioPropuesto } from '../src/types.ts';
import { contexto } from './helpers.ts';

/**
 * **La guarda que faltaba: qué permite el motor sobre las claves REALES.**
 *
 * El 2026-09-11, ampliar el clasificador convirtio «ruta desconocida» --que es
 * un rechazo-- en categorias con dueño, y algunas de esas categorias son
 * escribibles. **44 rutas de entrada de linea pasaron a estar permitidas sin
 * que ningun test lo notara**, incluida `l.0.mix`: el fader que estuvo a 0 dB
 * metiendo un tono del Bluetooth en el general durante dos dias. Lo encontro
 * una auditoria contando a mano.
 *
 * Clasificar no es autorizar, y hasta ahora nada vigilaba la diferencia. Este
 * test la vigila, y lo hace contra el **inventario capturado de la consola**:
 * una lista escrita a mano mide lo que uno recuerda, no lo que el aparato
 * manda.
 *
 * **Si este test falla, no lo actualices sin mirar.** Que suba el numero
 * significa que algo que antes se rechazaba ahora se escribe, y eso es una
 * decision de producto, no un detalle de mantenimiento.
 */

const INVENTARIO = join(
  import.meta.dirname, '..', '..', '..',
  'docs', 'inventario', '3.4.8318-ui24-2026-09-11', 'keys-observed.txt',
);

function permitidas(): readonly string[] {
  const claves = readFileSync(INVENTARIO, 'utf8').trim().split('\n');
  const motor = new SafetyEngine();
  // **Se usa el arnes que ya existe, no un contexto fabricado acá.** La primera
  // version construía uno a mano con `sessionState: 'CONFIGURANDO_CANALES'` --que
  // no existe, el valor es `CHANNEL_SETUP`-- y lo forzaba con `as`. El `as` tapó
  // el error de tipos y el conteo salió de un contexto invalido.
  const ctx = contexto({ busesDeSalidaPermitidos: new Set(['m']) });
  const salida: string[] = [];
  for (const path of claves) {
    const kind = clasificarRuta(path);
    if (kind === null) continue;
    const cambio = { kind, path, unidad: 'dB', valorPropuesto: 1, valorEsperado: 0 } as CambioPropuesto;
    const v = motor.evaluar([cambio], ctx, { conexionPermiteEscribir: true, snapshotVerificado: true });
    if (v.permitido) salida.push(path);
  }
  return salida;
}

test('ninguna entrada de linea es escribible', () => {
  // `l.*` es lo que entra por las RCA. Lo decide el usuario, y la aplicacion no
  // lo toca hasta que alguien decida lo contrario a proposito.
  const deLinea = permitidas().filter((p) => p.startsWith('l.'));
  deepStrictEqual(deLinea, []);
});

test('del general solo se escriben FILTROS', () => {
  // Nada de `bypass` --que anula la correccion de sala entera--, ni `linked`,
  // ni el recall de preset, que reemplaza las 62 bandas de golpe.
  const delGeneral = permitidas().filter((p) => p.startsWith('m.'));
  const noFiltros = delGeneral.filter(
    (p) => !/\.eq\.(peak\.|b\d+\.|hpf\b|lpf\b)/.test(p),
  );
  deepStrictEqual(noFiltros, [], 'solo filtros bajo m.eq.');
});

test('la cuenta de rutas escribibles no se mueve sola', () => {
  // **Un numero que se actualiza sin mirar deja de ser una guarda.** Si este
  // test falla: contá qué entró, decidí si corresponde, y recién ahí cambiá el
  // numero -- en el mismo commit que lo justifica.
  // **666, y el numero tiene historia.** La primera version decia 642 porque el
  // contexto se fabricaba a mano con un `sessionState` que no existe, forzado
  // con `as`: el cast tapo el error de tipos y suprimio las 24 rutas de
  // `hw.N.gain`. Esa ganancia del previo SI es trabajo de la aplicacion en
  // configuracion de canales (ADR-026), asi que 666 es el numero honesto.
  const n = permitidas().length;
  strictEqual(
    n, 666,
    `el motor permite ${n} rutas del inventario y se esperaban 666. `
    + 'Si subio, algo que se rechazaba ahora se escribe.',
  );
});
