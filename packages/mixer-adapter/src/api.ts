/**
 * Superficie única de contacto con la consola.
 *
 * Ningún asistente importa la biblioteca del protocolo ni construye comandos.
 * Hablan con esta interfaz, y solo a través del pipeline
 * `Assistant → Recommendation → Transaction → SafetyEngine → write()`.
 * `npm run validate:limites` verifica que nadie fuera de este paquete importe
 * la biblioteca del protocolo (ADR-006, CONTRIBUTING.md).
 */

/** Estado del almacén de estado confirmado. Ver ADR-005. */
export type StoreState = 'VALID' | 'INVALID';

/**
 * Origen de un cambio de parámetro.
 *
 * El protocolo no identifica al cliente que escribió: es una limitación
 * verificada, no una omisión. Solo se puede distinguir un cambio propio de uno
 * ajeno, por correlación temporal. La interfaz nunca promete "lo cambió el
 * teléfono de fulano".
 */
export type ChangeSource = 'SELF' | 'EXTERNAL' | 'UNKNOWN';

export type ConnectionState = 'CONNECTED' | 'UNSTABLE' | 'RECONNECTING' | 'DISCONNECTED';

export interface ReadResult<T = number> {
  readonly value: T;
  /** Instante del último mensaje entrante que tocó este parámetro. */
  readonly confirmedAt: string | null;
  readonly source: ChangeSource;
  readonly version: number;
  readonly storeState: StoreState;
}

export type WriteStatus =
  | 'APPLIED'
  | 'CONFLICT'
  | 'UNVERIFIED'
  | 'REJECTED';

/**
 * Vocabulario de métodos de confirmación, incluido el que ya no se alcanza.
 *
 * `ECHO` sigue en la lista porque el diario y el historial guardan lo que se
 * escribió antes de saber que no existía, y borrarlo del vocabulario haría
 * ilegible ese registro. Lo que no puede volver a ocurrir es **producirlo**:
 * para eso está `ConfirmedByAlcanzable`.
 */
export type ConfirmedBy = 'ECHO' | 'VU' | 'WITNESS' | 'TIMEOUT' | 'NONE';

/**
 * Lo que una escritura puede devolver contra esta consola.
 *
 * `ECHO` no está, y no es una omisión: está medido el 2026-09-08 que la Ui24R
 * **no le devuelve la escritura a quien la hizo** (SPK-P0.1, SPK-ACK-POLICY).
 * Seis segundos escuchando, cero líneas para la ruta escrita; se pide `INIT` y
 * el valor nuevo está. La rama que devolvía `APPLIED` con `confirmedBy: 'ECHO'`
 * era código inalcanzable, y mientras el tipo la admitía nada impedía volver a
 * escribirla. `WITNESS` es lo que la reemplaza: la segunda conexión testigo vio
 * la consola difundir el valor (ADR-024).
 */
export type ConfirmedByAlcanzable = Exclude<ConfirmedBy, 'ECHO'>;

export interface WriteResult {
  readonly status: WriteStatus;
  readonly confirmedBy: ConfirmedByAlcanzable;
  /** Valor leído cuando el estado es de conflicto. */
  readonly actual: number | null;
  readonly motivo: string | null;
}

/**
 * Cambio masivo externo: muchas **rutas distintas** moviéndose a la vez.
 *
 * **`GRUPO_DE_CANALES` se llamaba `FADER_DRAG` y era un nombre falso.** Se
 * dispara cuando varios canales cambian el mismo parámetro en la misma ventana
 * —un grupo, un VCA, un recall parcial—, no cuando alguien arrastra un fader:
 * eso es **una sola ruta** escrita muchas veces y nunca puede entrar acá. El
 * texto que la aplicación muestra siempre dijo la verdad; el identificador no,
 * y por eso el criterio 5 de SPK-P0.9 parecía cubierto hasta que se midió
 * contra la consola el 2026-09-10.
 *
 * El arrastre no genera un evento de estos **a propósito**: es un gesto sobre
 * un parámetro, no una avalancha, y no invalida el estado. Se agrupa en un
 * único aviso de cambio externo.
 */
export interface BulkExternalChange {
  /**
   * Cuántas rutas distintas se movieron. **Mirá `definitivo` antes de mostrarlo.**
   *
   * Cuando `definitivo` es falso, esto es «al menos esto»: el aviso sale en el
   * instante en que se cruza el umbral, así que lo que llega después todavía no
   * está contado.
   */
  readonly rutasAfectadas: number;
  /**
   * Si la avalancha ya terminó y este número es el total de verdad.
   *
   * **Existe porque el aviso mostraba nuestra constante y no el tamaño real.**
   * Medido el 2026-09-10: se escribieron 16 rutas y la pantalla dijo 10 — las
   * diez vueltas exactas del umbral. El aviso se emitía al cruzarlo y lo que
   * caía después entraba en la ventana de silencio sin actualizar la cuenta.
   * El operador leía el valor de una constante nuestra creyendo que era una
   * medición de su consola.
   *
   * Se arregló **sin retrasar el aviso**, porque enterarse tarde de que el
   * estado dejó de ser válido es peor que enterarse con un número corto. Sale
   * uno en el acto con `definitivo: false`, y otro al cerrarse la ventana.
   * La pantalla dice «al menos N» hasta que llega el segundo.
   *
   * **`definitivo` quiere decir «la ventana cerró», y el total se queda corto en
   * un recall: medido, 44 rutas difundidas contra 39 informadas.**
   *
   * **Por qué se queda corto NO está medido, y acá hubo una explicación falsa
   * que conviene dejar escrita.** Se publicó que era porque «el recall tarda
   * unos 3 segundos y la ventana dura 1». Los 3 segundos eran el `setTimeout`
   * del propio guion de medición, no el aparato: al ponerle marca de tiempo a
   * cada línea, **el recall difunde sus 44 rutas entre los 343 y los 344 ms**.
   * Un milisegundo. Todas caben holgadas en la ventana.
   *
   * Así que la diferencia de cinco viene de otro lado —candidatos: rutas cuyo
   * valor el almacén ya tenía y no cuenta como cambio, o el puntero que se
   * trata aparte— y **hasta que se mida, no se explica**. Lo que sí está medido
   * es el hecho: el número informado es menor que las rutas difundidas.
   */
  readonly definitivo: boolean;
  readonly ventanaMs: number;
  readonly probableCausa: 'SNAPSHOT_RECALL' | 'GRUPO_DE_CANALES' | 'DESCONOCIDA';
  readonly timestamp: string;
}

/**
 * Si hay otro operador tocando la consola, y desde cuándo.
 *
 * **La consola no publica presencia**: medido el 2026-09-10, no difunde nada
 * cuando un cliente entra o sale, y ninguna de las claves cuyo nombre lo
 * sugería se mueve. Lo único que cuenta es quién **toca** algo, así que la
 * presencia se infiere del tráfico ajeno.
 *
 * **Y por eso `presente: false` no significa «no hay nadie».** Significa «nadie
 * tocó nada últimamente». Un operador parado frente a la consola mirando la
 * pantalla es invisible para esto — y es exactamente el que se sorprende
 * cuando la aplicación mueve un fader. La interfaz tiene que decirlo así, no
 * como una afirmación sobre la sala.
 */
export interface PresenciaAjena {
  /** Alguien más tocó la consola dentro de la ventana. */
  readonly presente: boolean;
  /** Hace cuánto fue ese último toque. `null` si no hubo ninguno. */
  readonly desdeHaceMs: number | null;
}

/**
 * Cuánto se considera «recién» para decir que hay otro operador.
 *
 * **Elegido, no medido**, y conviene que se lea así. Una persona trabajando en
 * una consola toca algo cada pocos segundos; medio minuto cubre las pausas
 * normales —leer una hoja, hablar con alguien— sin estirarse tanto que alguien
 * que se fue siga figurando. Si algún día se mide cómo trabaja la gente de
 * verdad, este número se ajusta acá.
 */
export const VENTANA_PRESENCIA_MS = 30_000;

export interface DeviceInfo {
  readonly modelo: string;
  readonly firmware: string;
}

export interface MixerDomainAPI {
  readonly estadoConexion: ConnectionState;

  conectar(host: string): Promise<void>;
  desconectar(): Promise<void>;
  infoDispositivo(): Promise<DeviceInfo>;

  /**
   * Lee del almacén de estado confirmado, alimentado solo por mensajes
   * entrantes. Nunca del estado optimista de la biblioteca: una escritura
   * propia no confirmada no puede aparecer como valor actual, o un retroceso
   * restauraría algo que nunca se aplicó.
   */
  leer(parametro: string): ReadResult;

  /**
   * Escribe comparando antes contra el valor esperado. Si difiere, devuelve
   * conflicto y no escribe (INV-011).
   */
  escribir(parametro: string, valor: number, esperado: number): Promise<WriteResult>;

  /**
   * Relee la lista de instantáneas que la consola dice tener.
   *
   * INV-001 exige que ninguna transacción pase a APLICANDO sin su instantánea
   * «verificada en la lista de snapshots re-leída». El campo del modelo que
   * guardaba ese hecho existía y no lo escribía nadie: «verificado» significaba
   * en la práctica «la cadena no es nula». El escenario que la propia
   * invariante describe —borrar la instantánea entre guardarla y aplicar— no
   * podía detectarse.
   *
   * Se relee, no se cachea: el punto de la invariante es que alguien pudo
   * borrarla desde el navegador de la consola mientras tanto.
   */
  listarSnapshots(): Promise<readonly string[]>;

  /**
   * Crea el punto de retorno que INV-001 exige, y lo verifica releyendo.
   *
   * Devuelve el nombre si quedó en la lista de la consola, o `null`. **No
   * recibe el show**: se guarda siempre en el de la aplicación, para que no
   * haya forma de escribir encima del trabajo del usuario.
   */
  guardarInstantanea(): Promise<string | null>;

  /**
   * Cada trama del analizador, ya en bandas de decibeles relativos.
   *
   * Suscribirse **no** enciende el analizador: eso es `tomarAnalizador`, que es
   * una escritura y necesita permiso. Sin fuente elegida esto no dispara nunca.
   */
  alEspectro(cb: (bandas: readonly number[]) => void): () => void;

  /**
   * Apunta el analizador a una fuente. **Le cambia la pantalla al operador.**
   *
   * `var.rta` es una sola variable de la consola, no una por cliente. ADR-025
   * exige permiso explícito antes de llamar a esto.
   */
  tomarAnalizador(fuente: string): boolean;

  /** Devuelve el analizador a la fuente **leída** al conectar. */
  devolverAnalizador(): void;

  /** Qué fuente tenía el analizador al conectar, para poder contarlo. */
  fuenteOriginalDelAnalizador(): string | null;

  /** Suscripción a cambios externos y a avalanchas. */
  alCambiarExterno(cb: (parametro: string, valor: number) => void): () => void;
  /**
   * Vuelve a leer el estado entero de la consola.
   *
   * INV-021 invalida el estado ante una avalancha y dice «hasta re-lectura».
   * Sin esto, la segunda mitad de la frase no existía y el estado se quedaba
   * inválido para siempre.
   */
  releerEstado(): Promise<void>;

  alCambioMasivo(cb: (evento: BulkExternalChange) => void): () => void;

  /**
   * Si hay otro operador tocando la consola. Ver `PresenciaAjena`: lo que
   * devuelve `false` es «nadie tocó nada», no «no hay nadie».
   */
  otroOperador(): PresenciaAjena;
  alCambiarConexion(cb: (estado: ConnectionState) => void): () => void;
}

/**
 * Error que lanza el adaptador cuando se le pide escribir algo que no debe.
 * Es un tipo propio para que el Safety Engine lo distinga de un fallo de red.
 */
export class EscrituraProhibida extends Error {
  readonly parametro: string;
  readonly motivo: string;

  constructor(parametro: string, motivo: string) {
    super(`escritura prohibida en ${parametro}: ${motivo}`);
    this.name = 'EscrituraProhibida';
    this.parametro = parametro;
    this.motivo = motivo;
  }
}
