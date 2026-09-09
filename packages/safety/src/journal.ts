import type { CambioPropuesto } from './types.ts';

/**
 * Diario de transacciones. Implementa INV-020.
 *
 * Se escribe **antes** de cada escritura a la consola, no después. La razón es
 * el caso que el plan original no contemplaba: si la aplicación se cae a mitad
 * de una transacción de cuatro cambios, al arrancar hay que saber cuáles se
 * enviaron. Sin diario previo no hay forma de averiguarlo, porque el protocolo
 * tampoco confirma.
 *
 * Y al recuperar **nunca se reaplica**: se lee el estado real de la consola,
 * se muestra la diferencia y decide una persona. Reaplicar a ciegas después de
 * una caída es cómo se duplica un cambio.
 */

export type EstadoEntrada =
  | 'ABIERTA'
  | 'APLICANDO'
  | 'VERIFICANDO'
  | 'APLICADA'
  | 'PARCIAL'
  | 'CONFLICTO'
  | 'SUSPENDIDA'
  | 'REVERTIDA';

export interface CambioRegistrado {
  readonly path: string;
  readonly unidad: string;
  /** Valor previo leído de la consola, nunca calculado (INV-002). */
  readonly valorPrevio: number;
  readonly valorEsperado: number;
  readonly valorEnviado: number;
  readonly enviadoEl: string | null;
  /**
   * Cómo se confirmó el cambio.
   *
   * `WITNESS` es la conexión testigo (ADR-024) y es lo que hoy produce una
   * escritura aplicada. `ECHO` sigue en la lista porque el diario guarda lo que
   * se escribió antes de medir que esta consola no devuelve eco: una entrada
   * vieja tiene que poder leerse.
   */
  readonly confirmadoPor: 'ECHO' | 'VU' | 'WITNESS' | 'TIMEOUT' | 'NONE' | null;
  readonly verificado: boolean;
}

export interface EntradaDiario {
  readonly id: string;
  readonly sessionId: string;
  readonly estado: EstadoEntrada;
  readonly snapshotRef: string | null;
  readonly razon: string;
  readonly nivelAutonomia: string;
  readonly creadoEl: string;
  readonly cerradoEl: string | null;
  readonly cambios: readonly CambioRegistrado[];
}

/**
 * Puerto del diario.
 *
 * **La única implementación es `DiarioEnMemoria`.** El comentario anterior decía
 * que la persistente «vive en la app» y no vive en ninguna parte: la tabla
 * `transaction_journal` está en el esquema y no la escribe nadie, así que lo
 * que INV-020 protege —sobrevivir a una caída a mitad de una transacción— está
 * probado solo contra un `Map`. Se escribe con el primer llamador del ejecutor,
 * que es también lo que le falta a la cláusula de INV-034.
 */
export interface Diario {
  abrir(entrada: EntradaDiario): Promise<void>;
  actualizar(id: string, cambios: Partial<EntradaDiario>): Promise<void>;
  registrarCambio(id: string, indice: number, cambio: CambioRegistrado): Promise<void>;
  leer(id: string): Promise<EntradaDiario | undefined>;
  /** Transacciones que quedaron a medio aplicar tras una caída. */
  interrumpidas(): Promise<readonly EntradaDiario[]>;
}

/** Implementación en memoria, para tests y para el simulador. */
export class DiarioEnMemoria implements Diario {
  private readonly datos = new Map<string, EntradaDiario>();

  async abrir(entrada: EntradaDiario): Promise<void> {
    this.datos.set(entrada.id, entrada);
  }

  async actualizar(id: string, parcial: Partial<EntradaDiario>): Promise<void> {
    const previo = this.datos.get(id);
    if (!previo) throw new Error(`transacción desconocida en el diario: ${id}`);
    this.datos.set(id, { ...previo, ...parcial });
  }

  async registrarCambio(id: string, indice: number, cambio: CambioRegistrado): Promise<void> {
    const previo = this.datos.get(id);
    if (!previo) throw new Error(`transacción desconocida en el diario: ${id}`);
    const cambios = [...previo.cambios];
    cambios[indice] = cambio;
    this.datos.set(id, { ...previo, cambios });
  }

  async leer(id: string): Promise<EntradaDiario | undefined> {
    return this.datos.get(id);
  }

  async interrumpidas(): Promise<readonly EntradaDiario[]> {
    return [...this.datos.values()].filter(
      (e) => e.estado === 'APLICANDO' || e.estado === 'VERIFICANDO',
    );
  }

  /** Solo para tests: simula que el proceso murió y volvió a arrancar. */
  volcar(): readonly EntradaDiario[] {
    return [...this.datos.values()];
  }
}

export function entradaDesdeCambios(
  id: string,
  sessionId: string,
  razon: string,
  nivelAutonomia: string,
  snapshotRef: string | null,
  cambios: readonly CambioPropuesto[],
  valoresPrevios: ReadonlyMap<string, number>,
): EntradaDiario {
  return {
    id,
    sessionId,
    estado: 'ABIERTA',
    snapshotRef,
    razon,
    nivelAutonomia,
    creadoEl: new Date().toISOString(),
    cerradoEl: null,
    cambios: cambios.map((c) => ({
      path: c.path,
      unidad: c.unidad,
      valorPrevio: valoresPrevios.get(c.path) ?? Number.NaN,
      valorEsperado: c.valorEsperado,
      valorEnviado: c.valorPropuesto,
      enviadoEl: null,
      confirmadoPor: null,
      verificado: false,
    })),
  };
}
