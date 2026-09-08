import type { CicloDeReconexion, EstadisticaDeCadencia, InformeDeDiagnostico } from './tipos.ts';

/** El umbral del criterio 1 de SPK-P0.1: reconectar en menos de diez segundos. */
export const UMBRAL_RECONEXION_MS = 10_000;

/**
 * El informe en Markdown, pensado para pegarse en el acta del control o en una
 * conversación.
 *
 * Dice también **lo que no midió**. Un informe que solo enumera lo que salió
 * bien se lee como si lo demás estuviera comprobado, y acá lo que no se midió
 * es la mitad del spike.
 */
export function informeEnMarkdown(informe: InformeDeDiagnostico): string {
  const l: string[] = [];
  l.push('# Diagnóstico de conexión');
  l.push('');
  l.push(`**Generado:** ${informe.generadoEn}`);
  l.push(`**Consola:** ${informe.dispositivo.modelo ?? 'sin leer'} · firmware ${informe.dispositivo.firmware ?? 'sin leer'}`);
  l.push(`**Dirección:** ${informe.dispositivo.direccion}`);
  l.push(`**Aparato:** ${informe.dispositivo.agente}`);
  l.push('');

  l.push('## Cadencia de los medidores');
  l.push('');
  if (informe.cadenciaDeMedidores === null) {
    l.push('No se midió, o llegaron menos de dos tramas. Sin dos tramas no hay ningún intervalo que medir.');
  } else {
    const c = informe.cadenciaDeMedidores;
    l.push(`Medido durante ${(informe.duracionDeLaMedicionMs / 1000).toFixed(0)} s.`);
    l.push('');
    l.push('| Medida | Valor |');
    l.push('|---|---|');
    l.push(`| Muestras (intervalos) | ${c.muestras} |`);
    l.push(`| Intervalo medio | ${c.mediaMs.toFixed(1)} ms |`);
    l.push(`| Mediana | ${c.medianaMs.toFixed(1)} ms |`);
    l.push(`| Percentil 95 | ${c.p95Ms.toFixed(1)} ms |`);
    l.push(`| Fluctuación | ${c.fluctuacionMs.toFixed(1)} ms |`);
    l.push(`| Mínimo / máximo | ${c.minimoMs.toFixed(1)} / ${c.maximoMs.toFixed(1)} ms |`);
    l.push(`| **Umbral de inestabilidad** | **${c.umbralDeInestabilidadMs.toFixed(1)} ms** |`);
    l.push('');
    l.push('El umbral es tres veces el intervalo medio, como fija el criterio 4 de SPK-P0.1: por encima de eso la conexión se declara inestable.');
  }
  l.push('');

  l.push('## Ciclos de reconexión');
  l.push('');
  if (informe.ciclos.length === 0) {
    l.push('Ninguno registrado.');
  } else {
    l.push('| # | Modo de corte | Desde la caída | Desde que volvió la red | ¿Bajo 10 s? |');
    l.push('|---|---|---|---|---|');
    informe.ciclos.forEach((c, i) => {
      const desdeRed = c.msDesdeQueVolvioLaRed === null
        ? 'no avisó'
        : `${c.msDesdeQueVolvioLaRed} ms`;
      l.push(`| ${i + 1} | ${c.modo} | ${c.msDesdeLaCaida} ms | ${desdeRed} | ${veredicto(c)} |`);
    });
    l.push('');
    l.push(resumenDeCiclos(informe.ciclos));
    l.push('');
    l.push('«Desde la caída» incluye el tiempo que la red estuvo cortada, así que no se compara con nada: el número del criterio 1 es el otro. Cuando el sistema no avisa de que volvió la red, ese ciclo no puede juzgarse y queda anotado como tal en vez de contarse como bueno.');
  }
  l.push('');

  l.push('## Estado leído');
  l.push('');
  l.push(`Canales leídos: ${informe.canalesLeidos}.`);
  l.push(`Huella del estado: \`${informe.huellaDelEstado ?? 'sin estado'}\`.`);
  l.push('');
  l.push('La huella sirve para el criterio 5: conectar otro cliente a la vez, generar su propia huella y comparar. Iguales quiere decir que los dos ven lo mismo.');
  l.push('');

  l.push('## Lo que esta corrida no midió');
  l.push('');
  for (const pendiente of informe.sinMedir) l.push(`- ${pendiente}`);
  l.push('');
  return l.join('\n');
}

function veredicto(c: CicloDeReconexion): string {
  if (c.msDesdeQueVolvioLaRed === null) return 'sin juzgar';
  return c.msDesdeQueVolvioLaRed < UMBRAL_RECONEXION_MS ? 'sí' : '**NO**';
}

function resumenDeCiclos(ciclos: readonly CicloDeReconexion[]): string {
  const juzgables = ciclos.filter((c) => c.msDesdeQueVolvioLaRed !== null);
  const buenos = juzgables.filter((c) => c.msDesdeQueVolvioLaRed! < UMBRAL_RECONEXION_MS);
  const sinJuzgar = ciclos.length - juzgables.length;
  const partes = [`${buenos.length} de ${juzgables.length} ciclos juzgables por debajo de 10 s`];
  if (sinJuzgar > 0) partes.push(`${sinJuzgar} sin juzgar`);
  return `**Resumen:** ${partes.join(', ')}. El criterio 1 pide 20 de 20 por cada modo de corte.`;
}

/** Estadística de cadencia formateada en una línea, para la pantalla. */
export function resumenDeCadencia(c: EstadisticaDeCadencia | null): string {
  if (c === null) return 'sin datos';
  return `${c.mediaMs.toFixed(0)} ms de media, p95 ${c.p95Ms.toFixed(0)} ms`;
}
