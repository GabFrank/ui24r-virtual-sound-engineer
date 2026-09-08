#!/usr/bin/env node
/**
 * Recorre los escenarios del simulador y captura una imagen de cada uno.
 *
 * Lee la advertencia del README: esto valida la aplicación, no el protocolo.
 */

import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import { mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..', '..');
const OUT = join(AQUI, 'out');
const DIST = join(RAIZ, 'apps', 'mobile', 'dist', 'mobile', 'browser');

const PUERTO_SIM = 8765;
const PUERTO_WEB = 4321;

// Tablet en horizontal: es como se usa en escenario.
const VIEWPORT = { width: 1280, height: 800 };

const procesos = [];

function lanzar(nombre, comando, args, opciones = {}) {
  const p = spawn(comando, args, { cwd: RAIZ, stdio: ['ignore', 'pipe', 'pipe'], ...opciones });
  p.stdout.on('data', (d) => process.stdout.write(`[${nombre}] ${d}`));
  p.stderr.on('data', (d) => process.stderr.write(`[${nombre}] ${d}`));
  procesos.push(p);
  return p;
}

function limpiar() {
  for (const p of procesos) { try { p.kill('SIGTERM'); } catch { /* ya murió */ } }
}
process.on('exit', limpiar);
process.on('SIGINT', () => { limpiar(); process.exit(1); });

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * ¿Hay algo escuchando en ese puerto?
 *
 * Si una ejecución anterior dejó el simulador vivo, se reutiliza en vez de
 * intentar levantar otro y morir con el puerto ocupado.
 */
function puertoOcupado(puerto) {
  return new Promise((resolve) => {
    const s = connect({ port: puerto, host: '127.0.0.1' });
    s.on('connect', () => { s.destroy(); resolve(true); });
    s.on('error', () => resolve(false));
    setTimeout(() => { s.destroy(); resolve(false); }, 500);
  });
}

async function main() {
  if (!existsSync(DIST)) {
    console.error(`No existe ${DIST}. Ejecutar primero: npm run build -w mobile`);
    process.exit(1);
  }
  mkdirSync(OUT, { recursive: true });

  if (await puertoOcupado(PUERTO_SIM)) {
    console.log(`  · reutilizando el simulador que ya escucha en ${PUERTO_SIM}`);
  } else {
    lanzar('sim', 'node', ['tools/mixer-sim/src/server.mjs', '--port', String(PUERTO_SIM)]);
  }
  if (await puertoOcupado(PUERTO_WEB)) {
    console.log(`  · reutilizando el servidor web que ya escucha en ${PUERTO_WEB}`);
  } else {
    lanzar('web', 'npx', ['--yes', 'http-server', DIST, '-p', String(PUERTO_WEB), '-s', '--cors']);
  }
  await esperar(4000);

  // El entorno trae un Chromium preinstalado que puede no coincidir con la
  // versión que Playwright espera. Se usa el que hay en vez de descargar otro.
  const navegador = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const contexto = await navegador.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    colorScheme: 'dark',
  });
  const pagina = await contexto.newPage();

  pagina.on('console', (m) => {
    if (m.type() === 'error') console.error(`[app] ${m.text()}`);
  });
  pagina.on('pageerror', (e) => console.error(`[app] excepción: ${e.message}`));

  const capturar = async (nombre, descripcion) => {
    const ruta = join(OUT, `${nombre}.png`);
    await pagina.screenshot({ path: ruta, fullPage: false });
    console.log(`  ✓ ${nombre}.png — ${descripcion}`);
    return ruta;
  };

  // Canal de control hacia el simulador, para provocar escenarios. Vive en la
  // página, no como referencia cruzada, porque la página navega y una
  // referencia al objeto quedaría huérfana.
  const abrirControl = async () => {
    await pagina.evaluate(async (puerto) => {
      const ws = new WebSocket(`ws://localhost:${puerto}`);
      await new Promise((r) => { ws.onopen = r; });
      globalThis.__simControl = ws;
    }, PUERTO_SIM);
  };

  const escenario = async (nombre) => {
    await pagina.evaluate((n) => {
      globalThis.__simControl.send(`!scenario ${n}`);
    }, nombre);
  };

  console.log('\nCapturando escenarios:\n');

  await pagina.goto(`http://localhost:${PUERTO_WEB}/`, { waitUntil: 'networkidle' });
  await abrirControl();
  await esperar(500);
  await capturar('01-sin-conexion', 'pantalla inicial, sin conexión');

  await pagina.click('button.primario');
  await pagina.waitForSelector('table tbody tr', { timeout: 10000 });
  await esperar(1500);
  await capturar('02-telemetria', 'telemetría de doce canales con medidores en vivo');

  await escenario('clipping');
  await esperar(2500);
  await capturar('03-saturacion', 'un canal saturando: contador de clips y medidor en rojo');
  await escenario('clipping');

  await escenario('external-change');
  await esperar(800);
  await capturar('04-cambio-externo', 'cambio hecho desde otro dispositivo, detectado como ajeno');

  await escenario('fader-drag');
  await esperar(1200);
  await capturar('05-arrastre-fader', 'arrastre de fader: muchos mensajes, una sola ruta, sin alerta');

  await escenario('snapshot-recall');
  await esperar(800);
  await capturar('06-cambio-masivo', 'recuperación de instantánea detectada como avalancha');

  await pagina.click('.alerta button');
  await esperar(300);

  await escenario('vu-gap');
  await esperar(1200);
  await capturar('07-conexion-inestable', 'medidores cortados: la conexión pasa a inestable');
  await esperar(4000);

  await pagina.click('button.stop');
  await esperar(500);
  await capturar('08-paro-emergencia', 'paro de emergencia activo, escrituras bloqueadas');

  await pagina.click('.btn-rearme');
  await esperar(500);
  await capturar('09-rearmado', 'rearmado tras el paro');

  // --- Asignación de canales y asistente de ganancia ---

  await pagina.click('nav.pestanias button:nth-child(2)');
  await esperar(400);
  await capturar('10-canales-sin-asignar', 'canales de la consola, todavía sin asignar');

  await pagina.click('.cabecera button');
  await esperar(600);
  await capturar('11-canales-propuestos', 'tipos propuestos desde el nombre que ya tiene cada canal');

  await pagina.click('nav.pestanias button:nth-child(3)');
  await esperar(400);
  await capturar('12-ganancia-sin-medir', 'asistente de ganancia antes de medir');

  // La captura dura dieciocho segundos más tres de cuenta regresiva.
  await pagina.click('table tbody tr:first-child button.medir');
  await esperar(1500);
  await capturar('13-cuenta-regresiva', 'cuenta regresiva antes de capturar');
  await esperar(4000);
  await capturar('14-capturando', 'capturando la ventana del canal');
  await esperar(17000);
  // La explicación queda debajo de la tabla de doce canales: sin bajar, la
  // captura mostraría solo los números y no el porqué, que es lo importante.
  await pagina.evaluate(() => {
    document.querySelector('.recomendacion')?.scrollIntoView({ block: 'center' });
  });
  await esperar(400);
  await capturar('15-recomendacion', 'recomendación de ganancia con su porqué y su evidencia');

  await navegador.close();
  console.log(`\nCapturas en ${OUT}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
