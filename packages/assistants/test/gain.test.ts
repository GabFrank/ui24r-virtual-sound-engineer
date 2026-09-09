import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analizarVentana, proponerGanancia, UMBRAL_SILENCIO_DB,
  DELTA_MAXIMO_DB, REDUCCION_RELEVANTE_DB, type MuestraVu } from '../src/gain.ts';
import {
  perfilPorTipo, PERFILES_DE_CANAL, DINAMICA_LIMPIA, DINAMICA_SIN_LEER,
  type DinamicaDeCanal,
} from '@vse/domain';

/**
 * Un canal con el proceso que se pida activo y el resto fuera del camino.
 *
 * `DINAMICA_LIMPIA` —todo INACTIVO— es lo que usan los tests que no hablan de
 * proceso: son los que fijan que **nada cambió** para un canal limpio.
 */
function conProceso(cambios: Partial<DinamicaDeCanal>): DinamicaDeCanal {
  return { ...DINAMICA_LIMPIA, ...cambios };
}

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
  /**
   * Reducción que el compresor aplica **en el pico**, en dB.
   *
   * Se reparte como lo haría un compresor de verdad: aprieta donde la señal
   * sube y suelta en los valles, así que el pico es el que más reducción tiene.
   */
  reduccionEnPicoDb?: number;
}): MuestraVu[] {
  const {
    picoDb, duracionS = 18, hz = 20, conSilencios = true, dinamicaDb = 9,
    reduccionEnPicoDb = 0,
  } = opciones;
  const muestras: MuestraVu[] = [];
  const total = Math.round(duracionS * hz);
  for (let i = 0; i < total; i++) {
    const tMs = (i / hz) * 1000;
    const fase = (i / hz) % 4; // frases de cuatro segundos
    let db: number;
    let envolventeActual = 0;
    if (conSilencios && fase > 3.2) {
      db = -70; // respiración entre frases
    } else {
      const envolvente = Math.sin((fase / 3.2) * Math.PI);
      envolventeActual = Math.max(0, envolvente);
      db = picoDb - dinamicaDb * (1 - envolvente);
    }
    muestras.push({ tMs, db, reduccionDb: reduccionEnPicoDb * envolventeActual });
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
    muestras.push({ tMs: i * 100, db: i % 2 === 0 ? -20 : -10, reduccionDb: 0 });
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
  for (let i = 0; i < 400; i++) muestras.push({ tMs: i * 50, db: -75, reduccionDb: 0 });
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
    repetidoEnDosCapturas: true, snrDb: 40, calibracionValida: true, dinamica: DINAMICA_LIMPIA,
  });
  assert.ok(p.avisos.some((x) => /riesgo de saturación/.test(x)));
});

test('propone bajar cuando el pico está demasiado alto', () => {
  const a = analizarVentana(ventanaDeVoz({ picoDb: -4 }));
  const p = proponerGanancia(a, perfilPorTipo('LEAD_VOCAL'), 34, {
    repetidoEnDosCapturas: true, snrDb: 40, calibracionValida: true, dinamica: DINAMICA_LIMPIA,
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
    repetidoEnDosCapturas: true, snrDb: 30, calibracionValida: true, dinamica: DINAMICA_LIMPIA,
  });
  assert.ok(p.deltaDb > 0);
  assert.equal(p.recortadoPorLimite, true, 'quince decibeles no se corrigen de una vez');
});

test('INV-004: ninguna propuesta supera el límite por transacción', () => {
  for (const perfil of PERFILES_DE_CANAL) {
    for (const pico of [-60, -40, -25, -12, -6, -1]) {
      const a = analizarVentana(ventanaDeVoz({ picoDb: pico }));
      const p = proponerGanancia(a, perfil, 30, {
        repetidoEnDosCapturas: true, snrDb: 40, calibracionValida: true, dinamica: DINAMICA_LIMPIA,
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
    repetidoEnDosCapturas: true, snrDb: 40, calibracionValida: true, dinamica: DINAMICA_LIMPIA,
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
    { repetidoEnDosCapturas: true, snrDb: 40, calibracionValida: true, dinamica: DINAMICA_LIMPIA },
  );
  const cajon = proponerGanancia(
    analizarVentana(ventanaDeVoz({ picoDb: pico })), perfilPorTipo('CAJON'), 30,
    { repetidoEnDosCapturas: true, snrDb: 40, calibracionValida: true, dinamica: DINAMICA_LIMPIA },
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
    repetidoEnDosCapturas: false, snrDb: 40, calibracionValida: true, dinamica: DINAMICA_LIMPIA,
  });
  const dos = proponerGanancia(a, perfil, 34, {
    repetidoEnDosCapturas: true, snrDb: 40, calibracionValida: true, dinamica: DINAMICA_LIMPIA,
  });
  assert.equal(unaSola.confianza, 'LOW');
  assert.equal(dos.confianza, 'HIGH');
});

test('sin calibración válida no hay confianza suficiente', () => {
  const a = analizarVentana(ventanaDeVoz({ picoDb: -12 }));
  const p = proponerGanancia(a, perfilPorTipo('LEAD_VOCAL'), 34, {
    repetidoEnDosCapturas: true, snrDb: 40, calibracionValida: false, dinamica: DINAMICA_LIMPIA,
  });
  assert.equal(p.confianza, 'INSUFFICIENT_DATA');
});

test('una relación señal a ruido pobre se avisa con su motivo probable', () => {
  const a = analizarVentana(ventanaDeVoz({ picoDb: -12 }));
  const p = proponerGanancia(a, perfilPorTipo('LEAD_VOCAL'), 34, {
    repetidoEnDosCapturas: true, snrDb: 18, calibracionValida: true, dinamica: DINAMICA_LIMPIA,
  });
  assert.ok(p.avisos.some((x) => /señal a ruido/.test(x)));
  assert.ok(p.avisos.some((x) => /micrófono estar lejos/.test(x)));
});

test('una dinámica mayor que la esperada se señala', () => {
  const a = analizarVentana(ventanaDeVoz({ picoDb: -12, dinamicaDb: 30 }));
  const p = proponerGanancia(a, perfilPorTipo('BASS'), 18, {
    repetidoEnDosCapturas: true, snrDb: 30, calibracionValida: true, dinamica: DINAMICA_LIMPIA,
  });
  assert.ok(p.avisos.some((x) => /más de lo esperado/.test(x)));
});

test('la razón explica el porqué, con números', () => {
  const a = analizarVentana(ventanaDeVoz({ picoDb: -18 }));
  const p = proponerGanancia(a, perfilPorTipo('LEAD_VOCAL'), 34, {
    repetidoEnDosCapturas: true, snrDb: 40, calibracionValida: true, dinamica: DINAMICA_LIMPIA,
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

/* ------------------------------------------------------------------ *
 * El nivel medido no siempre es el de la fuente
 *
 * El medidor de entrada de esta consola está DESPUÉS del procesamiento
 * dinámico: bajar el umbral del compresor mueve la lectura. Un consejo de
 * ganancia calculado sobre un nivel comprimido es un consejo equivocado, y lo
 * grave es que no se nota. Lo que sigue fija en qué casos el asistente cambia
 * de comportamiento, y --tan importante como eso-- en cuáles NO cambia.
 * ------------------------------------------------------------------ */

test('el análisis toma la reducción del instante del pico, no el promedio', () => {
  // Un canal que aprieta en las frases y suelta en el grito tiene promedio alto
  // y pico limpio. La propuesta sale del pico, así que lo que importa es cuánto
  // le sacaron a ESE pico.
  const a = analizarVentana(ventanaDeVoz({ picoDb: -12, reduccionEnPicoDb: 6 }));
  assert.ok(Math.abs(a.reduccionEnPicoDb - 6) < 0.3, `dio ${a.reduccionEnPicoDb.toFixed(2)}`);
  assert.ok(a.reduccionMaximaDb >= a.reduccionEnPicoDb - 1e-9);
  assert.ok(a.fraccionComprimida > 0);
});

test('el compresor NO cambia el número: la ventana se mide antes que él', () => {
  // Es lo que se gana midiendo en el punto correcto en vez de reconstruir el
  // nivel. Antes de saber que `pre` es anterior al dinámico, este caso obligaba
  // a abstenerse de proponer; ahora la propuesta sale entera y con el mismo
  // número que en un canal limpio.
  const limpio = proponerGanancia(
    analizarVentana(ventanaDeVoz({ picoDb: -25 })), perfilPorTipo('BASS'), 18,
    { repetidoEnDosCapturas: true, snrDb: 30, calibracionValida: true, dinamica: DINAMICA_LIMPIA },
  );
  const comprimiendo = proponerGanancia(
    analizarVentana(ventanaDeVoz({ picoDb: -25, reduccionEnPicoDb: 9 })),
    perfilPorTipo('BASS'), 18,
    {
      repetidoEnDosCapturas: true, snrDb: 30, calibracionValida: true,
      dinamica: conProceso({ compresor: 'ACTIVO' }),
    },
  );

  assert.equal(comprimiendo.deltaDb, limpio.deltaDb, 'el mismo número');
  assert.equal(comprimiendo.gainPropuestoDb, limpio.gainPropuestoDb);
  assert.ok(comprimiendo.deltaDb > 0, 'y sigue proponiendo subir');
  assert.equal(
    comprimiendo.confianza, limpio.confianza,
    'lo medido no cuesta confianza: que el compresor no toca ese punto está comprobado',
  );
});

test('un canal comprimiendo avisa que el cambio no se va a escuchar entero', () => {
  // El aviso cambió de motivo, no desapareció. Ya no es "no puedo confiar en el
  // nivel" sino "lo que vas a escuchar no es lo que estoy midiendo": si el
  // compresor saca 9 dB, subir tres se oye como bastante menos de tres.
  const a = analizarVentana(ventanaDeVoz({ picoDb: -25, reduccionEnPicoDb: 9 }));
  const p = proponerGanancia(a, perfilPorTipo('BASS'), 18, {
    repetidoEnDosCapturas: true, snrDb: 30, calibracionValida: true,
    dinamica: conProceso({ compresor: 'ACTIVO' }),
  });

  assert.deepEqual(p.condicionadaPor, ['compresor']);
  assert.ok(p.reduccionEnPicoDb > 8);
  const aviso = p.avisos.find((x) => /está comprimiendo/.test(x));
  assert.ok(aviso !== undefined, 'tiene que avisar');
  assert.match(aviso ?? '', /vas a escuchar bastante menos/);
  assert.match(aviso ?? '', /el número de acá arriba es el correcto/);
});

test('la razón dice de dónde salió el pico cuando el canal comprime', () => {
  // No es la columna que el usuario está mirando en la consola: la de la
  // consola trae el compresor encima. Decirlo evita que compare dos números
  // distintos y crea que uno de los dos está mal.
  const a = analizarVentana(ventanaDeVoz({ picoDb: -4, reduccionEnPicoDb: 6 }));
  const p = proponerGanancia(a, perfilPorTipo('LEAD_VOCAL'), 34, {
    repetidoEnDosCapturas: true, snrDb: 40, calibracionValida: true,
    dinamica: conProceso({ compresor: 'ACTIVO' }),
  });
  assert.match(p.razon, /medidos antes del compresor/);
  assert.match(p.razon, /sacaba 6\.\d dB/);
});

test('un compresor puesto que no llegó a actuar no cambia nada', () => {
  // La distinción que vale: en un show casi todos los canales tienen compresor.
  // Avisar en todos sería un cartel que se aprende a ignorar. Manda lo que se
  // midió, no lo que está configurado.
  const a = analizarVentana(ventanaDeVoz({ picoDb: -25, reduccionEnPicoDb: 0 }));
  const conCompresor = proponerGanancia(a, perfilPorTipo('BASS'), 18, {
    repetidoEnDosCapturas: true, snrDb: 30, calibracionValida: true,
    dinamica: conProceso({ compresor: 'ACTIVO' }),
  });

  assert.deepEqual(conCompresor.condicionadaPor, [], 'nada hay entre el previo y el parlante');
  assert.ok(
    conCompresor.avisos.some((x) => /no llegó a actuar/.test(x)),
    'pero se dice, porque sostiene la confianza en el aviso del día que sí aparezca',
  );
  assert.ok(!conCompresor.avisos.some((x) => /está comprimiendo/.test(x)));
});

test('una reducción por debajo del escalón de la perilla se trata como cero', () => {
  // El escalón más fino de la ganancia de entrada es de 1 dB: un sesgo menor no
  // puede cambiar a qué posición se manda al usuario.
  const a = analizarVentana(ventanaDeVoz({
    picoDb: -25, reduccionEnPicoDb: REDUCCION_RELEVANTE_DB - 0.4,
  }));
  const p = proponerGanancia(a, perfilPorTipo('BASS'), 18, {
    repetidoEnDosCapturas: true, snrDb: 30, calibracionValida: true,
    dinamica: conProceso({ compresor: 'ACTIVO' }),
  });
  assert.equal(p.reduccionEnPicoDb, 0);
  assert.deepEqual(p.condicionadaPor, []);
});

test('la puerta ya no baja la confianza: se midio', () => {
  // Estuvo en MEDIUM mientras el caso de la puerta era una inferencia. Se midio
  // el 2026-09-09 contra la consola: con la puerta cerrada del todo, el nivel
  // de entrada cayo a -Infinity y el punto de medicion no se movio un decimal.
  // El aviso se queda igual, pero por otro motivo: la puerta no afecta a la
  // medicion y si a lo que se escucha.
  const a = analizarVentana(ventanaDeVoz({ picoDb: -25 }));
  const p = proponerGanancia(a, perfilPorTipo('BASS'), 18, {
    repetidoEnDosCapturas: true, snrDb: 30, calibracionValida: true,
    dinamica: conProceso({ puerta: 'ACTIVO' }),
  });

  assert.ok(p.deltaDb > 0, 'sigue proponiendo');
  assert.equal(p.confianza, 'HIGH', 'y ahora si llega a la mas alta');
  assert.ok(p.avisos.some((x) => /afecta a la medición/i.test(x)));
  assert.deepEqual(p.condicionadaPor, ['puerta de ruido']);
});

test('con la puerta activa no se culpa al músico por la variación de la puerta', () => {
  // El aviso de «la fuente varió más de lo esperado» estaría midiendo la
  // puerta. Es el mismo error que hizo salir torcido el primer barrido contra
  // la consola: el medidor no mentía, informaba una señal ya procesada.
  const a = analizarVentana(ventanaDeVoz({ picoDb: -12, dinamicaDb: 30 }));
  const conPuerta = proponerGanancia(a, perfilPorTipo('BASS'), 18, {
    repetidoEnDosCapturas: true, snrDb: 30, calibracionValida: true,
    dinamica: conProceso({ puerta: 'ACTIVO' }),
  });
  const sinPuerta = proponerGanancia(a, perfilPorTipo('BASS'), 18, {
    repetidoEnDosCapturas: true, snrDb: 30, calibracionValida: true, dinamica: DINAMICA_LIMPIA,
  });

  assert.ok(sinPuerta.avisos.some((x) => /más de lo esperado/.test(x)));
  assert.ok(!conPuerta.avisos.some((x) => /más de lo esperado/.test(x)));
});

test('el de-esser cuesta confianza porque es el unico bloque sin medir', () => {
  const a = analizarVentana(ventanaDeVoz({ picoDb: -25 }));
  const p = proponerGanancia(a, perfilPorTipo('LEAD_VOCAL'), 34, {
    repetidoEnDosCapturas: true, snrDb: 40, calibracionValida: true,
    dinamica: conProceso({ deesser: 'ACTIVO' }),
  });

  assert.ok(p.avisos.some((x) => /de-esser activo/.test(x)));
  assert.equal(p.confianza, 'MEDIUM');
});

test('solo lo inferido cuesta confianza; lo medido no', () => {
  // La regla entera en un test. El compresor, el ecualizador y la puerta estan
  // MEDIDOS --ninguno toca el punto de medicion-- asi que ninguno cuesta
  // confianza. El de-esser no: no reporta cuanto atenua y no se probo con
  // sibilancia, y mientras siga asi cuesta un escalon.
  const a = analizarVentana(ventanaDeVoz({ picoDb: -4, reduccionEnPicoDb: 6 }));
  const comun = { repetidoEnDosCapturas: true, snrDb: 40, calibracionValida: true };

  const limpio = proponerGanancia(
    analizarVentana(ventanaDeVoz({ picoDb: -4 })), perfilPorTipo('LEAD_VOCAL'), 34,
    { ...comun, dinamica: DINAMICA_LIMPIA },
  );
  const comprimiendo = proponerGanancia(a, perfilPorTipo('LEAD_VOCAL'), 34,
    { ...comun, dinamica: conProceso({ compresor: 'ACTIVO' }) });
  const conPuerta = proponerGanancia(a, perfilPorTipo('LEAD_VOCAL'), 34,
    { ...comun, dinamica: conProceso({ puerta: 'ACTIVO' }) });
  const conDeesser = proponerGanancia(a, perfilPorTipo('LEAD_VOCAL'), 34,
    { ...comun, dinamica: conProceso({ deesser: 'ACTIVO' }) });

  assert.equal(limpio.confianza, 'HIGH');
  assert.equal(comprimiendo.confianza, 'HIGH', 'medido: no cuesta confianza');
  assert.equal(conPuerta.confianza, 'HIGH', 'medido tambien: dejo de costar');
  assert.equal(conDeesser.confianza, 'MEDIUM', 'lo unico que sigue inferido');
});

test('no saber si hay proceso se dice, pero no se bloquea ni se penaliza', () => {
  // «No lo sé» no es evidencia de que haya proceso. Y con la reducción medida,
  // el caso que importaba --el compresor-- ya está cubierto: si sacó cero, da
  // igual que la bandera no haya llegado. Tratar DESCONOCIDO como ACTIVO
  // apagaría el asistente entero contra un firmware que no publique esas
  // claves, sin ganar nada.
  const a = analizarVentana(ventanaDeVoz({ picoDb: -25 }));
  const p = proponerGanancia(a, perfilPorTipo('BASS'), 18, {
    repetidoEnDosCapturas: true, snrDb: 30, calibracionValida: true,
    dinamica: DINAMICA_SIN_LEER,
  });

  assert.ok(p.deltaDb > 0);
  assert.equal(p.confianza, 'HIGH');
  assert.ok(p.avisos.some((x) => /la consola no dijo si/.test(x)));
});

test('un canal limpio se comporta exactamente igual que antes de todo esto', () => {
  // La red de seguridad del cambio: si algo de lo anterior se filtra al camino
  // normal, acá se nota.
  const a = analizarVentana(ventanaDeVoz({ picoDb: -18 }));
  const p = proponerGanancia(a, perfilPorTipo('LEAD_VOCAL'), 34, {
    repetidoEnDosCapturas: true, snrDb: 40, calibracionValida: true, dinamica: DINAMICA_LIMPIA,
  });
  assert.equal(p.reduccionEnPicoDb, 0);
  assert.deepEqual(p.condicionadaPor, []);
  assert.equal(p.confianza, 'HIGH');
  assert.equal(p.deltaDb, 3, 'margen 18 contra objetivo 12, recortado al límite');
  assert.equal(p.gainPropuestoDb, 37);
});
