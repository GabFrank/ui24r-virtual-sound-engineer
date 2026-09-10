import { Ui24rTransport } from '@vse/mixer-adapter';
const RUTA = 'i.9.mute';
const t = new Ui24rTransport();
let valor: number | null = null;
const vistos: string[] = [];
t.alRecibir((l) => {
  if (l.startsWith(`SETD^${RUTA}^`)) { valor = Number(l.split('^')[2]); vistos.push(l); }
});
await t.conectar('192.168.0.78');
await new Promise((r) => setTimeout(r, 3500));
console.log(`valor inicial: ${valor}`);

const objetivo = valor === 1 ? 0 : 1;
const intentos: [string, () => void][] = [
  ['SETD pelado', () => t.enviar(`SETD^${RUTA}^${objetivo}`)],
  ['SETD con decimal', () => t.enviar(`SETD^${RUTA}^${objetivo}.0`)],
  ['@SETD', () => t.enviar(`@SETD^${RUTA}^${objetivo}`)],
  ['INIT y despues SETD', () => { t.enviar('INIT'); setTimeout(() => t.enviar(`SETD^${RUTA}^${objetivo}`), 1200); }],
  ['SETD sin envoltorio socket.io', () => {
    // Accede al socket por dentro: es una prueba, no codigo de produccion.
    const ws = (t as unknown as { ws: WebSocket }).ws;
    ws.send(`SETD^${RUTA}^${objetivo}`);
  }],
];

for (const [nombre, enviar] of intentos) {
  const antes = valor;
  try { enviar(); } catch (e) { console.log(`  ${nombre.padEnd(32)} error al enviar: ${e}`); continue; }
  await new Promise((r) => setTimeout(r, 2500));
  const cambio = valor !== antes;
  console.log(`  ${nombre.padEnd(32)} ${cambio ? `*** FUNCIONA (${antes} -> ${valor}) ***` : 'sin efecto'}`);
  if (cambio) break;
}
await t.desconectar();
