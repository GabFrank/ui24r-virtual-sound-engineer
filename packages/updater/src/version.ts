/**
 * Comparación de versiones semánticas.
 *
 * No se usa una biblioteca porque hace falta muy poco y porque este código
 * decide si se reemplaza la aplicación instalada: conviene poder leerlo entero.
 */

export interface Version {
  readonly mayor: number;
  readonly menor: number;
  readonly parche: number;
  /** Vacío en una versión estable. `['alpha', 1]` en `1.2.0-alpha.1`. */
  readonly preLanzamiento: readonly (string | number)[];
}

const FORMATO = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

/** Devuelve `null` si el texto no es una versión semántica. Nunca lanza. */
export function parsearVersion(texto: string): Version | null {
  const m = FORMATO.exec(texto.trim());
  if (m === null) return null;
  const [, mayor, menor, parche, pre] = m;
  return {
    mayor: Number(mayor),
    menor: Number(menor),
    parche: Number(parche),
    preLanzamiento: pre === undefined
      ? []
      : pre.split('.').map((p) => (/^\d+$/.test(p) ? Number(p) : p)),
  };
}

export function esEstable(v: Version): boolean {
  return v.preLanzamiento.length === 0;
}

/** Negativo si `a` es anterior a `b`, cero si son la misma, positivo si posterior. */
export function compararVersiones(a: Version, b: Version): number {
  if (a.mayor !== b.mayor) return a.mayor - b.mayor;
  if (a.menor !== b.menor) return a.menor - b.menor;
  if (a.parche !== b.parche) return a.parche - b.parche;

  // Una versión con pre-lanzamiento es ANTERIOR a la estable del mismo número:
  // 1.2.0-alpha.1 viene antes que 1.2.0. Es la regla de semver y es fácil de
  // invertir por descuido.
  const aPre = a.preLanzamiento;
  const bPre = b.preLanzamiento;
  if (aPre.length === 0 && bPre.length === 0) return 0;
  if (aPre.length === 0) return 1;
  if (bPre.length === 0) return -1;

  for (let i = 0; i < Math.max(aPre.length, bPre.length); i++) {
    const x = aPre[i];
    const y = bPre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    const xNum = typeof x === 'number';
    const yNum = typeof y === 'number';
    // Los identificadores numéricos ordenan antes que los alfanuméricos.
    if (xNum && !yNum) return -1;
    if (!xNum && yNum) return 1;
    if (xNum && yNum) return (x as number) - (y as number);
    return String(x) < String(y) ? -1 : 1;
  }
  return 0;
}

export function formatearVersion(v: Version): string {
  const base = `${v.mayor}.${v.menor}.${v.parche}`;
  return v.preLanzamiento.length === 0 ? base : `${base}-${v.preLanzamiento.join('.')}`;
}
