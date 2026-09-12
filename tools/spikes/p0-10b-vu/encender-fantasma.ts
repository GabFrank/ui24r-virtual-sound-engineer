/**
 * Encender la alimentacion fantasma del canal 9, con el monitor protegido.
 *
 * **Esto cruza INV-007 a sabiendas.** La invariante deja `hw.N.phantom` en solo
 * lectura PARA LA APLICACION, y por buenas razones: un fantasma que se enciende
 * solo puede danar un microfono de cinta, y conmutarlo da un golpe seco que con
 * el general arriba sale por los parlantes. Esto es una herramienta corrida a
 * mano con autorizacion explicita del usuario --2026-09-10, «tu puedes
 * encenderlo, yo no estoy ahi»-- y no cambia lo que la aplicacion puede hacer.
 *
 * Es seguro en esta sala por tres cosas comprobables:
 *   - lo enchufado en el 9 es un Behringer B2, de condensador, que SIN fantasma
 *     no entrega absolutamente nada;
 *   - no hay ningun microfono de cinta conectado;
 *   - el general se baja antes de conmutar, asi que el golpe no llega al Rockit.
 *
 * El orden importa y es el mismo que se usaria a mano: punto de retorno, general
 * abajo, canal en silencio --hay un condensador enfrentado a un monitor a 1,7 m,
 * o sea un lazo armado--, fantasma, esperar a que el capsulo cargue, comprobar
 * que entre senal, y dejar el general como estaba.
 */
import { Ui24rTransport, Ui24rMixerAdapter, codificarSetd, decodificar,
         decodificarVuCanales, dbDeMedidor } from '@vse/mixer-adapter';
import { exigirClave } from '../canal-muerto.ts';

const maquina = process.argv[2] ?? '192.168.0.78';
const N = 8;               // canal 9
const t = new Ui24rTransport();
const app = new Ui24rMixerAdapter(t);

const crudo = new Map<string, number>();
let nivel = -Infinity;
t.alRecibir((l) => {
  const m = decodificar(l);
  if (m.tipo === 'SETD') crudo.set(m.path, m.valor);
  if (l.startsWith('VU2^')) {
    const c = decodificarVuCanales(l.slice(4))[N];
    if (c) { const db = dbDeMedidor(c.entrada); if (Number.isFinite(db)) nivel = Math.max(nivel, db); }
  }
});

await app.conectar(maquina);
await new Promise((r) => setTimeout(r, 6000));

const punto = await app.guardarInstantanea();
console.log(`punto de retorno: ${punto ?? 'NO SE PUDO'}`);
if (punto === null) { await app.desconectar(); process.exit(1); }

// **Se exige la clave en vez de suponerla.** Un `?? valor` antes de una
// escritura no es un valor por omision: es una suposicion disfrazada de
// lectura, y con una lectura HTTP fallida --que devuelve un mapa vacio--
// restauraba la consola a un numero inventado. Auditoria del 2026-09-12.
const generalAntes = exigirClave(crudo, 'm.mix');
const muteAntes = crudo.get(`i.${N}.mute`) ?? 0;
console.log(`general antes: ${generalAntes} · i.${N}.mute antes: ${muteAntes}`);

console.log('');
console.log('1. general abajo y canal 9 en silencio (hay un lazo armado en la sala)');
t.enviar(codificarSetd('m.mix', 0));
t.enviar(codificarSetd(`i.${N}.mute`, 1));
await new Promise((r) => setTimeout(r, 1500));

console.log('2. fantasma encendido');
t.enviar(codificarSetd(`hw.${N}.phantom`, 1));

console.log('3. esperando a que cargue el capsulo (8 s)');
await new Promise((r) => setTimeout(r, 8000));

nivel = -Infinity;
await new Promise((r) => setTimeout(r, 6000));
console.log('');
console.log(`nivel de entrada del canal 9: ${nivel === -Infinity ? 'SIN SENAL — el microfono sigue mudo' : nivel.toFixed(1) + ' dB'}`);

console.log('');
console.log('4. el general vuelve donde estaba; el canal 9 queda EN SILENCIO a proposito');
t.enviar(codificarSetd('m.mix', generalAntes));
await new Promise((r) => setTimeout(r, 1200));
console.log('   el silencio del canal se levanta cuando se decida provocar el lazo, no antes');

await app.desconectar();
