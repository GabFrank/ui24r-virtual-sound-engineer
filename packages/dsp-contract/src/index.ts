/**
 * Contrato del puente entre el motor de audio nativo y la aplicación.
 *
 * Regla que define este paquete: **el audio no cruza el puente**. A 48 kHz,
 * dos canales en coma flotante son unos 384 kB/s sostenidos, y el puente de
 * Capacitor serializa a JSON. Lo que cruza son métricas y espectros ya
 * reducidos, calculados del lado nativo (ADR-001).
 *
 * Hay un test que verifica que ningún tipo de este archivo contenga un arreglo
 * de muestras.
 */

/** Tasa máxima de eventos hacia la aplicación. Por encima, la interfaz se ahoga. */
export const MAX_EVENTOS_POR_SEGUNDO = 20;

/** Número máximo de bins de espectro que cruzan el puente. */
export const MAX_BINS_ESPECTRO = 240;

export interface DeviceInfo {
  readonly id: string;
  readonly nombre: string;
  readonly tipo: 'USB' | 'BUILTIN' | 'OTRO';
  readonly canalesEntrada: number;
  readonly canalesSalida: number;
  readonly sampleRatesSoportados: readonly number[];
}

export interface CaptureConfig {
  readonly deviceId: string;
  readonly canales: number;
  readonly sampleRate: number;
  /**
   * Pide la fuente de audio sin procesar. Si el dispositivo no la soporta, el
   * resultado lo declara y la aplicación lo muestra: una captura con ganancia
   * automática no sirve para medir.
   */
  readonly pedirSinProcesar: boolean;
}

export interface CaptureStatus {
  readonly activa: boolean;
  readonly deviceId: string | null;
  readonly canales: number;
  readonly sampleRate: number;
  /** Si se consiguió la fuente sin procesar, o hubo que caer en otra. */
  readonly sinProcesar: boolean;
  readonly fuenteReal: string;
  /** Cortes de audio desde que arrancó la captura. Métrica de calidad. */
  readonly xruns: number;
  readonly tiempoActivoS: number;
}

/** Métricas de nivel por canal, emitidas de forma continua. */
export interface LevelsEvent {
  readonly tipo: 'levels';
  readonly timestampUs: number;
  readonly canales: readonly {
    readonly indice: number;
    readonly rmsFastDb: number;
    readonly rmsSlowDb: number;
    readonly picoMuestraDb: number;
    readonly picoRealDb: number;
    readonly factorCrestaDb: number;
    readonly saturando: boolean;
  }[];
}

export interface SpectrumEvent {
  readonly tipo: 'spectrum';
  readonly timestampUs: number;
  readonly canal: number;
  /** Frecuencias centrales, en hercios. */
  readonly frecuenciasHz: readonly number[];
  /** Magnitudes, en decibeles. Nunca más de MAX_BINS_ESPECTRO. */
  readonly magnitudesDb: readonly number[];
  readonly suavizado: 'THIRD' | 'SIXTH' | 'TWELFTH';
  readonly promedios: number;
}

/**
 * Función de transferencia entre la referencia eléctrica y el micrófono.
 * Los bins con coherencia por debajo del umbral no son confiables: la
 * aplicación los marca en vez de ocultarlos.
 */
export interface TransferEvent {
  readonly tipo: 'transfer';
  readonly timestampUs: number;
  readonly frecuenciasHz: readonly number[];
  readonly magnitudDb: readonly number[];
  readonly faseGrados: readonly number[];
  readonly coherencia: readonly number[];
  readonly promedios: number;
  readonly retardoCompensadoMuestras: number;
}

export interface DelayEvent {
  readonly tipo: 'delay';
  readonly timestampUs: number;
  readonly retardoMuestras: number;
  readonly retardoMs: number;
  /** Valor del pico de correlación: por debajo de 0,3 no es una estimación fiable. */
  readonly confianzaCorrelacion: number;
}

export interface XrunEvent {
  readonly tipo: 'xrun';
  readonly timestampUs: number;
  readonly total: number;
}

export interface DeviceChangeEvent {
  readonly tipo: 'deviceChange';
  readonly timestampUs: number;
  readonly evento: 'CONECTADO' | 'DESCONECTADO';
  readonly deviceId: string;
}

export type AudioEvent =
  | LevelsEvent | SpectrumEvent | TransferEvent
  | DelayEvent | XrunEvent | DeviceChangeEvent;

/** Ventana grabada a archivo. El audio queda en disco; aquí viaja la ruta. */
export interface RecordedWindow {
  readonly rutaArchivo: string;
  readonly sampleRate: number;
  readonly canales: number;
  readonly duracionS: number;
  readonly xrunsDurante: number;
}

/**
 * Superficie que el plugin nativo expone a la aplicación.
 *
 * El generador de señal no está acá: el generador es el reproductor de la
 * consola, y se controla por el adaptador de mezcladora (ADR-002). La salida
 * de audio del dispositivo solo se usa dentro del asistente de loopback, y
 * tiene su propia superficie separada, precisamente para que no se use por
 * accidente.
 */
export interface AudioEnginePlugin {
  listarDispositivos(): Promise<{ readonly dispositivos: readonly DeviceInfo[] }>;
  iniciarCaptura(config: CaptureConfig): Promise<CaptureStatus>;
  detenerCaptura(): Promise<void>;
  estado(): Promise<CaptureStatus>;
  grabarVentana(opciones: { readonly duracionS: number; readonly rutaDestino: string }): Promise<RecordedWindow>;
  configurarAnalisis(opciones: {
    readonly suavizado: 'THIRD' | 'SIXTH' | 'TWELFTH';
    readonly promediado: 'LINEAL' | 'EXPONENCIAL';
    readonly ventanaS: number;
    readonly canalEspectro: number;
    readonly calcularTransferencia: boolean;
  }): Promise<void>;
}
