import type { MixerDomainAPI, ReadResult, WriteResult, ConnectionState,
  DeviceInfo, BulkExternalChange } from '@vse/mixer-adapter';
import type { ContextoSeguridad } from '../src/types.ts';

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
    hayTakeDeSoundcheckActivo: false,
    busesDeSalidaPermitidos: new Set(['m.eq.b1.gain']),
    confianza: 'HIGH',
    aprobacionExplicita: true,
    ...parcial,
  };
}
