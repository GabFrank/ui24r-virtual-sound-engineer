/**
 * Puente para conducir la aplicacion en la tablet desde la maquina.
 *
 * La aplicacion corre en una WebView de Android; `adb forward` expone su
 * protocolo de depuracion en el 9222 y desde aca se le puede evaluar
 * JavaScript, tocar la pantalla y sacar capturas. Es lo que permite recorrer
 * una sesion entera sin tener la tablet en la mano.
 *
 *   node tools/tablet/cdp.mjs eval "<expresion>"
 *   node tools/tablet/cdp.mjs captura <archivo.png>
 *   node tools/tablet/cdp.mjs ir "#/telemetria"
 */
import WebSocket from '../../node_modules/ws/index.js';
import { writeFileSync } from 'node:fs';

const lista = await (await fetch('http://localhost:9222/json/list')).json();
const objetivo = lista.find((p) => p.type === 'page');
if (!objetivo) { console.error('no hay ninguna pagina'); process.exit(1); }

const ws = new WebSocket(objetivo.webSocketDebuggerUrl);
await new Promise((r, x) => { ws.on('open', r); ws.on('error', x); });

let id = 0;
const pendientes = new Map();
ws.on('message', (d) => {
  const m = JSON.parse(String(d));
  if (m.id && pendientes.has(m.id)) { pendientes.get(m.id)(m); pendientes.delete(m.id); }
});
const enviar = (method, params = {}) => new Promise((r) => {
  const i = ++id;
  pendientes.set(i, r);
  ws.send(JSON.stringify({ id: i, method, params }));
});

const [orden, arg] = process.argv.slice(2);

if (orden === 'eval') {
  const r = await enviar('Runtime.evaluate', { expression: arg, returnByValue: true, awaitPromise: true });
  const v = r.result?.result;
  console.log(v?.value !== undefined ? (typeof v.value === 'string' ? v.value : JSON.stringify(v.value, null, 2)) : JSON.stringify(v));
} else if (orden === 'captura') {
  const r = await enviar('Page.captureScreenshot', { format: 'png' });
  writeFileSync(arg, Buffer.from(r.result.data, 'base64'));
  console.log(`guardada en ${arg}`);
} else if (orden === 'ir') {
  await enviar('Runtime.evaluate', { expression: `location.hash = ${JSON.stringify(arg)}` });
  await new Promise((r) => setTimeout(r, 1200));
  const r = await enviar('Runtime.evaluate', { expression: 'location.hash', returnByValue: true });
  console.log('ahora en', r.result?.result?.value);
} else {
  console.error('ordenes: eval | captura | ir');
}
ws.close();
