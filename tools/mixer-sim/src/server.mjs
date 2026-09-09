#!/usr/bin/env node
/**
 * Simulador de consola Ui24R.
 *
 * Ver README: reproduce nuestras hipótesis sobre el protocolo, no la consola.
 * Sirve para depurar la aplicación antes de llegar al hardware, no para
 * validar el protocolo.
 *
 * **Puesto al día el 2026-09-08** con lo que se midió contra una Ui24R real, en
 * lo que ya no hace falta suponer: el envoltorio de socket.io 0.9 y el formato
 * de las tramas de medidores. Sigue siendo un simulador —lo que no está medido
 * sigue siendo una hipótesis— pero al menos deja de contradecir lo que sí.
 *
 * Lo que a propósito NO imita, y conviene saberlo:
 *
 * - **Manda `DUMP_END`.** La consola real no manda ninguna marca de fin de
 *   volcado; el adaptador la detecta por quietud. Se conserva acá porque hace
 *   las pruebas deterministas, y el adaptador respeta las dos formas.
 * - **Emite medidores pase lo que pase.** La consola real **calla `VU2` cuando
 *   no hay señal**. Imitarlo dejaría el simulador mudo casi siempre.
 */

import { WebSocketServer } from 'ws';
import { CANALES, estadoInicial, nombres, dbAFader } from './state.mjs';

const args = process.argv.slice(2);
const puerto = Number(args[args.indexOf('--port') + 1]) || 8765;
const conEco = !args.includes('--no-echo');
const vuHz = Number(args[args.indexOf('--vu-hz') + 1]) || 20;

const estado = estadoInicial();
const clientes = new Set();

let vuCortadoHasta = 0;
let canalSaturando = null;

/**
 * Escala de los medidores, de `deconvertVU` en el `mixer.html` de la consola.
 * Un byte de 0 a ~240 es una posición normalizada de 0 a 1, no decibeles.
 */
const VU_ESCALA = 0.004167508166392142;

/**
 * Arma una trama `VU2` con el formato real: cabecera de 8 bytes y 6 por canal.
 *
 * Antes se mandaba un byte por canal sin cabecera, mapeado de −80 a 0 dB. Eso
 * era la hipótesis, y estaba equivocada en las tres cosas.
 */
// El medidor es lineal en decibeles: 0 dB arriba, -80 abajo. Sale del propio
// `mixer.html` de la consola, que dibuja la barra proporcional a la posicion y
// pone las marcas en `-dB * h / 80`. Hasta el 2026-09-08 el simulador emitia
// con la ley del fader, que es otra cosa.
const MEDIDOR_RANGO_DB = 80;

function codificarVu(nivelesDb) {
  const bytes = [nivelesDb.length, 0, 0, 0, 0, 0, 0, 0];
  for (const db of nivelesDb) {
    const posicion = (!Number.isFinite(db) || db <= -MEDIDOR_RANGO_DB)
      ? 0
      : (db + MEDIDOR_RANGO_DB) / MEDIDOR_RANGO_DB;
    const b = Math.max(0, Math.min(255, Math.round(posicion / VU_ESCALA)));
    // pre, entrada, salida, dinámico entrada, dinámico salida, reducción.
    // 247 en el último byte es "sin reducción de ganancia", como en la consola.
    bytes.push(b, b, b, 0, 0, 247);
  }
  return Buffer.from(bytes).toString('base64');
}

/**
 * Envuelve líneas de protocolo como lo hace socket.io 0.9.
 *
 * La consola no manda líneas peladas: manda `3:::<carga>`, y una sola trama
 * puede traer varias líneas separadas por saltos. Sin esto el simulador hablaba
 * un protocolo que ninguna consola habla.
 */
function envolver(...lineas) {
  return `3:::${lineas.join('\n')}`;
}

function difundir(linea, excepto = null) {
  for (const ws of clientes) {
    if (ws === excepto) continue;
    if (ws.readyState === 1) ws.send(envolver(linea));
  }
}

/** Aplica un cambio y lo difunde, como haría la consola con sus clientes. */
function aplicar(path, valor, origen = null) {
  estado.set(path, valor);
  // El eco al propio emisor es justo lo que el spike P0.1 tiene que medir.
  // Acá es configurable para poder probar la aplicación en los dos mundos.
  difundir(`SETD^${path}^${valor}`, conEco ? null : origen);
}

function volcadoCompleto(ws) {
  // La consola manda el volcado en tandas de varias líneas por trama, no una
  // línea por mensaje. Se imita para que el cliente ejercite ese camino.
  const lineas = [];
  for (const [path, valor] of estado) lineas.push(`SETD^${path}^${valor}`);
  for (const [path, texto] of nombres()) lineas.push(`SETS^${path}^${texto}`);
  for (let i = 0; i < lineas.length; i += 40) {
    ws.send(envolver(...lineas.slice(i, i + 40)));
  }
  ws.send(envolver('DUMP_END'));
}

// --- Escenarios ------------------------------------------------------------

const escenarios = {
  /** Otro cliente sube un fader. La aplicación tiene que verlo como ajeno. */
  'external-change': () => {
    const nuevo = dbAFader(-1.0);
    aplicar('i.6.mix', nuevo);
    log('escenario: otro cliente subió el fader del bajo a -1,0 dB');
  },

  /** Recuperación de instantánea: muchas rutas distintas de golpe. */
  'snapshot-recall': () => {
    for (const c of CANALES) {
      aplicar(`i.${c.idx}.mix`, dbAFader(c.faderDb - 3));
    }
    aplicar('var.currentSnapshot', 1);
    log('escenario: recuperación de instantánea, 13 rutas en menos de un segundo');
  },

  /** Arrastre de fader: muchos mensajes sobre una sola ruta. */
  'fader-drag': async () => {
    for (let i = 0; i < 40; i++) {
      aplicar('i.4.mix', dbAFader(-4 + i * 0.15));
      await new Promise((r) => setTimeout(r, 15));
    }
    log('escenario: arrastre de fader, 40 mensajes sobre una sola ruta');
  },

  /** Corte de medidores: la conexión pasa a inestable. */
  'vu-gap': () => {
    vuCortadoHasta = Date.now() + 4000;
    log('escenario: medidores cortados durante cuatro segundos');
  },

  /** Un canal empieza a saturar. */
  clipping: () => {
    canalSaturando = canalSaturando === null ? 0 : null;  // idx 0 = canal 1
    log(`escenario: saturación en el canal 1 ${canalSaturando ? 'activada' : 'desactivada'}`);
  },

  /** Corte de conexión. */
  drop: () => {
    log('escenario: cerrando todas las conexiones');
    for (const ws of clientes) ws.close(1006, 'corte simulado');
  },
};

// --- Servidor --------------------------------------------------------------

const wss = new WebSocketServer({ port: puerto });

wss.on('connection', (ws) => {
  clientes.add(ws);
  log(`cliente conectado (${clientes.size} en total)`);
  volcadoCompleto(ws);

  ws.on('message', (data) => {
    // El cliente también envuelve: manda `3:::ALIVE`, no `ALIVE`. Se acepta con
    // envoltorio y sin él, para que los escenarios se puedan disparar a mano
    // con una herramienta cualquiera.
    const crudo = String(data).trim();
    const linea = crudo.startsWith('3:::') ? crudo.slice(4) : crudo;

    if (linea.startsWith('!scenario ')) {
      const nombre = linea.slice('!scenario '.length).trim();
      const fn = escenarios[nombre];
      if (fn) void fn();
      else log(`escenario desconocido: ${nombre}`);
      return;
    }

    if (linea === 'ALIVE') return;

    const partes = linea.split('^');
    if (partes[0] === 'SETD' && partes.length >= 3) {
      const valor = Number(partes[2]);
      if (Number.isFinite(valor)) aplicar(partes[1], valor, ws);
    }
  });

  ws.on('close', () => {
    clientes.delete(ws);
    log(`cliente desconectado (${clientes.size} en total)`);
  });
});

// Medidores: la consola los emite de forma continua. Su cadencia es lo que la
// aplicación usa para decidir si la conexión está sana.
setInterval(() => {
  if (Date.now() < vuCortadoHasta) return;
  const t = Date.now() / 1000;
  const niveles = [];
  for (const c of CANALES) {
    // Movimiento verosímil: una envolvente lenta más variación rápida.
    const lento = Math.sin(t * 0.7 + c.idx) * (c.dinamica / 2);
    const rapido = (Math.random() - 0.5) * 3;
    let db = c.nivelBase + lento + rapido;
    if (canalSaturando === c.idx) db = -0.3 + Math.random() * 0.4;
    niveles.push(db);
  }
  difundir(`VU2^${codificarVu(niveles)}`);
}, Math.round(1000 / vuHz));

// El analizador de espectro, que es lo que la consola emite pase lo que pase.
//
// Antes acá se difundía `ALIVE` a los clientes, y era al revés: `ALIVE` lo manda
// **el cliente** a la consola, cada segundo, y sin él la consola deja de emitir.
// Ninguna consola manda `ALIVE` a nadie.
//
// Que esto exista no es decorativo. El adaptador vigila el hueco entre tramas
// de analizador para decidir si la conexión está viva —porque `VU2` se apaga en
// los silencios y `RTA` no—, así que un simulador sin `RTA` deja toda sesión
// marcada como inestable a los 300 ms.
//
// La carga es un espectro en silencio: 30 bandas en cero. El cliente todavía no
// decodifica `RTA`, solo cuenta que llegó.
const RTA_SILENCIO = Buffer.alloc(30).toString('base64');
setInterval(() => difundir(`RTA^${RTA_SILENCIO}`), Math.round(1000 / 30));

function log(msg) {
  process.stdout.write(`[sim] ${msg}\n`);
}

log(`escuchando en ws://localhost:${puerto}`);
log(`eco de escrituras propias: ${conEco ? 'activado' : 'desactivado'}`);
log(`medidores: ${vuHz} tramas por segundo`);
