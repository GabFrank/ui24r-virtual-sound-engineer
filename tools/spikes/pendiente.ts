/**
 * Un papelito en disco con lo que se escribió y todavía no se restauró.
 *
 * **Qué agujero tapa.** `conRestauracion` declara honestamente lo que no cubre:
 * *«`SIGKILL` y quedarse sin corriente. No hay vuelta.»* Eso era cierto mientras
 * lo único que sabía qué había que restaurar viviera en la memoria del proceso
 * que se acaba de morir. Con el papelito, **sí hay vuelta**: la próxima corrida
 * lo encuentra y avisa, y `reparar-pendiente.ts` lo deshace.
 *
 * **Y no es hipotético.** El 2026-09-16, al cortar `banco-en-vivo.ts`, la señal
 * llegó y la restauración **arrancó** —alcanzó a imprimir que arrancaba— pero al
 * proceso lo mataron antes de que terminara de escribir. La consola quedó con el
 * supresor apagado y un envío de auxiliar abierto. Se detectó releyendo por HTTP,
 * a mano, porque alguien se acordó de mirar. Sin ese acordarse, quedaba así.
 *
 * **Por qué no se arregla haciendo la restauración más rápida.** Es lo primero
 * que uno piensa y está mal. Buena parte de esos segundos son una **espera de
 * seguridad**: entre matar el tono y volver a encender el supresor hay que
 * esperar a que el tono muera de verdad, porque reencenderlo con el tono sonando
 * es exactamente como se plantó la notch de la 104. Acortar esa espera cambia un
 * riesgo por otro peor.
 *
 * **Lo que este módulo NO promete.** No restaura solo: **avisa**. Restaurar sin
 * que nadie mire, con valores que quedaron de una corrida que se murió quién sabe
 * cómo, es escribir a ciegas sobre la consola de alguien. El papelito dice qué
 * quedó tocado y con qué valores volver; la decisión de aplicarlo es de quien
 * corre `reparar-pendiente.ts`.
 *
 * Tampoco cubre que el disco se pierda. Cubre lo que pasa de verdad: un proceso
 * que muere de golpe.
 */
import { writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Dónde vive el papelito.
 *
 * **En el repositorio y no en `/tmp`, a propósito.** El caso que hay que cubrir
 * incluye quedarse sin corriente, y muchos sistemas vacían el temporal al
 * arrancar — justo cuando el papelito haría más falta. Está en `.gitignore`: es
 * estado de una máquina, no del proyecto.
 */
export const RUTA_PENDIENTE = join(
  new URL('../..', import.meta.url).pathname, '.restauracion-pendiente.json',
);

export interface Pendiente {
  /** Cuándo se anotó, en ISO, para que quien lo encuentre sepa de cuándo es. */
  readonly cuando: string;
  /** Qué guion lo dejó. Sin esto no se puede reconstruir qué estaba pasando. */
  readonly guion: string;
  readonly maquina: string;
  /** Clave y valor **leídos del aparato antes de escribir**. */
  readonly pares: readonly (readonly [string, number])[];
}

/**
 * Anota lo que se está por tocar. Se llama **antes** de la primera escritura.
 *
 * Si se llamara después, la ventana entre escribir y anotar es exactamente el
 * agujero que esto viene a tapar.
 */
export function anotarPendiente(
  guion: string,
  maquina: string,
  pares: readonly (readonly [string, number])[],
): void {
  const p: Pendiente = { cuando: new Date().toISOString(), guion, maquina, pares };
  writeFileSync(RUTA_PENDIENTE, `${JSON.stringify(p, null, 2)}\n`);
}

/** Borra el papelito. Se llama **después** de que la restauración se verificó. */
export function cerrarPendiente(): void {
  rmSync(RUTA_PENDIENTE, { force: true });
}

/** Lo que haya quedado sin restaurar, o `null`. */
export function leerPendiente(): Pendiente | null {
  if (!existsSync(RUTA_PENDIENTE)) return null;
  try {
    return JSON.parse(readFileSync(RUTA_PENDIENTE, 'utf8')) as Pendiente;
  } catch {
    // **Un papelito ilegible es peor que ninguno si se traga el error.** Se
    // informa como pendiente desconocido en vez de devolver `null`, que se leería
    // como «no hay nada que restaurar».
    return {
      cuando: '(ilegible)', guion: '(ilegible)', maquina: '(ilegible)', pares: [],
    };
  }
}

/**
 * Avisa por la salida de error si quedó algo de una corrida anterior.
 *
 * **Avisa y deja seguir.** Abortar la corrida nueva sería peor: la consola ya
 * está tocada, y la corrida nueva normalmente lee el estado y lo restaura al
 * terminar, así que suele arreglar más de lo que rompe. Lo que no puede pasar es
 * que nadie se entere.
 */
export function avisarSiHayPendiente(): void {
  const p = leerPendiente();
  if (p === null) return;
  console.error('');
  console.error('=== ATENCION: quedo una restauracion sin terminar ===');
  console.error(`   la dejo ${p.guion} el ${p.cuando} en ${p.maquina}`);
  for (const [k, v] of p.pares) console.error(`     ${k} tiene que volver a ${v}`);
  console.error('   Se arregla con: node --experimental-strip-types '
    + 'tools/spikes/reparar-pendiente.ts');
  console.error('');
}
