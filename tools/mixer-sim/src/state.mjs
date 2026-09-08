// Estado de la consola simulada. Los nombres y niveles son los de una banda
// real, para que las pantallas se vean como se van a ver de verdad.

export const CANALES = [
  { idx: 1,  nombre: 'VOZ PRINCIPAL', gainDb: 34, faderDb: -2.5,  nivelBase: -18, dinamica: 9 },
  { idx: 2,  nombre: 'CORO 1',        gainDb: 32, faderDb: -6.0,  nivelBase: -24, dinamica: 7 },
  { idx: 3,  nombre: 'CORO 2',        gainDb: 32, faderDb: -6.5,  nivelBase: -25, dinamica: 7 },
  { idx: 4,  nombre: 'GUITARRA AC',   gainDb: 26, faderDb: -4.0,  nivelBase: -20, dinamica: 6 },
  { idx: 5,  nombre: 'GUITARRA EL',   gainDb: 22, faderDb: -5.5,  nivelBase: -21, dinamica: 5 },
  { idx: 6,  nombre: 'BAJO',          gainDb: 18, faderDb: -3.0,  nivelBase: -16, dinamica: 4 },
  { idx: 7,  nombre: 'CAJON',         gainDb: 28, faderDb: -4.5,  nivelBase: -19, dinamica: 12 },
  { idx: 8,  nombre: 'CONGA',         gainDb: 30, faderDb: -7.0,  nivelBase: -23, dinamica: 11 },
  { idx: 9,  nombre: 'SHAKER',        gainDb: 38, faderDb: -9.0,  nivelBase: -28, dinamica: 8 },
  { idx: 10, nombre: 'FLAUTA',        gainDb: 33, faderDb: -5.0,  nivelBase: -22, dinamica: 8 },
  { idx: 11, nombre: 'TECLADO L',     gainDb: 12, faderDb: -6.0,  nivelBase: -22, dinamica: 5 },
  { idx: 12, nombre: 'TECLADO R',     gainDb: 12, faderDb: -6.0,  nivelBase: -22, dinamica: 5 },
];

export function dbAFader(db) {
  if (db <= -90) return 0;
  const v = Math.pow(10, (Math.min(10, db) - 10) / (20 * 2.2));
  return Math.max(0, Math.min(1, v));
}

export function gainANormalizado(db) {
  // La consola expone la ganancia de entrada de -6 a 57 dB.
  return Math.max(0, Math.min(1, (db + 6) / 63));
}

export function estadoInicial() {
  const estado = new Map();
  for (const c of CANALES) {
    estado.set(`i.${c.idx}.mix`, dbAFader(c.faderDb));
    estado.set(`i.${c.idx}.mute`, 0);
    estado.set(`i.${c.idx}.pan`, 0.5);
    estado.set(`hw.${c.idx}.gain`, gainANormalizado(c.gainDb));
    estado.set(`hw.${c.idx}.phantom`, c.idx <= 4 ? 1 : 0);
  }
  estado.set('m.mix', dbAFader(0));
  estado.set('m.mute', 0);
  estado.set('var.mtk.soundcheck', 0);
  estado.set('p.0.mute', 1);
  estado.set('p.1.mute', 1);
  return estado;
}

export function nombres() {
  return CANALES.map((c) => [`i.${c.idx}.name`, c.nombre]);
}
