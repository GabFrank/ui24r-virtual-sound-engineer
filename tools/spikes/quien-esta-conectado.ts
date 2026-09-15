/**
 * Qué hay enchufado a la consola, leído del aparato.
 *
 * **Sólo lee.** Existe porque el registro tenía anotado el canal del B2 y no el
 * de la entrada de línea, y adivinarlo era exactamente lo que no hay que hacer
 * con algo que después decide dónde se manda una señal de medición.
 *
 * Uso: `node tools/spikes/quien-esta-conectado.ts [ip]`. La IP **no** está
 * fija: la consola toma la que le dé el router y ya cambió entre sesiones
 * (`192.168.0.49` el 2026-09-08, `192.168.0.78` el 2026-09-10). El valor por
 * defecto es el último visto, no una garantía.
 */
import { estadoPorHttp } from './canal-muerto.ts';

const IP_POR_DEFECTO = '192.168.0.78';
const e = await estadoPorHttp(process.argv[2] ?? IP_POR_DEFECTO);
console.log('canal | fuente    | nombre               | silencio | fader    | fantasma');
for (let n = 0; n < 24; n++) {
  const src = e.get(`i.${n}.src`) ?? '—';
  const nombre = e.get(`i.${n}.name`) ?? '';
  const mute = e.get(`i.${n}.mute`) ?? '';
  const mix = e.get(`i.${n}.mix`) ?? '';
  const ph = src.startsWith('hw.') ? (e.get(`${src}.phantom`) ?? '') : '';
  if (src === 'none' && nombre === '') continue;
  console.log(
    String(n + 1).padStart(5), '|', src.padEnd(9), '|', nombre.padEnd(20), '|',
    (mute === '1' ? 'SÍ' : 'no').padEnd(8), '|', mix.slice(0, 8).padEnd(8), '|',
    ph === '1' ? 'ENCENDIDA' : ph === '0' ? 'apagada' : '');
}
console.log('');
console.log('claves leídas:', e.size);
