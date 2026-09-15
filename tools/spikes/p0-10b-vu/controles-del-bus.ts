/**
 * Los controles que una medición sobre un bus auxiliar necesita, archivados.
 *
 * **Existe porque la medición 94 los corrió desde un borrador.** El censo de
 * quién más alimenta el bus, el estado del supresor y la comprobación de la
 * restauración se hicieron y se citaron en el documento — pero desde un guion
 * de usar y tirar, así que las cifras citadas no estaban en ninguna evidencia
 * archivada. Un número que no está en su evidencia es un número que nadie puede
 * volver a verificar, y este proyecto ya tiene tres episodios de eso.
 *
 * Corre **después** de medir y comprueba, en este orden:
 *
 * 1. **La restauración**, releyendo por HTTP — camino distinto del que escribió.
 * 2. **Quién más alimenta el bus.** Un auxiliar es una suma: si otros canales le
 *    mandan, el piso del barrido no es el piso del envío sino el de la suma.
 * 3. **Si el supresor aprendió algo durante la corrida.** Un filtro nuevo dobla
 *    la curva y parece una rodilla.
 * 4. **Si el bus está enlazado en estéreo**, en cuyo caso el paneo del canal
 *    reparte y el nivel leído no depende sólo del envío.
 * 5. **El estado del dinámico y la puerta** del canal, que pueden actuar sin
 *    avisar.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-10b-vu/controles-del-bus.ts 10 2 192.168.0.78
 */
import { estadoPorHttp } from '../canal-muerto.ts';

const canal = Number(process.argv[2] ?? '10');
const n = canal - 1;
const aux = Number(process.argv[3] ?? '2');
const maquina = process.argv[4] ?? '192.168.0.78';

/** Lo que un filtro del supresor dice cuando está vacío. */
const FILTRO_VACIO = '1000.0000000000,116';

const e = await estadoPorHttp(maquina);
console.log(`canal ${canal} (i.${n}) -> auxiliar ${aux + 1} (a.${aux}), ${e.size} claves leidas`);

console.log('');
console.log('=== 1. RESTAURACION, releida por HTTP ===');
for (const k of [`i.${n}.aux.${aux}.value`, `i.${n}.mix`, `hw.${n}.gain`,
                 `i.${n}.aux.${aux}.post`, `i.${n}.aux.${aux}.postproc`]) {
  console.log('  ', k.padEnd(24), e.get(k) ?? '—');
}
// **El ecualizador también, desde la medición 95.** Esa corrida realza las cinco
// bandas al máximo para generar un cambio de nivel conocido, y dejarlas puestas
// sería devolverle al usuario un canal ecualizado que él no ecualizó.
for (let b = 1; b <= 5; b++) {
  console.log('  ', `i.${n}.eq.b${b}.gain`.padEnd(24), e.get(`i.${n}.eq.b${b}.gain`) ?? '—',
    e.get(`i.${n}.eq.b${b}.gain`) === '0.5' ? '' : '   <-- NO es plano');
}

console.log('');
console.log(`=== 2. QUIEN MAS ALIMENTA EL AUXILIAR ${aux + 1} ===`);
let otros = 0;
for (let c = 0; c < 24; c++) {
  const v = Number(e.get(`i.${c}.aux.${aux}.value`) ?? '0');
  if (v > 0) {
    console.log(`   i.${c}.aux.${aux}.value = ${v}   (canal ${c + 1}, `
      + `"${e.get(`i.${c}.name`) ?? ''}", silencio=${e.get(`i.${c}.mute`) ?? '?'})`);
    otros++;
  }
}
console.log(`   canales que mandan algo: ${otros}`);
console.log('   Con senal en ellos, el piso del barrido es la suma y no el envio.');

console.log('');
console.log('=== 3. LOS SUPRESORES: EL DEL BUS Y EL DEL GENERAL ===');
// **Este control miraba SOLO el del bus, y era el que no podia aprender.**
// `a.2.afs.enabled` vale 0, o sea apagado: por ahi no iba a aparecer nunca un
// filtro. Y mientras las tres corridas archivadas imprimian «filtros plantados:
// 0 (0 = no aprendio nada)», el supresor del GENERAL estaba aprendiendo seis
// filtros de -18 dB en 1000, 100 y 10000 Hz --las tres frecuencias de los tonos
// de medicion-- y desplazando los tres del usuario.
//
// O sea que los tres archivos `controles-*` no sostienen lo que parecian
// sostener. Lo encontro una auditoria de instrumentos, y el defecto es de forma:
// **un control que mira donde no puede pasar nada solo puede confirmar.** El
// tono sale por el general, asi que el general es donde hay que mirar.
//
// El orden de las columnas es `freq, Q, gain, tipo`: lo dice el volcado crudo
// --`376.47,7.0,-6.0,2` es un notch de -6 dB con Q 7, porque un Q de -6 no
// existe-- y una ranura vacia es `1000,116,0,0`, con 116 de Q.
const mostrarFiltros = (prefijo: string): number => {
  console.log(`   ${prefijo}.afs.enabled = ${e.get(`${prefijo}.afs.enabled`) ?? '—'}`);
  let n = 0;
  for (let i = 0; i < 12; i++) {
    const f = e.get(`${prefijo}.afs.eq.${i}`) ?? '';
    if (f === '' || f.startsWith(FILTRO_VACIO)) continue;
    const [hz, q, ganancia] = f.split(',');
    console.log(`   ${prefijo}.afs.eq.${i}  ${Number(hz).toFixed(1).padStart(9)} Hz  `
      + `${Number(ganancia).toFixed(1).padStart(6)} dB  Q=${Number(q).toFixed(1)}`);
    n++;
  }
  console.log(`   filtros plantados en ${prefijo}: ${n}`);
  return n;
};
const filtrosBus = mostrarFiltros(`a.${aux}`);
const filtrosGeneral = mostrarFiltros('m');
console.log(`   TOTAL: ${filtrosBus} en el bus + ${filtrosGeneral} en el general.`);
console.log('   Los tonos de medicion salen por el GENERAL, asi que es ahi donde el');
console.log('   supresor aprende. Si este numero crece entre dos corridas, la medicion');
console.log('   le planto filtros al usuario y hay que borrarlos con m.afs.clearlive.');

console.log('');
console.log('=== 4. ENLACE ESTEREO Y SILENCIOS ===');
for (const k of [`a.${aux}.stereoIndex`, `a.${aux + 1}.stereoIndex`, `a.${aux}.mute`, `a.${aux}.mix`,
                 `i.${n}.aux.${aux}.mute`, `i.${n}.aux.${aux}.post`, `i.${n}.aux.${aux}.postproc`,
                 'settings.auxsendpoint']) {
  console.log('  ', k.padEnd(22), e.get(k) ?? '—');
}

console.log('');
console.log('=== 5. DINAMICA Y PUERTA: DEL CANAL Y DEL BUS ===');
// **Faltaba la del bus, y la ley del auxiliar se mide SOBRE ese bus.** Este
// control miraba solo el dinamico del canal; si el del bus estuviera actuando,
// comprimiria el barrido entero y la curva saldria aplastada sin que nada lo
// dijera. Lo encontro una auditoria de instrumentos.
for (const k of [`i.${n}.dyn.ratio`, `i.${n}.dyn.threshold`, `i.${n}.dyn.bypass`,
                 `i.${n}.gate.enabled`, `i.${n}.gate.thresh`, `i.${n}.gate.depth`,
                 `a.${aux}.dyn.ratio`, `a.${aux}.dyn.threshold`, `a.${aux}.dyn.bypass`]) {
  console.log('  ', k.padEnd(22), e.get(k) ?? '—');
}
console.log('   ratio 1 = 1:1, o sea el compresor esta puesto y no comprime.');
console.log('   Ese SENTIDO esta medido (con a=1 la reduccion informada es 0,00 y');
console.log('   entrada = pre). La FORMULA VtoRATIO = 1/a quedo REFUTADA por la');
console.log('   medicion 97 del 2026-09-12: ver el backlog.');
console.log('   depth 0 = atenuacion MAXIMA de la puerta (VtoGATE_DEPTH = 60a - 60), escala invertida.');
