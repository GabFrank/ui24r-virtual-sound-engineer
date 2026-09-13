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
 * **Esto no barre nada.** El envío vuelve a 0 después del control positivo y se
 * queda ahí.
 *
 * **Lo que la primera versión de este guion hacía mal, porque es lo caro.** El
 * −91,77 no se midió con la consola en reposo: se midió adentro de la
 * neutralización de la 104, con `a.4.mix = 0,45` como atenuador fijo. En reposo
 * ese fader vale **0**, y `faderADb(0) = −∞`. Este guion no reproducía el banco,
 * así que habría medido el piso del bin en los cuatro estados, las cuatro caídas
 * habrían dado ≈ 0 dB, y la tabla habría impreso «la fuga es anterior al mute del
 * canal» **sobre una cadena de medición muerta**. La guarda que tenía que
 * atajarlo fallaba, pero no detenía nada. De ahí las dos reglas de este archivo:
 * el banco se reproduce clave por clave, y **una guarda que falla aborta antes
 * del veredicto**.
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

/** El atenuador fijo de la 104. Sin esto el auxiliar sale por un fader en −∞. */
const FADER_DEL_AUXILIAR = 0.45;
/** Lo que la 104 midió con el envío cerrado, en ese banco. G1 exige reproducirlo. */
const LA_104_MIDIO_DBFS = -91.77;
const G1_TOLERANCIA_DB = 1.5;
/** Lo que la 104 midió con el envío en 1,0. C1 exige acercarse. */
const LA_104_CON_ENVIO_ABIERTO_DBFS = -12.68;
const C1_TOLERANCIA_DB = 6;
/** G2: sin este margen en E0, la fila «cae» es inalcanzable por aritmética. */
const G2_MARGEN_MINIMO_DB = 15;
/** G4: con el tono apagado el bin tiene que caer por debajo de esto. */
const G4_PISO_DBFS = -110;
/** El veredicto, en dB de caída respecto de E0. */
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

type Lectura = { auxDb: number; generalDb: number; margenAuxDb: number; recorta: boolean };

let sonando: ReturnType<typeof spawn> | null = null;
/**
 * **Un `ChildProcess` que emite `'error'` sin oyente mata el proceso sin correr
 * el `finally`.** No es teoría: `spawn` de un binario que no existe o sin permiso
 * emite `'error'` de forma asincrónica, fuera del `await`, y `conRestauracion` no
 * llega a restaurar. Su docblock enumera cuatro huecos y éste no estaba. Con el
 * oyente puesto, el fallo llega como excepción del cuerpo, que sí está cubierto.
 */
let falloDelTono: Error | null = null;

async function medir(etiqueta: string, exigeTono: boolean): Promise<Lectura> {
  if (exigeTono) {
    if (falloDelTono !== null) throw falloDelTono;
    if (sonando !== null && sonando.exitCode !== null) {
      throw new Error(`el tono dejo de sonar antes de ${etiqueta}: afplay salio con `
        + `${sonando.exitCode}. Sin tono las lecturas son el piso y el veredicto seria falso.`);
    }
  }
  const wav = join(carpeta, `${etiqueta}.wav`);
  const hijo = spawn(GRABADOR, [String(SEGUNDOS_DE_CAPTURA), wav, 'Scarlett'], { stdio: 'ignore' });
  await new Promise<void>((resolver, rechazar) => {
    hijo.on('error', rechazar);
    hijo.on('close', () => resolver());
  });
  const an = analizar(wav, HZ) as {
    canales: { tonoDb: number; margenEnBinDb: number; recorteExacto: boolean }[];
  };
  rmSync(wav, { force: true });
  const aux = an.canales[ENTRADA_AUXILIAR]!;
  const gen = an.canales[ENTRADA_GENERAL]!;
  return {
    auxDb: aux.tonoDb, generalDb: gen.tonoDb,
    margenAuxDb: aux.margenEnBinDb,
    // El general va a nivel alto y de él cuelga G3: un recorte falsearia el bin
    // sin dejar rastro.
    recorta: aux.recorteExacto || gen.recorteExacto,
  };
}

const t = new Ui24rTransport();
await t.conectar(maquina);
const e0 = await estadoPorHttpExigido(maquina);

const PREVIO: readonly (readonly [string, number])[] = [
  [`i.${n}.aux.${a}.value`, Number(exigirClave(e0, `i.${n}.aux.${a}.value`))],
  ['m.mute', Number(exigirClave(e0, 'm.mute'))],
  [`i.${n}.mute`, Number(exigirClave(e0, `i.${n}.mute`))],
  [`a.${a}.mix`, Number(exigirClave(e0, `a.${a}.mix`))],
  [`a.${a}.gate.enabled`, Number(exigirClave(e0, `a.${a}.gate.enabled`))],
  [`a.${a}.dyn.bypass`, Number(exigirClave(e0, `a.${a}.dyn.bypass`))],
  [`i.${n}.dyn.bypass`, Number(exigirClave(e0, `i.${n}.dyn.bypass`))],
  [`i.${n}.gate.enabled`, Number(exigirClave(e0, `i.${n}.gate.enabled`))],
  [`i.${n}.deesser.enabled`, Number(exigirClave(e0, `i.${n}.deesser.enabled`))],
  // Por la regla del 2026-09-13: si queda encendido con el tono sonando, el
  // supresor le planta una notch de −18 dB al general, y sacarla exige `clearall`,
  // que se lleva los filtros del usuario.
  ['m.afs.enabled', Number(exigirClave(e0, 'm.afs.enabled'))],
];

console.log('=== 105 — DE QUIEN ES LA FUGA DE 1 kHz ===');
console.log(`canal ${canal} (i.${n}) -> auxiliar ${auxiliar} (a.${a}) -> entrada 2`);
console.log(`tono de ${HZ} Hz a ${NIVEL_DBFS} dBFS | ${SEGUNDOS_DE_CAPTURA} s por captura`);
console.log('');
console.log('=== ESTADO, LEIDO DEL APARATO ===');
console.log(`   ${e0.size} claves por HTTP`);
for (const k of [
  `i.${n}.aux.${a}.value`, `i.${n}.aux.${a}.post`, `i.${n}.mute`, `i.${n}.mix`,
  'm.mute', 'm.mix', 'm.afs.enabled', 'm.afs.fmode',
  `a.${a}.mix`, `a.${a}.mute`, `a.${a}.afs.enabled`, `hwoutaux.${a}.src`,
]) {
  console.log(`   ${k.padEnd(24)} ${e0.get(k) ?? '(ausente)'}`);
}

// ------------------------------------------------- lo que se exige sin escribir
{
  const exigir = (clave: string, esperado: string, porque: string): void => {
    const v = String(e0.get(clave) ?? '(ausente)');
    if (v !== esperado) throw new Error(`${clave} = ${v}, y esta medicion exige ${esperado}: ${porque}`);
  };
  exigir(`i.${n}.aux.${a}.value`, '0',
    'con el envio abierto lo que se mide es el envio y no la fuga');
  exigir(`a.${a}.mute`, '0', 'un bus muteado no deja pasar nada y las cuatro lecturas serian el piso');
  exigir('m.mute', '0', 'E1 escribe m.mute = 1, y si ya valia 1 no saca nada del camino');
  exigir(`i.${n}.mute`, '0', 'E2 escribe este mute, y si ya valia 1 no hay tono en ningun lado');
  exigir(`a.${a}.afs.enabled`, '0', 'un supresor en el bus del tono planta notches a mitad de corrida');
  exigir(`hwoutaux.${a}.src`, `a.${a}`, 'la salida fisica tiene que traer ESTE bus');
  const otros = [...e0.keys()]
    .filter((k) => new RegExp(`^(i|f|l|p)\\.\\d+\\.aux\\.${a}\\.value$`).test(k)
      && k !== `i.${n}.aux.${a}.value`)
    .filter((k) => Number(e0.get(k)) > 0);
  if (otros.length > 0) {
    throw new Error(`${otros.length} tira(s) mas alimentan este auxiliar: ${otros.join(', ')}. `
      + 'Lo que se mediria es la suma.');
  }
  console.log('');
  console.log('   exigido sin escribir: envio en 0, bus y canal sin mutear, general sin');
  console.log(`   mutear, supresor del bus apagado, hwoutaux.${a}.src = a.${a}, 0 tiras mas`);
}

const L: Record<string, Lectura> = {};
let muteCortaElAuxiliar: boolean | null = null;
let c1Db = NaN;
let c2Db = NaN;

await conRestauracion(
  async () => {
    sonando?.kill();
    await restaurarClaves(t, maquina, PREVIO);
    rmSync(carpeta, { recursive: true, force: true });
  },
  async () => {
    // ---------------------------------------------------- el banco de la 104
    t.enviar(codificarSetd('m.afs.enabled', 0));
    t.enviar(codificarSetd(`a.${a}.gate.enabled`, 0));
    t.enviar(codificarSetd(`a.${a}.dyn.bypass`, 1));
    t.enviar(codificarSetd(`i.${n}.dyn.bypass`, 1));
    t.enviar(codificarSetd(`i.${n}.gate.enabled`, 0));
    t.enviar(codificarSetd(`i.${n}.deesser.enabled`, 0));
    t.enviar(codificarSetd(`a.${a}.mix`, FADER_DEL_AUXILIAR));
    await new Promise((r) => setTimeout(r, 2500));
    console.log('');
    console.log('=== EL BANCO DE LA 104, REPRODUCIDO CLAVE POR CLAVE ===');
    console.log(`   a.${a}.mix = ${FADER_DEL_AUXILIAR} como ATENUADOR FIJO. Sin esto el`);
    console.log(`   auxiliar sale por un fader en 0, que es −infinito dB, y las cuatro`);
    console.log('   lecturas darian el piso del bin. Es el defecto que la auditoria paro.');
    console.log('   puerta y compresor del bus, y compresor, puerta y de-esser del canal: fuera');
    console.log(`   supresor del general: estaba en ${PREVIO[9]![1]}, apagado mientras suene`);

    const wav = tono(240);
    sonando = spawn('afplay', [wav]);
    sonando.on('error', (e) => { falloDelTono = e instanceof Error ? e : new Error(String(e)); });
    await new Promise((r) => setTimeout(r, 3000));

    const mostrar = (nombre: string, x: Lectura): void => {
      console.log(`${nombre.padEnd(34)} ${x.auxDb.toFixed(2).padStart(9)} dBFS  `
        + `${x.generalDb.toFixed(2).padStart(9)} dBFS  ${x.margenAuxDb.toFixed(0).padStart(5)} dB`
        + (x.recorta ? '   <-- RECORTA' : ''));
    };

    console.log('');
    console.log('=== EL CONTROL POSITIVO, QUE VA ANTES DE TODO ===');
    console.log('estado                              aux (bin 1k)   gral (bin 1k)  margen');

    // C1 — ¿llega el tono a la consola?
    t.enviar(codificarSetd(`i.${n}.aux.${a}.value`, 1));
    await new Promise((r) => setTimeout(r, 2500));
    const c1 = await medir('C1', true);
    c1Db = c1.auxDb;
    mostrar('C1  envio ABIERTO en 1,0', c1);

    // C2 — ¿el mute del canal está en el camino del auxiliar?
    t.enviar(codificarSetd(`i.${n}.mute`, 1));
    await new Promise((r) => setTimeout(r, 2500));
    const c2 = await medir('C2', true);
    c2Db = c2.auxDb;
    mostrar('C2  envio abierto + canal MUTEADO', c2);
    muteCortaElAuxiliar = c1.auxDb - c2.auxDb > CAE_DB;

    // Se vuelve al estado de E0.
    t.enviar(codificarSetd(`i.${n}.mute`, 0));
    t.enviar(codificarSetd(`i.${n}.aux.${a}.value`, 0));
    await new Promise((r) => setTimeout(r, 2500));

    console.log('');
    console.log('=== LOS CUATRO ESTADOS ===');
    console.log('estado                              aux (bin 1k)   gral (bin 1k)  margen');

    L.E0 = await medir('E0', true);
    mostrar('E0  banco de la 104, envio en 0', L.E0);

    t.enviar(codificarSetd('m.mute', 1));
    await new Promise((r) => setTimeout(r, 2000));
    L.E1 = await medir('E1', true);
    mostrar('E1  general muteado', L.E1);

    t.enviar(codificarSetd('m.mute', 0));
    t.enviar(codificarSetd(`i.${n}.mute`, 1));
    await new Promise((r) => setTimeout(r, 2000));
    L.E2 = await medir('E2', true);
    mostrar('E2  canal muteado', L.E2);

    // **E3 con la consola como en E0, y no como quedó en E2.** Si se midiera con
    // el canal muteado, una fuente ajena de 1 kHz que entre por el canal estaría
    // tapada y G4 pasaría sin ver nada: sería una guarda que no puede fallar.
    t.enviar(codificarSetd(`i.${n}.mute`, 0));
    await new Promise((r) => setTimeout(r, 2000));
    sonando.kill();
    sonando = null;
    await new Promise((r) => setTimeout(r, 2000));
    L.E3 = await medir('E3', false);
    mostrar('E3  tono apagado, consola como E0', L.E3);
  },
);

await new Promise((r) => setTimeout(r, 1000));

// ------------------------------------------------------------------ veredictos
const d = (x: number): string => (Number.isFinite(x) ? x.toFixed(2) : String(x));
const problemas: string[] = [];

console.log('');
console.log('=== LAS GUARDAS, contra el contrato del item 105 ===');

{
  const dif = Math.abs(c1Db - LA_104_CON_ENVIO_ABIERTO_DBFS);
  const ok = dif <= C1_TOLERANCIA_DB;
  console.log(`\nC1 el tono llega a la consola: ${d(c1Db)} dBFS con el envio abierto, `
    + `contra ${LA_104_CON_ENVIO_ABIERTO_DBFS} de la 104 (difiere ${d(dif)}, tope ${C1_TOLERANCIA_DB})`);
  console.log(ok ? '   PASA.' : '   FALLA. O el tono no esta entrando a la consola --la salida por '
    + 'omision de la Mac no es la interfaz-- o el banco no es el mismo.');
  if (!ok) problemas.push('C1');
}
{
  console.log(`\nC2 el mute del canal corta el auxiliar: ${d(c1Db)} -> ${d(c2Db)} dBFS `
    + `(cayo ${d(c1Db - c2Db)} dB)`);
  console.log(muteCortaElAuxiliar
    ? '   SI. El envio es pre-fader, y ademas resulta POST-mute. E2 separa algo.'
    : '   NO. El envio es pre-fader Y pre-mute: mutear el canal no lo saca del bus '
      + 'auxiliar, asi que E2 NO separa nada y las filas que lo usan no valen.');
  console.log('   Esto no se sabia: el proyecto tenia medido `post`, nunca la relacion con el mute.');
}
{
  const dif = Math.abs(L.E0!.auxDb - LA_104_MIDIO_DBFS);
  const ok = dif <= G1_TOLERANCIA_DB;
  console.log(`\nG1 E0 reproduce la 104: ${d(L.E0!.auxDb)} dBFS contra ${LA_104_MIDIO_DBFS} `
    + `(difiere ${d(dif)}, tope ${G1_TOLERANCIA_DB})`);
  console.log(ok ? '   PASA.' : '   FALLA. El banco no es el mismo, asi que ninguna de las otras '
    + 'lecturas significa nada.');
  if (!ok) problemas.push('G1');
}
{
  const m = L.E0!.margenAuxDb;
  const ok = m >= G2_MARGEN_MINIMO_DB;
  console.log(`\nG2 la caida maxima observable alcanza: margen de ${d(m)} dB en E0 `
    + `(minimo ${G2_MARGEN_MINIMO_DB})`);
  console.log(ok ? `   PASA. Una caida de hasta ${d(m)} dB es observable.`
    : `   FALLA. Con ${d(m)} dB de margen, una caida de mas de eso NO PUEDE OCURRIR: `
      + 'la fila «cae» es inalcanzable por aritmetica y el guion estaria obligado a '
      + 'imprimir «queda» diga lo que diga la fisica.');
  if (!ok) problemas.push('G2');
}
{
  const c1g = L.E0!.generalDb - L.E1!.generalDb;
  const c2g = L.E0!.generalDb - L.E2!.generalDb;
  const ok = c1g > CAE_DB && c2g > CAE_DB;
  console.log(`\nG3 el testigo del general: E0 ${d(L.E0!.generalDb)} -> E1 ${d(L.E1!.generalDb)} `
    + `(cayo ${d(c1g)}), E2 ${d(L.E2!.generalDb)} (cayo ${d(c2g)})`);
  console.log(ok ? '   PASA. Los dos mutes llegaron y se notan donde tienen que notarse.'
    : '   FALLA. Un mute no llego o no hace lo que se cree, asi que el estado que lo usa '
      + 'no saca del camino lo que el contrato dice que saca.');
  if (!ok) problemas.push('G3');
}
{
  const ok = L.E3!.auxDb < G4_PISO_DBFS;
  console.log(`\nG4 E3 baja al piso: ${d(L.E3!.auxDb)} dBFS (tope ${G4_PISO_DBFS}), medido `
    + 'con la consola como en E0');
  console.log(ok ? '   PASA. Con el tono apagado no queda 1 kHz.'
    : '   FALLA. Hay una fuente de 1 kHz que NO es el tono de este guion.');
  if (!ok) problemas.push('G4');
}
{
  const r = [L.E0!, L.E1!, L.E2!, L.E3!].some((x) => x.recorta);
  if (r) { console.log('\nRECORTE en alguna captura: el bin esta falseado.'); problemas.push('recorte'); }
}

console.log('');
if (problemas.length > 0) {
  console.log(`=== NO SE IMPRIME VEREDICTO: fallaron ${problemas.join(', ')} ===`);
  console.log('   El contrato dice que una guarda que falla ABORTA. Un veredicto sobre una');
  console.log('   cadena de medicion rota es peor que no tener veredicto: se ve igual de');
  console.log('   sereno y es falso. Arreglar lo que fallo y volver a correr.');
  process.exitCode = 1;
} else {
  const caida = (x: Lectura): number => L.E0!.auxDb - x.auxDb;
  const clasificar = (c: number): 'cae' | 'queda' | 'no se decide' | 'SUBE' =>
    (c < -QUEDA_DB ? 'SUBE' : c > CAE_DB ? 'cae' : c < QUEDA_DB ? 'queda' : 'no se decide');
  const k1 = caida(L.E1!); const k2 = caida(L.E2!);
  const v1 = clasificar(k1); const v2 = clasificar(k2);
  console.log('=== EL VEREDICTO ===');
  console.log(`   E1 ${v1} (${d(k1)} dB), E2 ${v2} (${d(k2)} dB)`);
  console.log(`   umbrales declarados antes de mirar: cae > ${CAE_DB}, queda < ${QUEDA_DB}`);
  if (v1 === 'SUBE' || v2 === 'SUBE') {
    console.log('   => ANOMALIA: mutear SUBIO el nivel de 1 kHz en el auxiliar. Eso no es');
    console.log('      «queda»: es un hallazgo, y esta corrida no lo explica.');
  } else if (muteCortaElAuxiliar === false && v1 !== 'cae') {
    console.log('   => SOLO SE INFORMA E1, y E1 no cayo. C2 mostro que el mute del canal no');
    console.log('      esta en el camino del auxiliar, asi que E2 no separa nada.');
  } else if (v1 === 'cae' && v2 === 'cae') {
    console.log('   => LA FUGA ENTRA POR EL CAMINO DEL GENERAL. Dos candidatos que esta');
    console.log('      corrida NO separa: diafonia de la entrada 1 a la entrada 2 adentro de');
    console.log('      la Scarlett, o diafonia del bus general al auxiliar adentro de la');
    console.log('      consola. Separarlos pide desenchufar el cable de la entrada 1.');
  } else if (v1 === 'queda' && v2 === 'cae') {
    console.log('   => LA FUGA ES DE LA CONSOLA: la tira le llega al bus auxiliar sin pasar');
    console.log('      por el envio. Es una propiedad del aparato, no del banco.');
  } else if (v1 === 'queda' && v2 === 'queda') {
    console.log('   => LA FUGA ES ANTERIOR AL MUTE DEL CANAL. Dos candidatos que esta corrida');
    console.log('      NO separa: la salida de la interfaz cruzandose a su propia entrada 2,');
    console.log('      o la etapa de entrada de la consola.');
  } else if (v1 === 'cae' && v2 === 'queda') {
    console.log('   => CONTRADICTORIO, y es un hallazgo y no un veredicto: mutear el canal');
    console.log('      saca el tono tambien del general, asi que si E1 cae, E2 tiene que');
    console.log('      caer. Lo que falla es lo que se cree de `i.' + n + '.mute`.');
  } else {
    console.log('   => NO SE DECIDE. Alguna caida quedo en la banda muerta que el contrato');
    console.log('      declaro antes de mirar. No se elige el que convenga.');
  }
}

console.log('');
console.log('=== LO QUE ESTA CORRIDA NO DICE ===');
console.log('   Nada sobre otras frecuencias: un tono, 1 kHz.');
console.log('   Nada sobre si la fuga es coherente o incoherente: el bin da amplitud');
console.log('   y no fase, y sin fase no se sabe como se suma.');
console.log('   Nada sobre el auxiliar 3 ni sobre el bloque de efectos.');
console.log('   En dos de las cuatro filas NO dice cual de los dos candidatos.');

console.log('');
console.log('=== G5 RESTAURACION, RELEIDA POR HTTP ===');
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
  console.log(bien ? '   Todo restaurado, comprobado por un camino distinto del que escribio.'
    : '   HAY CLAVES SIN RESTAURAR. Revisar la consola antes de seguir.');
  if (!bien) process.exitCode = 1;
}
await t.desconectar();
