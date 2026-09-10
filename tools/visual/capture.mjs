#!/usr/bin/env node
/**
 * Recorre los escenarios del simulador y captura una imagen de cada uno.
 *
 * Lee la advertencia del README: esto valida la aplicación, no el protocolo.
 */

import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import { mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
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

/**
 * Con qué navegador se captura.
 *
 * Estaba fijo en `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, que es
 * la ruta del contenedor donde se escribió esto. En una máquina que no sea ese
 * contenedor el script falla al arrancar, así que **las capturas se dejaban de
 * actualizar en vez de salir distintas**: el modo de fallo es que nadie las
 * corre, no que se vean mal.
 *
 * El orden es: lo que diga `CHROMIUM_PATH`, después el Chromium que instala
 * Playwright, después el Chrome del sistema, y si no hay ninguno se devuelve
 * `undefined` para que Playwright resuelva lo suyo y falle él, con su propio
 * mensaje, que explica cómo instalarlo mejor que cualquier cosa que pongamos
 * acá.
 *
 * **Un Chrome del sistema no es idéntico al Chromium de Playwright**: si algún
 * día una captura cambia sin que haya cambiado el código, esta es la primera
 * sospecha, y por eso se registra cuál se usó.
 */
function navegadorDisponible() {
  const candidatos = [
    process.env.CHROMIUM_PATH,
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    join(homedir(), 'Library/Caches/ms-playwright/chromium-1194/chrome-mac/Chromium.app/Contents/MacOS/Chromium'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  for (const c of candidatos) {
    if (existsSync(c)) {
      console.log(`  \u00b7 navegador: ${c}`);
      return c;
    }
  }
  console.log('  \u00b7 navegador: el que resuelva Playwright');
  return undefined;
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
    executablePath: navegadorDisponible(),
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

  /**
   * Deja la página conectada al simulador, venga como venga.
   *
   * La tarjeta «Consola» muestra «Conectar» **o** «Desconectar», nunca las dos,
   * así que no hay un solo botón que sirva para ambos casos: la primera página
   * llega desconectada y la segunda, que comparte el almacenamiento, ya se
   * conectó sola al cargar. Antes esto se resolvía clickeando «el primer
   * `ui-button` de la tarjeta», que en la segunda página era «Desconectar» --y
   * la dejaba sin consola sin que nada fallara.
   *
   * Se espera al estado y no a un reloj: así el paso dice si salió bien en vez
   * de seguir de largo con la aplicación desconectada.
   */
  const conectarAlSimulador = async (p) => {
    await p.goto(`http://localhost:${PUERTO_WEB}/#/ajustes`, { waitUntil: 'networkidle' });
    await p.fill('#aj-host', `ws://localhost:${PUERTO_SIM}`);
    const conectar = p.locator('ui-card[titulo="Consola"] ui-button[variante="primario"] button');
    if (await conectar.count() > 0) await conectar.click();
    await p.waitForSelector('ui-card[titulo="Consola"] ui-button[variante="secundario"]', { timeout: 10000 });
  };

  console.log('\nCapturando escenarios:\n');

  await pagina.goto(`http://localhost:${PUERTO_WEB}/#/consola`, { waitUntil: 'networkidle' });
  await abrirControl();
  await esperar(500);
  await capturar('01-sin-conexion', 'pantalla inicial, sin conexión');

  // La dirección de la consola es un ajuste, no una acción de la pantalla de
  // telemetría: se configura una vez y desde un solo sitio.
  await conectarAlSimulador(pagina);
  await esperar(1200);
  await pagina.goto(`http://localhost:${PUERTO_WEB}/#/consola`, { waitUntil: 'networkidle' });
  await pagina.waitForSelector('table tbody tr', { timeout: 10000 });
  await esperar(1500);
  await capturar('02-telemetria', 'telemetría con medidores en vivo, un canal por entrada de la consola');

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
  // El simulador manda primero los faders y despues `var.currentSnapshot`, que
  // es un orden tan valido como el otro. La alerta tiene que terminar diciendo
  // que fue un recall: anunciarlo como un arrastre de faders cambia lo que el
  // usuario cree que conviene hacer.
  const textoAlerta = await pagina.textContent('.alerta');
  if (!/recuper[oó] una instant[aá]nea/i.test(textoAlerta ?? '')) {
    throw new Error(
      'la alerta de cambio masivo no reconoció el recall: ' +
      `"${textoAlerta?.trim().slice(0, 140)}"`,
    );
  }
  console.log('  · la alerta nombra la instantánea, no un arrastre de faders');
  await capturar('06-cambio-masivo', 'recuperación de instantánea detectada como avalancha');

  // Releer tiene que devolver el estado a valido de verdad, no solo cerrar el
  // cartel. Antes el boton decia "Entendido" y no habia ninguna relectura: un
  // recall dejaba el estado invalido -- y con el la posibilidad de escribir --
  // muerto por el resto del show.
  // Antes de releer, el estado tiene que estar sin confirmar: si ya estuviera
  // confirmado, lo de abajo no probaría nada.
  const antes = await pagina.textContent('[data-estado-confirmado]');
  if (!/sin confirmar/i.test(antes ?? '')) {
    throw new Error(`la avalancha no invalidó el estado: la insignia dice "${antes?.trim()}"`);
  }

  await pagina.click('.alerta ui-button:first-child button');
  await esperar(3000);

  // Lo que se comprueba es que el estado **vuelva a estar confirmado**, no que
  // el cartel desaparezca. El cartel lo apaga la propia función, sin mirar
  // nada: con `releerEstado()` vaciado a `return;` la comprobación anterior
  // pasaba igual, e imprimía su línea de éxito.
  const despues = await pagina.textContent('[data-estado-confirmado]');
  if (!/^\s*Estado confirmado/i.test(despues ?? '')) {
    throw new Error(
      `la relectura no devolvió el estado a confirmado: la insignia dice "${despues?.trim()}"`,
    );
  }
  const alertaSigue = await pagina.locator('.alerta').count();
  if (alertaSigue > 0) {
    throw new Error('el estado volvió a ser válido pero el cartel sigue puesto');
  }
  console.log('  · la relectura devuelve el estado a confirmado y despeja el cartel');
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

  // La asignación pertenece a la banda de la sesión, así que hace falta una
  // sesión abierta. Se crean los perfiles mínimos y se abre.
  await pagina.goto(`http://localhost:${PUERTO_WEB}/#/perfiles`, { waitUntil: 'networkidle' });
  await pagina.click('ui-page-header ui-button button');
  await pagina.waitForSelector('#banda-nombre');
  await pagina.fill('#banda-nombre', 'Los del Fondo');
  await pagina.click('.racimo-entre ui-button:last-child button');
  await pagina.waitForSelector('[data-perfil="bandas"]');
  await pagina.click('[data-perfil="locales"]');
  await pagina.click('ui-page-header ui-button button');
  await pagina.waitForSelector('#loc-nombre');
  await pagina.fill('#loc-nombre', 'Bar Central');
  await pagina.click('.racimo-entre ui-button:last-child button');
  await pagina.waitForSelector('[data-perfil="bandas"]');

  await pagina.goto(`http://localhost:${PUERTO_WEB}/#/sesion`, { waitUntil: 'networkidle' });
  await pagina.click('ui-empty ui-button button');
  await pagina.waitForSelector('#ses-banda');
  await pagina.click('ui-dialog [pie] ui-button:last-child button');
  await pagina.waitForSelector('[data-estado]');

  await pagina.goto(`http://localhost:${PUERTO_WEB}/#/sesion/canales`, { waitUntil: 'networkidle' });
  await esperar(400);
  await capturar('10-canales-sin-asignar', 'canales de la consola, todavía sin asignar');

  await pagina.click('ui-page-header ui-button button');
  await esperar(600);
  await capturar('11-canales-propuestos', 'tipos propuestos desde el nombre que ya tiene cada canal');

  // Las asignaciones tienen que sobrevivir a salir de la pantalla: viven en el
  // perfil de banda persistido, no en una señal suelta en memoria. Antes había
  // dos fuentes de verdad y la de la sesión estaba siempre vacía.
  await pagina.goto(`http://localhost:${PUERTO_WEB}/#/consola`, { waitUntil: 'networkidle' });
  await esperar(400);
  await pagina.goto(`http://localhost:${PUERTO_WEB}/#/sesion/canales`, { waitUntil: 'networkidle' });
  await esperar(600);
  const sobreviven = await pagina.evaluate(() => {
    // El perfil y no el primer desplegable de la fila. Desde que la pantalla
    // pregunta primero quien toca, el primero es el integrante, y una
    // asignacion propuesta desde el nombre del canal no tiene ninguno: esta
    // legitimamente vacia. Lo que la propuesta si llena es el perfil, que es
    // lo que esta comprobacion siempre quiso verificar.
    const primero = document.querySelector('tbody tr select[aria-label^="perfil"]');
    const encabezado = document.querySelector('ui-page-header p')?.textContent ?? '';
    return { valor: primero?.value ?? '(sin select)', encabezado: encabezado.trim().slice(0, 30) };
  });
  if (sobreviven.valor === '' || sobreviven.valor === '(sin select)') {
    throw new Error(
      `la asignación no sobrevivió a salir de la pantalla: el desplegable dice ` +
      `"${sobreviven.valor}" mientras el encabezado dice "${sobreviven.encabezado}"`,
    );
  }
  console.log(`  · la asignación sobrevive a salir de la pantalla (${sobreviven.valor})`);

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
  // La explicación queda debajo de la tabla de canales, que ocupa mas de una
  // pantalla: sin bajar, la
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

  // Se cierra la sesión antes de seguir: con una abierta, INV-034 bloquea la
  // actualización y las capturas siguientes mostrarían el bloqueo en vez de lo
  // que quieren mostrar. Es el comportamiento correcto, no un estorbo.
  await pagina.goto(`http://localhost:${PUERTO_WEB}/#/sesion`, { waitUntil: 'networkidle' });
  await pagina.click('ui-page-header ui-button button');
  await pagina.waitForSelector('ui-dialog[titulo="Cerrar la sesión"] [open]');
  await pagina.click('ui-dialog[titulo="Cerrar la sesión"] [pie] ui-button:last-child button');
  await esperar(600);

  // Volver a cargar deja la aplicación desconectada, que es el momento en que
  // corresponde actualizar. Hace falta `reload` y no solo `goto`: cambiar el
  // fragmento de la dirección no recarga el documento, así que la conexión con
  // el simulador sobreviviría y el bloqueo de INV-034 seguiría activo.
  //
  // **Y hace falta apagar la autoconexión, o recargar no alcanza.** Cerrar la
  // sesión y recargar dejaba la aplicación conectada de nuevo un segundo
  // después, porque al arrancar se reconecta sola al host guardado. Con eso,
  // INV-034 volvía a bloquear y las tres capturas siguientes mostraban el
  // bloqueo: la 19 salía rotulada «falta el ajuste del sistema» enseñando otra
  // cosa, y la 20 se caía esperando un botón que la pantalla nunca iba a
  // dibujar. **Así se cortaba el escenario en el veinte.**
  //
  // Vale la pena ver el modo de fallo: el paso que se rompió fue el que
  // esperaba algo que no llegó, pero el que quedó *mal* fue el anterior, que
  // esperaba un selector tan general que valía para las dos ramas. Una espera
  // que no distingue lo que quiere fotografiar no falla: saca la foto
  // equivocada.
  await pagina.evaluate(() => localStorage.setItem('vse.pref.autoconectar', 'no'));
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
  await pagina.waitForSelector('.novedad .nota.aviso', { timeout: 5000 });
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

  // --- El espectro y el aviso de realimentación ---
  //
  // Son las dos pantallas nuevas y son las que más fácil se rompen sin que
  // nadie lo note: el espectro es una fila de barras sin texto, así que un
  // error de orden, de escala o de altura no da ningún síntoma más que verse
  // raro. Por eso se capturan, y por eso el simulador manda un espectro con
  // forma en vez de silencio: contra ceros, la captura salía en blanco y no
  // revisaba nada.
  //
  // El diálogo de permiso se captura aparte del espectro porque es una decisión
  // del operador --le estamos pidiendo prestado el único analizador de la
  // consola-- y el texto que la explica es lo que hay que revisar.
  //
  // Se vuelve a encender la autoconexión, que se apagó para poder fotografiar
  // la pantalla de actualización: sin consola no hay analizador que pedir
  // prestado.
  await pagina.evaluate(() => localStorage.setItem('vse.pref.autoconectar', 'si'));
  await pagina.goto(`http://localhost:${PUERTO_WEB}/#/espectro`, { waitUntil: 'networkidle' });
  await pagina.reload({ waitUntil: 'networkidle' });
  await esperar(1500);
  await abrirControl();
  await pagina.waitForSelector('.permiso', { timeout: 5000 });
  await esperar(400);
  await capturar('22-analizador-permiso', 'pidiendo prestado el analizador, diciendo qué se va a ver y qué se restaura');

  // El escenario primero y el permiso después: el vigilante necesita ver la
  // banda sostenida durante medio segundo antes de avisar, así que si se
  // encendiera después de entrar, la primera captura saldría sin aviso.
  await escenario('realimentacion');
  await esperar(300);
  await pagina.click('.permiso ui-button[variante="primario"] button');
  await pagina.waitForSelector('.barras .barra', { timeout: 5000 });
  await esperar(400);
  await capturar('23-espectro', 'el espectro del general, con la banda colgada marcada');

  await pagina.waitForSelector('.alarma', { timeout: 8000 });
  await esperar(600);
  await capturar('24-realimentacion', 'aviso de realimentación: qué frecuencia, cuánto lleva y qué canales están abiertos');

  // Se sale de la pantalla dentro del escenario de capturas y no al final,
  // porque salir es lo que devuelve el analizador al operador. Si esto no
  // corriera, la captura siguiente se sacaría con el analizador todavía tomado
  // y el escenario estaría tapando justo el caso que más importa restaurar.
  await pagina.goto(`http://localhost:${PUERTO_WEB}/#/consola`, { waitUntil: 'networkidle' });
  await esperar(500);

  // --- Las pantallas de la consola en teléfono ---
  //
  // Son las tres que muestran tablas densas, y son las que peor se llevan con
  // un ancho de 390 píxeles: ahí la tabla se sustituye por una lista de
  // tarjetas. Sin estas capturas, esa sustitución no se revisa nunca.
  {
    const tel = await contexto.newPage();
    await tel.setViewportSize({ width: 390, height: 1400 });
    // **Acá se perdían tres capturas en silencio.** Esta página comparte el
    // almacenamiento con la anterior, así que hereda la dirección del simulador
    // y **se conecta sola al cargar**. Con la aplicación ya conectada la
    // tarjeta no dibuja «Conectar», y el selector viejo --el primer `ui-button`
    // de la tarjeta-- terminaba clickeando «Desconectar». Las tres capturas del
    // teléfono salían de una aplicación sin consola, con la lista de canales
    // vacía, y **ninguna fallaba**: `tel-01` fotografiaba una pantalla en
    // blanco y recién `tel-02` se caía, porque «Proponer todos» estaba apagado.
    await conectarAlSimulador(tel);
    await esperar(800);

    const capturarTel = async (nombre, descripcion) => {
      await esperar(400);
      await tel.screenshot({ path: join(OUT, `${nombre}.png`) });
      console.log(`  ✓ ${nombre}.png — ${descripcion}`);
    };

    await tel.goto(`http://localhost:${PUERTO_WEB}/#/consola`, { waitUntil: 'networkidle' });
    await esperar(1200);
    await capturarTel('tel-01-consola', 'telemetría en teléfono: tarjetas en vez de tabla');

    // La asignación pertenece a la banda de la sesión, así que hace falta
    // abrir una: los perfiles ya existen de la parte anterior.
    await tel.goto(`http://localhost:${PUERTO_WEB}/#/sesion`, { waitUntil: 'networkidle' });
    await tel.click('ui-empty ui-button button');
    await tel.waitForSelector('#ses-banda');
    await tel.click('ui-dialog [pie] ui-button:last-child button');
    await tel.waitForSelector('[data-estado]');

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

  // **Salir a mano, y no dejar que Node decida cuándo.** `limpiar()` estaba
  // colgado de `process.on('exit')`, que es justo el evento que no llega: el
  // simulador y el servidor web quedan vivos con sus tuberías abiertas y
  // mantienen el bucle de eventos girando para siempre. El proceso se quedaba
  // ahí, con las capturas ya sacadas y sin decir nada.
  //
  // Que esto no se hubiera notado dice algo peor que el error: **el camino
  // feliz nunca se había recorrido entero**. Cada corrida anterior terminaba
  // por una excepción, y ese camino sí sale, porque `process.exit(1)` no
  // espera a nadie. El único final que estaba roto era el de que todo saliera
  // bien.
  limpiar();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
