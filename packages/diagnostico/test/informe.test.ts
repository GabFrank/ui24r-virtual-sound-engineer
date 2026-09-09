import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estadisticaDeCadencia } from '../src/cadencia.ts';
import { informeEnMarkdown } from '../src/informe.ts';
import type { InformeDeDiagnostico } from '../src/tipos.ts';

/** Treinta tramas a 33 ms: lo que da el analizador, con o sin música. */
const RTA = estadisticaDeCadencia(Array.from({ length: 30 }, (_, i) => i * 33));
/** Cuatro tramas muy separadas: lo que dan los medidores en una sala callada. */
const VU2 = estadisticaDeCadencia([0, 4_000, 9_000, 15_000]);

function informe(parcial: Partial<InformeDeDiagnostico> = {}): InformeDeDiagnostico {
  return {
    version: 2,
    generadoEn: '2026-09-08T23:00:00.000Z',
    dispositivo: { modelo: 'Ui24R', firmware: '3.4.8318-ui24', direccion: '192.168.0.78', agente: 'prueba' },
    cadenciaDelAnalizador: RTA,
    cadenciaDeMedidores: VU2,
    duracionDeLaMedicionMs: 60_000,
    ciclos: [],
    huellaDelEstado: null,
    canalesLeidos: 12,
    sinMedir: [],
    ...parcial,
  };
}

test('el informe da las dos cadencias por separado', () => {
  // Cuando había una sola, el número que se leía como «la conexión» era el de
  // los medidores, que la consola apaga en silencio. Los mismos datos de esta
  // prueba —33 ms de analizador contra segundos de medidores— dan dos lecturas
  // opuestas, y el informe tiene que mostrar las dos.
  const md = informeEnMarkdown(informe());

  assert.match(md, /## Cadencia del analizador \(`RTA`\)/);
  assert.match(md, /## Cadencia de los medidores \(`VU2`\)/);
});

test('el informe dice cuál de las dos juzga la conexión', () => {
  const md = informeEnMarkdown(informe());

  assert.match(md, /criterio 4 de SPK-P0\.1/, 'la del analizador se declara como la del criterio');
  assert.match(md, /\*\*No juzga la conexión\.\*\*/, 'la de los medidores se declara como lo que no es');
});

test('una cadencia que falta se explica en vez de quedar en blanco', () => {
  const md = informeEnMarkdown(informe({ cadenciaDeMedidores: null }));

  assert.match(md, /menos de dos tramas/);
  assert.match(md, /## Cadencia del analizador \(`RTA`\)/, 'la otra sigue estando');
});
