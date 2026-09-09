/**
 * Escritura directa a la consola, para medir. **No es la aplicación.**
 *
 * La aplicación está en nivel OBSERVE y no escribe: toda escritura suya tiene
 * que pasar por el Safety Engine con su invariante, y saltearlo por comodidad
 * rompería lo único que sostiene el resto del proyecto. Esto es un script de
 * spike, con la misma autoridad que tiene una persona tocando en `mixer.html`,
 * y existe porque hay criterios que **exigen** escribir: el eco de las
 * escrituras propias —criterio 3 de SPK-P0.1— y puentear el procesamiento de
 * un canal para poder medir su medidor sin un compresor en el medio.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-10b-vu/escribir.ts i.9.dyn.bypass=1 i.9.gate.enabled=0
 *   node --experimental-strip-types tools/spikes/p0-10b-vu/escribir.ts --leer i.9.dyn.bypass i.9.gate.enabled
 *
 * **Siempre imprime el valor anterior antes de escribir.** Sin eso no hay
 * vuelta atrás, y quien mide el equipo de otro tiene que poder dejarlo como lo
 * encontró.
 */
import { Ui24rTransport, codificarSetd } from '@vse/mixer-adapter';

const MAQUINA = process.env['VSE_CONSOLA'] ?? '192.168.0.78';
const soloLeer = process.argv.includes('--leer');
const args = process.argv.slice(2).filter((a) => a !== '--leer');

if (args.length === 0) {
  console.error('faltan rutas. Ejemplo: i.9.dyn.bypass=1');
  process.exit(2);
}

const pedidos = args.map((a) => {
  const [ruta, valor] = a.split('=');
  return { ruta: ruta!, valor: valor === undefined ? null : Number(valor) };
});

const t = new Ui24rTransport();
const estado = new Map<string, number>();
/** Marcas de tiempo del eco, por ruta y valor, para el criterio 3. */
const ecos: { ruta: string; valor: number; msDesdeElEnvio: number }[] = [];
const enviadas = new Map<string, { valor: number; enMs: number }>();

t.alRecibir((linea) => {
  if (!linea.startsWith('SETD^')) return;
  const [, ruta, crudo] = linea.split('^');
  if (ruta === undefined) return;
  const valor = Number(crudo);
  estado.set(ruta, valor);

  const pendiente = enviadas.get(ruta);
  if (pendiente !== undefined && Math.abs(pendiente.valor - valor) < 1e-9) {
    ecos.push({ ruta, valor, msDesdeElEnvio: Date.now() - pendiente.enMs });
    enviadas.delete(ruta);
  }
});

await t.conectar(MAQUINA);
// El volcado entero llega solo al conectar; hay que dejarlo terminar para
// poder informar el valor anterior de cada ruta.
await new Promise((r) => setTimeout(r, 4000));

console.log('valores antes de tocar nada:');
for (const { ruta } of pedidos) {
  const actual = estado.get(ruta);
  console.log(`  ${ruta.padEnd(28)} = ${actual === undefined ? '(no llego en el volcado)' : actual}`);
}

if (!soloLeer) {
  console.log('');
  console.log('escribiendo:');
  for (const { ruta, valor } of pedidos) {
    if (valor === null || Number.isNaN(valor)) {
      console.log(`  ${ruta}: sin valor, se saltea`);
      continue;
    }
    enviadas.set(ruta, { valor, enMs: Date.now() });
    t.enviar(codificarSetd(ruta, valor));
    console.log(`  ${ruta.padEnd(28)} <- ${valor}`);
    // Espaciadas: la consola no confirma, y un lote a fondo se parece a una
    // avalancha de cambios externos para cualquier otro cliente conectado.
    await new Promise((r) => setTimeout(r, 150));
  }

  await new Promise((r) => setTimeout(r, 1500));

  console.log('');
  console.log('eco de las escrituras propias (criterio 3 de SPK-P0.1):');
  for (const { ruta, valor } of pedidos) {
    const eco = ecos.find((e) => e.ruta === ruta);
    const leido = estado.get(ruta);
    console.log(
      `  ${ruta.padEnd(28)} ${eco === undefined ? 'SIN ECO' : `eco en ${eco.msDesdeElEnvio} ms`}`
      + ` · valor ahora ${leido}`
      + (leido !== undefined && valor !== null && Math.abs(leido - valor) > 1e-9 ? '  <-- NO QUEDO' : ''),
    );
  }
}

await t.desconectar();
