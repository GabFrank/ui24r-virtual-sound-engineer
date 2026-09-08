import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SNAPSHOTS_AUTOMATICAS, PREFIJO_SNAPSHOT_AUTOMATICA, esSnapshotDeLaApp,
  fechaDeSnapshotAutomatica, nombreSnapshotAutomatica, snapshotsABorrar,
} from '../src/entities/transaction.ts';

function automatica(minuto: number): string {
  return nombreSnapshotAutomatica(new Date(Date.UTC(2026, 8, 8, 20, minuto, 0)));
}

test('el nombre y su lectura son inversas', () => {
  // Si el que escribe y el que lee no coincidieran, la retencion borraria la
  // instantanea equivocada -- que es justo el punto al que se vuelve cuando
  // algo sale mal.
  for (let m = 0; m < 60; m += 7) {
    const fecha = new Date(Date.UTC(2026, 8, 8, 20, m, 0));
    const leida = fechaDeSnapshotAutomatica(nombreSnapshotAutomatica(fecha));
    assert.equal(leida?.getTime(), fecha.getTime());
  }
});

test('un nombre que no es automatico no tiene fecha', () => {
  assert.equal(fechaDeSnapshotAutomatica('MI SHOW'), null);
  assert.equal(fechaDeSnapshotAutomatica('VSE_MANUAL_1'), null);
  assert.equal(fechaDeSnapshotAutomatica(`${PREFIJO_SNAPSHOT_AUTOMATICA}sin-fecha`), null);
});

test('por debajo del maximo no se borra nada', () => {
  const nombres = Array.from({ length: MAX_SNAPSHOTS_AUTOMATICAS }, (_, i) => automatica(i));
  assert.deepEqual(snapshotsABorrar(nombres), []);
});

test('por encima del maximo se borran las mas viejas, en ese orden', () => {
  const nombres = Array.from({ length: MAX_SNAPSHOTS_AUTOMATICAS + 3 }, (_, i) => automatica(i));
  const aBorrar = snapshotsABorrar(nombres);
  assert.deepEqual(aBorrar, [automatica(0), automatica(1), automatica(2)]);
});

test('el orden de entrada no importa: manda la fecha del nombre', () => {
  const nombres = Array.from({ length: MAX_SNAPSHOTS_AUTOMATICAS + 2 }, (_, i) => automatica(i))
    .reverse();
  assert.deepEqual(snapshotsABorrar(nombres), [automatica(0), automatica(1)]);
});

test('nunca se devuelve una instantanea ajena', () => {
  // El peor fallo posible de esta aplicacion: borrar lo que guardo el usuario.
  const ajenas = ['MI SHOW', 'BANDA VIERNES', 'default', 'VSE'];
  const nombres = [
    ...ajenas,
    ...Array.from({ length: MAX_SNAPSHOTS_AUTOMATICAS + 5 }, (_, i) => automatica(i)),
  ];
  const aBorrar = snapshotsABorrar(nombres);
  for (const ajena of ajenas) {
    assert.ok(!aBorrar.includes(ajena), `se propuso borrar ${ajena}`);
    // Ni siquiera «VSE» a secas: el prefijo propio lleva guion bajo, y el
    // nombre del show reservado no es una instantanea de la aplicacion.
    assert.equal(esSnapshotDeLaApp(ajena), false);
  }
  assert.equal(aBorrar.length, 5);
});

test('nunca se devuelve una VSE_ que no sea automatica', () => {
  // El prefijo propio no alcanza: la retencion habla de las que crea la
  // aplicacion sola, no de una que el usuario guardo con nombre nuestro.
  const manuales = ['VSE_ANTES_DEL_SHOW', 'VSE_PRUEBA'];
  const nombres = [
    ...manuales,
    ...Array.from({ length: MAX_SNAPSHOTS_AUTOMATICAS + 1 }, (_, i) => automatica(i)),
  ];
  const aBorrar = snapshotsABorrar(nombres);
  for (const m of manuales) assert.ok(!aBorrar.includes(m), `se propuso borrar ${m}`);
  assert.deepEqual(aBorrar, [automatica(0)]);
});

test('nunca se devuelve una que no se pueda fechar', () => {
  // Sin poder ordenarla no se sabe si es la mas vieja. Conservar de mas es el
  // error barato; borrar a ciegas pierde un punto de retorno.
  const rara = `${PREFIJO_SNAPSHOT_AUTOMATICA}corrupta`;
  const nombres = [
    rara,
    ...Array.from({ length: MAX_SNAPSHOTS_AUTOMATICAS + 1 }, (_, i) => automatica(i)),
  ];
  assert.deepEqual(snapshotsABorrar(nombres), [automatica(0)]);
});

test('el maximo de INV-003 es veinte', () => {
  assert.equal(MAX_SNAPSHOTS_AUTOMATICAS, 20);
});

test('un maximo de cero deja borrar todas las automaticas y ninguna ajena', () => {
  const nombres = ['MI SHOW', automatica(1), automatica(2)];
  assert.deepEqual(snapshotsABorrar(nombres, 0), [automatica(1), automatica(2)]);
});
