/**
 * ¿El crudo 0 de `i.N.dyn.ratio` es un limitador?
 *
 * Contrato: `docs/compromisos/110-el-crudo-cero-de-la-relacion.md`, escrito antes
 * de tocar la consola, con el trabajo previo —que la mitad estaba en casa: la
 * medición 97 refutó `1/a` y la 98 midió el techo de reducción sin llegar nunca
 * al crudo 0—.
 *
 * ## El defecto del contrato, encontrado al escribir esto
 *
 * El contrato proponía subir la fuente **10 dB** y mirar cuánto sube la salida,
 * con `ratio = 0,5` de control esperando 5 dB. **Eso se rompe con lo que la 98 ya
 * midió**: la reducción tiene techo, y a `a = 0,5` ese techo son 6,02 dB. Con la
 * señal bien por encima del umbral, un escalón de 10 dB deja al compresor
 * saturado en la parte alta, y entonces la salida sube **los 10 enteros** — que
 * es exactamente lo que predice una relación 1:1. El control habría fallado por
 * el techo y no por el método, y lo habría hecho en la dirección que induce a
 * desconfiar de una medición buena.
 *
 * **Se mide con dos escalones en vez de uno**, así la saturación se ve en lugar
 * de esconderse: si el escalón chico da la relación esperada y el grande da
 * bastante más, el compresor tocó su techo en el medio, y eso **se informa** en
 * vez de contaminar el veredicto.
 *
 * Y el umbral no se calcula —su ley está refutada— sino que **se calibra
 * midiendo**: se prueba hasta que la reducción contra el compresor puenteado caiga
 * en una ventana usable.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-10b-vu/crudo-cero-de-la-relacion.ts 192.168.0.78
 */
import { spawn } from 'node:child_process';
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Ui24rTransport, codificarSetd } from '@vse/mixer-adapter';
import { estadoPorHttpExigido, exigirClave } from '../canal-muerto.ts';
import { argTexto } from '../argumentos.ts';
import { conRestauracion } from '../con-restauracion.ts';
import { restaurarClaves } from '../restaurar.ts';
import { leerUnaClave } from '../leer-una-clave.ts';
import { anotarPendiente, cerrarPendiente, avisarSiHayPendiente } from '../pendiente.ts';
// @ts-expect-error -- JavaScript sin tipos
import { analizar } from '../../audio/analizar.mjs';

const maquina = argTexto(2, '192.168.0.78');
const CANAL = 10;
const n = CANAL - 1;
/** La entrada de la Scarlett por donde vuelve el general. Base cero. */
const ENTRADA = 0;

const FM = 48000;
const HZ = 1000;
const SEGUNDOS_DE_CAPTURA = 3;
const GRABADOR = 'tools/audio/bin/grabar';

/** Los niveles de fuente, en dBFS. El paso chico y el grande. */
const NIVELES = [-28, -24, -18] as const;
/** Las relaciones que se prueban, **en este orden**: el control va primero. */
const RELACIONES = [
  // **El control pasa de 0,5 a 0,25, y el motivo lo dio la corrida anterior.**
  // Con 0,5 --nominal 2:1-- la 98 midio que el techo de reduccion son 6,02 dB, asi
  // que no se puede llevar el punto de trabajo hondo sin saturarlo; y en el punto
  // poco profundo que si admitia, la relacion medida dio 1,6:1 en vez de 2:1,
  // porque cerca del umbral la relacion efectiva no es la nominal. Con 0,25
  // --nominal 4:1-- el techo son 12,04 dB y hay lugar para meterse en la zona
  // desarrollada.
  { crudo: 0.25, nominal: '4:1', esControl: true },
  { crudo: 0.02, nominal: '50:1 (el tope del manual)', esControl: false },
  { crudo: 0, nominal: 'infinito segun el cliente', esControl: false },
] as const;
/**
 * Umbrales a probar, **de arriba hacia abajo y empezando donde la primera corrida
 * vio que el compresor empieza a actuar**.
 *
 * Esa corrida barrio 0,30 … 0,60 y la reduccion no se movio entre 0,35 y 0,60
 * --el compresor ni se enteraba-- y recien en 0,30 aparecieron 2,2 dB. Asi que
 * el rango util esta en 0,30 y para abajo, y probar arriba es gastar capturas.
 */
const UMBRALES = [0.22, 0.19, 0.16, 0.25, 0.13, 0.10, 0.28] as const;
/** Reducción que se busca al calibrar: bastante para verse, lejos del techo. */
/**
 * Reduccion buscada al calibrar, **con el control en 4:1**.
 *
 * Se sube de [2,5] a [5,9] porque la corrida anterior mostro que con 2,2 dB de
 * reduccion la relacion medida sale corrida hacia abajo --1,6:1 donde el cliente
 * dice 2:1--: eso es la rodilla, no la ley. Y el techo de 4:1 son 12,04 dB segun
 * la 98, asi que 9 deja margen para no medir contra el techo.
 */
const REDUCCION_BUSCADA_DB: readonly [number, number] = [5, 9];
const MARGEN_MINIMO_DB = 45;

const carpeta = mkdtempSync(join(tmpdir(), 'ratio-cero-'));

function tono(segundos: number, dbfs: number): string {
  const muestras = FM * segundos;
  const amplitud = Math.pow(10, dbfs / 20) * 32767;
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
  const ruta = join(carpeta, `tono${dbfs}.wav`);
  writeFileSync(ruta, Buffer.concat([c, datos]));
  return ruta;
}

let sonando: ReturnType<typeof spawn> | null = null;

async function poneleTono(dbfs: number): Promise<void> {
  sonando?.kill();
  await new Promise((r) => { setTimeout(r, 400); });
  sonando = spawn('afplay', [tono(60, dbfs)]);
  let fallo: Error | null = null;
  sonando.on('error', (e) => { fallo = e instanceof Error ? e : new Error(String(e)); });
  // **Se espera bastante a propósito.** El compresor tiene ataque y relajación
  // que nadie midió --siguen abiertos desde la 97-- así que se le da tiempo de
  // asentarse antes de capturar. Medir durante el transitorio seria medir la
  // balistica creyendo que se mide la relacion.
  await new Promise((r) => { setTimeout(r, 3500); });
  if (fallo !== null) throw fallo;
  if (sonando.exitCode !== null) {
    throw new Error(`afplay salio con ${sonando.exitCode}: el tono de ${dbfs} dBFS no suena.`);
  }
}

async function medir(etiqueta: string): Promise<{ db: number; margen: number; recorta: boolean }> {
  if (sonando === null || sonando.exitCode !== null) {
    throw new Error(`el tono dejo de sonar antes de «${etiqueta}».`);
  }
  const wav = join(carpeta, `${etiqueta}.wav`);
  const hijo = spawn(GRABADOR, [String(SEGUNDOS_DE_CAPTURA), wav, 'Scarlett'],
    { stdio: ['ignore', 'ignore', 'pipe'] });
  let err = '';
  hijo.stderr?.on('data', (b: Buffer) => { err += b.toString(); });
  const codigo = await new Promise<number | null>((res, rej) => {
    hijo.on('error', rej); hijo.on('close', (c) => res(c));
  });
  if (codigo !== 0) throw new Error(`el grabador salio con ${codigo}: ${err.trim() || '(nada)'}`);
  const an = analizar(wav, HZ) as {
    canales: { tonoDb: number; margenEnBinDb: number; recorteExacto: boolean }[];
  };
  rmSync(wav, { force: true });
  const c = an.canales[ENTRADA]!;
  return { db: c.tonoDb, margen: c.margenEnBinDb, recorta: c.recorteExacto };
}

avisarSiHayPendiente();

const t = new Ui24rTransport();
await t.conectar(maquina);
const e0 = await estadoPorHttpExigido(maquina);

const PREVIO: readonly (readonly [string, number])[] = [
  ['m.afs.enabled', Number(exigirClave(e0, 'm.afs.enabled'))],
  ['m.dyn.bypass', Number(exigirClave(e0, 'm.dyn.bypass'))],
  [`i.${n}.dyn.ratio`, Number(exigirClave(e0, `i.${n}.dyn.ratio`))],
  [`i.${n}.dyn.threshold`, Number(exigirClave(e0, `i.${n}.dyn.threshold`))],
  [`i.${n}.dyn.bypass`, Number(exigirClave(e0, `i.${n}.dyn.bypass`))],
  // **La compensacion del compresor, que la primera corrida no neutralizo y le
  // costo la calibracion.** Con el preajuste que el canal traia, `dyn.outgain`
  // valia 0,7186 y `72a - 24` da +27,74 dB: exactamente la «reduccion negativa»
  // que se midio. O sea que lo que parecia compresion al reves era compensacion
  // pura, y el contrato no la habia listado.
  [`i.${n}.dyn.outgain`, Number(exigirClave(e0, `i.${n}.dyn.outgain`))],
  [`i.${n}.gate.enabled`, Number(exigirClave(e0, `i.${n}.gate.enabled`))],
  [`i.${n}.deesser.enabled`, Number(exigirClave(e0, `i.${n}.deesser.enabled`))],
];
const softknee = exigirClave(e0, `i.${n}.dyn.softknee`);

console.log('=== 110 — ¿EL CRUDO 0 DE LA RELACION ES UN LIMITADOR? ===');
console.log(`   canal ${CANAL} -> general -> entrada ${ENTRADA + 1} de la interfaz`);
console.log(`   softknee esta en ${softknee}, se LEE y NO se toca: con rodilla blanda la`);
console.log('   relacion efectiva cerca del umbral no es la nominal.');
console.log('');

anotarPendiente('crudo-cero-de-la-relacion.ts', maquina, PREVIO);

/** `[relacion][nivel]` en dBFS, y la referencia con el compresor puenteado. */
const salida = new Map<number, number[]>();
const puenteado: number[] = [];
let umbralUsado = NaN;

await conRestauracion(
  async () => {
    sonando?.kill();
    await new Promise((r) => { setTimeout(r, 1500); });
    await restaurarClaves(t, maquina, PREVIO);
    rmSync(carpeta, { recursive: true, force: true });
  },
  async () => {
    t.enviar(codificarSetd('m.afs.enabled', 0));
    await new Promise((r) => { setTimeout(r, 1500); });
    const afs = await leerUnaClave(maquina, 'm.afs.enabled');
    if (afs !== 0) throw new Error(`m.afs.enabled quedo en ${afs}: no se mete tono sostenido `
      + `con el supresor encendido.`);
    console.log('   supresor apagado y COMPROBADO por HTTP');

    t.enviar(codificarSetd('m.dyn.bypass', 1));
    t.enviar(codificarSetd(`i.${n}.gate.enabled`, 0));
    t.enviar(codificarSetd(`i.${n}.deesser.enabled`, 0));
    // **La compensacion a su punto de 0 dB.** `72a - 24 = 0` en `a = 1/3`. La
    // formula es INFERIDA, asi que esto no garantiza cero exacto --pero si que
    // sea constante y chica, que es lo unico que el metodo necesita: lo que se
    // mide son DIFERENCIAS entre niveles de fuente.
    t.enviar(codificarSetd(`i.${n}.dyn.outgain`, 1 / 3));
    await new Promise((r) => { setTimeout(r, 1500); });

    // --- la referencia sin compresor, en los tres niveles ------------------
    console.log('');
    console.log('=== REFERENCIA: el compresor PUENTEADO ===');
    t.enviar(codificarSetd(`i.${n}.dyn.bypass`, 1));
    await new Promise((r) => { setTimeout(r, 1200); });
    for (const dbfs of NIVELES) {
      await poneleTono(dbfs);
      const l = await medir(`ref${dbfs}`);
      if (l.recorta) throw new Error(`la referencia de ${dbfs} dBFS recorta.`);
      puenteado.push(l.db);
      console.log(`   fuente ${String(dbfs).padStart(4)} dBFS -> ${l.db.toFixed(2)} dBFS`
        + `   (margen ${l.margen.toFixed(1)} dB)`);
      if (dbfs === NIVELES[NIVELES.length - 1] && !(l.margen >= MARGEN_MINIMO_DB)) {
        throw new Error(`C1 FALLA: el tono alto esta a ${l.margen.toFixed(1)} dB del piso y `
          + `hacen falta ${MARGEN_MINIMO_DB}.`);
      }
    }
    // Que la referencia siga a la fuente es lo que dice que el camino es lineal.
    const pasoRef = puenteado[2]! - puenteado[0]!;
    console.log(`   la referencia subio ${pasoRef.toFixed(2)} dB con 10 dB de fuente`);

    // --- calibración del umbral -------------------------------------------
    t.enviar(codificarSetd(`i.${n}.dyn.bypass`, 0));
    t.enviar(codificarSetd(`i.${n}.dyn.ratio`, 0.5));
    await new Promise((r) => { setTimeout(r, 1200); });
    console.log('');
    console.log('=== CALIBRACION DEL UMBRAL ===');
    console.log('   (su ley esta refutada desde la 97, asi que se calibra midiendo)');
    await poneleTono(NIVELES[1]);
    for (const u of UMBRALES) {
      t.enviar(codificarSetd(`i.${n}.dyn.threshold`, u));
      await new Promise((r) => { setTimeout(r, 1500); });
      const l = await medir(`cal${u}`);
      const reduccion = puenteado[1]! - l.db;
      console.log(`   umbral ${u.toFixed(2)} -> reduccion de ${reduccion.toFixed(2)} dB`);
      if (reduccion >= REDUCCION_BUSCADA_DB[0] && reduccion <= REDUCCION_BUSCADA_DB[1]) {
        umbralUsado = u; break;
      }
    }
    if (Number.isNaN(umbralUsado)) {
      throw new Error(`no se encontro un umbral que diera entre ${REDUCCION_BUSCADA_DB[0]} y `
        + `${REDUCCION_BUSCADA_DB[1]} dB de reduccion con relacion 0,5. Sin un punto de trabajo `
        + `en la zona activa, el escalon mide otra cosa.`);
    }
    console.log(`   -> se usa el umbral ${umbralUsado}`);

    // --- las tres relaciones, en los tres niveles -------------------------
    console.log('');
    console.log('=== LAS TRES RELACIONES ===');
    for (const r of RELACIONES) {
      t.enviar(codificarSetd(`i.${n}.dyn.ratio`, r.crudo));
      await new Promise((r2) => { setTimeout(r2, 1500); });
      const leido = await leerUnaClave(maquina, `i.${n}.dyn.ratio`);
      if (Math.abs(leido - r.crudo) > 1e-9) {
        throw new Error(`i.${n}.dyn.ratio quedo en ${leido} y se pidio ${r.crudo}: sin la `
          + `relacion puesta, lo que se mida es de otra.`);
      }
      const fila: number[] = [];
      for (const dbfs of NIVELES) {
        await poneleTono(dbfs);
        const l = await medir(`r${r.crudo}-${dbfs}`);
        if (l.recorta) throw new Error(`la captura de ${r.nominal} a ${dbfs} dBFS recorta.`);
        fila.push(l.db);
      }
      salida.set(r.crudo, fila);
      const red = puenteado[1]! - fila[1]!;
      console.log(`   crudo ${String(r.crudo).padEnd(5)} (${r.nominal})`);
      console.log(`      salidas: ${fila.map((x) => x.toFixed(2)).join('  ')} dBFS`
        + `   | reduccion en el medio: ${red.toFixed(2)} dB`);
    }
  },
);

const despues = await estadoPorHttpExigido(maquina);
console.log('');
console.log('=== RESTAURACION, RELEIDA POR HTTP ===');
let bien = true;
for (const [k, v] of PREVIO) {
  const leido = Number(exigirClave(despues, k));
  const ok = Math.abs(leido - v) < 1e-9;
  if (!ok) bien = false;
  console.log(`   ${ok ? 'OK  ' : 'MAL '} ${k.padEnd(22)} esperado ${v}  leido ${leido}`);
}
if (bien) cerrarPendiente(); else process.exitCode = 1;

console.log('');
console.log('=== VEREDICTOS ===');
/** Escalón chico: −28 → −24, 4 dB. Escalón grande: −28 → −18, 10 dB. */
const chico = (f: number[]): number => f[1]! - f[0]!;
const grande = (f: number[]): number => f[2]! - f[0]!;

const control = salida.get(0.25)!;
/**
 * **C2 mide la CADENA, no la relacion nominal, y la primera version estaba mal.**
 *
 * El contrato ponia de control positivo que una relacion nominal del cliente
 * diera su valor: 2:1 tenia que dar 2:1. **Eso es usar como control justamente lo
 * que este proyecto ya refuto**: la medicion 97 establecio que `1/a` no describe
 * este aparato. Un control que da por cierta una hipotesis refutada no valida el
 * instrumento — falla siempre, y su fallo no dice nada sobre el instrumento.
 *
 * El error es identificable **sin mirar los datos**, y se corrige por eso y no
 * porque el control haya fallado: cambiar un criterio despues de ver el resultado
 * que no gusta es acomodar la regla al resultado, y este repositorio tiene esa
 * regla escrita.
 *
 * Lo que un control positivo tiene que comprobar aca es que **la cadena de
 * medicion sigue a la fuente**: con el compresor PUENTEADO, subir la fuente 10 dB
 * tiene que subir la salida 10 dB. Si eso no pasa, no hay nada que interpretar
 * despues. Y no supone ninguna ley del compresor.
 */
const pasoDeLaReferencia = puenteado[2]! - puenteado[0]!;
const c2 = Math.abs(pasoDeLaReferencia - 10) <= 0.5;
console.log(`C2 la cadena sigue a la fuente: con el compresor PUENTEADO, 10 dB de fuente `
  + `movieron la salida ${pasoDeLaReferencia.toFixed(2)} dB`);
console.log(`   ${c2 ? 'PASA' : 'NO PASA: la cadena no es lineal y nada de abajo se puede leer'}`);
console.log(`   (la relacion NOMINAL del cliente no se usa de control: la 97 la refuto)`);

const c3 = (puenteado[1]! - control[1]!) >= 5;
console.log(`C3 el compresor esta actuando: reduce `
  + `${(puenteado[1]! - control[1]!).toFixed(2)} dB con 4:1 (minimo 5)`);
console.log(`   ${c3 ? 'PASA' : 'NO PASA: si no reduce, «no se movio» no dice nada'}`);

console.log('');
console.log('   relacion            | +4 dB de fuente | +10 dB de fuente | R implicita (chico)');
console.log('   --------------------|-----------------|------------------|--------------------');
for (const r of RELACIONES) {
  const f = salida.get(r.crudo)!;
  const ch = chico(f); const gr = grande(f);
  const R = ch <= 0.001 ? Infinity : 4 / ch;
  console.log(`   ${String(r.crudo).padEnd(5)} ${r.nominal.padEnd(14)}| `
    + `${ch.toFixed(3).padStart(13)} dB | ${gr.toFixed(3).padStart(14)} dB | `
    + `${Number.isFinite(R) ? `${R.toFixed(1)}:1` : 'infinita'}`);
  // **Solo tiene sentido cuando los dos escalones son positivos.** Con pendiente
  // negativa el cociente se da vuelta y el aviso salia igual, diciendo que el
  // compresor «toco su techo» justo en la fila donde no hay techo posible.
  if (ch > 0.02 && gr > ch * 3) {
    console.log(`         (el escalon grande sube mucho mas que el chico: el compresor toco`);
    console.log(`          su techo en el medio, asi que el grande NO mide la relacion)`);
  }
}

console.log('');
if (!c2 || !c3) {
  console.log('NO SE CONCLUYE NADA: fallo un control.');
  process.exitCode = 1;
} else {
  const cero = chico(salida.get(0)!);
  const cincuenta = chico(salida.get(0.02)!);
  console.log(`Con el escalon chico, el crudo 0 movio la salida ${cero.toFixed(3)} dB.`);
  console.log(`El 50:1 del manual predice 0,080 dB; una relacion infinita predice 0,000.`);
  if (cero < -0.02) {
    console.log('');
    console.log('EL CRUDO 0 SOBRE-LIMITA: al subir la fuente, la salida BAJA. Es mas que');
    console.log('una relacion infinita --pendiente negativa-- y descarta el 50:1 del manual,');
    console.log('que predice que la salida SUBE 0,080 dB con este escalon.');
    console.log(`   El crudo 0,02 --el 50:1 del manual-- dio ${cincuenta.toFixed(3)} dB.`);
  } else if (cero < 0.04) {
    console.log('');
    console.log('EL CRUDO 0 SE COMPORTA COMO UN LIMITADOR. Descarta el tope 50:1 del manual.');
    console.log(`   El crudo 0,02 --el 50:1-- dio ${cincuenta.toFixed(3)} dB, para comparar.`);
  } else {
    console.log('');
    console.log('EL CRUDO 0 NO ES UN LIMITADOR: la salida sigue a la fuente.');
  }
  console.log('');
  console.log('   Y queda dicho lo que NO se puede leer de esta tabla: las relaciones');
  console.log('   NOMINALES no reproducen --4:1 mide 1,5:1 y 50:1 mide 6:1--, que es');
  console.log('   exactamente lo que la 97 ya habia refutado. No es un hallazgo nuevo');
  console.log('   ni un defecto de esta corrida: es el estado conocido de esa ley.');
  console.log('');
  console.log('   LIMITE DE ESTA CORRIDA, declarado antes de medir: con esta precision no se');
  console.log('   distingue una relacion infinita de una muy alta. Lo que si se puede es');
  console.log('   descartar el 50:1, que predice un movimiento diez veces mayor.');
}
console.log('');
console.log('Un umbral, una frecuencia, un canal, un dia. Nada de la ley de la relacion,');
console.log('que sigue refutada desde la 97, ni de los tiempos, que siguen sin medirse.');

await t.desconectar();
