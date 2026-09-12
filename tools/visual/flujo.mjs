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
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..', '..');
const OUT = join(AQUI, 'out');
const DIST = join(RAIZ, 'apps', 'mobile', 'dist', 'mobile', 'browser');
const PUERTO_WEB = 4321;

/**
 * El mínimo táctil, en píxeles.
 *
 * Sale de `--tap-min` en `apps/mobile/src/styles/_tokens.scss` y de
 * `docs/design-system.md`, que lo promete en dos lugares. Se comprueba contra
 * la ficha al arrancar: dos números que dicen lo mismo y pueden separarse son
 * un defecto esperando.
 */
const TAP_MIN_PX = 48;

const TAMANIOS = [
  { id: 'tablet', width: 1280, height: 900 },
  { id: 'telefono', width: 390, height: 844 },
];

/**
 * El 48 de acá y el de la ficha tienen que ser el mismo.
 *
 * Este archivo no puede leer una ficha CSS en tiempo de ejecución del navegador
 * sin cargar la aplicación, así que se lo comprueba contra el archivo de
 * tokens al arrancar. Es el mismo patrón con que el editor del escenario ata su
 * blanco táctil, y existe por el mismo motivo.
 */
function comprobarLaFicha() {
  const tokens = readFileSync(join(RAIZ, 'apps', 'mobile', 'src', 'styles', '_tokens.scss'), 'utf8');
  const m = /--tap-min:\s*(\d+)px/.exec(tokens);
  if (m === null) throw new Error('no existe la ficha --tap-min en _tokens.scss');
  if (Number(m[1]) !== TAP_MIN_PX) {
    throw new Error(
      `la ficha --tap-min vale ${m[1]} px y flujo.mjs comprueba contra ${TAP_MIN_PX}: se separaron`,
    );
  }
}

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

  // **Sin autoconexión.** Este recorrido es de perfiles y sesión: no toca la
  // consola en ningún paso. Con la autoconexión encendida, la aplicación
  // intenta el host de fábrica --`10.10.1.1`, que solo existe cuando uno se
  // cuelga del punto de acceso de la propia consola-- y falla cada cuatro
  // segundos. Eso llenaba la lista de fallos con siete «conexion_fallida» por
  // corrida, todos esperables, y el recorrido salía en rojo siempre.
  //
  // El problema de un guion que siempre falla no es que moleste: es que deja
  // de leerse, y el día que aparezca un error de verdad va a estar en medio
  // del ruido. Apagarla acá hace que **cualquier error de consola que quede
  // sea uno que hay que mirar**.
  await p.addInitScript(() => localStorage.setItem('vse.pref.autoconectar', 'no'));

  const fallos = [];
  p.on('pageerror', (e) => fallos.push(`excepción: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error') fallos.push(`consola: ${m.text()}`); });

  const paso = async (n, nombre, descripcion) => {
    await esperar(350);

    // Ninguna pantalla puede desplazarse en horizontal. Es la comprobación que
    // sostiene «funciona en un teléfono»: hasta ahora eso lo respaldaban las
    // capturas, y una captura muestra el recorte, no el desborde. Se hace en
    // cada paso y en los dos anchos porque el que desborda suele ser un estado
    // concreto —una tabla con datos, un diálogo abierto—, no la pantalla vacía.
    //
    // **No** se mira `documentElement`: el contenedor de la aplicación lleva
    // `overflow-y: auto`, y en CSS eso convierte el eje horizontal de `visible`
    // a `auto`, así que el desbordamiento se lo queda él y el documento nunca
    // crece. Una comprobación sobre el documento no podía fallar nunca. Se
    // recorren los contenedores que de verdad se desplazan, y se exceptúa
    // `.desplaza-x`, que es la vía declarada para lo ancho a propósito -- una
    // tabla, un diagrama -- dentro de su propia caja.
    const desborde = await p.evaluate(() => {
      for (const el of document.querySelectorAll('*')) {
        if (el.scrollWidth <= el.clientWidth + 1) continue;
        if (el.closest('.desplaza-x') !== null) continue;
        // Con `overflow-x: visible` el contenido se pinta fuera y no hay barra:
        // un icono de 24 px en una caja de 22 no es una pantalla que se
        // desplaza, y contarlo llenaba esto de ruido.
        //
        // `hidden` y `clip` sí cuentan, y ese era el punto ciego: `ui-card` los
        // usa, y es «lo que reemplaza a las filas de una tabla» en teléfono.
        // Ahí el contenido no se desplaza — se **pierde**, sin barra y sin
        // aparecer en la captura. Es peor que desplazarse, no mejor.
        // Los textos solo para lectores de pantalla miden un pixel y esconden
        // su contenido a propósito: no le ocultan nada a nadie.
        if (el.clientWidth <= 1 || el.clientHeight <= 1) continue;
        const estilo = getComputedStyle(el);
        const desplaza = estilo.overflowX === 'auto' || estilo.overflowX === 'scroll';
        const recorta = estilo.overflowX === 'hidden' || estilo.overflowX === 'clip';
        if (!desplaza && !recorta) continue;
        const clase = String(el.className || '').split(' ')[0];
        return {
          donde: `${el.tagName.toLowerCase()}${clase ? '.' + clase : ''}`,
          ancho: el.scrollWidth,
          visible: el.clientWidth,
          modo: desplaza ? 'se desplaza' : 'recorta contenido',
        };
      }
      return null;
    });
    if (desborde !== null) {
      fallos.push(
        `paso ${n} (${nombre}): «${desborde.donde}» ${desborde.modo} en horizontal, ` +
        `${desborde.ancho} px de contenido en ${desborde.visible} de ancho`,
      );
    }

    // **Los blancos táctiles, medidos.** El sistema de diseño promete 48 píxeles
    // como mínimo en dos lugares, y hasta ahora nada lo comprobaba: se medía un
    // único rectángulo, el del paro en diálogo, y el resto de la promesa vivía
    // en la palabra de quien escribió cada pantalla.
    //
    // Ya falló una vez y en silencio: en el editor del escenario, un blanco
    // declarado de 48 medía **26,7** en una tablet angosta, porque el dibujo se
    // estiraba y una unidad de dibujo no era un píxel de pantalla. Por eso se
    // mide `getBoundingClientRect()`, que devuelve el rectángulo **dibujado**,
    // después de cualquier transformación — y no el tamaño nominal del estilo.
    const chicos = await p.evaluate((minimo) => {
      const INTERACTIVOS = 'button, a[href], input, select, textarea, [role="button"], [tabindex]';

      /**
       * El rectángulo que de verdad recibe el toque.
       *
       * 1. **El enlace estirado.** Un `<a>` con un `::after` absoluto y pegado a
       *    los cuatro bordes cubre toda su fila: es el patrón con que una fila
       *    de tabla entera se vuelve un enlace. El enlace mide el ancho de su
       *    texto y se toca la fila.
       * 2. **La casilla dentro de una etiqueta.** Tocar el `<label>` alterna la
       *    casilla: ése es el blanco, no los 22 píxeles del cuadradito.
       *
       * Si no hay ninguno de los dos, devuelve la caja propia.
       */
      const areaEfectiva = (el, propia) => {
        const despues = getComputedStyle(el, '::after');
        const pegado = despues.position === 'absolute'
          && ['top', 'right', 'bottom', 'left'].every((l) => despues[l] === '0px');
        if (pegado && el.offsetParent !== null) return el.offsetParent.getBoundingClientRect();
        const etiqueta = el.closest('label');
        if (etiqueta !== null && el.matches('input, select, textarea')) {
          return etiqueta.getBoundingClientRect();
        }
        return propia;
      };
      const malos = [];
      for (const el of document.querySelectorAll(INTERACTIVOS)) {
        if (el.tabIndex < 0) continue;
        if (el.matches('input[type=hidden]')) continue;
        const r = el.getBoundingClientRect();
        // Lo invisible o de tamaño cero no se puede tocar. Los textos sólo para
        // lectores de pantalla miden un píxel y esconden su contenido a
        // propósito: el desborde ya los exceptúa por lo mismo.
        if (r.width <= 1 || r.height <= 1) continue;
        if (getComputedStyle(el).visibility === 'hidden') continue;
        // Un enlace en medio de una oración tiene el alto de la línea y no es un
        // objetivo táctil en el sentido de la regla: agrandarlo rompería el
        // párrafo. **Es una decisión, no algo que el sistema de diseño diga.**
        if (el.tagName === 'A' && el.closest('p, li') !== null) continue;
        // **Lo que se mide es el área que recibe el toque, no la caja del
        // elemento**, y hay dos mecanismos legítimos que las separan. Los dos
        // aparecieron la primera vez que esto corrió, y tratarlos como
        // excepciones habría vaciado la comprobación: no son elementos que
        // incumplen y se perdonan, son elementos cuyo blanco real es otro.
        const efectivo = areaEfectiva(el, r);
        if (efectivo.width >= minimo && efectivo.height >= minimo) continue;
        const clase = String(el.className || '').split(' ')[0];
        malos.push({
          donde: `${el.tagName.toLowerCase()}${clase ? '.' + clase : ''}`,
          texto: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 24),
          ancho: Math.round(efectivo.width), alto: Math.round(efectivo.height),
        });
      }
      return malos;
    }, TAP_MIN_PX);
    for (const c of chicos) {
      fallos.push(
        `paso ${n} (${nombre}) en ${tamanio.id}: «${c.donde}${c.texto ? ' · ' + c.texto : ''}» `
        + `mide ${c.ancho}×${c.alto} px y el mínimo es ${TAP_MIN_PX}`,
      );
    }

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
  // Los instrumentos se eligen del catálogo, no se escriben. Un toque en la
  // grilla deja la fuente elegida; la variante y el rol aparecen recién
  // después, y solo los que esa fuente declara.
  await p.click('app-elegir-instrumentos [data-fuente="VOZ"]');
  await p.click('app-elegir-instrumentos [data-fuente="GUITARRA"]');
  await p.click('app-elegir-instrumentos li:last-child .ficha:has-text("de nylon")');
  await paso(4, 'integrante', 'alta de integrante: instrumentos elegidos del catálogo');
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
  // Los errores aparecen al abandonar el campo, no en cada pulsación: un
  // formulario recién abierto no debe estar ya en rojo.
  await p.locator('#loc-alto').blur();
  await paso(8, 'local-error', 'validación: aparece al abandonar el campo, no al teclear');
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

  // El sistema lo usa el local que se acaba de crear, así que no se puede
  // borrar: un local sin sistema no dice con qué equipo se toca. La
  // comprobación es que el diálogo lo explique en vez de borrar y dejar el
  // local apuntando a nada -- el esquema declara la clave foránea pero nadie
  // la aplica.
  await p.click('.racimo-entre ui-button:first-child button');
  await p.waitForSelector('ui-dialog[titulo="Borrar el sistema"] [open]');
  const textoBorrado = await p.textContent('ui-dialog[titulo="Borrar el sistema"]');
  if (!/No se puede borrar/.test(textoBorrado ?? '')) {
    fallos.push('el sistema en uso se dejó borrar sin avisar');
  }
  await p.click('ui-dialog[titulo="Borrar el sistema"] [pie] ui-button button');
  await esperar(300);

  // Guardar es el último botón de la fila; el primero ahora es borrar.
  await p.click('.racimo-entre ui-button:last-child button');
  await esperar(400);

  // Salir con cambios sin guardar tiene que preguntar. Los formularios no
  // guardan en cada tecla -- un nombre a medio escribir no debe quedar
  // guardado -- así que «Volver» perdía en silencio todo lo escrito.
  await p.click('[data-destino="perfiles"]');
  await p.click('[data-perfil="pa"]');
  await p.click('a.tarjeta');
  await p.waitForSelector('#pa-nombre');
  await p.fill('#pa-nombre', 'Nombre a medio escribir');
  await p.click('ui-page-header ui-button button');
  const aviso = 'ui-dialog[titulo="Hay cambios sin guardar"]';
  // Se pregunta si apareció en vez de esperarlo a secas: si no aparece, este
  // paso tiene que anotar el fallo y seguir, no tumbar el recorrido entero con
  // un tiempo de espera agotado que no dice qué pasó.
  const pregunto = await p.locator(`${aviso} [open]`).waitFor({ timeout: 5000 })
    .then(() => true).catch(() => false);
  await paso(13, 'salir-sin-guardar', 'salir con cambios sin guardar pregunta antes');
  if (!pregunto) {
    fallos.push('salir con cambios sin guardar no preguntó nada');
  } else {
    // «Seguir editando» tiene que dejar la pantalla donde estaba.
    await p.click(`${aviso} [pie] ui-button:first-child button`);
    await esperar(300);
    if (await p.locator('#pa-nombre').count() === 0) {
      fallos.push('«seguir editando» salió igual de la pantalla');
    }
    await p.click('ui-page-header ui-button button');
    await p.click(`${aviso} [pie] ui-button:last-child button`);
  }
  await esperar(400);

  // --- Sesión ---
  await p.click('[data-destino="sesion"]');
  await paso(14, 'sesion-lista', 'ya se puede empezar una sesión');
  await p.click('ui-empty ui-button button');
  await p.waitForSelector('#ses-banda');
  await paso(15, 'sesion-elegir', 'elegir banda y local');
  await p.click('ui-dialog [pie] ui-button:last-child button');
  await p.waitForSelector('[data-estado]');
  await paso(16, 'sesion-abierta', 'sesión abierta, con lo que sigue');

  await p.click('[data-estado="SETUP"]');
  await esperar(400);
  await paso(17, 'sesion-setup', 'avance de estado según la tabla de transiciones');

  // **El recorrido guiado, en los dos anchos.** Hasta acá `flujo.mjs` no visitaba
  // ni canales ni recorrido, así que la pantalla nueva no se capturaba en ningún
  // ancho y sus blancos táctiles no se medían. Era una obligación del contrato
  // de esa pantalla que quedó sin cumplir, y un auditor lo predijo antes de que
  // se escribiera.
  //
  // **Lo que se puede capturar sin consola es el bloqueo por estado y el estado
  // vacío**: el recorrido se arma con los canales asignados, y asignar canales
  // necesita la consola. La lista con filas y el arrastre quedan fuera de este
  // camino, y eso está declarado en `docs/compromisos/93-blancos-tactiles.md`.
  // Se navega por clic y no por `goto`: el servidor estático de este recorrido
  // no resuelve rutas profundas, y un `goto` a `/sesion/recorrido` devuelve 404
  // en vez de cargar la aplicación.
  await p.click('[data-atajo="recorrido"]');
  await p.waitForSelector('ui-empty');
  await paso(18, 'recorrido-otro-estado', 'el recorrido dice por qué no se puede en este estado');

  await p.click('ui-page-header ui-button button');
  await p.waitForSelector('[data-estado="CALIBRATING"]');
  await p.click('[data-estado="CALIBRATING"]');
  await esperar(400);
  await p.click('[data-estado="CHANNEL_SETUP"]');
  await esperar(400);
  await p.click('[data-atajo="recorrido"]');
  await p.waitForSelector('ui-empty');
  await paso(19, 'recorrido-vacio', 'el recorrido sin canales asignados dice qué falta');
  await p.click('ui-page-header ui-button button');
  await p.waitForSelector('[data-estado]');

  await p.click('[data-destino="historial"]');
  await paso(20, 'historial', 'la sesión en curso ya figura en el historial');

  await p.click('[data-destino="ajustes"]');
  await paso(21, 'ajustes', 'ajustes: consola, actualización y datos');

  // El registro persistente tiene que tener algo dentro para este punto: se
  // vienen guardando bandas, locales y una sesión. La comprobación existe
  // porque un sumidero que no está conectado se ve exactamente igual que uno
  // conectado hasta que alguien mira, y durante meses «hay registro» quiso
  // decir «hay una clase Logger».
  await p.click('ui-card[titulo="Registro"] ui-button:first-child button');
  const lineas = p.locator('ui-card[titulo="Registro"] .eventos li');
  await lineas.first().waitFor({ timeout: 5000 }).catch(() => { /* el conteo lo dice */ });
  const eventos = await lineas.count();
  if (eventos === 0) fallos.push('el registro guardado no devolvió ningún evento');
  await paso(22, 'registro', 'el registro guardado, con lo que hizo la aplicación');

  // --- Cierre ---
  await p.click('[data-destino="sesion"]');
  await p.click('ui-page-header ui-button button');
  await p.waitForSelector('ui-dialog[titulo="Cerrar la sesión"] [open]');
  await paso(23, 'cerrar', 'confirmación de cierre: no se puede reabrir');
  await p.click('ui-dialog[titulo="Cerrar la sesión"] [pie] ui-button:last-child button');
  await esperar(500);
  await paso(24, 'cerrada', 'vuelta al estado inicial, con la sesión en el historial');

  await p.click('[data-destino="historial"]');
  // La tabla y la lista de tarjetas coexisten en el árbol; solo una es
  // visible según el ancho. Se elige la que de verdad se ve.
  await p.locator('tbody tr, a.tarjeta').locator('visible=true').first().click();
  await esperar(400);
  await paso(25, 'detalle', 'detalle de la sesión cerrada, solo lectura');

  // --- Prueba de conexión ---
  //
  // Tiene una tabla, que es la forma más fácil de romper un ancho de teléfono.
  // La comprobación de desbordamiento de más abajo la mira como a cualquier
  // otro paso.
  await p.goto(`http://localhost:${PUERTO_WEB}/#/ajustes/diagnostico`, { waitUntil: 'networkidle' });
  await p.waitForSelector('ui-page-header');
  await paso(26, 'diagnostico', 'prueba de conexión: mide y no escribe');

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
    // 64, no 44. El umbral estaba por debajo de la propia invariante, así que
    // la comprobación aprobaba un botón de 48 px que INV-019 prohíbe: se
    // corrigió un caso de 60 px «por cuatro píxeles» y se dejó pasar uno de 16.
    // Una comprobación más floja que la regla que dice comprobar no comprueba.
    const MINIMO_INV_019 = 64;
    if (r.width < MINIMO_INV_019 || r.height < MINIMO_INV_019) {
      return `el paro del diálogo mide ${Math.round(r.width)}x${Math.round(r.height)}, ` +
        `y INV-019 exige ${MINIMO_INV_019}`;
    }
    const encima = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return boton.contains(encima) ? null : `otro elemento tapa el paro: ${encima?.tagName}`;
  });
  if (paroAlcanzable !== null) fallos.push(`INV-019 en diálogo: ${paroAlcanzable}`);

  await paso(27, 'paro-en-dialogo', 'INV-019: el paro sigue disponible con un diálogo abierto');

  await p.close();
  return fallos;
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
  comprobarLaFicha();
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
    executablePath: navegadorDisponible(),
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

  // Salir a mano: el simulador y el servidor web quedan vivos con sus tuberías
  // abiertas y mantienen el bucle de eventos girando, así que `process.exit`
  // nunca llega solo. El mismo agujero estaba en `capture.mjs`, y ahí está
  // explicado por qué costó tanto verlo: el único final que se colgaba era el
  // de que todo saliera bien.
  limpiar();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
