#!/usr/bin/env node
/**
 * Recorre el camino completo de usuario y captura cada paso.
 *
 * Es distinto de `capture.mjs`: aquél provoca escenarios del protocolo contra
 * el simulador, éste comprueba que se pueda ir de cero a una sesión cerrada
 * sin quedarse atascado en ninguna pantalla.
 *
 * Corre en dos anchos, teléfono y tablet, porque un camino que funciona en
 * 1280 píxeles y se rompe en 390 no está terminado.
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
const PUERTO_WEB = 4321;

const TAMANIOS = [
  { id: 'tablet', width: 1280, height: 900 },
  { id: 'telefono', width: 390, height: 844 },
];

const procesos = [];
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

function lanzar(nombre, comando, args) {
  const p = spawn(comando, args, { cwd: RAIZ, stdio: ['ignore', 'pipe', 'pipe'] });
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

function puertoOcupado(puerto) {
  return new Promise((resolve) => {
    const s = connect({ port: puerto, host: '127.0.0.1' });
    s.on('connect', () => { s.destroy(); resolve(true); });
    s.on('error', () => resolve(false));
    setTimeout(() => { s.destroy(); resolve(false); }, 500);
  });
}

async function recorrer(contexto, tamanio) {
  const p = await contexto.newPage();
  await p.setViewportSize({ width: tamanio.width, height: tamanio.height });

  const fallos = [];
  p.on('pageerror', (e) => fallos.push(`excepción: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error') fallos.push(`consola: ${m.text()}`); });

  const paso = async (n, nombre, descripcion) => {
    await esperar(350);
    const ruta = join(OUT, `flujo-${tamanio.id}-${String(n).padStart(2, '0')}-${nombre}.png`);
    await p.screenshot({ path: ruta });
    console.log(`  ✓ ${tamanio.id} ${n}. ${descripcion}`);
  };

  // Cada recorrido empieza de cero: si no se limpia, el segundo ancho
  // encuentra los datos del primero y no prueba el estado vacío, que es
  // justamente donde un usuario nuevo se queda atascado.
  await p.goto(`http://localhost:${PUERTO_WEB}/`, { waitUntil: 'networkidle' });
  await p.evaluate(() => { localStorage.clear(); });
  await p.reload({ waitUntil: 'networkidle' });

  await paso(1, 'vacio', 'primera vez: no hay nada y la pantalla dice qué falta');

  await p.click('[data-destino="perfiles"]');
  await paso(2, 'perfiles-vacio', 'perfiles sin nada cargado');

  // --- Banda ---
  await p.click('ui-page-header ui-button button');
  await p.waitForSelector('#banda-nombre');
  await p.fill('#banda-nombre', 'Los del Fondo');
  await paso(3, 'banda-nueva', 'alta de banda');

  await p.click('ui-card[titulo="Integrantes"] ui-button button');
  await p.waitForSelector('#int-nombre');
  await p.fill('#int-nombre', 'Ana');
  await p.fill('#int-instr', 'voz, guitarra acústica');
  await paso(4, 'integrante', 'alta de integrante en diálogo');
  await p.click('ui-dialog ui-button.primario button, ui-dialog [pie] ui-button:last-child button');
  await esperar(300);
  await paso(5, 'banda-con-integrante', 'la banda ya tiene integrantes');

  await p.click('.racimo-entre ui-button:last-child button');
  await p.waitForSelector('[data-perfil="bandas"]');
  await paso(6, 'banda-guardada', 'la banda aparece en la lista');

  // --- Local (crea también un sistema de amplificación) ---
  await p.click('[data-perfil="locales"]');
  await p.click('ui-page-header ui-button button');
  await p.waitForSelector('#loc-nombre');
  await p.fill('#loc-nombre', 'Bar Central');
  await p.selectOption('#loc-tipo', 'INDOOR_SMALL');
  await p.fill('#loc-largo', '14');
  await p.fill('#loc-ancho', '8');
  await p.fill('#loc-alto', '3,2');
  await paso(7, 'local-nuevo', 'alta de local, con coma decimal');

  await p.fill('#loc-alto', '0');
  await paso(8, 'local-error', 'validación: una dimensión fuera de rango');
  await p.fill('#loc-alto', '3,2');

  await p.click('.racimo-entre ui-button:last-child button');
  await p.waitForSelector('[data-perfil="bandas"]');
  await p.click('[data-perfil="locales"]');
  await paso(9, 'local-guardado', 'el local aparece en la lista');

  // --- Sistema de amplificación ---
  await p.click('[data-perfil="pa"]');
  await paso(10, 'pa-lista', 'el sistema que se creó junto con el local');
  await p.click('a.tarjeta');
  await p.waitForSelector('#pa-nombre');
  await p.fill('#pa-nombre', 'Cajas propias');
  await p.fill('#pa-cajas', 'Par de 12 pulgadas activas');
  await p.fill('#pa-desde', '1000');
  await p.fill('#pa-hasta', '1500');
  await paso(11, 'pa-rango-invalido', 'validación: menos de una octava de rango útil');
  await p.fill('#pa-desde', '65');
  await p.fill('#pa-hasta', '16000');
  await paso(12, 'pa-rango-valido', 'rango útil corregido');
  await p.click('.racimo-fin ui-button button');
  await esperar(400);

  // --- Sesión ---
  await p.click('[data-destino="sesion"]');
  await paso(13, 'sesion-lista', 'ya se puede empezar una sesión');
  await p.click('ui-empty ui-button button');
  await p.waitForSelector('#ses-banda');
  await paso(14, 'sesion-elegir', 'elegir banda y local');
  await p.click('ui-dialog [pie] ui-button:last-child button');
  await p.waitForSelector('[data-estado]');
  await paso(15, 'sesion-abierta', 'sesión abierta, con lo que sigue');

  await p.click('[data-estado="SETUP"]');
  await esperar(400);
  await paso(16, 'sesion-setup', 'avance de estado según la tabla de transiciones');

  await p.click('[data-destino="historial"]');
  await paso(17, 'historial', 'la sesión en curso ya figura en el historial');

  await p.click('[data-destino="ajustes"]');
  await paso(18, 'ajustes', 'ajustes: consola, actualización y datos');

  // --- Cierre ---
  await p.click('[data-destino="sesion"]');
  await p.click('ui-page-header ui-button button');
  await p.waitForSelector('ui-dialog[titulo="Cerrar la sesión"] [open]');
  await paso(19, 'cerrar', 'confirmación de cierre: no se puede reabrir');
  await p.click('ui-dialog[titulo="Cerrar la sesión"] [pie] ui-button:last-child button');
  await esperar(500);
  await paso(20, 'cerrada', 'vuelta al estado inicial, con la sesión en el historial');

  await p.click('[data-destino="historial"]');
  // La tabla y la lista de tarjetas coexisten en el árbol; solo una es
  // visible según el ancho. Se elige la que de verdad se ve.
  await p.locator('tbody tr, a.tarjeta').locator('visible=true').first().click();
  await esperar(400);
  await paso(21, 'detalle', 'detalle de la sesión cerrada, solo lectura');

  // --- INV-019: el paro tiene que poder tocarse también con un diálogo abierto ---
  //
  // Un «dialog» abierto con showModal() se pinta en la capa superior del
  // navegador, por encima de cualquier z-index, y su velo intercepta los
  // eventos de puntero. El botón flotante del contenedor deja de existir para
  // el usuario. Esta comprobación existe porque eso pasaba de verdad: con el
  // diálogo de cerrar sesión abierto, un clic sobre el paro agotaba el tiempo
  // de espera.
  await p.goto(`http://localhost:${PUERTO_WEB}/#/perfiles`, { waitUntil: 'networkidle' });
  await p.click('ui-page-header ui-button button');
  await p.waitForSelector('#banda-nombre');
  await p.click('ui-card[titulo="Integrantes"] ui-button button');
  await p.waitForSelector('#int-nombre');

  const paroAlcanzable = await p.evaluate(() => {
    const dlg = document.querySelector('dialog[open]');
    if (dlg === null) return 'no se abrió ningún diálogo';
    const boton = dlg.querySelector('app-paro-boton button');
    if (boton === null) return 'el diálogo no contiene el paro de emergencia';
    const r = boton.getBoundingClientRect();
    if (r.width < 44 || r.height < 44) return `el paro del diálogo mide ${r.width}x${r.height}`;
    const encima = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return boton.contains(encima) ? null : `otro elemento tapa el paro: ${encima?.tagName}`;
  });
  if (paroAlcanzable !== null) fallos.push(`INV-019 en diálogo: ${paroAlcanzable}`);

  await paso(22, 'paro-en-dialogo', 'INV-019: el paro sigue disponible con un diálogo abierto');

  await p.close();
  return fallos;
}

async function main() {
  if (!existsSync(DIST)) {
    console.error(`No existe ${DIST}. Ejecutar primero: npm run build:dev -w mobile`);
    process.exit(1);
  }
  mkdirSync(OUT, { recursive: true });

  if (!(await puertoOcupado(PUERTO_WEB))) {
    lanzar('web', 'npx', ['--yes', 'http-server', DIST, '-p', String(PUERTO_WEB), '-s', '--cors']);
    await esperar(3000);
  } else {
    console.log(`  · reutilizando el servidor web que ya escucha en ${PUERTO_WEB}`);
  }

  const navegador = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const contexto = await navegador.newContext({
    deviceScaleFactor: 2, colorScheme: 'dark', locale: 'es-PY',
    permissions: ['clipboard-read', 'clipboard-write'],
  });

  console.log('\nRecorriendo el camino completo:\n');
  const fallos = [];
  for (const t of TAMANIOS) {
    fallos.push(...(await recorrer(contexto, t)).map((f) => `[${t.id}] ${f}`));
  }

  await navegador.close();

  if (fallos.length > 0) {
    console.error(`\n${fallos.length} error(es) en el recorrido:\n`);
    for (const f of fallos) console.error(`  ✘ ${f}`);
    process.exit(1);
  }
  console.log(`\nCapturas en ${OUT}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
