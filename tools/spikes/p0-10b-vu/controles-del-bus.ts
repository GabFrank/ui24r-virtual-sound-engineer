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
console.log('=== 3. EL SUPRESOR DEL BUS ===');
console.log(`   a.${aux}.afs.enabled = ${e.get(`a.${aux}.afs.enabled`) ?? '—'}`);
let filtros = 0;
for (let i = 0; i < 12; i++) {
  const f = e.get(`a.${aux}.afs.eq.${i}`) ?? '';
  if (f !== '' && !f.startsWith(FILTRO_VACIO)) { console.log(`   a.${aux}.afs.eq.${i} = ${f}`); filtros++; }
}
console.log(`   filtros plantados: ${filtros}   (0 = no aprendio nada)`);

console.log('');
console.log('=== 4. ENLACE ESTEREO Y SILENCIOS ===');
for (const k of [`a.${aux}.stereoIndex`, `a.${aux + 1}.stereoIndex`, `a.${aux}.mute`, `a.${aux}.mix`,
                 `i.${n}.aux.${aux}.mute`, `i.${n}.aux.${aux}.post`, `i.${n}.aux.${aux}.postproc`,
                 'settings.auxsendpoint']) {
  console.log('  ', k.padEnd(22), e.get(k) ?? '—');
}

console.log('');
console.log('=== 5. DINAMICA Y PUERTA DEL CANAL ===');
for (const k of [`i.${n}.dyn.ratio`, `i.${n}.dyn.threshold`, `i.${n}.dyn.bypass`,
                 `i.${n}.gate.enabled`, `i.${n}.gate.thresh`, `i.${n}.gate.depth`]) {
  console.log('  ', k.padEnd(22), e.get(k) ?? '—');
}
console.log('   ratio 1 = 1:1, o sea el compresor esta puesto y no comprime (VtoRATIO = 1/a).');
console.log('   depth 0 = atenuacion MAXIMA de la puerta (VtoGATE_DEPTH = 60a - 60), escala invertida.');
