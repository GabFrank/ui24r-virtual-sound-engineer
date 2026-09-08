#!/usr/bin/env node
/**
 * Simulador de consola Ui24R.
 *
 * Ver README: reproduce nuestras hipótesis sobre el protocolo, no la consola.
 * Sirve para depurar la aplicación antes de llegar al hardware, no para
 * validar el protocolo.
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

function codificarVu(nivelesDb) {
  const bytes = nivelesDb.map((db) => {
    if (!Number.isFinite(db) || db <= -80) return 0;
    return Math.max(0, Math.min(255, Math.round(((db + 80) / 80) * 255)));
  });
  return Buffer.from(bytes).toString('base64');
}

function difundir(linea, excepto = null) {
  for (const ws of clientes) {
    if (ws === excepto) continue;
    if (ws.readyState === 1) ws.send(linea);
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
  for (const [path, valor] of estado) ws.send(`SETD^${path}^${valor}`);
  for (const [path, texto] of nombres()) ws.send(`SETS^${path}^${texto}`);
  ws.send('DUMP_END');
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
    canalSaturando = canalSaturando === null ? 1 : null;
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
    const linea = String(data).trim();

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

// Latido, como el de la consola.
setInterval(() => difundir('ALIVE'), 1000);

function log(msg) {
  process.stdout.write(`[sim] ${msg}\n`);
}

log(`escuchando en ws://localhost:${puerto}`);
log(`eco de escrituras propias: ${conEco ? 'activado' : 'desactivado'}`);
log(`medidores: ${vuHz} tramas por segundo`);
