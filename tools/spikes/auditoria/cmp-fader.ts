import { faderADb, gananciaADb } from '../../../packages/mixer-adapter/src/conversiones.ts';
// medido: crudo -> bytes del medidor post-fader (b64), tono -12 dBFS, pre=94
const medido: [number, number][] = [
  [1, 124], [0.95, 117], [0.9, 110], [0.85, 104], [0.8, 98], [0.7647058824, 94],
  [0.75, 92], [0.7, 87], [0.65, 81], [0.6, 74], [0.55, 67], [0.5, 59],
  [0.45, 50], [0.4, 40], [0.35, 27], [0.3, 14],
];
console.log('crudo\tdB_medido\tdB_doc\t\tdif');
for (const [c, b] of medido) {
  const dbMed = (b - 94) / 3;           // 94 = unidad, 3 bytes por dB
  const dbDoc = faderADb(c);
  console.log(`${c}\t${dbMed.toFixed(2)}\t\t${dbDoc.toFixed(2)}\t\t${(dbMed - dbDoc).toFixed(2)}`);
}
console.log('\ndoc: fader 1.0 =', faderADb(1), ' 0.7647058824 =', faderADb(0.7647058824).toFixed(3));
console.log('\nganancia doc por crudo:');
for (const c of [0, 0.04, 0.07, 0.10, 0.13, 0.16, 0.19, 0.22, 0.25, 0.26, 0.29, 0.32, 0.35, 0.38, 0.41, 0.44, 0.47, 0.50, 0.51, 0.52, 0.55, 0.60, 0.70, 0.80, 0.90, 1.0]) {
  console.log(`  ${c}\t${gananciaADb(c)}`);
}
