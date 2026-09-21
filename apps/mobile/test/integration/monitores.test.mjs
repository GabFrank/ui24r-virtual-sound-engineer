import '@angular/compiler';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MIGRACIONES } from '@vse/store';
import { EscuchaDeLaCunaService } from '../../src/app/monitor/escucha-de-la-cuna.service';
import { EnvioAMonitorService } from '../../src/app/monitor/envio-a-monitor.service';
import { MonitoresComponent } from '../../src/app/monitor/monitores.component';
import { ConnectionStateService } from '../../src/app/core/connection.state';
import { DatabaseService } from '../../src/app/core/database.service';
import { MedicionesService } from '../../src/app/core/mediciones.service';
import { DiarioService } from '../../src/app/core/diario.service';
import { MixerService } from '../../src/app/core/mixer.service';
import { Logger } from '../../src/app/core/logger';
import { SafetyService } from '../../src/app/core/safety.service';
import { SessionStateService } from '../../src/app/core/session.state';
import { CUENTA_REGRESIVA_S, DURACION_CAPTURA_S } from '../../src/app/core/medicion-de-la-captura.ts';

const CUNA = { canal: 1, auxiliar: 1, channelId: 'canal-1' };
const log = { info() {}, warn() {}, error() {} };

function entorno(t, archivo = ':memory:') {
  const db = new DatabaseSync(archivo);
  // Igual que Android hoy: no atribuirle garantías foráneas que no activa.
  db.exec('PRAGMA foreign_keys = OFF');
  for (const m of MIGRACIONES) for (const sql of m.sentencias) db.exec(sql);
  let abierta = true;
  const cerrar = () => { if (abierta) db.close(); abierta = false; };
  t.after(cerrar);
  const base = {
    async ejecutar(sql, valores = []) { db.prepare(sql).run(...valores); },
    async consultar(sql, valores = []) { return db.prepare(sql).all(...valores); },
  };
  const conexion = new ConnectionStateService();
  conexion.fijarEstado('CONNECTED');
  conexion.volcadoCompletoRecibido();
  const mixer = {
    canales: () => [{ indice: 1, nivelPreProcesoDb: -18 - (Math.floor(Date.now() / 50) % 2) * 6, reduccionDb: 0 }],
    auxiliares: () => [{ indice: 1, nivelDb: -18 - (Math.floor(Date.now() / 50) % 2) * 6, reduccionDb: 0 }],
    api: () => ({ guardarInstantanea: async () => 'snapshot-prueba' }),
  };
  const seguridad = {
    permiteEscritura: () => ({ permitido: true }), bloqueado: () => false,
    crearEjecutor: (_api, diario) => ({ ejecutar: async (id, sessionId, razon) => {
      await diario.abrir({ id, sessionId, razon, estado: 'APLICADA', snapshotRef: 'snapshot-prueba',
        nivelAutonomia: 'ASSISTED', creadoEl: new Date().toISOString(),
        cerradoEl: new Date().toISOString(), cambios: [], medicionPosteriorId: null,
        nivelEstablecidoEn: [] });
      return { estado: 'APLICADA', id };
    } }),
  };
  const inyector = Injector.create({ providers: [
    { provide: DatabaseService, useValue: base },
    { provide: Logger, useValue: log },
    { provide: MixerService, useValue: mixer },
    { provide: ConnectionStateService, useValue: conexion },
    { provide: MedicionesService, useFactory: () => new MedicionesService() },
    { provide: DiarioService, useFactory: () => new DiarioService() },
    { provide: SafetyService, useValue: seguridad },
    { provide: SessionStateService, useValue: { estado: () => 'CHANNEL_SETUP' } },
  ] });
  t.after(() => inyector.destroy());
  return {
    db, base, cerrar, mixer, conexion,
    mediciones: inyector.get(MedicionesService), diario: inyector.get(DiarioService),
    escucha: runInInjectionContext(inyector, () => new EscuchaDeLaCunaService()),
    envio: runInInjectionContext(inyector, () => new EnvioAMonitorService()),
  };
}

function reloj(t) {
  t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: Date.UTC(2026, 8, 21) });
}
async function empezarCaptura(t, escucha) {
  t.mock.timers.tick(CUENTA_REGRESIVA_S * 1000);
  await Promise.resolve();
  assert.equal(escucha.estado(), 'ESCUCHANDO');
}
async function terminarCaptura(t, pendiente) {
  // Cada tic avanza también Date.now; no se sustituye el recolector real.
  for (let ms = 0; ms < DURACION_CAPTURA_S * 1000; ms += 50) t.mock.timers.tick(50);
  return pendiente;
}

for (const fase of ['CUENTA_REGRESIVA', 'ESCUCHANDO']) {
  test(`cancelar durante ${fase} no guarda ni concede otro paso`, async (t) => {
    reloj(t);
    const e = entorno(t);
    const pendiente = e.escucha.escuchar(CUNA, 'sesion-1');
    if (fase === 'ESCUCHANDO') await empezarCaptura(t, e.escucha);
    e.escucha.cancelar();
    const r = await pendiente;
    assert.equal(r.cancelada, true);
    assert.equal(r.medicionId, null);
    assert.equal(r.sonoS, 0);
    assert.equal(r.alcanzaParaOtroPaso, false);
    assert.equal(e.escucha.estado(), 'INACTIVA');
    assert.deepEqual(await e.mediciones.deLaSesion('sesion-1'), []);
  });
}

test('la cola de una cuenta cancelada no pisa la escucha siguiente', async (t) => {
  reloj(t);
  const e = entorno(t);
  const primera = e.escucha.escuchar(CUNA, 'sesion-1');
  e.escucha.cancelar();
  const segunda = e.escucha.escuchar(CUNA, 'sesion-1');
  assert.equal((await primera).cancelada, true);
  assert.equal(e.escucha.estado(), 'CUENTA_REGRESIVA');
  e.escucha.cancelar();
  assert.equal((await segunda).cancelada, true);
  assert.deepEqual(await e.mediciones.deLaSesion('sesion-1'), []);
});

test('escuchar guarda la medición y anota su identificador en el diario real', async (t) => {
  reloj(t);
  const e = entorno(t);
  await e.diario.abrir({
    id: 'tx-1', sessionId: 'sesion-1', estado: 'APLICADA', snapshotRef: 'snapshot-prueba',
    creadoEl: '2026-09-20T23:00:00Z', cerradoEl: '2026-09-20T23:00:01Z', cambios: [],
    medicionPosteriorId: null, nivelEstablecidoEn: [],
    razon: 'prueba de escucha', nivelAutonomia: 'ASSISTED',
  });
  const pendiente = e.escucha.escuchar(CUNA, 'sesion-1');
  await empezarCaptura(t, e.escucha);
  const r = await terminarCaptura(t, pendiente);
  assert.equal(r.cancelada, false);
  assert.ok(r.sonoS >= 10);
  assert.equal(r.alcanzaParaOtroPaso, true);
  const [medicion] = await e.mediciones.deLaSesion('sesion-1');
  assert.equal(medicion.id, r.medicionId);
  assert.equal(medicion.channelId, 'canal-1');
  assert.equal(medicion.sessionId, 'sesion-1');
  await e.envio.anotarEscucha('tx-1', r.medicionId);
  assert.equal((await e.diario.leer('tx-1')).medicionPosteriorId, r.medicionId);
  await e.envio.anotarEscucha('tx-1', null);
  assert.equal((await e.diario.leer('tx-1')).medicionPosteriorId, r.medicionId);
});

for (const problema of ['sin enlace', 'sin auxiliar', 'error al guardar']) {
  test(`${problema}: la captura real no promete permiso`, async (t) => {
    reloj(t);
    const e = entorno(t);
    if (problema === 'sin enlace') e.conexion.fijarEstado('DISCONNECTED');
    if (problema === 'sin auxiliar') e.mixer.auxiliares = () => [];
    if (problema === 'error al guardar') e.base.ejecutar = async () => { throw new Error('disco lleno'); };
    const pendiente = e.escucha.escuchar(CUNA, 'sesion-1');
    await empezarCaptura(t, e.escucha);
    const r = await terminarCaptura(t, pendiente);
    assert.equal(r.alcanzaParaOtroPaso, false);
    if (problema !== 'sin auxiliar') assert.equal(r.medicionId, null);
    else {
      assert.equal(r.sonoS, 0);
      assert.ok(r.segundosNoOidos > 0);
    }
  });
}

test('el diario real sobre archivo conserva una operación interrumpida al reabrir', async (t) => {
  const carpeta = mkdtempSync(join(tmpdir(), 'vse-diario-'));
  t.after(() => rmSync(carpeta, { recursive: true, force: true }));
  const archivo = join(carpeta, 'prueba.sqlite');
  const e = entorno(t, archivo);
  await e.diario.abrir({ id: 'pendiente', sessionId: 'sesion-1', estado: 'ABIERTA',
    snapshotRef: 'snapshot-prueba', creadoEl: '2026-09-21T00:00:00Z', cerradoEl: null, cambios: [],
    medicionPosteriorId: null, nivelEstablecidoEn: [], razon: 'prueba de reinicio', nivelAutonomia: 'ASSISTED' });
  e.cerrar();
  const reabierto = entorno(t, archivo);
  assert.deepEqual((await reabierto.diario.interrumpidas()).map((x) => x.id), ['pendiente']);
});

// Los métodos son de producción. Se suministran dependencias a la instancia sin
// renderizar el DOM ni arrancar su effect de carga de perfiles. La plantilla y
// la DI de la pantalla no quedan cubiertas por estos casos.
function pantalla() {
  const pasos = [];
  let resolverSubida;
  let resolverEscucha;
  let avisarEscucha;
  const escuchando = new Promise((resolve) => { avisarEscucha = resolve; });
  const p = Object.create(MonitoresComponent.prototype);
  Object.assign(p, {
    auxiliar: signal(1), sesion: { actual: () => ({ sesion: { id: 'sesion-1' } }) },
    enCurso: signal(null), escuchando: signal(false), aviso: signal(null),
    envio: {
      subir: async () => { pasos.push('subir'); return new Promise((r) => { resolverSubida = r; }); },
      anotarEscucha: async (id, medicionId) => { pasos.push(['anotar', id, medicionId]); },
      marcarAsiEstaBien: async (ruta) => { pasos.push(['marcar', ruta]); return { ok: true }; },
    },
    escucha: { escuchar: () => {
      pasos.push('escuchar');
      const pendiente = new Promise((r) => { resolverEscucha = r; });
      avisarEscucha();
      return pendiente;
    } },
  });
  const fila = { canal: 1, pasoDb: 2, sePuedeMarcar: true, que: 'Voz', camino: {
    ruta: 'i.0.aux.0.value', channelId: 'canal-1', nivel: { tipo: 'EN_DB', db: -20, crudo: 0.5 },
  } };
  return { p, fila, pasos, escuchando,
    subir: () => resolverSubida({ estado: 'APLICADA', id: 'tx-1', quedoEnDb: -18, salioDelSilencio: false }),
    terminar: (cancelada = false) => resolverEscucha({ cancelada, medicionId: cancelada ? null : 'm-1',
      sonoS: 18, alcanzaParaOtroPaso: !cancelada, segundosNoOidos: 0 }),
  };
}

test('la pantalla real ordena subir, escuchar y anotar sin permitir pasos simultáneos', async () => {
  const e = pantalla();
  const primera = e.p.subirUnPaso(e.fila);
  await e.p.subirUnPaso({ ...e.fila, canal: 2 });
  assert.deepEqual(e.pasos, ['subir']);
  e.subir(); await e.escuchando;
  assert.deepEqual(e.pasos, ['subir', 'escuchar']);
  await e.p.subirUnPaso({ ...e.fila, canal: 2 });
  assert.deepEqual(e.pasos, ['subir', 'escuchar']);
  e.terminar(); await primera;
  assert.deepEqual(e.pasos, ['subir', 'escuchar', ['anotar', 'tx-1', 'm-1']]);
  assert.equal(e.p.enCurso(), null);
});

test('una escucha cancelada corta la cadena de la pantalla sin anotar', async () => {
  const e = pantalla();
  const pendiente = e.p.subirUnPaso(e.fila);
  e.subir(); await e.escuchando;
  e.terminar(true); await pendiente;
  assert.deepEqual(e.pasos, ['subir', 'escuchar']);
  assert.equal(e.p.enCurso(), null);
  assert.match(e.p.aviso(), /cancelada/);
});

test('marcar un envío o toda la cuña se frena mientras hay un paso', async () => {
  const e = pantalla();
  e.p.porMarcar = () => [e.fila];
  e.p.enCurso.set(1);
  await e.p.marcar(e.fila); await e.p.marcarLaCuna();
  assert.deepEqual(e.pasos, []);
  e.p.enCurso.set(null);
  await e.p.marcar(e.fila); await e.p.marcarLaCuna();
  assert.deepEqual(e.pasos, [['marcar', 'i.0.aux.0.value'], ['marcar', 'i.0.aux.0.value']]);
});

test('el servicio real no marca rutas que la aplicación no movió', async (t) => {
  const e = entorno(t);
  const r = await e.envio.marcarAsiEstaBien('i.0.aux.0.value');
  assert.equal(r.ok, false);
  assert.deepEqual([...e.envio.nivelesMarcados()], []);
});

test('subir registra la ruta que puede marcarse y otro movimiento retira esa marca', async (t) => {
  reloj(t);
  const e = entorno(t);
  const paso = { canal: 1, auxiliar: 1, ruta: 'i.0.aux.0.value',
    nivelActualDb: -20, crudoActual: 0.5, subirDb: 2 };
  // Aquí se prueba el servicio y su diario. El ejecutor es un doble y no
  // demuestra permisos, conversión física ni aprobación del Safety Engine.
  const primero = await e.envio.subir(paso, 'sesion-1');
  assert.equal(primero.estado, 'APLICADA');
  assert.equal(e.envio.sePuedeMarcar(paso.ruta), true);
  assert.equal((await e.envio.marcarAsiEstaBien(paso.ruta)).ok, true);
  assert.deepEqual((await e.diario.leer(primero.id)).nivelEstablecidoEn, [paso.ruta]);
  assert.equal((await e.envio.marcarAsiEstaBien(paso.ruta)).ok, false);
  t.mock.timers.tick(1);
  assert.equal((await e.envio.subir(paso, 'sesion-1')).estado, 'APLICADA');
  assert.equal(e.envio.nivelesMarcados().has(paso.ruta), false);
  assert.equal(e.envio.sePuedeMarcar(paso.ruta), true);
});
