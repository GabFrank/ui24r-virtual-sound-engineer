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
  /** En qué unidad están las **magnitudes**: `dB`, `octavas`, `ms`. */
  readonly unidad: string;
  /** Valor previo leído de la consola, nunca calculado (INV-002). **En crudo.** */
  readonly valorPrevio: number;
  /** **En crudo.** */
  readonly valorEsperado: number;
  /** Lo que se le mandó a la consola. **En crudo: es lo que fue al cable.** */
  readonly valorEnviado: number;
  /**
   * Los dos valores que importan, **en la unidad declarada arriba**.
   *
   * **El diario decía `dB` al lado de tres números que no eran decibeles**, y
   * estuvo así desde el principio. Es el mismo error que este repositorio ya
   * cazó y arregló **en el motor** —donde un tope de 3 dB dejaba pasar saltos de
   * 61,9 dB porque comparaba decibeles contra el crudo del protocolo— y que
   * **acá nunca se arregló**: `CambioPropuesto` ganó `magnitudPropuesta` y
   * `magnitudEsperada`, el diario no.
   *
   * No era inofensivo. El historial de la sesión —cuánto se corrió cada ruta
   * desde que empezó— **se reconstruye del diario**, y sumar crudos etiquetados
   * en decibeles da una cuenta que no es de ninguna especie. Mientras el diario
   * fue sólo un registro para leer después, el error no se cobraba; el día que
   * alimenta al motor, sí.
   *
   * Los tres valores crudos se conservan: son lo que de verdad fue al cable, y
   * son con lo que se revierte. Lo que se agrega es la otra mitad.
   */
  readonly magnitudEsperada: number;
  readonly magnitudEnviada: number;
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
  /**
   * La medición que se hizo **después** de aplicar esta transacción, si la hubo.
   *
   * **Es lo que separa una serie de cambios de una rampa que escucha.** El motor
   * se niega a mover dos veces el mismo parámetro sin una medición en el medio
   * —*«hay que comprobar el efecto antes de volver a moverlo»*, que es la regla 4
   * del repositorio— y hasta hoy esa regla no podía aplicarse porque nadie
   * registraba la medición posterior.
   *
   * `null` mientras no la haya. **Que sea `null` no significa que no se midió:
   * significa que nadie lo anotó**, y el motor trata las dos igual a propósito —
   * fallar cerrado es lo correcto cuando la duda es si se escuchó o no.
   *
   * La columna `measurement_after_id` existe en `transaction_journal` desde el
   * esquema inicial y **nunca tuvo quien la llenara**; la entrada se serializa
   * entera como JSON en `datos`, así que esto no necesita migración.
   */
  readonly medicionPosteriorId: string | null;
  /**
   * Las rutas cuyo **nivel de trabajo** quedó establecido al cerrar esta
   * transacción.
   *
   * **Es el ancla de [ADR-034](../../../docs/adr/ADR-034-poner-el-nivel-de-monitor-y-retocarlo.md).**
   * Poner el nivel de un monitor y retocarlo son dos operaciones con presupuestos
   * distintos, y lo que las separa es si alguien ya fijó un nivel del que
   * desviarse. Antes de eso la referencia es el piso del soundcheck, y proteger
   * 4 dB alrededor del piso no protege a nadie.
   *
   * **Nace vacío y lo llena el usuario, no la aplicación.** La aplicación no
   * puede saber cuándo el músico está conforme con su cuña: eso lo dice él, y lo
   * anota la pantalla de monitor con `actualizar`, por el mismo camino que usa
   * `AplicarGananciaService.anotarEscucha` para `medicionPosteriorId` desde el
   * 2026-09-19. **Y la comparación es sólo del mecanismo**: el que se anota acá
   * lo decide una persona, y el otro lo decide el reloj.
   * Marcarlo solo —al llegar al techo, por ejemplo— sería la aplicación
   * declarando terminada una operación cuyo criterio de terminado es de otro.
   *
   * **Una ruta se establece una vez, no se desestablece, y tampoco se vuelve a
   * establecer.** Volver atrás devolvería la ruta a la operación sin presupuesto,
   * y con eso cualquiera podría recuperar la rampa entera diciendo que el nivel ya
   * no vale. Si un músico quiere otro nivel de trabajo, eso es una decisión suya y
   * es otra cosa que la que esta pieza resuelve.
   *
   * **Y las dos últimas cláusulas se escribieron antes de ser ciertas.** Este
   * párrafo razonaba por qué desestablecer sería peligroso y no impedía nada:
   * `historialDeLaSesion` rebasaba el acumulado **por cada entrada** que listara
   * la ruta, así que marcarla en cada transacción devolvía los 4 dB enteros sin
   * límite —lo mismo que desestablecer, por la puerta de al lado—. Lo encontró una
   * auditoría de fidelidad el 2026-09-17, junto con que este campo tampoco se
   * cruzaba contra lo que la transacción de verdad tocaba. **Las garantías viven
   * en `historialDeLaSesion`, que es quien lee esto**, y este campo es una lista
   * sin validar: `Diario.actualizar` acepta lo que le den.
   *
   * Se serializa dentro del JSON de `datos` en `transaction_journal`, así que no
   * necesita migración —el mismo motivo por el que no la necesitó
   * `medicionPosteriorId`—. **Una entrada vieja no lo trae**, y quien lo lea
   * tiene que tratar la ausencia como «ninguna»: ver `historialDeLaSesion`.
   */
  readonly nivelEstablecidoEn: readonly string[];
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
  /**
   * Todas las transacciones de una sesión, **de la más vieja a la más nueva**.
   *
   * Es de donde sale el historial que el motor necesita para frenar: ver
   * `historialDeLaSesion`. El orden importa —la última que tocó cada ruta es la
   * que decide si hubo escucha después— y por eso lo garantiza el almacén y no
   * el que llama.
   */
  deLaSesion(sessionId: string): Promise<readonly EntradaDiario[]>;
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

  async deLaSesion(sessionId: string): Promise<readonly EntradaDiario[]> {
    return [...this.datos.values()]
      .filter((e) => e.sessionId === sessionId)
      .sort((a, b) => a.creadoEl.localeCompare(b.creadoEl));
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
    // Se anota cuando la medición ocurra, con `actualizar`. Nace en null porque
    // al abrir la transacción todavía no se escribió nada que medir.
    medicionPosteriorId: null,
    // Nace vacío por el mismo motivo: al abrir la transacción el músico todavía
    // no escuchó nada, así que nadie puede haber dicho que así está bien.
    nivelEstablecidoEn: [],
    cambios: cambios.map((c) => ({
      path: c.path,
      unidad: c.unidad,
      valorPrevio: valoresPrevios.get(c.path) ?? Number.NaN,
      valorEsperado: c.valorEsperado,
      valorEnviado: c.valorPropuesto,
      // La otra mitad, en la unidad declarada. `CambioPropuesto` las trae desde
      // que INV-004 empezó a aplicarse de verdad; el diario las ignoraba.
      magnitudEsperada: c.magnitudEsperada,
      magnitudEnviada: c.magnitudPropuesta,
      enviadoEl: null,
      confirmadoPor: null,
      verificado: false,
    })),
  };
}
