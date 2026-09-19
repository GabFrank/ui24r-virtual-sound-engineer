/**
 * ¿Cuándo termina la consola de contar cómo está, y aguanta el plazo que usamos?
 *
 * **La pregunta, y por qué no es teórica.** Al conectarse, la consola manda su
 * estado entero: miles de líneas seguidas. El adaptador da ese volcado por
 * terminado cuando pasan **`quietudVolcadoMs` = 250 ms sin una línea de estado**,
 * y mientras dura no anuncia los cambios como ajenos —si lo hiciera, cada
 * conexión abriría una alerta de cambio masivo—.
 *
 * Ese plazo tiene una hipótesis adentro que nadie midió en esta consola: **que el
 * volcado no tiene huecos internos de más de 250 ms**. Si los tiene, el adaptador
 * lo corta antes de tiempo y **lee el resto del volcado como si alguien hubiera
 * cambiado cien parámetros a mano**. El criterio 13 de la auditoría externa lo
 * dejó abierto con un dato de otro modelo: la Ui16 tardó de 0,2 a 0,55 s, y
 * **una vez 12 s**.
 *
 * **Lo que se mide, y es más que «cuánto tarda».** Por cada conexión:
 *
 * - cuándo llega la primera línea de estado y cuándo la última;
 * - **el hueco más grande entre dos líneas de estado consecutivas**, que es el
 *   número que decide si 250 ms alcanza. Un volcado largo y parejo es inofensivo;
 *   uno corto con una pausa de 300 ms en el medio rompe la suposición;
 * - si existe alguna línea que sirva de marcador de fin, que es lo que haría
 *   innecesario el plazo.
 *
 * **No escribe nada.** Conecta, escucha, se desconecta. Es lo que hace cualquier
 * cliente al abrir la mesa, diez veces.
 *
 * ## Trabajo previo
 *
 * **No hay coincidencias en otros proyectos.** Se buscó en los cuatro que hablan
 * este protocolo y en los foros del fabricante: ninguno documenta el fin del
 * volcado ni un marcador. Todos asumen que el estado «ya llegó» cuando lo
 * necesitan. Que no haya precedente significa más cuidado con lo que se concluya
 * de una consola, un firmware y un día.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-1/fin-del-volcado.ts 192.168.0.78 10
 */
import { Ui24rTransport } from '@vse/mixer-adapter';
import { argIndice, argTexto } from '../argumentos.ts';

const maquina = argTexto(2, '192.168.0.78');
const CONEXIONES = argIndice(3, 'conexiones', 10, { desde: 1, hasta: 30 });

/** El plazo que el adaptador usa hoy. Es lo que esta corrida pone a prueba. */
const QUIETUD_DEL_ADAPTADOR_MS = 250;
/** Cuánto se escucha por conexión antes de cerrar. */
const ESCUCHA_MS = 9000;
/**
 * Un silencio de estado más largo que esto se considera «el volcado terminó».
 *
 * **Es generoso a propósito, y por eso la medición vale.** Si fuera parecido a
 * los 250 ms del adaptador, esta corrida no podría distinguir un hueco interno de
 * un fin de volcado: estaría suponiendo la respuesta. Con 3 s, un hueco de 300 ms
 * cuenta como hueco --que es lo que hay que detectar-- y no como final.
 */
const SILENCIO_QUE_CIERRA_MS = 3000;

/** Las líneas que cuentan como estado. `RTA` y `VU2` son telemetría, no estado. */
const esEstado = (l: string): boolean => l.startsWith('SETD^') || l.startsWith('SETS^');

interface Corrida {
  readonly primera: number;
  readonly ultima: number;
  readonly lineas: number;
  readonly huecoMayor: number;
  readonly dondeElHueco: number;
  readonly verbos: ReadonlySet<string>;
}

async function unaConexion(): Promise<Corrida> {
  const t = new Ui24rTransport();
  const llegadas: number[] = [];
  const verbos = new Set<string>();
  let t0 = 0;
  t.alRecibir((l) => {
    const v = l.split('^')[0] ?? '';
    verbos.add(v.slice(0, 24));
    if (esEstado(l)) llegadas.push(Date.now() - t0);
  });
  t0 = Date.now();
  await t.conectar(maquina);
  await new Promise((r) => { setTimeout(r, ESCUCHA_MS); });
  await t.desconectar();

  if (llegadas.length === 0) {
    throw new Error(`la conexion a ${maquina} no trajo una sola linea de estado en `
      + `${ESCUCHA_MS} ms. Una consola viva manda miles: esto no es un volcado corto, `
      + `es una lectura fallida, y publicarla como «0 ms» seria inventar.`);
  }

  // El fin del volcado: la última línea antes de un silencio largo de estado.
  let fin = llegadas.length - 1;
  for (let i = 1; i < llegadas.length; i++) {
    if (llegadas[i]! - llegadas[i - 1]! > SILENCIO_QUE_CIERRA_MS) { fin = i - 1; break; }
  }
  let huecoMayor = 0;
  let dondeElHueco = 0;
  for (let i = 1; i <= fin; i++) {
    const h = llegadas[i]! - llegadas[i - 1]!;
    if (h > huecoMayor) { huecoMayor = h; dondeElHueco = llegadas[i - 1]!; }
  }
  return {
    primera: llegadas[0]!, ultima: llegadas[fin]!, lineas: fin + 1,
    huecoMayor, dondeElHueco, verbos,
  };
}

console.log(`=== FIN DEL VOLCADO EN ${maquina}, ${CONEXIONES} CONEXIONES ===`);
console.log('');
console.log(`   el adaptador da el volcado por terminado con ${QUIETUD_DEL_ADAPTADOR_MS} ms`);
console.log('   sin lineas de estado. Lo que decide si alcanza es el HUECO MAYOR.');
console.log('');
console.log('   #  | 1a linea | ultima  | lineas | hueco mayor | a los');
console.log('   ---|----------|---------|--------|-------------|-------');

const corridas: Corrida[] = [];
for (let i = 1; i <= CONEXIONES; i++) {
  const c = await unaConexion();
  corridas.push(c);
  const alerta = c.huecoMayor >= QUIETUD_DEL_ADAPTADOR_MS ? '  <-- PASA EL PLAZO' : '';
  console.log(`   ${String(i).padStart(2)} | ${String(c.primera).padStart(6)} ms `
    + `| ${String(c.ultima).padStart(5)} ms | ${String(c.lineas).padStart(6)} `
    + `| ${String(c.huecoMayor).padStart(8)} ms | ${String(c.dondeElHueco).padStart(5)} ms`
    + alerta);
  await new Promise((r) => { setTimeout(r, 500); });
}

const duraciones = corridas.map((c) => c.ultima);
const huecos = corridas.map((c) => c.huecoMayor);
const lineas = corridas.map((c) => c.lineas);
const max = (xs: number[]): number => Math.max(...xs);
const min = (xs: number[]): number => Math.min(...xs);
const mediana = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

console.log('');
console.log('=== RESUMEN ===');
console.log(`   duracion del volcado: mediana ${mediana(duraciones)} ms, `
  + `min ${min(duraciones)}, max ${max(duraciones)}`);
console.log(`   lineas de estado:     mediana ${mediana(lineas)}, `
  + `min ${min(lineas)}, max ${max(lineas)}`);
console.log(`   HUECO MAYOR:          mediana ${mediana(huecos)} ms, `
  + `min ${min(huecos)}, max ${max(huecos)}`);
console.log('');

const peor = max(huecos);
const margen = QUIETUD_DEL_ADAPTADOR_MS - peor;
if (peor >= QUIETUD_DEL_ADAPTADOR_MS) {
  console.log(`   EL PLAZO NO ALCANZA. El peor hueco fue ${peor} ms contra un plazo de `
    + `${QUIETUD_DEL_ADAPTADOR_MS}.`);
  console.log('   El adaptador corta el volcado a la mitad y lee el resto como cambio ajeno.');
  process.exitCode = 1;
} else {
  console.log(`   El plazo aguanta: el peor hueco fue ${peor} ms y el plazo es `
    + `${QUIETUD_DEL_ADAPTADOR_MS}, o sea ${margen} ms de margen.`);
  console.log(`   ES UNA COTA SOBRE ${CONEXIONES} CONEXIONES, no una garantia: la Ui16 tardo`);
  console.log('   una vez 12 s, y eso no se ve repitiendo diez veces en un rato tranquilo.');
}

const todos = new Set<string>();
for (const c of corridas) for (const v of c.verbos) todos.add(v);
console.log('');
console.log(`   verbos vistos: ${[...todos].sort().join(', ')}`);
console.log('   Si alguno fuera un marcador de fin, el plazo sobraria. Buscarlo aca es');
console.log('   la unica forma barata de descartarlo.');
