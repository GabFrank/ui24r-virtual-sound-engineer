/**
 * El volcado por HTTP (`/raw`) contra el del WebSocket, en el mismo momento.
 *
 * La consola sirve TODO su estado por un GET a `/raw`, sin socket.io y sin
 * apreton de manos. Comparado contra un volcado archivado de otro dia daba 63
 * claves de mas, pero eso no prueba nada: el estado cambio en el medio. Esto
 * los captura a la vez.
 */
import { Ui24rTransport } from '@vse/mixer-adapter';

const maquina = process.argv[2] ?? '192.168.0.78';

const t = new Ui24rTransport();
const ws = new Set<string>();
t.alRecibir((l) => {
  const [c, r] = l.split('^');
  if ((c === 'SETD' || c === 'SETS') && r) ws.add(r);
});
await t.conectar(maquina);
await new Promise((r) => setTimeout(r, 8000));
await t.desconectar();

// `/raw` NO es una instantanea: es un flujo en vivo que se queda abierto --por
// eso trae VU2 y RTA--. `fetch` se cuelga esperando el fin del cuerpo, asi que
// se lee con curl y un limite de tiempo.
const { execFileSync } = await import('node:child_process');
// Y curl termina con codigo 28 --tiempo agotado-- justamente porque el flujo
// no cierra. Los datos ya estan; se ignora el codigo de salida a proposito.
let texto = '';
try {
  texto = execFileSync('curl', ['-s', '--max-time', '10', `http://${maquina}/raw`],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
} catch (e) {
  texto = String((e as { stdout?: string }).stdout ?? '');
}
const http = new Set<string>();
for (const l of texto.split('\n')) {
  const [c, r] = l.split('^');
  if ((c === 'SETD' || c === 'SETS') && r) http.add(r);
}

const soloHttp = [...http].filter((k) => !ws.has(k)).sort();
const soloWs = [...ws].filter((k) => !http.has(k)).sort();
const fam = (xs: string[]): string => {
  const m = new Map<string, number>();
  for (const k of xs) { const f = k.replace(/\d+/g, 'N'); m.set(f, (m.get(f) ?? 0) + 1); }
  return [...m].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([f, n]) => `${n}x ${f}`).join('\n    ');
};

console.log(`WebSocket: ${ws.size} claves`);
console.log(`HTTP /raw: ${http.size} claves`);
console.log('');
console.log(`solo en HTTP: ${soloHttp.length}`);
if (soloHttp.length) console.log('    ' + fam(soloHttp));
console.log(`solo en WebSocket: ${soloWs.length}`);
if (soloWs.length) console.log('    ' + fam(soloWs));
