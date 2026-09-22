/**
 * Medidor en vivo del banco, para cablear con los ojos en el número.
 *
 * **Para qué es.** El 2026-09-15 el banco quedó sin poder medir: el tono entra a
 * la consola pero vuelve 70 dB por debajo de lo que el contrato del ítem 108
 * espera. El usuario va a desconectar todo y a reconectar cable por cable, y
 * necesita saber **en el momento** si lo que acaba de enchufar funciona. Sin
 * esto el ciclo es enchufar, correr una medición de seis minutos, mirar, y
 * volver a empezar.
 *
 * Pone un tono sostenido y, una vez por segundo y medio, dice tres cosas:
 *
 * - **qué canal de la consola está recibiendo señal**, leído del medidor de la
 *   propia consola, que es el instrumento más directo que hay para «¿entra?»;
 * - **qué llega a la entrada 1 de la interfaz**, que es el retorno del general;
 * - **qué llega a la entrada 2**, que es el retorno del auxiliar.
 *
 * ## El detalle que lo hace funcionar
 *
 * **Se guarda el ÚLTIMO valor conocido de cada canal, no se cuentan cuadros.**
 * La consola emite `VU2` cuando el nivel **cambia**, no a cadencia fija —medido
 * el 2026-09-15, ver
 * `docs/backlog/hallazgo-el-medidor-se-emite-por-cambio.md`—. Con un tono
 * sostenido el nivel queda quieto y llegan poquísimos cuadros, **y eso no es un
 * problema**: el último valor recibido sigue siendo el valor actual. Un medidor
 * que promediara los cuadros de una ventana se quedaría sin datos justo cuando
 * la señal es más estable, que es exactamente el error que dejó al 108 sin
 * correr dos veces.
 *
 * ## Qué escribe
 *
 * **Siempre `m.afs.enabled`.** Se apaga el supresor —comprobándolo por HTTP
 * antes de que suene nada— porque esto deja un tono sostenido varios minutos,
 * que es justo lo que le planta filtros permanentes. Vuelve por
 * `restaurarClaves()` dentro de `conRestauracion`, que cubre también el Ctrl-C:
 * este guion está hecho para cortarlo a mano cuando el cableado esté listo.
 *
 * **Y dos claves más SÓLO si se pide probar un auxiliar**: el envío del canal
 * del banco a ese auxiliar y el nivel del auxiliar. Sin abrirlos no se puede
 * distinguir un cable cortado de un envío cerrado. Se leen antes, se comprueban
 * por HTTP después de escribirlos, y vuelven por el mismo camino garantizado.
 *
 * **No toca faders de canal, ni ecualizador, ni mute, ni ruteo.**
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-10b-vu/banco-en-vivo.ts 192.168.0.78
 *   node --experimental-strip-types tools/spikes/p0-10b-vu/banco-en-vivo.ts 192.168.0.78 5   (y prueba el Aux 5)
 *
 * Se corta con Ctrl-C. La restauración corre igual.
 */
import { spawn } from 'node:child_process';
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  Ui24rTransport, codificarSetd, decodificarVuCanales, dbDeMedidor,
} from '@vse/mixer-adapter';
import { estadoPorHttpExigido, exigirClave } from '../canal-muerto.ts';
import { argIndice, argTexto } from '../argumentos.ts';
import { conRestauracion } from '../con-restauracion.ts';
import { anotarPendiente, cerrarPendiente, avisarSiHayPendiente } from '../pendiente.ts';
import { restaurarClaves } from '../restaurar.ts';
import { leerUnaClave } from '../leer-una-clave.ts';
// @ts-expect-error -- JavaScript sin tipos
import { analizar } from '../../audio/analizar.mjs';

const maquina = argTexto(2, '192.168.0.78');
/**
 * Auxiliar cuyo envio se abre para poder PROBAR su cable, o 0 para no tocar nada.
 *
 * **Por que hace falta abrirlo.** Un cable de retorno de auxiliar no se puede
 * verificar mirando: si no llega senal, puede ser que el cable este cortado o
 * que el envio este cerrado, y las dos cosas se ven igual. El 2026-09-16 se
 * declaro «bien» el cable del Aux 5 habiendo comprobado solamente que el envio
 * estaba en cero --lo noto el usuario--. Para decir que un cable pasa senal hay
 * que mandarle senal.
 */
const auxAProbar = argIndice(3, 'auxiliar a probar', 0, { desde: 0, hasta: 10 });
/** Cuanto se abre el envio y el nivel del auxiliar mientras dura la prueba. */
const NIVEL_DE_PRUEBA = 0.75;
/** El canal del banco, que es de donde sale el envio. */
const CANAL_DEL_BANCO = 10;

const FM = 48000;
const HZ = 1000;
const NIVEL_DBFS = -18;
/** Cuánto dura el tono. Se corta con Ctrl-C mucho antes, normalmente. */
const MINUTOS = 20;
/** Cada cuánto se refresca la pantalla. */
const REFRESCO_MS = 1500;
/** Cuánto se graba por refresco. Corto, para que la pantalla siga al cable. */
const CAPTURA_S = 0.7;
const GRABADOR = 'tools/audio/bin/grabar';
/** Por encima de esto se considera que hay señal de verdad y no ruido. */
const UMBRAL_SENAL_DB = -60;

const carpeta = mkdtempSync(join(tmpdir(), 'banco-en-vivo-'));

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

const t = new Ui24rTransport();

/**
 * El último nivel conocido de cada canal.
 *
 * Ver el docblock de arriba: con un flujo que se emite por cambio, «el último
 * que llegó» **es** el valor actual. No se promedia ni se cuenta.
 */
const ultimoNivel = new Map<number, number>();
t.alRecibir((linea) => {
  if (!linea.startsWith('VU2^')) return;
  decodificarVuCanales(linea.slice(4)).forEach((c: { salida: number }, i: number) => {
    ultimoNivel.set(i, dbDeMedidor(c.salida));
  });
});

avisarSiHayPendiente();
await t.conectar(maquina);
const e0 = await estadoPorHttpExigido(maquina);
const n = CANAL_DEL_BANCO - 1;
const m = auxAProbar - 1;
/** Las dos perillas que cierran el camino del auxiliar, leidas antes de tocarlas. */
const CLAVES_DEL_AUX = auxAProbar === 0 ? [] : [
  `i.${n}.aux.${m}.value`,
  `a.${m}.mix`,
];
const PREVIO: readonly (readonly [string, number])[] = [
  ['m.afs.enabled', Number(exigirClave(e0, 'm.afs.enabled'))],
  ...CLAVES_DEL_AUX.map((k) => [k, Number(exigirClave(e0, k))] as const),
];

let sonando: ReturnType<typeof spawn> | null = null;

// **El papelito, ANTES de la primera escritura.** Si a este proceso lo matan de
// golpe --SIGKILL, corte de energia--, `conRestauracion` no llega a correr y lo
// unico que sabe que hay que restaurar muere con el. El papelito sobrevive.
anotarPendiente('banco-en-vivo.ts', maquina, PREVIO);

await conRestauracion(
  async () => {
    sonando?.kill();
    await new Promise((r) => { setTimeout(r, 1000); });
    await restaurarClaves(t, maquina, PREVIO);
    rmSync(carpeta, { recursive: true, force: true });
    // **Se relee por HTTP antes de cantar victoria.** Este guion esta hecho para
    // cortarlo a mano, que es justo cuando la restauracion puede quedar a medias:
    // decir «restaurado» sin comprobarlo seria el exito falso que este proyecto
    // persigue. Y de eso depende que se borre el papelito.
    const fin = await estadoPorHttpExigido(maquina);
    let todoVolvio = true;
    console.log('');
    console.log('=== RESTAURACION, RELEIDA POR HTTP ===');
    for (const [k, v2] of PREVIO) {
      const leido = Number(exigirClave(fin, k));
      const ok = Math.abs(leido - v2) < 1e-9;
      if (!ok) todoVolvio = false;
      console.log(`   ${ok ? 'OK  ' : 'MAL '} ${k.padEnd(22)} esperado ${v2}  leido ${leido}`);
    }
    if (todoVolvio) {
      cerrarPendiente();
      console.log('   Todo volvio. Banco libre.');
    } else {
      process.exitCode = 1;
      console.error('   HAY CLAVES SIN RESTAURAR. El papelito se deja: '
        + 'node --experimental-strip-types tools/spikes/reparar-pendiente.ts');
    }
  },
  async () => {
    t.enviar(codificarSetd('m.afs.enabled', 0));
    await new Promise((r) => { setTimeout(r, 1500); });
    const afs = await leerUnaClave(maquina, 'm.afs.enabled');
    if (afs !== 0) {
      throw new Error(`m.afs.enabled quedo en ${afs}: no se deja un tono sostenido con el `
        + `supresor encendido.`);
    }
    console.log(`supresor apagado y comprobado. Tono de ${HZ} Hz a ${NIVEL_DBFS} dBFS, `
      + `hasta ${MINUTOS} min.`);
    if (auxAProbar !== 0) {
      for (const k of CLAVES_DEL_AUX) {
        t.enviar(codificarSetd(k, NIVEL_DE_PRUEBA));
        await new Promise((r) => { setTimeout(r, 200); });
      }
      await new Promise((r) => { setTimeout(r, 1200); });
      // **Que el envio se haya abierto se comprueba, no se supone.** Si no se
      // abrio, la entrada 2 sigue callada y se leeria como «cable cortado»,
      // que es la conclusion falsa que esta prueba vino a evitar.
      for (const k of CLAVES_DEL_AUX) {
        const leido = await leerUnaClave(maquina, k);
        if (Math.abs(leido - NIVEL_DE_PRUEBA) > 1e-6) {
          throw new Error(`${k} quedo en ${leido} y se pidio ${NIVEL_DE_PRUEBA}: sin el envio `
            + `abierto, un cable sano y uno cortado se ven igual.`);
        }
      }
      console.log(`envio del canal ${CANAL_DEL_BANCO} al auxiliar ${auxAProbar} abierto en `
        + `${NIVEL_DE_PRUEBA}, y el nivel del auxiliar tambien. Comprobado por HTTP.`);
      console.log(`   volveran a ${CLAVES_DEL_AUX.map((k) =>
        `${k}=${PREVIO.find(([c]) => c === k)?.[1]}`).join(', ')}`);
    }
    console.log('Cortar con Ctrl-C cuando el cableado este listo: la restauracion corre igual.');
    console.log('');
    console.log('  hora   | canal de la consola con senal | entrada 1 (general) | entrada 2 (aux)');
    console.log('  -------|-------------------------------|---------------------|----------------');

    sonando = spawn('afplay', [tono(MINUTOS * 60)]);
    sonando.on('error', (e) => { throw e instanceof Error ? e : new Error(String(e)); });
    await new Promise((r) => { setTimeout(r, 1500); });

    const hasta = Date.now() + MINUTOS * 60 * 1000;
    const wav = join(carpeta, 'v.wav');
    while (Date.now() < hasta) {
      if (sonando.exitCode !== null) {
        throw new Error(`el tono dejo de sonar: afplay salio con ${sonando.exitCode}.`);
      }
      const hijo = spawn(GRABADOR, [String(CAPTURA_S), wav, 'Scarlett'],
        { stdio: ['ignore', 'ignore', 'pipe'] });
      let err = '';
      hijo.stderr?.on('data', (b: Buffer) => { err += b.toString(); });
      const codigo = await new Promise<number | null>((res, rej) => {
        hijo.on('error', rej); hijo.on('close', (c) => res(c));
      });
      if (codigo !== 0) {
        throw new Error(`el grabador salio con ${codigo}: ${err.trim() || '(nada)'}`);
      }
      const an = analizar(wav, HZ) as { canales: { tonoDb: number }[] };

      // El canal de la consola que más señal tiene, si alguno pasa el umbral.
      let mejor = -1;
      let mejorDb = -Infinity;
      for (const [i, db] of ultimoNivel) {
        if (db > mejorDb) { mejorDb = db; mejor = i; }
      }
      const enConsola = mejorDb > UMBRAL_SENAL_DB
        ? `canal ${String(mejor + 1).padStart(2)}  ${mejorDb.toFixed(1).padStart(6)} dB`
        : '   -- nada --            ';

      const di = (x: number | undefined): string => (x === undefined || !Number.isFinite(x)
        ? '    sin senal   '
        : `${x.toFixed(1).padStart(8)} dBFS${x > UMBRAL_SENAL_DB ? ' *' : '  '}`);

      const hora = new Date().toTimeString().slice(0, 8);
      console.log(`  ${hora} | ${enConsola} | ${di(an.canales[0]?.tonoDb)} | `
        + `${di(an.canales[1]?.tonoDb)}`);

      await new Promise((r) => { setTimeout(r, REFRESCO_MS); });
    }
  },
);

await t.desconectar();
