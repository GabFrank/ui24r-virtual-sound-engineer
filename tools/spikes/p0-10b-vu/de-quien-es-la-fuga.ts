/**
 * ¿De quién es la fuga de 1 kHz que la 104 encontró con el envío cerrado?
 *
 * **Contrato:** `docs/compromisos/105-de-quien-es-la-fuga.md`.
 *
 * **Por qué existe.** La 104 midió, con `i.9.aux.4.value` en 0, un tono de 1 kHz
 * a −91,77 dBFS en la entrada 2 de la interfaz —25 dB por encima del piso del bin
 * de ese banco, o sea señal y no ruido—. Ese aditivo explica todo el residuo que
 * la 94 declaró indecidible. Pero no dice de dónde sale, y la respuesta cambia
 * qué se puede medir: si la fuga es del banco, ninguna medición de esta serie
 * puede bajar de unos 70 dB sin corregirla.
 *
 * **Esto no barre nada.** El envío queda en 0 toda la corrida. Se prende y se
 * apaga lo que alimenta cada camino, y se mira el mismo bin en cuatro estados.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-10b-vu/de-quien-es-la-fuga.ts 10 5 192.168.0.78
 */
import { spawn } from 'node:child_process';
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Ui24rTransport, codificarSetd } from '@vse/mixer-adapter';
import { estadoPorHttpExigido, exigirClave } from '../canal-muerto.ts';
import { argIndice, argTexto } from '../argumentos.ts';
import { conRestauracion } from '../con-restauracion.ts';
import { restaurarClaves } from '../restaurar.ts';
// @ts-expect-error -- JavaScript sin tipos
import { analizar } from '../../audio/analizar.mjs';

const canal = argIndice(2, 'canal', 10, { desde: 1, hasta: 24 });
const n = canal - 1;
const auxiliar = argIndice(3, 'auxiliar', 5, { desde: 1, hasta: 10 });
const a = auxiliar - 1;
const maquina = argTexto(4, '192.168.0.78');

const HZ = 1000;
const FM = 48000;
const NIVEL_DBFS = -15;
const SEGUNDOS_DE_CAPTURA = 4;

/** Lo que la 104 midió con el envío cerrado. L1 exige reproducirlo. */
const LA_104_MIDIO_DBFS = -91.77;
const L1_TOLERANCIA_DB = 1.5;
/** L2: con el tono apagado el bin tiene que caer por debajo de esto. */
const L2_PISO_DBFS = -110;
/** L3: la tabla de veredictos, en dB de caída respecto de E0. */
const CAE_DB = 10;
const QUEDA_DB = 3;

const RAIZ = join(import.meta.dirname, '..', '..', '..');
const GRABADOR = join(RAIZ, 'tools', 'audio', 'bin', 'grabar');
/** Índices del analizador: 0 = entrada 1 (general), 1 = entrada 2 (auxiliar). */
const ENTRADA_GENERAL = 0;
const ENTRADA_AUXILIAR = 1;
const carpeta = mkdtempSync(join(tmpdir(), 'vse-105-'));

function tono(segundos: number): string {
  const muestras = FM * segundos;
  const amplitud = Math.pow(10, NIVEL_DBFS / 20) * 32767;
  const datos = Buffer.alloc(muestras * 4);
  for (let i = 0; i < muestras; i++) {
    const v = Math.round(amplitud * Math.sin((2 * Math.PI * HZ * i) / FM));
    datos.writeInt16LE(v, i * 4); datos.writeInt16LE(v, i * 4 + 2);
  }
  const c = Buffer.alloc(44);
  c.write('RIFF', 0); c.writeUInt32LE(36 + datos.length, 4); c.write('WAVEfmt ', 8);
  c.writeUInt32LE(16, 16); c.writeUInt16LE(1, 20); c.writeUInt16LE(2, 22);
  c.writeUInt32LE(FM, 24); c.writeUInt32LE(FM * 4, 28); c.writeUInt16LE(4, 32);
  c.writeUInt16LE(16, 34); c.write('data', 36); c.writeUInt32LE(datos.length, 40);
  const ruta = join(carpeta, 'tono.wav');
  writeFileSync(ruta, Buffer.concat([c, datos]));
  return ruta;
}

type Lectura = { auxDb: number; generalDb: number; margenAuxDb: number };

async function medir(etiqueta: string): Promise<Lectura> {
  const wav = join(carpeta, `${etiqueta}.wav`);
  const hijo = spawn(GRABADOR, [String(SEGUNDOS_DE_CAPTURA), wav, 'Scarlett'], { stdio: 'ignore' });
  await new Promise<void>((r) => { hijo.on('close', () => r()); });
  const an = analizar(wav, HZ) as {
    canales: { tonoDb: number; margenEnBinDb: number }[];
  };
  rmSync(wav, { force: true });
  return {
    auxDb: an.canales[ENTRADA_AUXILIAR]!.tonoDb,
    generalDb: an.canales[ENTRADA_GENERAL]!.tonoDb,
    margenAuxDb: an.canales[ENTRADA_AUXILIAR]!.margenEnBinDb,
  };
}

const t = new Ui24rTransport();
await t.conectar(maquina);
const e0 = await estadoPorHttpExigido(maquina);

const PREVIO: readonly (readonly [string, number])[] = [
  ['m.mute', Number(exigirClave(e0, 'm.mute'))],
  [`i.${n}.mute`, Number(exigirClave(e0, `i.${n}.mute`))],
  // Va acá y no en un `finally` por la regla del 2026-09-13: si queda encendido
  // con el tono sonando, el supresor le planta una notch de −18 dB al general y
  // sacarla exige `clearall`, que se lleva los filtros del usuario.
  ['m.afs.enabled', Number(exigirClave(e0, 'm.afs.enabled'))],
];

console.log('=== 105 — DE QUIEN ES LA FUGA DE 1 kHz ===');
console.log(`canal ${canal} (i.${n}) -> auxiliar ${auxiliar} (a.${a}) -> entrada 2`);
console.log(`tono de ${HZ} Hz a ${NIVEL_DBFS} dBFS | ${SEGUNDOS_DE_CAPTURA} s por captura`);
console.log('');
console.log('=== ESTADO, LEIDO DEL APARATO ===');
console.log(`   ${e0.size} claves por HTTP`);
for (const k of [
  `i.${n}.aux.${a}.value`, `i.${n}.mute`, `i.${n}.mix`, 'm.mute', 'm.mix',
  'm.afs.enabled', 'm.afs.fmode', `a.${a}.mix`, `a.${a}.mute`, `hwoutaux.${a}.src`,
]) {
  console.log(`   ${k.padEnd(24)} ${e0.get(k) ?? '(ausente)'}`);
}

// **El envio tiene que estar cerrado, y se exige en vez de escribirlo.**
// Si valiera otra cosa, lo que se mide es el envio y no la fuga; y escribirlo
// a 0 «por las dudas» perderia el valor del usuario si esta guarda esta mal.
{
  const envio = Number(exigirClave(e0, `i.${n}.aux.${a}.value`));
  if (envio !== 0) {
    throw new Error(`i.${n}.aux.${a}.value = ${envio}, y esta medicion exige 0: `
      + 'con el envio abierto lo que se mide es el envio, no la fuga.');
  }
  console.log(`   envio CERRADO (i.${n}.aux.${a}.value = 0), exigido`);
}

let sonando: ReturnType<typeof spawn> | null = null;
const L: Record<string, Lectura> = {};

await conRestauracion(
  async () => {
    sonando?.kill();
    await restaurarClaves(t, maquina, PREVIO);
    rmSync(carpeta, { recursive: true, force: true });
  },
  async () => {
    t.enviar(codificarSetd('m.afs.enabled', 0));
    await new Promise((r) => setTimeout(r, 1500));
    console.log(`   supresor del general: estaba en ${PREVIO[2]![1]}, apagado mientras suene`);

    sonando = spawn('afplay', [tono(180)]);
    await new Promise((r) => setTimeout(r, 3000));

    console.log('');
    console.log('=== LOS CUATRO ESTADOS ===');
    console.log('estado                         aux (bin 1k)   general (bin 1k)   margen aux');

    const mostrar = (nombre: string, x: Lectura): void => {
      console.log(`${nombre.padEnd(30)} ${x.auxDb.toFixed(2).padStart(9)} dBFS  `
        + `${x.generalDb.toFixed(2).padStart(9)} dBFS   ${x.margenAuxDb.toFixed(0).padStart(5)} dB`);
    };

    L.E0 = await medir('E0');
    mostrar('E0  como esta', L.E0);

    t.enviar(codificarSetd('m.mute', 1));
    await new Promise((r) => setTimeout(r, 2000));
    L.E1 = await medir('E1');
    mostrar('E1  general muteado', L.E1);

    t.enviar(codificarSetd('m.mute', PREVIO[0]![1]));
    t.enviar(codificarSetd(`i.${n}.mute`, 1));
    await new Promise((r) => setTimeout(r, 2000));
    L.E2 = await medir('E2');
    mostrar('E2  canal muteado', L.E2);

    sonando.kill();
    sonando = null;
    await new Promise((r) => setTimeout(r, 2000));
    L.E3 = await medir('E3');
    mostrar('E3  tono apagado', L.E3);
  },
);

await new Promise((r) => setTimeout(r, 1000));

console.log('');
console.log('=== VEREDICTOS, contra el contrato del item 105 ===');
let falla = false;

const d = (x: number): string => (Number.isFinite(x) ? x.toFixed(2) : String(x));

// L1
{
  const dif = Math.abs(L.E0!.auxDb - LA_104_MIDIO_DBFS);
  const pasa = dif <= L1_TOLERANCIA_DB;
  console.log(`\nL1 E0 reproduce la 104: ${d(L.E0!.auxDb)} dBFS contra `
    + `${LA_104_MIDIO_DBFS} (difiere ${d(dif)} dB, tope ${L1_TOLERANCIA_DB})`);
  console.log(pasa ? '   PASA.' : '   FALLA. El banco cambio entre las dos corridas, asi que '
    + 'NINGUNA de las otras tres lecturas significa nada. Todo lo de abajo es informativo.');
  if (!pasa) falla = true;
}

// L2
{
  const pasa = L.E3!.auxDb < L2_PISO_DBFS;
  console.log(`\nL2 E3 baja al piso: ${d(L.E3!.auxDb)} dBFS (tope ${L2_PISO_DBFS})`);
  console.log(pasa ? '   PASA. Con el tono apagado no queda 1 kHz.'
    : '   FALLA. Hay una fuente de 1 kHz que NO es el tono de este guion, '
      + 'asi que la pregunta esta mal planteada y el veredicto de L3 no vale.');
  if (!pasa) falla = true;
}

// L4 — el testigo del mute, que decide si E2 prueba algo
{
  const caidaGeneral = L.E0!.generalDb - L.E2!.generalDb;
  const pasa = caidaGeneral > CAE_DB;
  console.log(`\nL4 el mute del canal se nota en el general: ${d(L.E0!.generalDb)} -> `
    + `${d(L.E2!.generalDb)} dBFS (cayo ${d(caidaGeneral)} dB)`);
  console.log(pasa ? '   PASA. El mute hace lo que se cree, asi que E2 prueba algo.'
    : `   FALLA. Mutear el canal no apago el general, asi que \`i.${n}.mute\` no hace `
      + 'lo que este guion supone y E2 NO separa nada.');
  if (!pasa) falla = true;
}

// L3 — el veredicto
{
  const caida = (x: Lectura): number => L.E0!.auxDb - x.auxDb;
  const clasificar = (c: number): 'cae' | 'queda' | 'no se decide' =>
    (c > CAE_DB ? 'cae' : c < QUEDA_DB ? 'queda' : 'no se decide');
  const c1 = caida(L.E1!); const c2 = caida(L.E2!);
  const v1 = clasificar(c1); const v2 = clasificar(c2);
  console.log(`\nL3 el veredicto: E1 ${v1} (${d(c1)} dB), E2 ${v2} (${d(c2)} dB)`);
  console.log(`   umbrales declarados antes de mirar: cae > ${CAE_DB} dB, queda < ${QUEDA_DB} dB`);
  if (v1 === 'cae') {
    console.log('   => LA FUGA ES DEL BANCO: entraba por la ENTRADA 1 de la interfaz,');
    console.log('      diafonia del bucle del general hacia la entrada 2.');
    console.log('      Toda medicion de esta serie que baje de ~70 dB la arrastra.');
  } else if (v1 === 'queda' && v2 === 'cae') {
    console.log('   => LA FUGA ES DE LA CONSOLA: la tira le llega al bus auxiliar sin');
    console.log('      pasar por el envio. Es una propiedad del aparato, no del banco.');
  } else if (v1 === 'queda' && v2 === 'queda') {
    console.log('   => LA FUGA ES ANTERIOR AL MUTE DEL CANAL. Dos candidatos y esta');
    console.log('      corrida NO los separa: la salida de la interfaz cruzandose a su');
    console.log('      propia entrada 2, o la etapa de entrada de la consola.');
    console.log('      Separarlos pide desenchufar el cable de la entrada 1, que');
    console.log('      necesita una mano y no se hace de noche.');
  } else {
    console.log('   => NO SE DECIDE. Alguna caida quedo en la banda muerta que el');
    console.log('      contrato declaro antes de mirar. No se elige el que convenga.');
  }
}

console.log('');
console.log('=== LO QUE ESTA CORRIDA NO DICE ===');
console.log('   Nada sobre otras frecuencias: un tono, 1 kHz.');
console.log('   Nada sobre si la fuga es coherente o incoherente: el bin da');
console.log('   amplitud y no fase, y sin fase no se sabe como se suma.');
console.log('   Nada sobre el auxiliar 3 ni sobre el bloque de efectos.');

console.log('');
console.log('=== RESTAURACION, RELEIDA POR HTTP ===');
{
  const fin = await estadoPorHttpExigido(maquina);
  let bien = true;
  for (const [k, v] of PREVIO) {
    const leido = Number(exigirClave(fin, k));
    const ok = Math.abs(leido - v) < 1e-9;
    if (!ok) bien = false;
    console.log(`   ${k.padEnd(22)} esperado ${String(v).padEnd(14)} leido ${leido}`
      + (ok ? '' : '   <-- NO COINCIDE'));
  }
  console.log(bien ? '   Todo restaurado, comprobado por un camino distinto del que escribio.'
    : '   HAY CLAVES SIN RESTAURAR. Revisar la consola antes de seguir.');
  if (!bien) falla = true;
}
await t.desconectar();
if (falla) process.exitCode = 1;
