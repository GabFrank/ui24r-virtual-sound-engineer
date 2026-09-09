import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analizarVentana, proponerGanancia, UMBRAL_SILENCIO_DB,
  DELTA_MAXIMO_DB, type MuestraVu } from '../src/gain.ts';
import { perfilPorTipo, PERFILES_DE_CANAL } from '@vse/domain';

/**
 * Ventana sintética con forma de frase cantada: sube, sostiene y baja, con
 * silencios entre frases. Es la forma que tiene la señal de verdad, y es donde
 * fallan los promedios ingenuos.
 */
function ventanaDeVoz(opciones: {
  picoDb: number;
  duracionS?: number;
  hz?: number;
  conSilencios?: boolean;
  dinamicaDb?: number;
}): MuestraVu[] {
  const { picoDb, duracionS = 18, hz = 20, conSilencios = true, dinamicaDb = 9 } = opciones;
  const muestras: MuestraVu[] = [];
  const total = Math.round(duracionS * hz);
  for (let i = 0; i < total; i++) {
    const tMs = (i / hz) * 1000;
    const fase = (i / hz) % 4; // frases de cuatro segundos
    let db: number;
    if (conSilencios && fase > 3.2) {
      db = -70; // respiración entre frases
    } else {
      const envolvente = Math.sin((fase / 3.2) * Math.PI);
      db = picoDb - dinamicaDb * (1 - envolvente);
    }
    muestras.push({ tMs, db });
  }
  return muestras;
}

test('el pico es el máximo real de la ventana', () => {
  const a = analizarVentana(ventanaDeVoz({ picoDb: -12 }));
  assert.ok(Math.abs(a.picoDb - (-12)) < 0.01);
  assert.ok(Math.abs(a.margenDb - 12) < 0.01);
});

test('los silencios entre frases no hunden el promedio', () => {
  // Es el error clásico: si se promedian los silencios, el nivel medido baja
  // varios decibeles y la recomendación sale con ganancia de más.
  const conSilencios = analizarVentana(ventanaDeVoz({ picoDb: -12, conSilencios: true }));
  const sinSilencios = analizarVentana(ventanaDeVoz({ picoDb: -12, conSilencios: false }));
  assert.ok(
    Math.abs(conSilencios.promedioDb - sinSilencios.promedioDb) < 1.5,
    `con silencios ${conSilencios.promedioDb.toFixed(1)} vs sin ellos ${sinSilencios.promedioDb.toFixed(1)}`,
  );
});

test('el promedio es energético, no aritmético sobre decibeles', () => {
  // Media energética de −20 y −10 dB: 10·log10((0,01+0,1)/2) ≈ −12,6 dB.
  // La media aritmética daría −15, que no corresponde a ninguna energía real.
  const muestras: MuestraVu[] = [];
  for (let i = 0; i < 120; i++) {
    muestras.push({ tMs: i * 100, db: i % 2 === 0 ? -20 : -10 });
  }
  const a = analizarVentana(muestras);
  assert.ok(Math.abs(a.promedioDb - (-12.6)) < 0.2, `dio ${a.promedioDb.toFixed(2)}`);
});

test('una ventana demasiado corta se marca insuficiente', () => {
  const a = analizarVentana(ventanaDeVoz({ picoDb: -12, duracionS: 4 }));
  assert.equal(a.suficiente, false);
  assert.match(a.motivoInsuficiente ?? '', /hacen falta 10/);
});

test('una ventana en silencio no produce análisis', () => {
  const muestras: MuestraVu[] = [];
  for (let i = 0; i < 400; i++) muestras.push({ tMs: i * 50, db: -75 });
  const a = analizarVentana(muestras);
  assert.equal(a.suficiente, false);
  assert.equal(a.muestras, 0);
  assert.match(a.motivoInsuficiente ?? '', /muestras con señal/);
});

test('una ventana vacía no rompe', () => {
  const a = analizarVentana([]);
  assert.equal(a.suficiente, false);
  assert.equal(a.muestras, 0);
});

test('la saturación se cuenta y se informa', () => {
  const a = analizarVentana(ventanaDeVoz({ picoDb: -0.2, dinamicaDb: 1 }));
  assert.ok(a.probabilidadDeSaturacion > 0);
  const p = proponerGanancia(a, perfilPorTipo('LEAD_VOCAL'), 34, {
    repetidoEnDosCapturas: true, snrDb: 40, calibracionValida: true,
  });
  assert.ok(p.avisos.some((x) => /riesgo de saturación/.test(x)));
});

test('propone bajar cuando el pico está demasiado alto', () => {
  const a = analizarVentana(ventanaDeVoz({ picoDb: -4 }));
  const p = proponerGanancia(a, perfilPorTipo('LEAD_VOCAL'), 34, {
    repetidoEnDosCapturas: true, snrDb: 40, calibracionValida: true,
  });
  // El perfil de voz busca 12 dB de margen y hay 4: habría que bajar 8,
  // pero el límite por transacción recorta a 3.
  assert.ok(p.deltaDb < 0);
  assert.equal(p.deltaDb, -DELTA_MAXIMO_DB);
  assert.equal(p.recortadoPorLimite, true);
  assert.equal(p.gainPropuestoDb, 31);
});

test('propone subir cuando la fuente quedó corta', () => {
  const a = analizarVentana(ventanaDeVoz({ picoDb: -25 }));
  const p = proponerGanancia(a, perfilPorTipo('BASS'), 18, {
    repetidoEnDosCapturas: true, snrDb: 30, calibracionValida: true,
  });
  assert.ok(p.deltaDb > 0);
  assert.equal(p.recortadoPorLimite, true, 'quince decibeles no se corrigen de una vez');
});

test('INV-004: ninguna propuesta supera el límite por transacción', () => {
  for (const perfil of PERFILES_DE_CANAL) {
    for (const pico of [-60, -40, -25, -12, -6, -1]) {
      const a = analizarVentana(ventanaDeVoz({ picoDb: pico }));
      const p = proponerGanancia(a, perfil, 30, {
        repetidoEnDosCapturas: true, snrDb: 40, calibracionValida: true,
      });
      assert.ok(
        Math.abs(p.deltaDb) <= DELTA_MAXIMO_DB + 1e-9,
        `${perfil.nombre} con pico ${pico}: propuso ${p.deltaDb}`,
      );
    }
  }
});

test('cuando el margen ya es el correcto, no propone cambio', () => {
  const perfil = perfilPorTipo('LEAD_VOCAL');
  const a = analizarVentana(ventanaDeVoz({ picoDb: -perfil.margenObjetivoDb }));
  const p = proponerGanancia(a, perfil, 34, {
    repetidoEnDosCapturas: true, snrDb: 40, calibracionValida: true,
  });
  assert.ok(Math.abs(p.deltaDb) < 0.05);
  assert.match(p.razon, /ya está donde corresponde/);
});

test('cada perfil busca su propio margen', () => {
  // El cajón se conforma con menos margen que la voz, porque su dinámica es
  // más predecible: el cantante puede gritar en el estribillo aunque en la
  // prueba no lo haya hecho. Con el mismo pico medido, el cajón admite más
  // ganancia que la voz.
  const pico = -14;
  const voz = proponerGanancia(
    analizarVentana(ventanaDeVoz({ picoDb: pico })), perfilPorTipo('LEAD_VOCAL'), 30,
    { repetidoEnDosCapturas: true, snrDb: 40, calibracionValida: true },
  );
  const cajon = proponerGanancia(
    analizarVentana(ventanaDeVoz({ picoDb: pico })), perfilPorTipo('CAJON'), 30,
    { repetidoEnDosCapturas: true, snrDb: 40, calibracionValida: true },
  );
  assert.notEqual(voz.deltaDb, cajon.deltaDb);
  assert.ok(
    cajon.deltaDb > voz.deltaDb,
    'el cajón pide menos margen, así que admite más ganancia que la voz',
  );
});

test('la confianza exige dos capturas coincidentes', () => {
  const a = analizarVentana(ventanaDeVoz({ picoDb: -12 }));
  const perfil = perfilPorTipo('LEAD_VOCAL');
  const unaSola = proponerGanancia(a, perfil, 34, {
    repetidoEnDosCapturas: false, snrDb: 40, calibracionValida: true,
  });
  const dos = proponerGanancia(a, perfil, 34, {
    repetidoEnDosCapturas: true, snrDb: 40, calibracionValida: true,
  });
  assert.equal(unaSola.confianza, 'LOW');
  assert.equal(dos.confianza, 'HIGH');
});

test('sin calibración válida no hay confianza suficiente', () => {
  const a = analizarVentana(ventanaDeVoz({ picoDb: -12 }));
  const p = proponerGanancia(a, perfilPorTipo('LEAD_VOCAL'), 34, {
    repetidoEnDosCapturas: true, snrDb: 40, calibracionValida: false,
  });
  assert.equal(p.confianza, 'INSUFFICIENT_DATA');
});

test('una relación señal a ruido pobre se avisa con su motivo probable', () => {
  const a = analizarVentana(ventanaDeVoz({ picoDb: -12 }));
  const p = proponerGanancia(a, perfilPorTipo('LEAD_VOCAL'), 34, {
    repetidoEnDosCapturas: true, snrDb: 18, calibracionValida: true,
  });
  assert.ok(p.avisos.some((x) => /señal a ruido/.test(x)));
  assert.ok(p.avisos.some((x) => /micrófono estar lejos/.test(x)));
});

test('una dinámica mayor que la esperada se señala', () => {
  const a = analizarVentana(ventanaDeVoz({ picoDb: -12, dinamicaDb: 30 }));
  const p = proponerGanancia(a, perfilPorTipo('BASS'), 18, {
    repetidoEnDosCapturas: true, snrDb: 30, calibracionValida: true,
  });
  assert.ok(p.avisos.some((x) => /más de lo esperado/.test(x)));
});

test('la razón explica el porqué, con números', () => {
  const a = analizarVentana(ventanaDeVoz({ picoDb: -18 }));
  const p = proponerGanancia(a, perfilPorTipo('LEAD_VOCAL'), 34, {
    repetidoEnDosCapturas: true, snrDb: 40, calibracionValida: true,
  });
  // «dB en la escala de la consola», no dBFS: la correspondencia con un nivel
  // digital real la mide SPK-P0.10b, y decirle dBFS al usuario afirma una
  // referencia de fondo de escala que nadie midio.
  assert.match(p.razon, /-18\.0 dB en la escala de la consola/);
  assert.match(p.razon, /18\.0 dB de margen/);
  assert.match(p.razon, /busca 12 dB/);
});

test('los perfiles del código coinciden con los del documento', () => {
  // Si alguien ajusta un número en un lado y no en el otro, esto avisa.
  assert.equal(PERFILES_DE_CANAL.length, 13);
  const voz = perfilPorTipo('LEAD_VOCAL');
  assert.equal(voz.margenObjetivoDb, 12);
  assert.deepEqual(voz.hpfRangoHz, [80, 120]);
  assert.equal(voz.usaDeesser, true);
  const bajo = perfilPorTipo('BASS');
  assert.equal(bajo.defaultRole, 'FOUNDATION');
  assert.deepEqual(bajo.bandaUtilHz, [35, 5000]);
  const playback = perfilPorTipo('PLAYBACK');
  assert.equal(playback.compresorRatio, null, 'una pista ya mezclada no se comprime');
});

test('todo perfil tiene rangos coherentes', () => {
  for (const p of PERFILES_DE_CANAL) {
    assert.ok(p.bandaUtilHz[0] < p.bandaUtilHz[1], `${p.nombre}: banda útil invertida`);
    assert.ok(p.hpfRangoHz[0] <= p.hpfRangoHz[1], `${p.nombre}: rango de filtro invertido`);
    assert.ok(p.margenObjetivoDb > 0 && p.margenObjetivoDb < 30, `${p.nombre}: margen fuera de rango`);
    assert.ok(p.snrMinimoDb > 0, `${p.nombre}: relación señal a ruido mínima inválida`);
  }
});
