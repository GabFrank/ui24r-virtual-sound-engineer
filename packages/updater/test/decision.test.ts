import { deepStrictEqual, strictEqual } from 'node:assert/strict';
import { test } from 'node:test';
import { BATERIA_MINIMA_PORCENTAJE, decidirActualizacion } from '../src/decision.ts';
import { leerCatalogo } from '../src/manifest.ts';
import type { ContextoDeActualizacion } from '../src/types.ts';

const BASE = 'https://github.com/GabFrank/ui24r-virtual-sound-engineer/releases/download';

function catalogo(...versiones: string[]) {
  return leerCatalogo(
    versiones.map((tag) => ({
      tag_name: tag,
      body: `notas de ${tag}`,
      draft: false,
      prerelease: false,
      published_at: '2026-09-08T00:00:00Z',
      assets: [
        { name: `vse-${tag}.apk`, browser_download_url: `${BASE}/${tag}/vse.apk`, size: 1 },
        { name: `vse-${tag}.apk.sha256`, browser_download_url: `${BASE}/${tag}/vse.apk.sha256`, size: 64 },
      ],
    })),
  ).publicaciones;
}

const OCIOSO: ContextoDeActualizacion = {
  versionInstalada: '0.1.0',
  sesionActiva: false,
  transaccionEnCurso: false,
  conectadoAConsola: false,
  redDisponible: true,
  bateriaPorcentaje: 80,
  enCargador: false,
};

test('ofrece la version mas alta, no la ultima publicada', () => {
  // GitHub devuelve por fecha. Una correccion de 0.1.1 publicada despues de
  // 0.2.0 dejaria la lista con la vieja primero.
  const d = decidirActualizacion(OCIOSO, catalogo('v0.2.0', 'v0.1.1'));
  strictEqual(d.tipo, 'DISPONIBLE');
  if (d.tipo === 'DISPONIBLE') strictEqual(d.publicacion.etiqueta, 'v0.2.0');
});

test('no ofrece nada cuando la instalada es la mas alta', () => {
  const d = decidirActualizacion({ ...OCIOSO, versionInstalada: '0.2.0' }, catalogo('v0.2.0', 'v0.1.1'));
  strictEqual(d.tipo, 'AL_DIA');
});

test('nunca propone bajar de version', () => {
  const d = decidirActualizacion({ ...OCIOSO, versionInstalada: '1.0.0' }, catalogo('v0.9.0'));
  strictEqual(d.tipo, 'AL_DIA');
});

test('sin catalogo no hay nada que ofrecer', () => {
  strictEqual(decidirActualizacion(OCIOSO, []).tipo, 'AL_DIA');
});

test('no decide si no puede leer la version instalada', () => {
  const d = decidirActualizacion({ ...OCIOSO, versionInstalada: 'depuracion' }, catalogo('v9.9.9'));
  strictEqual(d.tipo, 'VERSION_INSTALADA_ILEGIBLE');
});

test('INV-034: una sesion abierta bloquea la actualizacion', () => {
  const d = decidirActualizacion({ ...OCIOSO, sesionActiva: true }, catalogo('v0.2.0'));
  strictEqual(d.tipo, 'BLOQUEADA');
  if (d.tipo === 'BLOQUEADA') {
    deepStrictEqual(d.bloqueos.map((b) => b.motivo), ['SESION_ACTIVA']);
    strictEqual(d.bloqueos[0]?.invariante, 'INV-034');
    // La publicacion se sigue informando: el usuario tiene que poder ver que
    // hay una version nueva esperando para despues del show.
    strictEqual(d.publicacion.etiqueta, 'v0.2.0');
  }
});

test('INV-034: una transaccion en curso bloquea la actualizacion', () => {
  const d = decidirActualizacion({ ...OCIOSO, transaccionEnCurso: true }, catalogo('v0.2.0'));
  strictEqual(d.tipo, 'BLOQUEADA');
  if (d.tipo === 'BLOQUEADA') strictEqual(d.bloqueos[0]?.invariante, 'INV-034');
});

test('INV-034: estar conectado a la consola bloquea la actualizacion', () => {
  // En MVP0 no hay objeto sesion todavia. Sin este bloqueo la invariante no se
  // disparaba nunca y la pantalla ofrecia actualizar en pleno ensayo. Lo
  // encontro una captura visual.
  const d = decidirActualizacion({ ...OCIOSO, conectadoAConsola: true }, catalogo('v0.2.0'));
  strictEqual(d.tipo, 'BLOQUEADA');
  if (d.tipo === 'BLOQUEADA') {
    deepStrictEqual(d.bloqueos.map((b) => b.motivo), ['CONECTADO_A_CONSOLA']);
    strictEqual(d.bloqueos[0]?.invariante, 'INV-034');
  }
});

test('con sesion abierta no se repite el motivo de la conexion', () => {
  const d = decidirActualizacion(
    { ...OCIOSO, sesionActiva: true, conectadoAConsola: true },
    catalogo('v0.2.0'),
  );
  strictEqual(d.tipo, 'BLOQUEADA');
  if (d.tipo === 'BLOQUEADA') {
    deepStrictEqual(d.bloqueos.map((b) => b.motivo), ['SESION_ACTIVA']);
  }
});

test('informa todos los bloqueos, no solo el primero', () => {
  const d = decidirActualizacion(
    { ...OCIOSO, sesionActiva: true, transaccionEnCurso: true, redDisponible: false },
    catalogo('v0.2.0'),
  );
  strictEqual(d.tipo, 'BLOQUEADA');
  if (d.tipo === 'BLOQUEADA') {
    deepStrictEqual(d.bloqueos.map((b) => b.motivo), ['SESION_ACTIVA', 'TRANSACCION_EN_CURSO', 'SIN_RED']);
  }
});

test('la bateria baja bloquea, y el cargador la desbloquea', () => {
  const baja = { ...OCIOSO, bateriaPorcentaje: BATERIA_MINIMA_PORCENTAJE - 1 };
  strictEqual(decidirActualizacion(baja, catalogo('v0.2.0')).tipo, 'BLOQUEADA');
  strictEqual(decidirActualizacion({ ...baja, enCargador: true }, catalogo('v0.2.0')).tipo, 'DISPONIBLE');
});

test('un dispositivo que no informa bateria no queda bloqueado por eso', () => {
  const d = decidirActualizacion({ ...OCIOSO, bateriaPorcentaje: null }, catalogo('v0.2.0'));
  strictEqual(d.tipo, 'DISPONIBLE');
});

test('el catalogo sin version estable mas alta deja al dia aunque haya pre-lanzamientos', () => {
  const conRc = leerCatalogo([
    {
      tag_name: 'v0.3.0-rc.1',
      draft: false,
      prerelease: false,
      assets: [
        { name: 'vse.apk', browser_download_url: `${BASE}/v0.3.0-rc.1/vse.apk`, size: 1 },
        { name: 'vse.apk.sha256', browser_download_url: `${BASE}/v0.3.0-rc.1/vse.apk.sha256`, size: 64 },
      ],
    },
  ]).publicaciones;
  strictEqual(decidirActualizacion(OCIOSO, conRc).tipo, 'AL_DIA');
});
