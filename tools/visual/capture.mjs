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

// Tablet en horizontal: es como se usa en escenario, y es el tamaño con el
// que se capturan los escenarios de la consola.
const VIEWPORT = { width: 1280, height: 800 };

// Tamaños con los que se revisa que la interfaz responda. No son modelos
// concretos: son los anchos donde el diseño cambia de forma.
// El alto es deliberadamente grande: el contenido de la aplicación se
// desplaza dentro de su propia caja, no en el cuerpo de la página, así que la
// captura de página completa no lo alcanza. Se agranda la ventana en su lugar.
const TAMANIOS = [
  { id: 'telefono', width: 390, height: 2600 },
  { id: 'tablet-vertical', width: 834, height: 2400 },
  { id: 'tablet', width: 1280, height: 2200 },
];

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
  // La galería del sistema de diseño solo existe en la compilación de
  // desarrollo, así que las capturas se hacen sobre esa. Es el mismo código:
  // lo único que cambia es que no se optimiza y que `isDevMode()` es cierto.
  if (!existsSync(DIST)) {
    console.error(`No existe ${DIST}. Ejecutar primero: npm run build:dev -w mobile`);
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

  await pagina.goto(`http://localhost:${PUERTO_WEB}/#/consola`, { waitUntil: 'networkidle' });
  await abrirControl();
  await esperar(500);
  await capturar('01-sin-conexion', 'pantalla inicial, sin conexión');

  // La dirección de la consola es un ajuste, no una acción de la pantalla de
  // telemetría: se configura una vez y desde un solo sitio.
  await pagina.goto(`http://localhost:${PUERTO_WEB}/#/ajustes`, { waitUntil: 'networkidle' });
  await pagina.fill('#aj-host', `ws://localhost:${PUERTO_SIM}`);
  await pagina.click('ui-card[titulo="Consola"] ui-button button');
  await esperar(1200);
  await pagina.goto(`http://localhost:${PUERTO_WEB}/#/consola`, { waitUntil: 'networkidle' });
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

  await pagina.click('app-paro-boton.flotante button');
  await esperar(500);
  await capturar('08-paro-emergencia', 'paro de emergencia activo, escrituras bloqueadas');

  await pagina.click('app-paro-banda button');
  await esperar(500);
  await capturar('09-rearmado', 'rearmado tras el paro');

  // --- Asignación de canales y asistente de ganancia ---

  await pagina.goto(`http://localhost:${PUERTO_WEB}/#/sesion/canales`, { waitUntil: 'networkidle' });
  await esperar(400);
  await capturar('10-canales-sin-asignar', 'canales de la consola, todavía sin asignar');

  await pagina.click('ui-page-header ui-button button');
  await esperar(600);
  await capturar('11-canales-propuestos', 'tipos propuestos desde el nombre que ya tiene cada canal');

  await pagina.goto(`http://localhost:${PUERTO_WEB}/#/sesion/ganancia`, { waitUntil: 'networkidle' });
  await esperar(400);
  await capturar('12-ganancia-sin-medir', 'asistente de ganancia antes de medir');

  // La captura dura dieciocho segundos más tres de cuenta regresiva.
  await pagina.click('table tbody tr:first-child ui-button button');
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

  // --- Actualización dentro de la aplicación (ADR-020) ---
  //
  // El catálogo de GitHub se responde desde acá en vez de salir a la red: así
  // la captura es la misma todos los días y se puede provocar el caso que se
  // quiere ver. Es exactamente lo mismo que hace el simulador con el
  // protocolo de la consola, y vale la misma advertencia: esto prueba la
  // aplicación, no que GitHub conteste lo que suponemos.
  const RELEASES = /api\.github\.com\/repos\/.*\/releases/;
  const publicacion = (tag) => ({
    tag_name: tag,
    name: tag,
    body: `## Novedades\n\n- Asistente de ganancia con promedio energético.\n- Corrección del signo en la propuesta.`,
    draft: false,
    prerelease: false,
    published_at: '2026-09-08T12:00:00Z',
    assets: [
      {
        name: `vse-${tag.slice(1)}.apk`,
        size: 27_500_000,
        browser_download_url: `https://github.com/GabFrank/ui24r-virtual-sound-engineer/releases/download/${tag}/vse.apk`,
      },
      {
        name: `vse-${tag.slice(1)}.apk.sha256`,
        size: 82,
        browser_download_url: `https://github.com/GabFrank/ui24r-virtual-sound-engineer/releases/download/${tag}/vse.apk.sha256`,
      },
    ],
  });

  const responderCatalogo = async (cuerpo, estado = 200) => {
    await pagina.unroute(RELEASES).catch(() => {});
    await pagina.route(RELEASES, (ruta) =>
      ruta.fulfill({ status: estado, contentType: 'application/json', body: JSON.stringify(cuerpo) }),
    );
  };

  await responderCatalogo([publicacion('v0.2.0'), publicacion('v0.1.1')]);

  // Primero conectado, que es el caso que hay que ver: INV-034 no deja
  // actualizar mientras la aplicación está trabajando contra la consola.
  await pagina.goto(`http://localhost:${PUERTO_WEB}/#/ajustes/actualizacion`, { waitUntil: 'networkidle' });
  await esperar(300);
  await capturar('16-actualizacion-inicial', 'pestaña de actualización antes de consultar');

  await pagina.click('ui-page-header ui-button button');
  await pagina.waitForSelector('.bloqueos li', { timeout: 5000 });
  await esperar(300);
  await capturar('17-actualizacion-bloqueada', 'INV-034: conectado a la consola, no se actualiza');

  // Volver a cargar deja la aplicación desconectada, que es el momento en que
  // corresponde actualizar. Hace falta `reload` y no solo `goto`: cambiar el
  // fragmento de la dirección no recarga el documento, así que la conexión con
  // el simulador sobreviviría y el bloqueo de INV-034 seguiría activo.
  await pagina.goto(`http://localhost:${PUERTO_WEB}/#/ajustes/actualizacion`, { waitUntil: 'networkidle' });
  await pagina.reload({ waitUntil: 'networkidle' });
  await esperar(300);

  await responderCatalogo([]);
  await pagina.click('ui-page-header ui-button button');
  await pagina.waitForSelector('.nota.ok, .nota.aviso', { timeout: 5000 });
  await esperar(300);
  await capturar('18-actualizacion-al-dia', 'no hay ninguna versión más nueva publicada');

  // Sin el permiso del sistema no hay botón de descargar, y es lo que se ve la
  // primera vez en la tablet.
  await responderCatalogo([publicacion('v0.2.0'), publicacion('v0.1.1')]);
  await pagina.click('ui-page-header ui-button button');
  await pagina.waitForSelector('.novedad', { timeout: 5000 });
  await esperar(300);
  await capturar('19-actualizacion-sin-permiso', 'versión disponible, falta el ajuste del sistema');

  await pagina.evaluate(() => localStorage.setItem('vse.web.permiso', 'si'));
  await pagina.click('ui-page-header ui-button button');
  await pagina.waitForSelector('.novedad ui-button button.primario', { timeout: 5000 });
  await pagina.click('details summary');
  await esperar(300);
  await capturar('20-actualizacion-disponible', 'versión disponible, con sus novedades');

  // Una publicación con etiqueta de pre-lanzamiento se descarta aunque la
  // casilla de GitHub no esté marcada.
  await responderCatalogo([publicacion('v0.3.0-rc.1')]);
  await pagina.click('ui-page-header ui-button button');
  await pagina.waitForSelector('.nota.ok', { timeout: 5000 });
  await esperar(300);
  await capturar('21-prelanzamiento-descartado', 'una etiqueta rc no se ofrece como actualización');

  // --- Las pantallas de la consola en teléfono ---
  //
  // Son las tres que muestran tablas densas, y son las que peor se llevan con
  // un ancho de 390 píxeles: ahí la tabla se sustituye por una lista de
  // tarjetas. Sin estas capturas, esa sustitución no se revisa nunca.
  {
    const tel = await contexto.newPage();
    await tel.setViewportSize({ width: 390, height: 1400 });
    await tel.goto(`http://localhost:${PUERTO_WEB}/#/ajustes`, { waitUntil: 'networkidle' });
    await tel.fill('#aj-host', `ws://localhost:${PUERTO_SIM}`);
    await tel.click('ui-card[titulo="Consola"] ui-button button');
    await esperar(1500);

    const capturarTel = async (nombre, descripcion) => {
      await esperar(400);
      await tel.screenshot({ path: join(OUT, `${nombre}.png`) });
      console.log(`  ✓ ${nombre}.png — ${descripcion}`);
    };

    await tel.goto(`http://localhost:${PUERTO_WEB}/#/consola`, { waitUntil: 'networkidle' });
    await esperar(1200);
    await capturarTel('tel-01-consola', 'telemetría en teléfono: tarjetas en vez de tabla');

    await tel.goto(`http://localhost:${PUERTO_WEB}/#/sesion/canales`, { waitUntil: 'networkidle' });
    await tel.click('ui-page-header ui-button button');
    await esperar(600);
    await capturarTel('tel-02-canales', 'asignación de canales en teléfono');

    await tel.goto(`http://localhost:${PUERTO_WEB}/#/sesion/ganancia`, { waitUntil: 'networkidle' });
    await esperar(500);
    await capturarTel('tel-03-ganancia', 'asistente de ganancia en teléfono');

    await tel.close();
  }

  // --- Sistema de diseño, en los tres anchos donde cambia la forma ---
  //
  // Se capturan aparte de los escenarios de la consola porque contestan otra
  // pregunta: no si la aplicación entiende el protocolo, sino si se puede
  // leer y tocar en el tamaño de pantalla que haya.
  for (const t of TAMANIOS) {
    const p2 = await contexto.newPage();
    await p2.setViewportSize({ width: t.width, height: t.height });
    await p2.goto(`http://localhost:${PUERTO_WEB}/#/diseno`, { waitUntil: 'networkidle' });
    await esperar(500);
    const ruta = join(OUT, `ds-${t.id}.png`);
    await p2.screenshot({ path: ruta, fullPage: true });
    console.log(`  ✓ ds-${t.id}.png — sistema de diseño a ${t.width} px`);
    await p2.close();
  }

  await navegador.close();
  console.log(`\nCapturas en ${OUT}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
