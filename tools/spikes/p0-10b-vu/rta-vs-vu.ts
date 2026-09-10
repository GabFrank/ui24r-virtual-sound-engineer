/** RTA y VU2 lado a lado, con la misma senal, para saber que trae cada uno. */
import { spawn } from 'node:child_process';
import { Ui24rTransport, decodificarVuCanales, dbDeMedidor } from '@vse/mixer-adapter';
const t = new Ui24rTransport();
let rta: number[][] = []; let vu: number[] = [];
t.alRecibir((l) => {
  if (l.startsWith('RTA^')) rta.push([...Buffer.from(l.slice(4), 'base64')]);
  if (l.startsWith('VU2^')) {
    const m = decodificarVuCanales(l.slice(4))[9];
    if (m) vu.push(dbDeMedidor(m.entrada));
  }
});
await t.conectar('192.168.0.78');
await new Promise((r) => setTimeout(r, 3000));
const muestra = async (etiqueta: string, sonar: boolean) => {
  let p: ReturnType<typeof spawn> | null = null;
  if (sonar) p = spawn('afplay', ['/tmp/vse-comp.wav']);
  await new Promise((r) => setTimeout(r, 2500));
  rta = []; vu = [];
  await new Promise((r) => setTimeout(r, 2500));
  p?.kill();
  const media = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / (xs.length || 1);
  const cab = rta[0]?.slice(0, 4) ?? [];
  const canal10 = media(rta.map((r) => r[4 + 9] ?? 0));
  console.log(`${etiqueta.padEnd(10)} VU2 canal 10: ${media(vu).toFixed(1)} dB · RTA cabecera [${cab}] · RTA byte 13: ${canal10.toFixed(1)} · max de la trama: ${Math.max(...(rta[0] ?? [0]))}`);
};
await muestra('silencio', false);
await muestra('con tono', true);
await t.desconectar();
