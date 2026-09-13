/**
 * La ley del fader de un bus auxiliar, contra la salida real.
 *
 * **Contrato:** `docs/compromisos/106-la-ley-del-fader-de-bus-contra-la-salida-real.md`.
 *
 * **Qué reemplaza.** El contrato 99a diseñó esta misma medición contra el medidor
 * de la consola y declaró su techo: «esto es autoconsistencia y no calibración».
 * Ese techo ya no está — el auxiliar 5 está cableado a la entrada 2 de la
 * interfaz—, así que la ley se mide contra un convertidor externo.
 *
 * **Y baja el fader del general durante toda la corrida**, que sale de un
 * hallazgo: el ítem 105 midió que la fuga de 1 kHz que ensucia el fondo de estas
 * mediciones viaja por el camino del general. Con `m.mix = 0` cayó al menos
 * 30,4 dB. Acá no cuesta nada —se mide por la entrada 2, no por la 1— y compra el
 * fondo del barrido, que es donde la 94 no pudo decidir.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-10b-vu/ley-del-fader-de-bus-real.ts 10 5 192.168.0.78
 */
import { spawn } from 'node:child_process';
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  Ui24rTransport, codificarSetd, decodificarVuBuses, decodificarVuCanales,
  dbDeMedidor, faderADb, VU_ESCALA, MEDIDOR_RANGO_DB,
} from '@vse/mixer-adapter';
import { estadoPorHttpExigido, exigirClave } from '../canal-muerto.ts';
import { argIndice, argTexto } from '../argumentos.ts';
import { conRestauracion } from '../con-restauracion.ts';
import { restaurarClaves } from '../restaurar.ts';
import { leerUnaClave } from '../leer-una-clave.ts';
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
const SEGUNDOS_DE_CAPTURA = 3;

const ESCALON_DB = MEDIDOR_RANGO_DB * VU_ESCALA;
/** Para una DIFERENCIA de dos lecturas, dos escalones. */
const TOLERANCIA_DIFERENCIA_DB = 2 * ESCALON_DB;

/** El envío queda fijo: es la fuente del bus, no lo que se mide. */
const ENVIO_FIJO = 0.45;
/**
 * Lo que la 104 midió con la cadena al revés —envío 1,0 y bus 0,45—. **Se imprime
 * como referencia y NO se compara contra nada**: ese número sale de suponer que
 * el fader del bus sigue `faderADb`, que es la hipótesis bajo prueba.
 */
const LA_104_DIO_DBFS = -12.68;
/** Un punto vale si está este margen por encima del piso EFECTIVO. */
const MARGEN_MINIMO_DB = 45;
/** L5: sin este recorrido la corrida no separa `faderADb` de una curva parecida. */
const RECORRIDO_MINIMO_DB = 40;
/**
 * **Por debajo de esto, ninguna expectativa decide.**
 *
 * Sin un minimo, L3b pasa por construccion con UN punto: el denominador de la
 * pendiente da 0, `Math.abs(NaN) > 0.002` es false, `cambios < 0/3` es false, y se
 * imprime «PASA. Sin estructura que explicar» sobre un punto. Es la expectativa
 * que el contrato llama «la que decide», decidiendo en el vacio.
 */
const PUNTOS_MINIMOS = 10;
/** Menos cuadros VU2 que esto y el promedio no es un promedio. */
const CUADROS_MINIMOS = 20;
/**
 * C1: el tono tiene que estar al menos esto por encima del piso efectivo.
 *
 * **Y el número no es una opinión: es la condición necesaria para que L5 pueda
 * pasar.** Cualquier punto util necesita `MARGEN_MINIMO_DB` sobre el piso, y
 * entre el mejor y el peor tiene que haber `RECORRIDO_MINIMO_DB`. O sea que el
 * tope tiene que estar 45 + 40 = 85 dB arriba. Exigir menos abre una franja
 * donde C1 dice «el tono llega», se barren cinco minutos con el general del
 * usuario en 0, y L5 falla por aritmetica. Lo esperado en este banco son 104 dB.
 */
const C1_SOBRE_EL_PISO_DB = MARGEN_MINIMO_DB + RECORRIDO_MINIMO_DB;
/**
 * L7: la referencia interna de la interfaz no puede derivar mas que esto.
 *
 * **0,1 y no 0,3, por aritmetica.** L3b declara estructura con una pendiente de
 * 0,002 dB/dB, que sobre los ~59 dB de recorrido previsto son 0,118 dB de deriva
 * total. Un tope de 0,3 dejaria pasar una deriva del instrumento **2,5 veces
 * mayor que lo que L3b puede resolver**: la Mac podria fabricar el hallazgo de
 * L3b sin que L7 se entere. El control del instrumento tiene que ser mas fino que
 * la expectativa que vigila. La 104 midio 0,00 dB sobre 50 capturas con un tope
 * de 0,2, asi que apretar a 0,1 no cuesta nada y esta medido.
 */
const L7_DERIVA_MAXIMA_DB = 0.1;

/**
 * Dos crudos deliberadamente FUERA de la rejilla de centésimos.
 * Sin ellos L6 no puede fallar: `0,95` sobrevive exacto a un cuantizador a
 * centésimos, a vigésimos o a cualquier divisor.
 */
const CRUDOS = [
  1.0, 0.95, 0.90, 0.85, 0.8237, 0.80, 0.75, 0.70, 0.65, 0.6141, 0.60,
  0.55, 0.50, 0.45, 0.40, 0.35, 0.30, 0.25, 0.20, 0.15, 0.10,
];

const RAIZ = join(import.meta.dirname, '..', '..', '..');
const GRABADOR = join(RAIZ, 'tools', 'audio', 'bin', 'grabar');
const ENTRADA_AUXILIAR = 1;
const ENTRADA_REFERENCIA = 2;
const carpeta = mkdtempSync(join(tmpdir(), 'vse-106-'));

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
let cuadros: { pre: number; post: number; canalSalida: number }[] = [];
t.alRecibir((linea) => {
  if (!linea.startsWith('VU2^')) return;
  const carga = linea.slice(4);
  const bus = decodificarVuBuses(carga).auxiliares[a];
  const c = decodificarVuCanales(carga)[n];
  if (bus === undefined || c === undefined) return;
  cuadros.push({ pre: bus.pre, post: bus.post, canalSalida: c.salida });
});

type Medida = {
  preDb: number; postDb: number; canalDb: number; cuadros: number;
  realDb: number; referenciaDb: number; margenDb: number; ruidoDb: number; recorta: boolean;
};

let sonando: ReturnType<typeof spawn> | null = null;
let falloDelTono: Error | null = null;
const media = (xs: number[]): number => (xs.length === 0 ? NaN : xs.reduce((s, x) => s + x, 0) / xs.length);

async function medir(etiqueta: string, exigeTono: boolean): Promise<Medida> {
  /**
   * **El tono se comprueba antes Y después de la captura.** La ventana que importa
   * son los segundos de la captura, no el instante previo: si el reproductor muere
   * a mitad, la lectura es el piso y se leería como atenuación. Lo encontró una
   * auditoría del ítem 105.
   */
  const vivo = (cuando: string): void => {
    if (!exigeTono) return;
    if (falloDelTono !== null) throw falloDelTono;
    if (sonando !== null && sonando.exitCode !== null) {
      throw new Error(`el tono dejo de sonar ${cuando} ${etiqueta}: afplay salio con `
        + `${sonando.exitCode}. Sin tono la lectura es el piso y se leeria como atenuacion.`);
    }
  };
  vivo('antes de');
  const wav = join(carpeta, `${etiqueta}.wav`);
  cuadros = [];
  const hijo = spawn(GRABADOR, [String(SEGUNDOS_DE_CAPTURA), wav, 'Scarlett'], { stdio: 'ignore' });
  await new Promise<void>((resolver, rechazar) => {
    hijo.on('error', rechazar);
    hijo.on('close', () => resolver());
  });
  const xs = cuadros;
  const an = analizar(wav, HZ) as {
    canales: {
      tonoDb: number; margenEnBinDb: number; ruidoEnBinDb: number; recorteExacto: boolean;
    }[];
  };
  rmSync(wav, { force: true });
  vivo('durante');
  const aux = an.canales[ENTRADA_AUXILIAR]!;
  return {
    preDb: dbDeMedidor(media(xs.map((c) => c.pre))),
    postDb: dbDeMedidor(media(xs.map((c) => c.post))),
    canalDb: dbDeMedidor(media(xs.map((c) => c.canalSalida))),
    cuadros: xs.length,
    realDb: aux.tonoDb,
    margenDb: aux.margenEnBinDb,
    ruidoDb: aux.ruidoEnBinDb,
    recorta: aux.recorteExacto,
    referenciaDb: an.canales[ENTRADA_REFERENCIA]!.tonoDb,
  };
}

// ---------------------------------------------------------------- montaje
await t.conectar(maquina);
const e0 = await estadoPorHttpExigido(maquina);

const PREVIO: readonly (readonly [string, number])[] = [
  [`i.${n}.aux.${a}.value`, Number(exigirClave(e0, `i.${n}.aux.${a}.value`))],
  [`a.${a}.mix`, Number(exigirClave(e0, `a.${a}.mix`))],
  ['m.mix', Number(exigirClave(e0, 'm.mix'))],
  [`a.${a}.gate.enabled`, Number(exigirClave(e0, `a.${a}.gate.enabled`))],
  [`a.${a}.dyn.bypass`, Number(exigirClave(e0, `a.${a}.dyn.bypass`))],
  [`i.${n}.dyn.bypass`, Number(exigirClave(e0, `i.${n}.dyn.bypass`))],
  [`i.${n}.gate.enabled`, Number(exigirClave(e0, `i.${n}.gate.enabled`))],
  [`i.${n}.deesser.enabled`, Number(exigirClave(e0, `i.${n}.deesser.enabled`))],
  ['m.afs.enabled', Number(exigirClave(e0, 'm.afs.enabled'))],
];
const previo = (clave: string): number => {
  const x = PREVIO.find(([k]) => k === clave);
  if (x === undefined) throw new Error(`${clave} no esta en PREVIO`);
  return x[1];
};

const VACIA = '1000.0000000000,116';
/**
 * **Con `exigirClave` y no con `?? ''`.** Si el volcado no trajera las doce claves,
 * la version tolerante devolvia dos listas vacias, que coinciden, y se imprimia
 * «Sin cambios: el supresor no planto nada» habiendo comparado nada con nada —
 * sobre la unica clave cuya perdida le cuesta al usuario una notch de −18 dB que
 * solo `clearall` borra.
 */
const filtrosDelSupresor = (e: Map<string, string>): string[] => {
  const xs: string[] = [];
  for (let i = 0; i < 12; i++) {
    const f = String(exigirClave(e, `m.afs.eq.${i}`));
    if (!f.startsWith(VACIA)) xs.push(`eq.${i}: ${f}`);
  }
  return xs;
};

// **Las doce del supresor se validan ACA y no al final.** `filtrosDelSupresor`
// usa `exigirClave`, y llamarlo recien despues de los cinco minutos de medicion
// convertia una clave faltante en un reventon tardio: se media todo, se imprimian
// los veredictos, y despues lanzaba sin llegar a comparar la pila --que es lo
// unico que protege al usuario de quedarse con una notch de -18 dB--.
const FILTROS_AL_EMPEZAR = filtrosDelSupresor(e0);

console.log('=== 106 — LA LEY DEL FADER DE UN BUS, CONTRA LA SALIDA REAL ===');
console.log(`canal ${canal} (i.${n}) -> auxiliar ${auxiliar} (a.${a}) -> entrada 2`);
console.log(`se barre a.${a}.mix | envio fijo en ${ENVIO_FIJO}`);
console.log(`escalon del medidor: ${ESCALON_DB.toFixed(6)} dB | tolerancia de diferencia ${TOLERANCIA_DIFERENCIA_DB.toFixed(4)} dB`);
console.log('');
console.log('=== ESTADO, LEIDO DEL APARATO ===');
console.log(`   ${e0.size} claves por HTTP`);
for (const k of [
  `i.${n}.aux.${a}.value`, `i.${n}.aux.${a}.post`, `i.${n}.mute`, `i.${n}.mix`,
  `a.${a}.mix`, `a.${a}.mute`, `a.${a}.afs.enabled`, `hwoutaux.${a}.src`,
  'm.mix', 'm.afs.enabled', 'm.afs.fmode', `hw.${n}.gain`,
]) {
  console.log(`   ${k.padEnd(24)} ${e0.get(k) ?? '(ausente)'}`);
}

{
  const exigir = (clave: string, esperado: string, porque: string): void => {
    const v = String(e0.get(clave) ?? '(ausente)');
    if (v !== esperado) throw new Error(`${clave} = ${v}, y esta medicion exige ${esperado}: ${porque}`);
  };
  // **El envio EXIGIDO en 0, no supuesto.** C2 dice medir «la fuga con el envio
  // cerrado» y la primera version no lo cerraba ni lo exigia: si hubiera quedado
  // en un valor intermedio de otra corrida, `fugaDb` seria el tono y no la fuga,
  // el piso efectivo subiria y anularia medio barrido. Y con el bus al tope, un
  // envio en 0,75 da +1,44 dBFS: recorte duro.
  exigir(`i.${n}.aux.${a}.value`, '0', 'C2 mide la fuga con el envio CERRADO, y con el '
    + 'bus al tope un envio abierto recorta la entrada');
  // Las claves de las que cuelga el camino se EXIGEN, no se imprimen.
  exigir(`i.${n}.aux.${a}.post`, '0', 'la ley que se mide es la de ESTA derivacion');
  exigir(`i.${n}.aux.${a}.postproc`, '1', 'cambia que procesamiento del canal ve el envio');
  exigir(`a.${a}.mute`, '0', 'un bus muteado no deja pasar nada y todo seria el piso');
  exigir(`i.${n}.mute`, '0', 'un canal muteado no alimenta el bus');
  exigir(`a.${a}.afs.enabled`, '0', 'un supresor en el bus del tono planta notches a mitad del barrido');
  exigir(`hwoutaux.${a}.src`, `a.${a}`, 'la salida fisica tiene que traer ESTE bus');
  const otros = [...e0.keys()]
    .filter((k) => new RegExp(`^(i|f|l|p)\\.\\d+\\.aux\\.${a}\\.value$`).test(k)
      && k !== `i.${n}.aux.${a}.value`)
    .filter((k) => Number(e0.get(k)) > 0);
  if (otros.length > 0) {
    throw new Error(`${otros.length} tira(s) mas alimentan este auxiliar: ${otros.join(', ')}. `
      + 'Lo que se mediria es la suma.');
  }
  // **Las claves son `a.N.eq.peak.M`, y la primera version de esta guarda buscaba
  // `.gain` y `.g`.** Ninguna clave de este firmware termina asi, o sea que
  // `torcidas` era SIEMPRE vacio, el `throw` inalcanzable, y la linea de abajo
  // imprimia «ecualizador del bus plano» sin haber comprobado nada. La 104 lo
  // hacia bien y el 106 lo reescribio peor. Lo encontro una auditoria leyendo el
  // inventario, no el codigo.
  const bandas = [...e0.keys()].filter((k) => k.startsWith(`a.${a}.eq.peak.`));
  if (bandas.length === 0) {
    throw new Error(`el volcado no trajo ninguna clave a.${a}.eq.peak.*: sin eso esta `
      + 'guarda no comprueba nada y diria que esta plano.');
  }
  const torcidas = bandas.filter((k) => Math.abs(Number(e0.get(k)) - 0.5) > 1e-9);
  if (torcidas.length > 0) {
    throw new Error(`${torcidas.length} de ${bandas.length} banda(s) del ecualizador del `
      + `bus fuera del centro: ${torcidas.join(', ')}. La 94 evito un notch del supresor `
      + 'y cayo en una atenuacion del ecualizador del bus de 22,67 dB en 1 kHz.');
  }
  console.log(`   ecualizador del bus: ${bandas.length} bandas, todas centradas | `
    + `bypass = ${e0.get(`a.${a}.eq.bypass`) ?? '?'}`);
  console.log('');
  console.log('   exigido sin escribir: bus y canal sin mutear, supresor del bus apagado,');
  console.log(`   hwoutaux.${a}.src = a.${a}, 0 tiras mas, ecualizador del bus plano`);
}

type Punto = {
  crudo: number; crudoLeido: number; sentido: 'baja' | 'sube';
  m: Medida; atenuacion: number; prediccion: number; anulado: string | null;
};
const puntos: Punto[] = [];
let c1 = NaN;
let fugaDb = NaN;
let pisoEfectivo = NaN;

await conRestauracion(
  async () => {
    // **Se espera a que el tono muera antes de restaurar.** `m.afs.enabled` vuelve
    // a 1 al final de `restaurarClaves`, y reencender el supresor con el tono
    // todavia sonando es exactamente como se planto la notch de la 104.
    sonando?.kill();
    await new Promise((r) => setTimeout(r, 1500));
    await restaurarClaves(t, maquina, PREVIO);
    rmSync(carpeta, { recursive: true, force: true });
  },
  async () => {
    t.enviar(codificarSetd('m.afs.enabled', 0));
    t.enviar(codificarSetd(`a.${a}.gate.enabled`, 0));
    t.enviar(codificarSetd(`a.${a}.dyn.bypass`, 1));
    t.enviar(codificarSetd(`i.${n}.dyn.bypass`, 1));
    t.enviar(codificarSetd(`i.${n}.gate.enabled`, 0));
    t.enviar(codificarSetd(`i.${n}.deesser.enabled`, 0));
    // **El general abajo, por el hallazgo del 105.** No es neutralizacion de
    // rutina: es lo que quita la fuga de 1 kHz del fondo del barrido.
    t.enviar(codificarSetd('m.mix', 0));
    t.enviar(codificarSetd(`a.${a}.mix`, 1));
    await new Promise((r) => setTimeout(r, 2500));
    // **Que `m.mix = 0` haya llegado se comprueba, no se supone.** Toda la ganancia
    // de fondo de esta corrida cuelga de esa escritura, y si no llega, el piso se
    // queda alto, L5 falla y acusa «el banco se degrado», que es la consola
    // equivocada. Es el hallazgo 3 de la auditoria del 105, sin repetir.
    {
      const leido = await leerUnaClave(maquina, 'm.mix');
      if (leido !== 0) {
        throw new Error(`m.mix quedo en ${leido} y esta corrida lo necesita en 0: sin eso `
          + 'la fuga de 1 kHz sigue en el fondo del barrido y no se mide la ley, se mide la suma.');
      }
    }
    console.log('');
    console.log('=== LO QUE SE NEUTRALIZA ===');
    console.log('   puerta y compresor del bus, y compresor, puerta y de-esser del canal');
    console.log(`   supresor del general: estaba en ${previo('m.afs.enabled')}, apagado mientras suene`);
    console.log(`   fader del GENERAL: estaba en ${previo('m.mix')}, a 0 toda la corrida.`);
    console.log('   Se mide por la entrada 2, asi que bajarlo no cuesta nada. Lo que');
    console.log('   compra se informa abajo, con el numero de C2 al lado: el item 105');
    console.log('   dejo una COTA --la fuga cayo al menos 30,4 dB-- y no un valor.');

    sonando = spawn('afplay', [tono(900)]);
    sonando.on('error', (e) => { falloDelTono = e instanceof Error ? e : new Error(String(e)); });
    await new Promise((r) => setTimeout(r, 3000));

    console.log('');
    console.log('=== LOS CONTROLES POSITIVOS ===');

    // C2 primero: con el envio cerrado, lo que entra por fuera del camino barrido.
    const mFuga = await medir('C2', true);
    fugaDb = mFuga.realDb;
    // Directo del analizador y no como `real - margen`: con el bin en -Infinity esa
    // resta da NaN, `Math.max(-Inf, NaN)` da NaN, y NaN anula el barrido ENTERO —
    // justo en el mejor resultado fisico posible, «no hay fuga ninguna».
    const ruidoDb = mFuga.ruidoDb;
    pisoEfectivo = Math.max(fugaDb, ruidoDb);
    console.log(`C2 con el envio CERRADO y el bus al tope: ${fugaDb.toFixed(2)} dBFS`);
    console.log(`   ruido del bin en esa misma captura: ${ruidoDb.toFixed(2)} dBFS`);
    // **Un piso no finito desactivaria la regla de anulacion entera.** Con C2 en
    // silencio digital exacto el ruido da −Infinity, todo margen da +Infinity, y
    // NINGUN punto se anula nunca: se puntuarian puntos hundidos en el ruido como
    // si estuvieran medidos, con todo el aparato de C2 silenciosamente apagado.
    if (!Number.isFinite(pisoEfectivo)) {
      throw new Error(`el piso efectivo dio ${pisoEfectivo}: sin un piso finito la regla `
        + 'de anulacion no puede anular nada y se publicarian puntos hundidos en el ruido.');
    }
    console.log(`   PISO EFECTIVO = ${pisoEfectivo.toFixed(2)} dBFS, el mayor de los dos.`);
    console.log('   `pisoDelBin` saltea los bins de guarda, asi que una fuga coherente en');
    console.log('   1 kHz le es invisible: por eso se mide aparte y por eso se usa esta.');
    console.log(`   Contra la 104, que midio -91,77 dBFS con el general arriba: `
      + `${(fugaDb - (-91.77)).toFixed(1)} dB de diferencia. Eso es lo que compro bajarlo,`);
    console.log('   medido en ESTA corrida y no heredado del hallazgo.');

    t.enviar(codificarSetd(`i.${n}.aux.${a}.value`, ENVIO_FIJO));
    await new Promise((r) => setTimeout(r, 2500));
    const mC1 = await medir('C1', true);
    c1 = mC1.realDb;
    const sobreElPiso = c1 - pisoEfectivo;
    console.log(`C1 envio en ${ENVIO_FIJO}, bus al tope: ${c1.toFixed(2)} dBFS, `
      + `${sobreElPiso.toFixed(1)} dB sobre el piso efectivo`);
    console.log(`   (la 104, con la cadena al reves, dio ${LA_104_DIO_DBFS} dBFS)`);
    // **C1 comprueba que el tono LLEGA, y nada mas.** La primera version exigia
    // -12,68 +-3 dBFS, y ese numero sale de suponer que el fader del BUS sigue
    // `faderADb` --que es justo la hipotesis bajo prueba--. Con un tope del bus de
    // +6 en vez de +10, C1 leeria -16,68 y abortaria: **el control mataba la
    // corrida exactamente cuando habia hallazgo**. Comprobado con la aritmetica de
    // la 104 antes de correr nada.
    //
    // El control del banco que NO es circular es L7: la referencia interna de la
    // interfaz, que no pasa por la consola.
    //
    // Y lanza aca adentro, que es donde la excepcion pasa por `conRestauracion`.
    // El contrato prometia abortar y la primera version barria diez minutos igual,
    // dejando el general del usuario en 0 para no medir nada.
    if (!(sobreElPiso >= C1_SOBRE_EL_PISO_DB)) {
      // **Dos causas distintas, dos mensajes.** Acusar siempre a la Mac es el defecto
      // que una auditoria le marco a la G1 del 105: la guarda correcta senalando la
      // consola equivocada. Si el tono llega fuerte y el margen igual no alcanza, lo
      // que esta alto es el PISO --la fuga no se suprimio-- y la Mac no tiene nada
      // que ver.
      // **Y la condicion mira el PISO en escala absoluta, no la misma diferencia
      // otra vez.** La primera version usaba `c1 > pisoEfectivo + 60`, que es
      // identico a `sobreElPiso > 60` --la misma magnitud que ya se esta juzgando,
      // partida en dos--. Las dos causas bajan `sobreElPiso` exactamente igual, asi
      // que eso acertaba la mitad de las veces: un tono debil con el piso impecable
      // mandaba al operador a mirar `m.mix`.
      //
      // El piso normal de este banco esta cerca de -117 dBFS y el de la 104, con la
      // fuga sin suprimir, dio -91,77. Un piso por encima de -100 es anormal y
      // señala la fuga; por debajo, el piso esta bien y lo que falta es el tono.
      const pisoAlto = pisoEfectivo > -100;
      throw new Error(`C1: el tono esta solo ${sobreElPiso.toFixed(1)} dB sobre el piso `
        + `(minimo ${C1_SOBRE_EL_PISO_DB}, que es lo que L5 necesita para ser posible). `
        + (pisoAlto
          ? `El tono ENTRA bien --${c1.toFixed(2)} dBFS-- pero el piso quedo en `
            + `${pisoEfectivo.toFixed(2)}: la fuga no se suprimio, y con este piso el `
            + 'recorrido util no alcanza. Revisar que m.mix haya bajado.'
          : 'El tono no esta entrando a la consola: la salida por omision de la Mac '
            + 'puede no ser la interfaz.'));
    }

    console.log('');
    console.log('=== EL BARRIDO ===');
    console.log('crudo  | leido    | real     | pre bus  | canal    | at.real | prev~   | margen');
console.log('   (prev~ es provisoria: la que decide se calcula con el crudo LEIDO del tope,');
console.log('    que recien se sabe al terminar el barrido. Los residuos van en L3/L3b.)');

    for (const sentido of ['baja', 'sube'] as const) {
      const orden = sentido === 'baja' ? CRUDOS : [...CRUDOS].reverse();
      for (const crudo of orden) {
        t.enviar(codificarSetd(`a.${a}.mix`, crudo));
        await new Promise((r) => setTimeout(r, 1200));
        const m = await medir(`${sentido}-${crudo}`, true);
        // **El crudo se relee, y con `leerUnaClave` y no con el volcado completo.**
        // Con `estadoPorHttpExigido` cada punto pagaba su tope de 8000 ms y el
        // barrido costaba 567 s contra un tono de 300: el reproductor se moria a
        // mitad y la corrida NO PODIA TERMINAR. Lo midio una auditoria.
        const crudoLeido = await leerUnaClave(maquina, `a.${a}.mix`);
        puntos.push({
          crudo, crudoLeido, sentido, m,
          // **En el crudo LEIDO, no en el escrito.** Si la consola redondeara, ese
          // error entraria en la ley sin tener nada que ver con ella, y `faderADb`
          // se evaluaria en un numero que la consola no tiene.
          atenuacion: NaN, prediccion: NaN,
          anulado: null,
        });
        console.log(`${crudo.toFixed(4).padStart(6)} | ${crudoLeido.toFixed(4).padStart(8)} | `
          + `${m.realDb.toFixed(2).padStart(8)} | ${m.preDb.toFixed(2).padStart(8)} | `
          + `${m.canalDb.toFixed(2).padStart(8)} | ${'—'.padStart(7)} | `
          // **Provisoria y marcada como tal.** La prediccion que decide se calcula
          // despues del barrido, cuando ya se sabe cual fue el crudo LEIDO del tope;
          // acá todavia no se sabe. Se imprime contra el escrito y se dice, en vez de
          // dejar dos numeros con la misma cara calculados de forma distinta.
          + `${(faderADb(1) - faderADb(crudoLeido)).toFixed(2).padStart(7)}~| `
          + `${(m.realDb - pisoEfectivo).toFixed(0).padStart(6)}`
          + (m.recorta ? '  <-- RECORTA' : ''));
      }
    }
  },
);

await new Promise((r) => setTimeout(r, 1000));

// ------------------------------------------------------------------ veredictos
const d = (x: number): string => (Number.isFinite(x) ? x.toFixed(2) : String(x));
const problemas: string[] = [];

// La atenuacion se mide contra el tope del barrido, del mismo sentido.
/**
 * **El punto de referencia tiene que servir, y esto nunca se comprobaba.**
 *
 * De él cuelgan TODAS las atenuaciones y TODAS las predicciones: si el tope está
 * anulado, los 41 puntos salen sesgados **la misma cantidad y en el mismo
 * sentido**. Y el daño no es un PASA tranquilizador: un tope recortado lee bajo,
 * el residuo sale constante, L3 falla y L3b ve 40 residuos del mismo signo con
 * cero cambios. O sea que la corrida publicaría **un hallazgo falso contra la
 * consola, con la firma exacta que la 94 dejó indecidible y que la 104 pagó por
 * poder nombrar** — mientras el motivo verdadero, una captura que el propio guion
 * marcó inservible, está impreso cuarenta líneas más abajo sin relación declarada.
 *
 * Ninguna guarda de `NaN` puede ver esto, porque con un tope anulado todos los
 * números son finitos. La 104 tiene esta comprobación; el 106 no la tuvo en tres
 * rondas de auditoría.
 */
// **PRIMERA PASADA: quien vale.** La anulacion no depende del tope, asi que se
// decide antes y sobre todos los puntos.
//
// **Y esto es lo que hace posible la guarda de la segunda pasada**, que es el
// motivo de partirlo. Antes el tope se resolvia con un `find` y se usaba pasara lo
// que pasara: su `anulado` no se leia NUNCA. Separar «quien vale» de «contra que
// se mide» es lo que permite mirarlo, y mirarlo con un valor ya definitivo.
//
// (Una version anterior de este comentario decia que el defecto era una dependencia
// del ORDEN. No lo era: no habia dependencia del orden porque no habia comprobacion
// ninguna. Queda corregido porque un comentario que acredita un defecto que no
// estaba es la misma clase de error que este proyecto persigue en la otra direccion.)
for (const p of puntos) {
  const margen = p.m.realDb - pisoEfectivo;
  if (!(margen >= MARGEN_MINIMO_DB)) {
    // La formula del error es de primer orden: con margen chico no significa nada
    // y se dice en vez de imprimir un numero sin sentido.
    p.anulado = `margen de ${d(margen)} dB sobre el piso efectivo`
      + (margen > 6
        ? `: el instrumento erraria ${(8.686 * Math.pow(10, -margen / 20)).toFixed(2)} dB`
        : ': por debajo de 6 dB la formula del error de primer orden no aplica');
  }
  // **Y no se pisa el motivo.** Antes `recorta` sobrescribia el del margen y se
  // perdia cual vino primero.
  if (p.m.recorta && p.anulado === null) p.anulado = 'la captura recorta';
  if (p.m.cuadros < CUADROS_MINIMOS && p.anulado === null) {
    p.anulado = `solo ${p.m.cuadros} cuadros VU2: el promedio no es un promedio`;
  }
}

// **SEGUNDA PASADA: el punto de referencia, ya con las anulaciones decididas.**
const referenciaInservible: string[] = [];
const topes = new Map<'baja' | 'sube', Punto>();
for (const sentido of ['baja', 'sube'] as const) {
  const tope = puntos.find((p) => p.sentido === sentido && p.crudo === CRUDOS[0]);
  if (tope === undefined || tope.anulado !== null
    || !Number.isFinite(tope.m.realDb) || !Number.isFinite(tope.crudoLeido)) {
    referenciaInservible.push(`${sentido}: ${tope === undefined ? 'no existe'
      : tope.anulado ?? 'lectura no finita'}`);
    continue;
  }
  topes.set(sentido, tope);
}
/**
 * **Y si no sirve NO se sale del proceso, se saltea el veredicto.**
 *
 * La primera version usaba `process.exit(1)` aca. Estaba bien respecto de
 * `conRestauracion` --la consola ya volvio-- y mal respecto de todo lo que viene
 * despues: se saltaba el informe de los puntos anulados, o sea **el motivo por el
 * que el tope no servia**; la verificacion por HTTP de las nueve claves; y la
 * comparacion de la pila del supresor.
 *
 * Y el caso en que esto dispara es **una corrida que salio mal**, justo cuando mas
 * falta hace saber si la consola volvio limpia. El guion acaba de mandar 900
 * segundos de 1 kHz sostenido por un canal que alimenta el general: si quedo una
 * notch plantada, salir ahi la deja sin informar y el usuario se entera en su
 * proxima fecha. Es literalmente la historia del hallazgo del `clearall`, dos veces.
 *
 * El contrato promete esas dos comprobaciones **sin condicion**.
 */
const referenciaSirve = referenciaInservible.length === 0;
if (!referenciaSirve) {
  console.log('');
  console.log('=== EL PUNTO DE REFERENCIA NO SIRVE ===');
  for (const x of referenciaInservible) console.log(`   ${x}`);
  console.log('   De el cuelgan TODAS las atenuaciones y TODAS las predicciones, asi que');
  console.log('   ninguna expectativa se decide y no se imprime ley. Publicarla seria');
  console.log('   publicar un HALLAZGO FALSO contra la consola: un tope recortado lee bajo,');
  console.log('   el residuo sale constante, y L3b lo leeria como estructura --la firma');
  console.log('   exacta que la 94 dejo indecidible--.');
  console.log('   Se sigue igual hasta la restauracion y la pila del supresor: son lo que');
  console.log('   mas falta hace justo cuando una corrida salio mal.');
  process.exitCode = 1;
}

// **TERCERA: las atenuaciones y las predicciones, con un tope que ya se sabe bueno.**
for (const p of referenciaSirve ? puntos : []) {
  const tope = topes.get(p.sentido)!;
  p.atenuacion = tope.m.realDb - p.m.realDb;
  // **Los DOS terminos con el crudo LEIDO.** Con el tope en el crudo escrito, un
  // tope que la consola devolviera como 0,9999 en vez de 1,0 metia un sesgo
  // CONSTANTE de 0,005 dB en los cuarenta residuos --del mismo tamaño que los de
  // la 104, ≤0,007-- y alcanzaba para empujar todos los signos al mismo lado y
  // hacer que L3b, «la que decide», fallara acusando a la consola por un redondeo.
  p.prediccion = faderADb(tope.crudoLeido) - faderADb(p.crudoLeido);
}

const utiles = puntos.filter((p) => p.anulado === null);

console.log('');
if (!referenciaSirve) {
  console.log('=== NO SE IMPRIMEN VEREDICTOS: el punto de referencia no sirve ===');
} else {
console.log('=== VEREDICTOS, contra el contrato del item 106 ===');

{
  // **C1 ya se juzgo, y se juzgo ARRIBA.** Acá había una segunda evaluación que
  // comparaba contra −12,68 ± 3 dBFS, y sobrevivió al arreglo que agregó la
  // buena: el control nuevo se puso y el viejo no se sacó. O sea que C1 se
  // evaluaba dos veces con criterios contradictorios y **ganaba el que el
  // contrato de esta misma medición declara falso**, porque era el que llegaba
  // al `if`. Con un tope del bus de +6 en vez de +10 habría abortado con el
  // motivo impreso al revés: «el banco no es el mismo».
  //
  // Lo encontró una segunda auditoría, y la lección es de forma: un arreglo que
  // agrega el control bueno sin sacar el malo deja los dos vivos, y gana el que
  // escribe en `problemas`.
  console.log(`\nC1 el tono llega: ${d(c1)} dBFS, juzgado en el sitio antes de barrer.`);
  console.log('   No se compara contra un nivel absoluto: ese numero saldria de suponer');
  console.log('   que el fader del BUS sigue faderADb, que es la hipotesis bajo prueba.');
}
{
  const pres = utiles.map((p) => p.m.preDb).filter(Number.isFinite);
  const rango = pres.length === 0 ? NaN : Math.max(...pres) - Math.min(...pres);
  const ok = rango <= TOLERANCIA_DIFERENCIA_DB;
  console.log(`\nL1 el pre del auxiliar no se mueve: rango ${d(rango)} dB `
    + `(tope ${TOLERANCIA_DIFERENCIA_DB.toFixed(4)})`);
  console.log(ok ? '   PASA. El byte +0 esta antes del fader del bus, como estaba medido.'
    : '   FALLA. Reabre que es el byte +0, medido en un solo bus y un solo dia.');
  if (!ok) problemas.push('L1');
}
{
  const cs = utiles.map((p) => p.m.canalDb).filter(Number.isFinite);
  const techo = cs.length === 0 ? -Infinity : Math.max(...cs);
  const rango = cs.length === 0 ? NaN : Math.max(...cs) - Math.min(...cs);
  console.log(`\nL2 el medidor del canal no se mueve: rango ${d(rango)} dB sobre ${cs.length} `
    + `puntos, techo ${d(techo)} dB`);
  // **Sin señal el rango da cero y L2 pasaria sola.** La 104 tenia esta guarda y el
  // 106 la habia borrado: basta un medidor que idlea en un byte distinto de cero
  // para que `canalDb` salga finito, constante y ~-80 dB, el rango de 0, y L2
  // imprima «la fuente no se movio» sin que haya habido nunca fuente.
  if (!(techo > -75)) {
    console.log(`   NO DECIDE: el medidor del canal nunca paso de ${d(techo)} dB. Sin señal `
      + 'el rango da cero y esta expectativa pasaria sola.');
    problemas.push('L2');
  } else {
    const ok = rango <= TOLERANCIA_DIFERENCIA_DB;
    console.log(ok ? '   PASA. La fuente no se movio.' : '   FALLA. La fuente cambio y la corrida no vale.');
    if (!ok) problemas.push('L2');
  }
}
{
  // **L7 — el unico testigo del INSTRUMENTO.** Todo lo demas de esta corrida vigila
  // la consola. La entrada 3 es un retorno interno de la interfaz: no pasa por la
  // consola, asi que si deriva, lo que cambio es la computadora o el conversor.
  // `referenciaDb` se venia calculando, imprimiendo y descartando, que es el patron
  // «se mide y no se usa» que esta serie ya cometio cuatro veces.
  const refs = puntos.map((p) => p.m.referenciaDb).filter(Number.isFinite);
  const deriva = refs.length === 0 ? NaN : Math.max(...refs) - Math.min(...refs);
  console.log(`\nL7 la referencia interna de la interfaz: ${refs.length} capturas finitas`);
  // **Con una sola captura la deriva da 0 y L7 pasaria sola**, que es el mismo
  // agujero que L4 y L6 tenian y que este mismo arreglo cerro en ellas. El puerto
  // se trajo la expectativa de la 104 y dejo su minimo.
  if (refs.length < PUNTOS_MINIMOS) {
    console.log(`   NO DECIDE: con menos de ${PUNTOS_MINIMOS} lecturas la deriva da cero `
      + 'y esta expectativa pasaria sola.');
    problemas.push('L7 sin lecturas');
  } else {
    const ok = deriva <= L7_DERIVA_MAXIMA_DB;
    console.log(`   deriva ${d(deriva)} dB (tope ${L7_DERIVA_MAXIMA_DB})`);
    console.log(ok ? '   PASA. El instrumento no se movio, y eso NO lo dice ningun otro control.'
      : '   FALLA. Se movio la computadora o el conversor, no la consola.');
    if (!ok) problemas.push('L7');
  }
}
{
  const ats = utiles.map((p) => p.atenuacion).filter(Number.isFinite);
  const recorrido = ats.length === 0 ? NaN : Math.max(...ats) - Math.min(...ats);
  const ok = recorrido >= RECORRIDO_MINIMO_DB;
  console.log(`\nL5 recorrido util: ${d(recorrido)} dB sobre ${utiles.length} puntos `
    + `(minimo ${RECORRIDO_MINIMO_DB})`);
  console.log(ok ? '   PASA.' : '   FALLA. Un tramo corto no separa `faderADb` de una curva parecida: '
    + 'es lo que le paso a la primera corrida de la 94.');
  if (!ok) problemas.push('L5');
}

if (problemas.length > 0) {
  console.log('');
  console.log(`=== NO SE IMPRIME LEY: fallaron ${problemas.join(', ')} ===`);
  console.log('   Una ley publicada sobre una cadena de medicion rota se ve igual de');
  console.log('   seria y es falsa.');
  process.exitCode = 1;
} else {
  {
    const res = utiles.filter((p) => p.crudo !== CRUDOS[0])
      .map((p) => ({ x: p.prediccion, r: p.atenuacion - p.prediccion, crudo: p.crudo }))
      .filter((p) => Number.isFinite(p.r));
    // **Con pocos puntos no se decide, y se dice.** Sin esta puerta, L3 revienta con
    // cero puntos (`reduce` sin semilla) y L3b PASA con uno (el denominador de la
    // pendiente da 0 y `NaN > 0.002` es false). Es la expectativa que el contrato
    // llama «la que decide», decidiendo en el vacio.
    if (res.length < PUNTOS_MINIMOS) {
      console.log(`\nL3 y L3b NO DECIDEN: quedaron ${res.length} puntos utiles y hacen `
        + `falta ${PUNTOS_MINIMOS}. Una ley sobre menos que eso no separa \`faderADb\` `
        + 'de cualquier curva parecida.');
      problemas.push('L3/L3b sin puntos');
    } else {
    const peor = res.reduce((m, x) => (Math.abs(x.r) > Math.abs(m.r) ? x : m), res[0]!);
    const ok = Math.abs(peor.r) <= ESCALON_DB;
    console.log(`\nL3 la salida real contra faderADb: desvio maximo ${d(peor.r)} dB `
      + `en el crudo ${peor.crudo} (tope ${ESCALON_DB.toFixed(4)})`);
    console.log(ok ? '   PASA. Y es una COTA, no una identidad: dice que si hay diferencia es '
      + 'menor que la resolucion.' : '   FALLA.');
    if (!ok) problemas.push('L3');

    // **L3b: la que decide.** Una cota de maximo no ve una desviacion que crece.
    const nres = res.length;
    const sx = res.reduce((s, p) => s + p.x, 0);
    const sy = res.reduce((s, p) => s + p.r, 0);
    const sxx = res.reduce((s, p) => s + p.x * p.x, 0);
    const sxy = res.reduce((s, p) => s + p.x * p.r, 0);
    const pend = (nres * sxy - sx * sy) / (nres * sxx - sx * sx);
    const pos = res.filter((p) => p.r > 0).length;
    const neg = res.filter((p) => p.r < 0).length;
    let cambios = 0;
    // Los residuos exactamente cero se excluyen: `Math.sign(0)` es 0 y cada uno
    // metia DOS cambios espurios, o sea hacia la prueba de rachas menos sensible.
    const signos = res.map((p) => Math.sign(p.r)).filter((x) => x !== 0);
    for (let i = 1; i < signos.length; i++) if (signos[i] !== signos[i - 1]) cambios++;
    const esperados = (signos.length - 1) / 2;
    const estructurado = Math.abs(pend) > 0.002 || cambios < esperados / 3;
    console.log(`\nL3b el residuo contra faderADb: pendiente ${pend.toFixed(5)} dB/dB sobre ${nres} puntos`);
    console.log(`   signos: ${pos} positivos, ${neg} negativos, ${cambios} cambios de signo `
      + `(con residuos independientes se esperarian ~${esperados.toFixed(0)})`);
    console.log(estructurado
      ? '   FALLA. El residuo ESTA estructurado, y eso es un hallazgo y no una '
        + 'contradiccion con L3: una cota puntual no ve la estructura. Gana L3b.'
      : '   PASA. Sin estructura que explicar.');
    if (estructurado) problemas.push('L3b');
    }
  }
  {
    let peor = { dif: 0, crudo: NaN };
    let pares = 0;
    for (const c of CRUDOS) {
      const b = utiles.find((p) => p.sentido === 'baja' && p.crudo === c);
      const s = utiles.find((p) => p.sentido === 'sube' && p.crudo === c);
      if (b === undefined || s === undefined) continue;
      const dif = Math.abs(b.atenuacion - s.atenuacion);
      if (!Number.isFinite(dif)) continue;
      pares += 1;
      if (dif > peor.dif) peor = { dif, crudo: c };
    }
    console.log(`\nL4 ida y vuelta: ${pares} pares comparados`);
    // **Cuantos pares se compararon, antes del numero.** Sin esto, cero pares dejaba
    // `peor.dif` en 0 y se imprimia «diferencia maxima 0.00 dB en el crudo NaN —
    // PASA», que no distingue «no hubo diferencia» de «no se comparo nada».
    if (pares === 0) {
      console.log('   NO DECIDE: ningun crudo sobrevivio en los dos sentidos.');
      problemas.push('L4 sin pares');
    } else {
      const ok = peor.dif <= TOLERANCIA_DIFERENCIA_DB;
      console.log(`   diferencia maxima ${d(peor.dif)} dB en el crudo ${peor.crudo}`);
      console.log(ok ? '   PASA.' : '   FALLA. Hay histeresis o falta de asentamiento.');
      if (!ok) problemas.push('L4');
    }
  }
  {
    let peor = { dif: 0, crudo: NaN };
    let comparados = 0;
    for (const p of puntos) {
      const dif = Math.abs(p.crudoLeido - p.crudo);
      if (!Number.isFinite(dif)) continue;
      comparados += 1;
      if (dif > peor.dif) peor = { dif, crudo: p.crudo };
    }
    console.log(`\nL6 el crudo escrito contra el releido: ${comparados} comparados`);
    if (comparados === 0) {
      console.log('   NO DECIDE: no se releyo ningun crudo.');
      problemas.push('L6 sin datos');
    } else {
    // **El veredicto en decibeles y no en bits.** Lo que importa no es si redondea
    // sino cuanto cuesta en la unidad de L3: un redondeo a 1e-4 en el crudo vale
    // ~0,005 dB, la sexagesima parte del escalon, y hacerlo FALLAR seria rechazar
    // por algo que no se puede ver. La 104 movio este veredicto a dB a proposito y
    // el 106 habia vuelto a los bits.
    // **El costo se evalua en el crudo de CADA punto y se toma el peor.** La
    // version anterior lo evaluaba siempre en `CRUDOS[0]` --el tope de la curva,
    // donde la pendiente es ~50 dB por unidad-- cuando la desviacion puede ocurrir
    // abajo, donde es ~156. Subestimaba 3,1 veces: imprimia PASA hasta una
    // desviacion que abajo cuesta 0,105 dB, el 31 % del presupuesto entero de L3.
    // O sea que L6 daba PASA sobre un redondeo que L3 ve y que mete pendiente en
    // L3b, que es justo lo que este veredicto en decibeles venia a impedir.
    const costoDb = puntos.reduce((peorCosto, p) => {
      const c = Math.abs(faderADb(p.crudoLeido) - faderADb(p.crudo));
      return Number.isFinite(c) && c > peorCosto ? c : peorCosto;
    }, 0);
    // **El veredicto es el costo en dB y nada mas.** `peor.dif` --el maximo de la
    // diferencia en CRUDO-- era la magnitud del criterio anterior y sobrevivio a la
    // reescritura: los dos maximos suelen estar en crudos distintos, y la frase los
    // presentaba como si fueran el mismo punto.
    console.log(`   el peor costo en dB sobre todos los puntos: ${costoDb.toFixed(4)} dB `
      + `(tope ${(ESCALON_DB / 10).toFixed(4)})`);
    console.log(costoDb < ESCALON_DB / 10
      ? '   PASA. Y es una COTA, no una identidad.'
      : '   FALLA: la consola redondea lo bastante como para verse en L3.');
    console.log('   Dos de los crudos barridos estan fuera de la rejilla de centesimos a');
    console.log('   proposito: sin ellos esta expectativa no podria fallar.');
      if (!(costoDb < ESCALON_DB / 10)) problemas.push('L6');
    }
  }
  if (problemas.length > 0) process.exitCode = 1;
}

}

// **Los anulados se informan SIEMPRE, y esto estaba adentro del `else`.**
// Cuando el punto de referencia no sirve, el motivo por el que no sirve es
// justamente una anulacion — asi que la unica corrida en la que este informe
// hace falta de verdad era la unica en la que no se imprimia.
const anulados = puntos.filter((p) => p.anulado !== null);
if (anulados.length > 0) {
  console.log('');
  console.log('=== LOS PUNTOS ANULADOS, QUE NO SE PUNTUAN PERO SE INFORMAN ===');
  for (const p of anulados) {
    console.log(`   ${p.sentido} ${p.crudo}: ${p.anulado}`);
  }
}

console.log('');
console.log('=== LO QUE ESTA CORRIDA NO DICE ===');
console.log('   Nada sobre m.mix: el general es otra ruta y otra medicion.');
console.log('   Nada sobre el cero absoluto: es relativa al tope del barrido.');
console.log('   Nada sobre la ley INVERSA: esto mide crudo -> dB.');
console.log('   Un bus de diez, un dia, una frecuencia, un nivel de fuente.');

console.log('');
console.log('=== RESTAURACION, RELEIDA POR HTTP ===');
{
  const fin = await estadoPorHttpExigido(maquina);
  let bien = true;
  for (const [k, v] of PREVIO) {
    const leido = Number(exigirClave(fin, k));
    const ok = Math.abs(leido - v) < 1e-9;
    if (!ok) bien = false;
    console.log(`   ${k.padEnd(24)} esperado ${String(v).padEnd(14)} leido ${leido}`
      + (ok ? '' : '   <-- NO COINCIDE'));
  }
  console.log(bien ? `   Las ${PREVIO.length} claves volvieron, por un camino distinto del que escribio.`
    : '   HAY CLAVES SIN RESTAURAR. Revisar la consola antes de seguir.');
  if (!bien) process.exitCode = 1;

  const antes = FILTROS_AL_EMPEZAR;
  const despues = filtrosDelSupresor(fin);
  console.log('');
  console.log(`   filtros del supresor: ${antes.length} antes, ${despues.length} despues`);
  for (const f of despues) console.log(`      ${f}`);
  if (despues.length !== antes.length || despues.some((f, i) => f !== antes[i])) {
    console.log('   LA PILA CAMBIO: el supresor planto algo. Es una notch REAL sobre el');
    console.log('   general del usuario, y borrarla exige `clearall`, que se lleva todo.');
    process.exitCode = 1;
  } else {
    console.log('   Sin cambios: el supresor no planto nada.');
  }
}
await t.desconectar();
