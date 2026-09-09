import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estadisticaDeCadencia, estadisticaDeSegmentos, huellaDelEstado } from '../src/cadencia.ts';
import { informeEnMarkdown } from '../src/informe.ts';
import type { CicloDeReconexion, InformeDeDiagnostico } from '../src/tipos.ts';

test('sin dos marcas no hay intervalo y devuelve null, no ceros', () => {
  assert.equal(estadisticaDeCadencia([]), null);
  assert.equal(estadisticaDeCadencia([100]), null);
});

test('una cadencia perfecta da media, mediana y p95 iguales y fluctuación cero', () => {
  const marcas = [0, 50, 100, 150, 200, 250];
  const c = estadisticaDeCadencia(marcas)!;
  assert.equal(c.muestras, 5);
  assert.equal(c.mediaMs, 50);
  assert.equal(c.medianaMs, 50);
  assert.equal(c.p95Ms, 50);
  assert.equal(c.fluctuacionMs, 0);
  assert.equal(c.umbralDeInestabilidadMs, 150);
});

test('la fluctuación distingue una cadencia irregular de una regular con la misma media', () => {
  // Las dos promedian 50 ms. La segunda alterna 10 y 90.
  const regular = estadisticaDeCadencia([0, 50, 100, 150, 200])!;
  const irregular = estadisticaDeCadencia([0, 10, 100, 110, 200])!;
  assert.equal(regular.mediaMs, irregular.mediaMs);
  assert.equal(regular.fluctuacionMs, 0);
  assert.ok(irregular.fluctuacionMs > 50, 'la irregular tiene que acusar la diferencia');
});

function marcasCon(intervalos: readonly number[]): number[] {
  const marcas = [0];
  for (const i of intervalos) marcas.push(marcas[marcas.length - 1]! + i);
  return marcas;
}

test('el percentil 95 es por rango y deja fuera exactamente el 5 % peor', () => {
  // Veinte intervalos: diecinueve de 10 ms y uno de 500. Ese pico ES el 5 %
  // superior, así que el percentil 95 no debe verlo -- y el máximo sí.
  const c = estadisticaDeCadencia(marcasCon([...Array(19).fill(10), 500]))!;
  assert.equal(c.muestras, 20);
  assert.equal(c.maximoMs, 500);
  assert.equal(c.p95Ms, 10);
  assert.equal(c.medianaMs, 10);
});

test('con dos picos en veinte, el percentil 95 ya los acusa', () => {
  // El segundo pico entra dentro del 95 %: es la diferencia entre «un bache» y
  // «esto pasa seguido», que es justo lo que el percentil tiene que separar.
  const c = estadisticaDeCadencia(marcasCon([...Array(18).fill(10), 500, 500]))!;
  assert.equal(c.p95Ms, 500);
});

test('el percentil no interpola: sale un valor que existe entre las muestras', () => {
  const c = estadisticaDeCadencia(marcasCon([10, 20, 30, 40]))!;
  assert.ok([10, 20, 30, 40].includes(c.p95Ms), `${c.p95Ms} no es ninguna muestra`);
});

test('la huella no depende del orden de las claves', () => {
  const a = new Map<string, number>([['i.1.mix', 0.5], ['i.2.mix', 0.25]]);
  const b = new Map<string, number>([['i.2.mix', 0.25], ['i.1.mix', 0.5]]);
  assert.equal(huellaDelEstado(a), huellaDelEstado(b));
});

test('la huella cambia si cambia un valor', () => {
  const a = new Map<string, number>([['i.1.mix', 0.5]]);
  const b = new Map<string, number>([['i.1.mix', 0.5001]]);
  assert.notEqual(huellaDelEstado(a), huellaDelEstado(b));
});

test('un estado vacío da huella estable', () => {
  assert.equal(huellaDelEstado(new Map()), huellaDelEstado(new Map()));
});

function ciclo(ms: number | null): CicloDeReconexion {
  return {
    modo: 'router-apagado',
    caidaEn: '2026-09-08T12:00:00.000Z',
    redVuelveEn: ms === null ? null : '2026-09-08T12:00:20.000Z',
    volcadoEn: '2026-09-08T12:00:25.000Z',
    msDesdeLaCaida: 25_000,
    msDesdeQueVolvioLaRed: ms,
  };
}

function informe(ciclos: readonly CicloDeReconexion[]): InformeDeDiagnostico {
  return {
    version: 2,
    generadoEn: '2026-09-08T12:00:00.000Z',
    dispositivo: { modelo: 'Ui24R', firmware: '3.5', direccion: 'ws://10.10.1.1', agente: 'prueba' },
    cadenciaDelAnalizador: null,
    cadenciaDeMedidores: null,
    duracionDeLaMedicionMs: 0,
    ciclos,
    huellaDelEstado: 'abcd',
    canalesLeidos: 12,
    sinMedir: ['El eco de las escrituras propias: exige escribir, y en esta fase la aplicación no escribe.'],
  };
}

test('un ciclo sin dato de red queda sin juzgar, no aprobado', () => {
  const md = informeEnMarkdown(informe([ciclo(null)]));
  assert.match(md, /sin juzgar/);
  assert.doesNotMatch(md, /\| sí \|/);
  assert.match(md, /0 de 0 ciclos juzgables/);
});

test('un ciclo lento sale marcado como fallo', () => {
  const md = informeEnMarkdown(informe([ciclo(12_000)]));
  assert.match(md, /\*\*NO\*\*/);
  assert.match(md, /0 de 1 ciclos juzgables/);
});

test('un ciclo rápido pasa, y el resumen no da por cerrado el criterio', () => {
  const md = informeEnMarkdown(informe([ciclo(3_000)]));
  assert.match(md, /1 de 1 ciclos juzgables/);
  assert.match(md, /pide 20 de 20/);
});

test('el informe dice siempre lo que no midió', () => {
  const md = informeEnMarkdown(informe([]));
  assert.match(md, /Lo que esta corrida no midió/);
  assert.match(md, /el eco de las escrituras propias/i);
});

test('sin cadencia el informe lo dice en vez de mostrar ceros', () => {
  const md = informeEnMarkdown(informe([]));
  assert.match(md, /menos de dos tramas/);
  assert.doesNotMatch(md, /0\.0 ms/);
});

test('el hueco de un corte no cuenta como cadencia', () => {
  // Dos tramos de 50 ms separados por tres segundos de caída. Medido de
  // corrido, la media subía a 66 ms y el máximo era el corte.
  const antes = [0, 50, 100, 150];
  const despues = [3150, 3200, 3250, 3300];

  const decorrido = estadisticaDeCadencia([...antes, ...despues])!;
  assert.ok(decorrido.maximoMs > 2000, 'de corrido, el corte entra como si fuera una trama tardía');

  const porTramos = estadisticaDeSegmentos([antes, despues])!;
  assert.equal(porTramos.mediaMs, 50);
  assert.equal(porTramos.maximoMs, 50);
  assert.equal(porTramos.muestras, 6, 'seis intervalos: tres por tramo, ninguno entre tramos');
});

test('un tramo de una sola trama no aporta intervalos y no rompe', () => {
  const c = estadisticaDeSegmentos([[0, 50, 100], [500], []])!;
  assert.equal(c.muestras, 2);
  assert.equal(c.mediaMs, 50);
});

test('sin ningún intervalo devuelve null aunque haya tramos', () => {
  assert.equal(estadisticaDeSegmentos([[], [1], []]), null);
});
