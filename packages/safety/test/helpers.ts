import type { MixerDomainAPI, ReadResult, WriteResult, ConnectionState,
  DeviceInfo, BulkExternalChange, PresenciaAjena } from '@vse/mixer-adapter';
import type { ContextoSeguridad, CambioPropuesto } from '../src/types.ts';
import { LIMITES } from '@vse/domain';
import { entrada } from '@vse/mixer-adapter';
import type { ParameterKind } from '@vse/domain';

/**
 * Mezcladora falsa con memoria, para ejercitar el Safety Engine y el ejecutor
 * sin consola. Permite provocar a voluntad lo que en la real es difícil:
 * conflictos, escrituras sin confirmar y caídas a mitad de transacción.
 */
export class MezcladoraFalsa implements MixerDomainAPI {
  estadoConexion: ConnectionState = 'CONNECTED';
  readonly escrituras: { path: string; valor: number }[] = [];

  private readonly valores = new Map<string, number>();
  private readonly confirmados = new Set<string>();

  /** Rutas que devolverán conflicto al escribirse. */
  conflictoEn = new Set<string>();
  /** Rutas que se aceptarán pero sin confirmación. */
  sinConfirmarEn = new Set<string>();
  /** Lanza al llegar a esta escritura, simulando una caída del proceso. */
  caerEnEscrituraNumero: number | null = null;

  /**
   * Estado del almacén confirmado que devuelve `leer`.
   *
   * Es configurable porque antes devolvía siempre VALID, y eso dejaba sin
   * ejercitar la rama del ejecutor que protege de escribir después de una
   * avalancha: la suite solo podía provocar el otro caso, el de la lectura sin
   * confirmar.
   */
  estadoDelAlmacen: ReadResult['storeState'] = 'VALID';

  /** Instantáneas que la consola dice tener, para verificar INV-001. */
  snapshots: string[] = [];

  /**
   * Si hay otro operador tocando la consola.
   *
   * Configurable, y por omisión **no hay nadie**: la presencia se infiere del
   * tráfico ajeno y en una suite sin consola no hay tráfico ajeno que inferir.
   * Ponerlo en `true` a mano es la forma de ejercitar las ramas que dependen
   * de que alguien más esté trabajando.
   */
  hayOtroOperador = false;

  constructor(iniciales: Record<string, number> = {}) {
    for (const [k, v] of Object.entries(iniciales)) {
      this.valores.set(k, v);
      this.confirmados.add(k);
    }
  }

  async conectar(): Promise<void> { this.estadoConexion = 'CONNECTED'; }
  async releerEstado(): Promise<void> {
    // La consola de prueba no pierde el estado, asi que releer no cambia nada.
  }

  async desconectar(): Promise<void> { this.estadoConexion = 'DISCONNECTED'; }
  async infoDispositivo(): Promise<DeviceInfo> {
    return { modelo: 'Ui24R-falsa', firmware: '0.0.0' };
  }

  async listarSnapshots(): Promise<readonly string[]> {
    return this.snapshots;
  }

  /**
   * La mezcladora falsa guarda igual que la de verdad: agrega a la lista.
   *
   * Se le pone un nombre fijo para que los tests puedan predecirlo. Devolver
   * `null` se consigue vaciando `puedeGuardarInstantanea`, que es como se
   * prueba el camino en el que no hay punto de retorno.
   */
  puedeGuardarInstantanea = true;

  /**
   * El analizador, en la mezcladora falsa.
   *
   * No hace nada porque ninguna prueba del ejecutor lo usa: el analizador es de
   * lectura y las transacciones son de escritura. Están para que el tipo cierre
   * y para que, el día que algo del ejecutor los necesite, se vea que faltan.
   */
  alEspectro(): () => void { return () => {}; }
  tomarAnalizador(): boolean { return false; }
  devolverAnalizador(): void {}
  fuenteOriginalDelAnalizador(): string | null { return null; }

  async guardarInstantanea(): Promise<string | null> {
    if (!this.puedeGuardarInstantanea) return null;
    const nombre = 'VSE_AUTO_1';
    if (!this.snapshots.includes(nombre)) this.snapshots = [...this.snapshots, nombre];
    return nombre;
  }

  leer(parametro: string): ReadResult {
    const tiene = this.confirmados.has(parametro);
    return {
      value: this.valores.get(parametro) ?? 0,
      confirmedAt: tiene ? new Date().toISOString() : null,
      source: 'EXTERNAL',
      version: 1,
      storeState: this.estadoDelAlmacen,
    };
  }

  /** Gancho para observar o hacer fallar una escritura desde un test. */
  alEscribir: ((parametro: string, valor: number) => void) | null = null;

  async escribir(parametro: string, valor: number, esperado: number): Promise<WriteResult> {
    this.alEscribir?.(parametro, valor);
    if (this.caerEnEscrituraNumero !== null &&
        this.escrituras.length === this.caerEnEscrituraNumero) {
      throw new Error('caída simulada del proceso');
    }

    const actual = this.valores.get(parametro) ?? 0;
    if (this.conflictoEn.has(parametro) || Math.abs(actual - esperado) > 1e-9) {
      return {
        status: 'CONFLICT',
        confirmedBy: 'NONE',
        actual,
        motivo: `se esperaba ${esperado} y hay ${actual}`,
      };
    }

    this.escrituras.push({ path: parametro, valor });

    if (this.sinConfirmarEn.has(parametro)) {
      return { status: 'UNVERIFIED', confirmedBy: 'TIMEOUT', actual: null, motivo: 'sin confirmación' };
    }

    this.valores.set(parametro, valor);
    this.confirmados.add(parametro);
    // `WITNESS` y no `ECHO`: contra esta consola el eco no existe, así que un
    // doble que lo devolviera estaría fingiendo algo que el adaptador real no
    // puede producir (ADR-024).
    return { status: 'APPLIED', confirmedBy: 'WITNESS', actual: valor, motivo: null };
  }

  /** Simula que otro cliente cambió un valor. */
  cambioExterno(parametro: string, valor: number): void {
    this.valores.set(parametro, valor);
    this.confirmados.add(parametro);
  }

  /** Simula un parámetro que nunca llegó por el protocolo. */
  olvidar(parametro: string): void {
    this.confirmados.delete(parametro);
  }

  alCambiarExterno(): () => void { return () => {}; }
  otroOperador(): PresenciaAjena {
    return { presente: this.hayOtroOperador, desdeHaceMs: this.hayOtroOperador ? 0 : null };
  }

  alCambioMasivo(_cb: (e: BulkExternalChange) => void): () => void { return () => {}; }
  alCambiarConexion(): () => void { return () => {}; }
}

export function contexto(parcial: Partial<ContextoSeguridad> = {}): ContextoSeguridad {
  return {
    sessionState: 'CHANNEL_SETUP',
    nivelAutonomia: 'ASSISTED',
    acumuladoPorRuta: new Map(),
    rutasConMedicionPosterior: new Set(),
    rutasYaTocadas: new Set(),
    techoPorRuta: new Map(),
    hayTakeDeSoundcheckActivo: false,
    // **Un PREFIJO de bus, y con la forma que el aparato tiene.** Acá decía
    // `new Set(['m.eq.b1.gain'])` -- una ruta completa, y encima inventada: el
    // ecualizador del general es un grafico de 31 bandas por lado
    // (`m.eq.peak.l.0`…`.30`), sin `.b1` y sin `.gain`. Era el UNICO elemento
    // del conjunto y el unico camino por el que el motor aprueba una escritura
    // de sala, asi que el diseño de la lista blanca de INV-008 nunca se probo
    // contra la forma real. Lo encontro una auditoria.
    busesDeSalidaPermitidos: new Set(['m']),
    confianza: 'HIGH',
    aprobacionExplicita: true,
    ...parcial,
  };
}

/**
 * El cambio con que se recorre el inventario de claves de la consola.
 *
 * **Existe para que el test y la herramienta midan la misma puerta.** Estaban
 * los dos construyendo el cambio a mano, y se separaron dos veces:
 *
 * 1. La copia de `tools/inventario/permisos.ts` se quedó sin `techoPorRuta`
 *    cuando ADR-028 lo agregó al contexto, y la herramienta estalló con un
 *    `TypeError` desde ese commit sin que nadie se enterara --`tools/` no era
 *    espacio de trabajo, así que `lint` no lo miraba--.
 * 2. Las dos declaraban `unidad: 'dB'` para las 6732 claves. Cuando
 *    `verificarLimite` empezó a comparar la unidad contra la del tope, el test
 *    se arregló y la herramienta se quedó contando **858 en vez de 930**: el
 *    pasa-altos declara octavas y el silencio de canal, canales.
 *
 * Dos definiciones de la misma cosa pueden separarse en silencio, y las dos
 * veces se separaron. Ésta es una.
 *
 * **La unidad se lee de `LIMITES`, no se escribe acá**, por el mismo motivo: si
 * alguien cambia la unidad de un tope, esto sigue midiendo la puerta que corre.
 */
export function cambioDeInventario(kind: ParameterKind, path: string): CambioPropuesto {
  // **Si la ruta tiene ley medida, el par va COHERENTE.** Y esto no es un
  // relajamiento del recorrido: es lo que lo mantiene midiendo lo que dice.
  //
  // Hasta el 2026-09-13 el crudo y la magnitud iban con el mismo número —«crudo 1
  // declarado como 1 dB»—, absurdo a propósito, porque lo que se mide acá es la
  // **puerta de permiso** y no la conversión. Eso funcionaba mientras nada atara
  // las dos cosas. Ese mismo día se arregló `entrada()`, que no resolvía ninguna
  // ruta concreta, y con eso `verificarAtadura` empezó a disparar de verdad: las
  // 96 rutas del ecualizador con ley medida —24 canales por 4 leyes— pasaron a
  // rechazarse con `MAGNITUD_NO_ATADA` y la cuenta cayó de 930 a 834.
  //
  // **El rechazo era correcto**: en `i.N.eq.b1.freq` el crudo 1 son 22 050 Hz y el
  // cambio declaraba 1. Lo que dejó de ser cierto es la premisa del arnés —que los
  // números no importan—, así que se arregla el arnés y no el número esperado.
  // Cambiar el 930 habría escondido que la guarda empezó a funcionar.
  const e = entrada(path);
  if (e !== undefined && e.estado === 'PROBADO') {
    // Un crudo del tramo medido, y la magnitud que ESE crudo produce.
    const raw = (e.rawMin + e.rawMax) / 2;
    return {
      kind, path, unidad: e.unidad,
      valorPropuesto: raw, valorEsperado: raw,
      magnitudPropuesta: e.fromRaw(raw), magnitudEsperada: e.fromRaw(raw),
    } as CambioPropuesto;
  }
  return {
    kind,
    path,
    unidad: LIMITES[kind]?.unidad ?? 'dB',
    // Sin ley medida no hay con qué atar, así que el par sigue siendo el de antes
    // y el motor sigue juzgando lo declarado. Que sea absurdo está dicho acá para
    // que nadie lo lea como una afirmación sobre unidades.
    valorPropuesto: 1,
    valorEsperado: 0,
    magnitudPropuesta: 1,
    magnitudEsperada: 0,
  } as CambioPropuesto;
}
