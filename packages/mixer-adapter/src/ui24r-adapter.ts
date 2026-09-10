import type {
  BulkExternalChange, ConnectionState, DeviceInfo, MixerDomainAPI,
  ReadResult, WriteResult,
} from './api.ts';
import { ConfirmedStateStore, type EntradaEstado } from './confirmed-store.ts';
import { actualizarPico, type Pico } from './retencion-pico.ts';
import {
  codificarSetd, dbDeMedidor, decodificar, decodificarVuCanales, MEDIDOR_SATURACION,
} from './protocol.ts';
import { faderADb, gananciaADb } from './conversiones.ts';
import { leerDinamica } from './dinamica.ts';
import { rutaDeGanancia, tomaPistaGrabada } from './fuente-de-canal.ts';
import { paresEstereo, type ParEstereo } from './pares-estereo.ts';
import { decodificarEspectro, hayEspectro } from './espectro.ts';
import {
  nombreDeInstantanea, comandoCrearShow, comandoGuardar, comandoListar, instantaneasDeLaLista,
  comandoDevolverEtiqueta,
} from './instantaneas.ts';
import { TestigoDeEscrituras } from './testigo.ts';
import type { Transport } from './transport.ts';
import type { DinamicaDeCanal } from '@vse/domain';

export interface OpcionesAdapter {
  /**
   * Hueco sin tramas del analizador que declara la conexión inestable.
   *
   * **Antes esto miraba las tramas de medidores, y estaba mal.** Medido el
   * 2026-09-08: la consola **deja de emitir `VU2` cuando no hay señal**. En
   * treinta segundos de silencio llegó una sola trama; con música, 1932 en
   * noventa segundos. Un vigilante sobre `VU2` declara la conexión inestable
   * en cada silencio, o sea entre tema y tema y en toda la prueba de sonido:
   * justo cuando el operador mira la pantalla.
   *
   * El analizador no hace esa supresión: 30,0 Hz medidos con señal y 30,2 Hz
   * en silencio absoluto, con percentil 95 de 37 ms. Es el latido honesto de
   * este aparato, y es lo que se vigila ahora.
   */
  readonly umbralHuecoRtaMs?: number;
  /** Espera máxima por la confirmación de una escritura. */
  readonly timeoutConfirmacionMs?: number;
  /**
   * Quietud sin líneas de estado que da por terminado el volcado inicial.
   *
   * **Existe porque la Ui24R no manda ninguna marca de fin de volcado.** El
   * adaptador esperaba una línea `DUMP_END` que el simulador sí emite y la
   * consola real no: contra el aparato, el estado confirmado se quedaba en
   * INVALID para siempre y ninguna lectura era confiable.
   *
   * El volcado son del orden de seis mil claves en unos 220 mensajes seguidos
   * —6 665 y 6 087 en dos sesiones, no es constante—, y entra
   * completo entre 112 y 158 ms (20 de 20 ciclos medidos el 2026-09-08). Un
   * cuarto de segundo sin una sola línea de estado es holgado para ese ritmo y
   * corto para el operador. Las tramas de medidores y de analizador no cuentan:
   * llegan siempre y no dirían nada.
   */
  readonly quietudVolcadoMs?: number;
  /** Cuánto esperar a que la consola escriba una instantánea antes de verificarla. */
  readonly esperaGuardadoMs?: number;
  readonly ahora?: () => number;
  /**
   * Cómo se abre la **segunda conexión testigo**, la que confirma las
   * escrituras (ADR-024).
   *
   * Por defecto se le pide al propio transporte con `nuevaSesion()`, que es lo
   * que hace que esto funcione sin que quien construye el adaptador tenga que
   * saber que existe un testigo. Se puede sustituir para los tests y para un
   * despliegue que quiera abrir la sesión de otra manera.
   *
   * Si no hay fábrica ni `nuevaSesion()`, el adaptador **no escribe**: lo dice
   * y devuelve `REJECTED`. Ver `escribir()`.
   */
  readonly crearTestigo?: () => Transport;
}

export interface EstadoCanal {
  readonly indice: number;
  readonly nombre: string;
  readonly faderDb: number;
  /**
   * La ganancia de entrada, o `null` si la consola todavía no la dijo.
   *
   * Era `number`, y cuando el estado confirmado no tenía `hw.N.gain` se
   * devolvía el extremo del rango como si fuera una lectura. La telemetría
   * imprimía «≈-6» y el asistente proponía a partir de ese número. El «≈»
   * distingue «estimado a partir de un valor crudo real» de «medido»; no
   * distinguía ninguno de los dos de «inventado», que es peor que los otros
   * dos juntos.
   */
  readonly gainDb: number | null;
  readonly silenciado: boolean;
  /**
   * Nivel de **entrada**, antes del fader y **después del proceso dinámico**.
   *
   * Es el que importa para el margen del previo en un sentido: no cambia
   * porque alguien mueva un fader. En la consola es la marca fantasma del
   * medidor, no la barra de color.
   *
   * **Lo que no es, y costó descubrirlo:** no es la señal que entra al canal.
   * El compresor y la puerta ya pasaron. Medido el 2026-09-09 con un tono fijo,
   * bajar el umbral del compresor movió esta lectura de −29,66 a −40,46 dB. Un
   * consejo de ganancia calculado sobre este número sin mirar `reduccionDb` es
   * un consejo calculado sobre una señal procesada.
   */
  readonly nivelDb: number;
  readonly picoDb: number;
  /**
   * Nivel **después del previo y antes del procesamiento dinámico**.
   *
   * Es el que hay que mirar para aconsejar ganancia, y el que muestrea el
   * asistente. `nivelDb` es lo que la consola dibuja en su tira —sirve para
   * hablar el mismo idioma que el operador— pero llega con el compresor
   * encima; este no.
   *
   * Medido el 2026-09-09: con el compresor apretando 5 dB, `nivelDb` cayó a
   * −53,33 y este se quedó en −48,66; y subiendo `hw.N.gain` de 10 a 22 dB,
   * los dos subieron lo mismo. Ver `MedidorCanal.pre`, donde está también qué
   * parte de esto sigue inferida.
   */
  readonly nivelPreProcesoDb: number;
  readonly picoPreProcesoDb: number;
  /**
   * Cuántos decibeles le está sacando el procesador dinámico ahora mismo.
   *
   * Cero cuando no está actuando, que es lo que informa la consola en un canal
   * sin compresor **y** en un canal con compresor puesto que no llega a su
   * umbral. Esa diferencia es la que convierte un aviso genérico —«hay un
   * compresor, cuidado»— en un dato accionable: «este nivel ya viene 9 dB
   * comprimido».
   */
  readonly reduccionDb: number;
  /** La mayor reducción vista desde el último reinicio de picos. */
  readonly reduccionPicoDb: number;
  /**
   * Qué proceso dinámico tiene puesto el canal.
   *
   * Es configuración, no medición: `reduccionDb` dice cuánto está haciendo el
   * compresor, y esto dice qué hay en el camino. Los dos hacen falta, porque la
   * puerta y el de-esser no tienen medidor propio en la trama.
   */
  readonly dinamica: DinamicaDeCanal;
  /**
   * Nivel de **salida**, después del fader.
   *
   * Es la barra de color que dibuja la consola en su tira. Se muestra para
   * que quien mire las dos pantallas a la vez encuentre el mismo número, y
   * porque la diferencia con la entrada es el fader: sirve para ver de un
   * vistazo cuánto se está atenuando un canal.
   */
  readonly nivelSalidaDb: number;
  readonly picoSalidaDb: number;
  /**
   * Veces que saturó el **previo**, byte `+0`.
   *
   * Es el que le importa a la ganancia: la consola lo vigila en su página de
   * ganancia con `setVUPre`, y cuando se enciende **congela el deslizador de
   * ganancia** para que nadie siga subiendo. Si este cuenta, la perilla del
   * previo está de más.
   */
  readonly saturacionesPrevio: number;
  /**
   * Veces que saturó la **salida** del canal, byte `+2`.
   *
   * Es el clip que la consola dibuja en la tira del canal, con `setVU(n, q, …)`
   * y `1 <= q`. Depende del fader, así que se arregla bajando el canal y no
   * tocando el previo.
   */
  readonly saturacionesSalida: number;
  /**
   * La ruta del previo que alimenta a este canal, o `null` si no se sabe.
   *
   * Sale de `i.N.src` y no del número del canal. Se expone porque quien vaya a
   * **escribir** la ganancia necesita saber dónde, y derivarlo dos veces —una
   * acá y otra en el llamador— es la forma de que las dos derivaciones se
   * separen con el tiempo.
   */
  readonly rutaGanancia: string | null;
  /**
   * Si el canal está reproduciendo una pista grabada en vez de su entrada.
   *
   * Cuando es cierto, **la ganancia del previo no afecta lo que suena**: el
   * canal reproduce lo grabado. Un consejo de ganancia ahí no es impreciso, es
   * inaplicable.
   */
  readonly tomaPistaGrabada: boolean;
}

/**
 * Adaptador de la consola Ui24R.
 *
 * Es el único punto del sistema que habla el protocolo. Todo lo demás usa
 * `MixerDomainAPI`. Dos cosas que hace distinto de la biblioteca comunitaria,
 * y que son la razón de que exista:
 *
 * - Lee **solo** del almacén de estado confirmado, alimentado por mensajes
 *   entrantes. Nunca da por aplicada una escritura propia sin confirmación.
 * - Deduce si la conexión está sana por la **cadencia de los medidores**, no
 *   por pérdida de paquetes: sobre TCP no se pierden, se retrasan.
 */
export class Ui24rMixerAdapter implements MixerDomainAPI {
  private readonly store: ConfirmedStateStore;
  private _estadoConexion: ConnectionState = 'DISCONNECTED';
  private ultimaTramaVuMs: number | null = null;
  private ultimaTramaRtaMs: number | null = null;
  private readonly umbralHuecoRtaMs: number;
  private readonly timeoutMs: number;
  private readonly ahora: () => number;

  private readonly nombresCanal = new Map<number, string>();
  /** De qué previo viene cada canal, según `i.N.src`. Ver `fuente-de-canal.ts`. */
  private readonly fuentesCanal = new Map<number, string>();
  private oyentesEspectro: ((bandas: readonly number[]) => void)[] = [];
  /**
   * La fuente que el analizador tenía cuando llegamos.
   *
   * `var.rta` es **global**: elegir la fuente le cambia la pantalla al operador
   * (R-28, ADR-025). Se anota lo que había para poder devolverlo, y se anota lo
   * que llega en el volcado —no se reconstruye—: la clave viaja una sola vez y
   * quien no la escuche entonces no la ve nunca.
   */
  private fuenteDelAnalizador: string | null = null;
  private analizadorPrestado = false;
  /** `stereoIndex` por canal. 0 es el izquierdo, 1 el derecho, −1 sin enlazar. */
  private readonly enlacesEstereo = new Map<number, number>();
  /**
   * La instantánea que la consola tiene por «actual».
   *
   * Se sigue acá y no en el almacén confirmado porque llega como `SETS` y ese
   * almacén solo procesa `SETD`. Hace falta para poder devolverla después de
   * guardar: ver `comandoDevolverEtiqueta`.
   */
  private instantaneaActual: string | null = null;
  /** La pista de soundcheck asignada a cada canal, por `i.N.scsrc`. */
  private readonly pistasDeSoundcheck = new Map<number, string>();
  /** Si el modo de soundcheck virtual está encendido. Es global. */
  private soundcheckEncendido = false;
  /**
   * Cuántos canales tiene la consola de enfrente.
   *
   * No se supone: la cabecera de cada trama `VU2` lo dice, y el volcado manda
   * un `i.N.name` por cada entrada. Estaba fijo en doce, y una Ui24R tiene
   * veinticuatro: las dos entradas RCA son los canales 21 y 22, así que con
   * doce no se veía justamente la fuente que se usa para probar.
   */
  private canalesDetectados = 0;
  private readonly nivelesVu = new Map<number, number>();
  private readonly picosVu = new Map<number, Pico>();
  private readonly nivelesSalida = new Map<number, number>();
  private readonly picosSalida = new Map<number, number>();
  private readonly saturacionesPrevio = new Map<number, number>();
  private readonly saturacionesSalida = new Map<number, number>();
  private readonly reducciones = new Map<number, number>();
  private readonly picosReduccion = new Map<number, number>();
  private readonly nivelesPreProceso = new Map<number, number>();
  private readonly picosPreProceso = new Map<number, number>();

  private info: DeviceInfo = { modelo: 'desconocido', firmware: 'desconocido' };
  private oyentesConexion: ((e: ConnectionState) => void)[] = [];
  private oyentesTelemetria: (() => void)[] = [];
  private oyentesLatido: (() => void)[] = [];
  private desuscribir: (() => void)[] = [];
  private vigilanteVu: ReturnType<typeof setInterval> | null = null;
  private temporizadorVolcado: ReturnType<typeof setTimeout> | null = null;
  private readonly quietudVolcadoMs: number;
  private readonly esperaGuardadoMs: number;
  /** La última dirección conectada, para poder releer el estado. */
  private url: string | null = null;

  private readonly transporte: Transport;

  /**
   * La conexión testigo, o `null` mientras no haya hecho falta.
   *
   * **Se abre perezosamente, en la primera escritura, y esa es la decisión.**
   * Hoy la aplicación está en nivel OBSERVE: mira, mide y propone, y no escribe
   * un solo parámetro. Abrir el testigo al conectar le cobraría a ese uso un
   * costo que no es simbólico, y está medido: cada sesión recibe el **volcado
   * completo, del orden de seis mil claves —no es un número fijo—** —112 a 158 ms de ráfaga— y después los flujos de
   * medidores y analizador, que son 30 tramas por segundo de `RTA` más las de
   * `VU2` con señal, sostenidas mientras dure el show. En una tablet sobre la
   * red que levanta la propia consola eso se paga en batería y en ancho de
   * banda, para nada.
   *
   * El costo es real, así que se paga cuando se usa. La primera escritura de la
   * sesión espera a que el testigo abra y termine su volcado; las siguientes ya
   * no. Ver `asegurarTestigo()`.
   */
  private testigo: TestigoDeEscrituras | null = null;
  /** Apertura en curso, para que dos escrituras a la vez no abran dos sesiones. */
  private aperturaTestigo: Promise<TestigoDeEscrituras | null> | null = null;
  private readonly crearTestigo: (() => Transport) | null;

  constructor(transporte: Transport, opciones: OpcionesAdapter = {}) {
    this.transporte = transporte;
    this.crearTestigo = opciones.crearTestigo
      ?? (typeof transporte.nuevaSesion === 'function'
        ? () => transporte.nuevaSesion!()
        : null);
    this.ahora = opciones.ahora ?? (() => Date.now());
    // 300 ms serian ocho tramas perdidas del analizador, que va a 30 Hz con
    // percentil 95 de 37 ms. Se mantiene el valor: sobre RTA es holgado y
    // ademas es un flujo que no se apaga solo.
    this.umbralHuecoRtaMs = opciones.umbralHuecoRtaMs ?? 300;
    this.timeoutMs = opciones.timeoutConfirmacionMs ?? 500;
    this.quietudVolcadoMs = opciones.quietudVolcadoMs ?? 250;
    // Cuánto se le da a la consola para escribir la instantánea en su disco
    // antes de preguntarle si quedó. No está medido: es una espera prudente.
    this.esperaGuardadoMs = opciones.esperaGuardadoMs ?? 800;
    this.store = new ConfirmedStateStore({ ahora: this.ahora });
  }

  get estadoConexion(): ConnectionState {
    return this._estadoConexion;
  }

  async conectar(url: string): Promise<void> {
    this.url = url;
    this.cambiarEstado('RECONNECTING');
    // El volcado empieza en cuanto se abre la conexión: la consola lo manda
    // sin que se le pida.
    this.store.volcadoIniciado();

    this.desuscribir.push(
      this.transporte.alRecibir((linea) => this.procesar(linea)),
      this.transporte.alCerrar(() => {
        this.store.invalidar();
        this.cambiarEstado('DISCONNECTED');
      }),
    );

    await this.transporte.conectar(url);
    this.cambiarEstado('CONNECTED');

    // Vigila el hueco entre tramas de medidores: si la consola deja de
    // emitirlas, la conexión está en problemas aunque el socket siga abierto.
    this.vigilanteVu = setInterval(() => this.revisarCadenciaRta(), 100);
  }

  /**
   * Vuelve a leer el estado entero de la consola.
   *
   * Es la mitad que le faltaba a INV-021. La invariante dice «store INVALID
   * **hasta re-lectura**», y el estado se invalidaba sin que existiera ninguna
   * forma de releerlo: lo único que devuelve el almacén a VALID es el volcado
   * completo, que la consola manda sola al abrir la conexión. El cartel decía
   * «hasta releerlo» y el botón decía «Entendido», así que un recall desde el
   * navegador de la consola dejaba el estado —y con él la posibilidad de
   * escribir— muerto por el resto del show.
   *
   * **Ahora se pide, ya no se reconecta.** El comentario anterior decía que no
   * había mensaje verificado que pidiera el volcado y que por eso se reconectaba.
   * SPK-P0.2a cerró el 2026-09-08 y `INIT` quedó medido: mandarlo produjo un
   * segundo volcado completo del estado. No escribe ningún parámetro; es una
   * consulta, como `ALIVE`.
   *
   * El cambio no es cosmético. Reconectar **ya no funcionaba** contra la consola
   * real: el identificador de sesión de socket.io es de un solo uso, así que
   * volver a abrir la misma dirección falla. Pedir `INIT` evita además tirar la
   * conexión para recuperar algo que la consola manda sin cortar nada.
   */
  async releerEstado(): Promise<void> {
    if (this.url === null) {
      throw new Error('no hay conexión que releer: primero hay que conectarse');
    }
    if (!this.transporte.conectado) {
      throw new Error('el transporte no está conectado: no hay a quién pedirle el estado');
    }
    this.store.volcadoIniciado();
    this.transporte.enviar('INIT');
    this.reiniciarQuietudDeVolcado();
  }

  async desconectar(): Promise<void> {
    if (this.vigilanteVu) clearInterval(this.vigilanteVu);
    this.vigilanteVu = null;
    if (this.temporizadorVolcado !== null) clearTimeout(this.temporizadorVolcado);
    this.temporizadorVolcado = null;
    for (const f of this.desuscribir) f();
    this.desuscribir = [];
    // El testigo se cierra con la principal. Dejarlo abierto sería seguir
    // pagando el volcado y los medidores de una sesión que ya no atestigua nada.
    await this.cerrarTestigo();
    await this.transporte.desconectar();
    this.store.invalidar();
    this.cambiarEstado('DISCONNECTED');
  }

  async infoDispositivo(): Promise<DeviceInfo> {
    return this.info;
  }

  /**
   * El estado confirmado entero, tal como está.
   *
   * Existe para el diagnóstico: la huella que compara dos clientes conectados a
   * la vez (criterio 5 de SPK-P0.1) tiene que cubrir todo lo leído y no una
   * muestra elegida a ojo. Es de solo lectura y no expone el almacén.
   */
  volcadoDelEstado(): ReadonlyMap<string, EntradaEstado> {
    return this.store.volcar();
  }

  /**
   * Relee la lista de instantáneas de la consola.
   *
   * Todavía no está implementada: el mensaje del protocolo que la devuelve es
   * uno de los que SPK-P0.4 tiene que verificar. Se lanza en vez de devolver
   * una lista vacía o inventada, porque quien llama —el ejecutor de
   * transacciones, para INV-001— trata el fallo como «no verificada» y no
   * escribe. Devolver algo aquí sería afirmar sobre el protocolo justo lo que
   * la primera regla del repositorio prohíbe afirmar.
   */
  private readonly oyentesVolcado: (() => void)[] = [];

  /**
   * Las instantáneas de la aplicación que hay **ahora** en la consola.
   *
   * Se pide y se espera la respuesta; no se cachea. El punto de INV-001 es
   * justamente que alguien pudo borrar la instantánea desde el navegador de la
   * consola entre que se guardó y ahora, así que una lista guardada en memoria
   * respondería la pregunta equivocada.
   *
   * Devuelve **solo las nuestras**. Si el usuario guardó algo a mano en el show
   * de la aplicación, no es un punto de retorno que le corresponda usar a
   * nadie más.
   */
  async listarSnapshots(): Promise<readonly string[]> {
    if (this._estadoConexion !== 'CONNECTED') return [];
    return this.pedirLista();
  }

  /**
   * Crea el punto de retorno que INV-001 exige, y lo verifica.
   *
   * Tres pasos, y el tercero es el que importa: se pide el show —la consola lo
   * ignora si ya existe—, se guarda, y **se relee la lista** para confirmar que
   * está. Sin ese último paso esto sería una escritura con esperanza, que es
   * exactamente lo que la invariante prohíbe.
   *
   * Devuelve el nombre si quedó, o `null`. Un `null` no es un fallo silencioso:
   * el ejecutor lo va a leer como «no hay instantánea» y va a rechazar la
   * transacción, que es lo correcto.
   */
  async guardarInstantanea(): Promise<string | null> {
    if (this._estadoConexion !== 'CONNECTED') return null;

    // Se anota ANTES de guardar: guardar es lo que la cambia.
    const anterior = this.instantaneaActual;

    const nombre = nombreDeInstantanea(this.ahora());
    this.transporte.enviar(comandoCrearShow());
    this.transporte.enviar(comandoGuardar(nombre));

    // La consola no acusa recibo de estas órdenes, así que se le da tiempo a
    // que escriba en su disco antes de preguntar. Es el mismo criterio que el
    // resto del adaptador: preguntar en vez de suponer.
    await new Promise((r) => setTimeout(r, this.esperaGuardadoMs));

    const lista = await this.pedirLista();
    const quedo = lista.includes(nombre);

    // **Devolver la etiqueta de «instantánea actual», que guardar cambió.**
    // Se descubrió midiendo: `var.currentSnapshot` pasa a apuntar a la que
    // acabamos de crear. Si el operador toca «actualizar instantánea actual»
    // en su consola después de esto, escribiría sobre la nuestra en vez de
    // sobre la suya y perdería su trabajo sin enterarse.
    //
    // Se devuelve **solo la etiqueta**. Cargar la instantánea aplicaría todo su
    // contenido y cambiaría el estado entero de la consola, que es lo contrario
    // de restaurar.
    if (anterior !== null && anterior !== nombre) {
      this.transporte.enviar(comandoDevolverEtiqueta(anterior));
      this.instantaneaActual = anterior;
    }

    return quedo ? nombre : null;
  }

  /** Pide `SNAPSHOTLIST` y espera la respuesta, con un tope de paciencia. */
  private pedirLista(): Promise<readonly string[]> {
    return new Promise((resolver) => {
      const vencimiento = setTimeout(() => { quitar(); resolver([]); }, this.timeoutMs);
      const quitar = this.transporte.alRecibir((linea) => {
        if (!linea.startsWith('SNAPSHOTLIST^')) return;
        clearTimeout(vencimiento);
        quitar();
        resolver(instantaneasDeLaLista(linea));
      });
      this.transporte.enviar(comandoListar());
    });
  }

  leer(parametro: string): ReadResult {
    const e = this.store.leer(parametro);
    return {
      value: e?.valor ?? 0,
      confirmedAt: e?.confirmadoEl ?? null,
      source: e?.origen ?? 'UNKNOWN',
      version: e?.version ?? 0,
      storeState: this.store.storeState,
    };
  }

  /**
   * Escribe comparando antes contra el valor esperado (INV-011) y confirma por
   * la conexión testigo (ADR-024).
   *
   * Si el valor actual no es el esperado, alguien lo cambió: se devuelve
   * conflicto y **no se escribe**. Sobrescribir el cambio de otra persona en
   * medio de un show es exactamente lo que este proyecto no puede hacer.
   *
   * La confirmación ya no espera el eco. Está medido que no llega: seis
   * segundos escuchando la propia conexión, cero líneas para la ruta escrita, y
   * el valor nuevo presente al pedir `INIT`. Lo que sí llega es la difusión a
   * los **demás** clientes, y dos sockets del mismo proceso cuentan como
   * clientes distintos: el testigo vio la escritura a los 27 ms. Así que se
   * suscribe la espera en el testigo, después se envía, y se confirma con lo
   * que el testigo vea.
   */
  async escribir(parametro: string, valor: number, esperado: number): Promise<WriteResult> {
    if (this._estadoConexion !== 'CONNECTED') {
      return {
        status: 'REJECTED',
        confirmedBy: 'NONE',
        actual: null,
        motivo: `la conexión está en ${this._estadoConexion}`,
      };
    }

    // Se compara antes de abrir el testigo para no pagar una sesión entera por
    // una escritura que ya sabemos que no va a salir.
    const previa = this.store.coincideConEsperado(parametro, esperado);
    if (!previa.coincide) {
      return {
        status: 'CONFLICT', confirmedBy: 'NONE', actual: previa.actual, motivo: previa.motivo,
      };
    }

    const testigo = await this.asegurarTestigo();
    if (testigo === null) {
      return {
        status: 'REJECTED',
        confirmedBy: 'NONE',
        actual: previa.actual,
        motivo:
          'no hay conexión testigo y es lo único que confirma una escritura contra esta ' +
          'consola, que no devuelve eco. No se envió nada',
      };
    }

    // La comparación se repite porque abrir el testigo tarda —conexión más su
    // volcado— y en ese hueco alguien pudo mover el parámetro desde el navegador
    // de la consola. La primera comprobación evita el gasto; esta es la que
    // cumple INV-011.
    const cmp = this.store.coincideConEsperado(parametro, esperado);
    if (!cmp.coincide) {
      return { status: 'CONFLICT', confirmedBy: 'NONE', actual: cmp.actual, motivo: cmp.motivo };
    }

    this.store.registrarEscrituraPropia(parametro, valor);
    // La suscripción va **antes** del envío: a 27 ms medidos, suscribirse
    // después es una carrera que se pierde.
    const confirmacion = testigo.esperar(parametro, valor, this.timeoutMs);
    this.transporte.enviar(codificarSetd(parametro, valor));

    if (await confirmacion) {
      // El valor entra al estado confirmado por acá y no por otro lado: la
      // conexión principal nunca va a ver su propia escritura, así que sin esto
      // el segundo cambio sobre la misma ruta chocaría contra el valor viejo.
      this.store.confirmarPorTestigo(parametro, valor);
      return { status: 'APPLIED', confirmedBy: 'WITNESS', actual: valor, motivo: null };
    }
    return {
      status: 'UNVERIFIED',
      confirmedBy: 'TIMEOUT',
      actual: null,
      motivo:
        `el testigo no vio ${parametro} = ${valor} en ${this.timeoutMs} ms. El cambio pudo ` +
        'aplicarse o no: la transacción queda detenida hasta que alguien decida',
    };
  }

  /** Si la segunda conexión está abierta. Para diagnóstico y para los tests. */
  get testigoAbierto(): boolean {
    return this.testigo !== null;
  }

  alCambiarExterno(cb: (parametro: string, valor: number) => void): () => void {
    return this.store.alCambioExterno(cb);
  }

  /**
   * Avisa cuando el volcado inicial terminó y el estado confirmado ya es
   * completo.
   *
   * Hace falta porque `CONNECTED` se emite al abrir el socket, antes de recibir
   * un solo mensaje del volcado. Quien escuchaba solo la conexión daba el
   * estado por válido durante todo ese intervalo, en el que el almacén todavía
   * está INVALID.
   */
  alVolcadoCompleto(cb: () => void): () => void {
    this.oyentesVolcado.push(cb);
    return () => {
      const i = this.oyentesVolcado.indexOf(cb);
      if (i >= 0) this.oyentesVolcado.splice(i, 1);
    };
  }

  alCambioMasivo(cb: (evento: BulkExternalChange) => void): () => void {
    return this.store.alCambioMasivo(cb);
  }

  alCambiarConexion(cb: (estado: ConnectionState) => void): () => void {
    this.oyentesConexion.push(cb);
    return () => { this.oyentesConexion = this.oyentesConexion.filter((f) => f !== cb); };
  }

  alActualizarTelemetria(cb: () => void): () => void {
    this.oyentesTelemetria.push(cb);
    return () => { this.oyentesTelemetria = this.oyentesTelemetria.filter((f) => f !== cb); };
  }

  /**
   * Cada trama del analizador (`RTA`).
   *
   * Es un aviso distinto del de telemetria a proposito. `VU2` **se apaga en
   * silencio** --una trama en treinta segundos sin senal, frente a mas de
   * veinte por segundo con musica-- asi que su cadencia mide cuanto silencio
   * hubo, no como esta la conexion. `RTA` no se apaga: llega a 30 Hz con senal
   * y sin ella, y por eso es el flujo sobre el que este adaptador ya decide si
   * la conexion esta inestable. Quien quiera medir la salud de la conexion
   * tiene que escuchar aca; quien quiera saber si habia audio, alla.
   */
  alLatido(cb: () => void): () => void {
    this.oyentesLatido.push(cb);
    return () => { this.oyentesLatido = this.oyentesLatido.filter((f) => f !== cb); };
  }

  /**
   * Los pares estéreo que la consola tiene declarados.
   *
   * **Se lee, no se declara.** El plan era pedirle al usuario que dijera qué
   * canales forman un par; resultó que la consola ya lo sabe. Ver
   * `pares-estereo.ts` para qué significa el número y por qué acá solo se lee.
   */
  paresEstereo(): readonly ParEstereo[] {
    return paresEstereo(this.enlacesEstereo);
  }

  /**
   * Cada trama del analizador, ya en bandas de decibeles relativos.
   *
   * Suscribirse no enciende el analizador: eso lo hace `tomarAnalizador`, que
   * es una escritura y necesita permiso. Sin fuente elegida esto no dispara
   * nunca, porque la consola manda ceros y `hayEspectro` los descarta.
   */
  alEspectro(cb: (bandas: readonly number[]) => void): () => void {
    this.oyentesEspectro.push(cb);
    return () => { this.oyentesEspectro = this.oyentesEspectro.filter((f) => f !== cb); };
  }

  /**
   * Apunta el analizador a una fuente. **Le cambia la pantalla al operador.**
   *
   * `var.rta` es una sola variable de la consola, no una por cliente: si la
   * aplicación la toca en medio de un show, alguien va a ver su analizador
   * saltar a otro canal sin haberlo tocado. Por eso ADR-025 exige permiso, y
   * por eso esto no se llama solo desde ningún lado.
   *
   * Devuelve `false` si no se pudo, que hoy es solo cuando no hay conexión.
   */
  tomarAnalizador(fuente: string): boolean {
    if (this._estadoConexion !== 'CONNECTED') return false;
    this.transporte.enviar(`SETS^var.rta^${fuente}`);
    this.analizadorPrestado = true;
    return true;
  }

  /**
   * Devuelve el analizador a la fuente que tenía cuando llegamos.
   *
   * **Se devuelve lo que se leyó, no una cadena vacía.** Reconstruir el valor
   * en vez de leerlo fue exactamente el error que las sondas de medición
   * cometieron durante días: «restaurar» a vacío parece inocente y no es lo
   * mismo que devolver lo que había.
   *
   * Si nunca llegó la clave no se escribe nada: dejarlo como está es menos
   * dañino que poner un valor que nadie leyó.
   */
  devolverAnalizador(): void {
    if (!this.analizadorPrestado) return;
    if (this.fuenteDelAnalizador === null) return;
    this.transporte.enviar(`SETS^var.rta^${this.fuenteDelAnalizador}`);
    this.analizadorPrestado = false;
  }

  /** Qué fuente tenía el analizador al conectar, para poder contarlo. */
  fuenteOriginalDelAnalizador(): string | null {
    return this.fuenteDelAnalizador;
  }

  /** Vista de los canales, ya en unidades físicas, para la interfaz. */
  canales(cantidad = this.canalesDetectados || CANALES_HASTA_SABER): readonly EstadoCanal[] {
    const salida: EstadoCanal[] = [];
    for (let canal = 1; canal <= cantidad; canal++) {
      const n = indiceDeRuta(canal);
      const fader = this.store.leer(`i.${n}.mix`);
      // **La ganancia se busca donde el canal dice, no donde su número sugiere.**
      // Antes esto era `hw.${n}.gain`, que supone que el canal N usa el previo
      // N. Coincide con el enrutamiento de fábrica y por eso nunca se notó.
      const rutaGain = rutaDeGanancia(this.fuentesCanal.get(canal));
      const gain = rutaGain === null ? undefined : this.store.leer(rutaGain);
      const mute = this.store.leer(`i.${n}.mute`);
      salida.push({
        indice: canal,
        nombre: this.nombresCanal.get(canal) ?? `CANAL ${canal}`,
        faderDb: fader ? faderADb(fader.valor) : -Infinity,
        gainDb: gain ? gananciaADb(gain.valor) : null,
        silenciado: (mute?.valor ?? 0) > 0.5,
        nivelDb: this.nivelesVu.get(canal) ?? -Infinity,
        picoDb: this.picosVu.get(canal)?.db ?? -Infinity,
        nivelSalidaDb: this.nivelesSalida.get(canal) ?? -Infinity,
        picoSalidaDb: this.picosSalida.get(canal) ?? -Infinity,
        rutaGanancia: rutaGain,
        tomaPistaGrabada: tomaPistaGrabada(
          this.soundcheckEncendido, this.pistasDeSoundcheck.get(canal),
        ),
        saturacionesPrevio: this.saturacionesPrevio.get(canal) ?? 0,
        saturacionesSalida: this.saturacionesSalida.get(canal) ?? 0,
        // Cero y no `null` cuando todavía no llegó una trama: la reducción es
        // una medida acotada por abajo, y «no llegó ninguna trama de medidores»
        // ya se distingue mirando el nivel, que sí es −∞.
        nivelPreProcesoDb: this.nivelesPreProceso.get(canal) ?? -Infinity,
        picoPreProcesoDb: this.picosPreProceso.get(canal) ?? -Infinity,
        reduccionDb: this.reducciones.get(canal) ?? 0,
        reduccionPicoDb: this.picosReduccion.get(canal) ?? 0,
        dinamica: leerDinamica((path) => this.store.leer(path), n),
      });
    }
    return salida;
  }

  private procesar(linea: string): void {
    const m = decodificar(linea);

    if (m.tipo === 'SETD') {
      this.store.procesarLinea(linea);
      // El enlace estéreo se guarda aparte y por canal: el almacén confirmado
      // lo tiene igual, pero armar el par exige mirar dos rutas a la vez y
      // traducir la base cero, y eso se hace una sola vez acá en el borde.
      const enlace = /^i\.(\d+)\.stereoIndex$/.exec(m.path);
      if (enlace) this.enlacesEstereo.set(canalDeIndice(Number(enlace[1])), m.valor);
      // El modo de soundcheck es global y viaja como número.
      if (m.path === 'var.mtk.soundcheck') this.soundcheckEncendido = m.valor > 0.5;
      this.reiniciarQuietudDeVolcado();
      return;
    }

    if (m.tipo === 'SETS') {
      this.reiniciarQuietudDeVolcado();
      if (m.path === 'var.currentSnapshot') this.instantaneaActual = m.texto;
      // Solo la primera: las siguientes pueden ser nuestras propias escrituras
      // rebotando por otros clientes, y guardarlas sería devolver lo que
      // nosotros mismos pusimos.
      if (m.path === 'var.rta' && this.fuenteDelAnalizador === null) {
        this.fuenteDelAnalizador = m.texto;
      }

      const pista = /^i\.(\d+)\.scsrc$/.exec(m.path);
      if (pista) this.pistasDeSoundcheck.set(canalDeIndice(Number(pista[1])), m.texto);

      const fuente = /^i\.(\d+)\.src$/.exec(m.path);
      if (fuente) {
        // La fuente también se guarda por canal y no por índice de ruta, igual
        // que el nombre: el borde traduce una sola vez y el resto del
        // adaptador no vuelve a pensar en la base cero.
        this.fuentesCanal.set(canalDeIndice(Number(fuente[1])), m.texto);
        return;
      }

      const coincidencia = /^i\.(\d+)\.name$/.exec(m.path);
      // El nombre se guarda por canal, no por índice de ruta: `i.0.name` es el
      // canal 1. Se convierte acá, en el borde, para que el resto del
      // adaptador hable un solo idioma.
      if (coincidencia) {
        const canal = canalDeIndice(Number(coincidencia[1]));
        this.nombresCanal.set(canal, m.texto);
        this.canalesDetectados = Math.max(this.canalesDetectados, canal);
      }
      return;
    }

    if (m.tipo === 'VU2') {
      this.procesarVu(m.cargaBase64);
      return;
    }

    // El analizador es la señal de vida: llega pase lo que pase, con señal y en
    // silencio. No se decodifica su contenido, solo se anota que llegó.
    if (m.tipo === 'RTA') {
      this.ultimaTramaRtaMs = this.ahora();
      if (this._estadoConexion === 'UNSTABLE') this.cambiarEstado('CONNECTED');
      for (const cb of this.oyentesLatido) cb();

      // La carga ya no se tira. Se decodifica solo si alguien la está mirando:
      // son 30 tramas por segundo y decodificarlas para nadie es batería de la
      // tablet gastada en nada.
      if (this.oyentesEspectro.length > 0) {
        const bandas = decodificarEspectro(m.cargaBase64);
        if (hayEspectro(bandas)) for (const cb of this.oyentesEspectro) cb(bandas);
      }
      return;
    }

    // El simulador sí manda un centinela. Se respeta: cuando está, no hace
    // falta esperar la quietud.
    if (m.tipo === 'OTRO' && m.linea === 'DUMP_END') {
      this.completarVolcado();
    }
  }

  private procesarVu(base64: string): void {
    // Se anota la marca de tiempo para la estadistica de cadencia, pero **no**
    // se toca el estado de la conexion: la ausencia de VU2 significa silencio,
    // no caida. Quien decide sobre la conexion es el analizador.
    const ahoraMs = this.ahora();
    this.ultimaTramaVuMs = ahoraMs;

    const medidores = decodificarVuCanales(base64);
    this.canalesDetectados = Math.max(this.canalesDetectados, medidores.length);
    for (let i = 0; i < medidores.length; i++) {
      const canal = i + 1;
      const medidor = medidores[i]!;
      const db = dbDeMedidor(medidor.entrada);
      this.nivelesVu.set(canal, db);

      // El pico se sostiene y cae, como lo dibuja la consola. Ver
      // `retencion-pico.ts`: la balistica no viene del aparato, la calcula el
      // cliente, asi que esto es una decision nuestra y no una herencia.
      this.picosVu.set(canal, actualizarPico(this.picosVu.get(canal), db, ahoraMs));

      // El nivel anterior al procesamiento dinámico. Es el que usa el asistente
      // de ganancia: `db` de acá arriba ya pasó por el compresor.
      const dbPreProceso = dbDeMedidor(medidor.pre);
      this.nivelesPreProceso.set(canal, dbPreProceso);
      const picoPreProcesoPrevio = this.picosPreProceso.get(canal) ?? -Infinity;
      this.picosPreProceso.set(canal, Math.max(picoPreProcesoPrevio, dbPreProceso));

      // La reducción viaja en el sexto byte de cada canal y estuvo llegando
      // desde siempre sin que nadie la leyera. Es lo que permite saber si el
      // nivel de arriba viene condicionado y por cuánto.
      this.reducciones.set(canal, medidor.reduccionDb);
      const picoReduccionPrevio = this.picosReduccion.get(canal) ?? 0;
      this.picosReduccion.set(canal, Math.max(picoReduccionPrevio, medidor.reduccionDb));

      const dbSalida = dbDeMedidor(medidor.salida);
      this.nivelesSalida.set(canal, dbSalida);
      const picoSalidaPrevio = this.picosSalida.get(canal) ?? -Infinity;
      this.picosSalida.set(canal, Math.max(picoSalidaPrevio, dbSalida));

      // **Saturación: son dos indicadores, y ninguno es `entrada`.**
      //
      // Esto contaba sobre `entrada` —el byte `+1`— con la duda anotada de
      // «cuál de los dos debe mirar un asistente de ganancia lo decide
      // SPK-P0.10b». Leído el `mixer.html` de la consola el 2026-09-09, la
      // respuesta es que `+1` **no tiene indicador de clip**:
      //
      //     m = +0 (pre)   n = +1 (entrada)   q = +2 (salida)
      //     inStrips[g].setVU(n, q, …)   // clip sobre q, la SALIDA
      //     gainStrips[g].setVUPre(m)    // clip propio sobre m, el PREVIO
      //
      // Son dos cosas distintas y se arreglan distinto: el del previo se baja
      // con la perilla de ganancia —tanto es así que la consola congela ese
      // deslizador mientras está encendido— y el de la salida, con el fader.
      // Contarlos juntos, o contarlos sobre un byte que la consola no vigila,
      // le da al asistente una señal que no corresponde a ninguna acción.
      if (medidor.pre >= MEDIDOR_SATURACION) {
        this.saturacionesPrevio.set(canal, (this.saturacionesPrevio.get(canal) ?? 0) + 1);
      }
      if (medidor.salida >= MEDIDOR_SATURACION) {
        this.saturacionesSalida.set(canal, (this.saturacionesSalida.get(canal) ?? 0) + 1);
      }
    }
    for (const cb of this.oyentesTelemetria) cb();
  }

  /**
   * Reinicia la cuenta de quietud mientras siguen llegando líneas de estado.
   *
   * Solo actúa durante el volcado inicial. Después de eso las líneas de estado
   * son cambios normales y no tienen que reabrir nada.
   */
  private reiniciarQuietudDeVolcado(): void {
    // **Solo mientras hay un volcado en curso.** Antes la condicion era que el
    // almacen no estuviera valido, y eso incluia el estado invalidado por una
    // avalancha: la linea siguiente rearmaba la cuenta y un cuarto de segundo
    // despues el estado se declaraba valido sin que nadie hubiera releido nada.
    // INV-021 se apagaba sola a los 250 ms, que es lo mismo que no existir.
    // Lo encontro el guion de capturas y se reprodujo en aislamiento.
    if (!this.store.recibiendoVolcado) return;
    if (this.temporizadorVolcado !== null) clearTimeout(this.temporizadorVolcado);
    this.temporizadorVolcado = setTimeout(
      () => this.completarVolcado(), this.quietudVolcadoMs,
    );
  }

  /** Da el volcado por terminado. Es idempotente a propósito. */
  private completarVolcado(): void {
    if (this.temporizadorVolcado !== null) {
      clearTimeout(this.temporizadorVolcado);
      this.temporizadorVolcado = null;
    }
    // **El mismo resguardo que `reiniciarQuietudDeVolcado`, y por lo mismo.**
    // A esto se llega por dos caminos: el temporizador de quietud, que solo se
    // arma con un volcado en curso, y un `DUMP_END` suelto desde `procesar()`,
    // que no comprobaba nada. Con el estado invalidado por una avalancha y sin
    // volcado en curso, ese segundo camino declaraba el almacén válido sin que
    // nadie hubiera releído: INV-021 apagada, igual que antes pero por la otra
    // puerta. Contra la consola real es inalcanzable —no manda `DUMP_END`—;
    // contra el simulador, que sí lo manda, no lo es, y el simulador es donde
    // se descubrió el defecto original.
    if (!this.store.recibiendoVolcado) return;
    if (this.store.storeState === 'VALID') return;
    this.store.volcadoCompletoRecibido();
    this.cambiarEstado('CONNECTED');
    for (const cb of this.oyentesVolcado) cb();
  }

  private revisarCadenciaRta(): void {
    if (this._estadoConexion === 'DISCONNECTED') return;
    if (this.ultimaTramaRtaMs === null) return;
    const hueco = this.ahora() - this.ultimaTramaRtaMs;
    if (hueco > this.umbralHuecoRtaMs && this._estadoConexion === 'CONNECTED') {
      this.cambiarEstado('UNSTABLE');
    }
  }

  /**
   * Devuelve el testigo listo para atestiguar, abriéndolo si hace falta.
   *
   * **Acá vive la pereza.** No hay ninguna llamada a esto fuera de `escribir()`,
   * y es deliberado: mientras la aplicación observe y no escriba, la segunda
   * sesión no existe y no cuesta un byte. La primera escritura de la sesión
   * paga la apertura y el volcado del testigo; el resto no paga nada.
   *
   * Devuelve `null` cuando no se puede atestiguar: sin fábrica de sesiones, sin
   * dirección conocida, o porque la apertura falló. Quien llama no escribe.
   */
  private async asegurarTestigo(): Promise<TestigoDeEscrituras | null> {
    if (this.testigo !== null) {
      if (this.testigo.listoParaAtestiguar) return this.testigo;
      // Se cayó. Se descarta y se vuelve a abrir con la escritura que lo pidió.
      const caido = this.testigo;
      this.testigo = null;
      await caido.cerrar().catch(() => { /* ya estaba cerrado */ });
    }
    if (this.crearTestigo === null || this.url === null) return null;

    this.aperturaTestigo ??= this.abrirTestigo(this.url);
    try {
      return await this.aperturaTestigo;
    } finally {
      this.aperturaTestigo = null;
    }
  }

  private async abrirTestigo(destino: string): Promise<TestigoDeEscrituras | null> {
    const testigo = new TestigoDeEscrituras(this.crearTestigo!(), {
      quietudVolcadoMs: this.quietudVolcadoMs,
    });
    try {
      await testigo.conectar(destino);
    } catch {
      await testigo.cerrar().catch(() => { /* nunca llegó a abrir */ });
      return null;
    }
    this.testigo = testigo;
    return testigo;
  }

  private async cerrarTestigo(): Promise<void> {
    const testigo = this.testigo;
    this.testigo = null;
    this.aperturaTestigo = null;
    if (testigo !== null) await testigo.cerrar().catch(() => { /* ya estaba cerrado */ });
  }

  private cambiarEstado(e: ConnectionState): void {
    if (this._estadoConexion === e) return;
    this._estadoConexion = e;
    for (const cb of this.oyentesConexion) cb(e);
  }

  /** Reinicia los contadores de pico y saturación al empezar una captura. */
  reiniciarPicos(): void {
    this.picosSalida.clear();
    this.picosVu.clear();
    this.saturacionesPrevio.clear();
    this.saturacionesSalida.clear();
    // El pico de reducción se reinicia con los demás: si no, la insignia de
    // «este canal viene comprimido» sobreviviría a puentear el compresor y
    // seguiría acusando a un canal ya limpio.
    this.picosReduccion.clear();
    this.picosPreProceso.clear();
  }
}

/**
 * Canal de la consola —el número de la serigrafía, desde 1— al índice que usan
 * las rutas del protocolo.
 *
 * **Las rutas son de base cero.** El canal 1 es `i.0.mix`, `hw.0.gain` e
 * `i.0.name`. Está medido contra el aparato y escrito en
 * `docs/protocol-spec.md`, pero este adaptador componía `i.1` para el canal 1,
 * y el resultado era una fila de la interfaz que mezclaba dos canales
 * distintos: el medidor del canal 1 —que sí llega en la posición 0 de la trama
 * `VU2`, y por eso se veía correcto— junto al nombre, la ganancia, el fader y
 * el silencio del canal 2.
 *
 * **Por qué no lo agarró ningún test.** El simulador construía su estado con
 * la misma suposición equivocada, así que los dos errores se cancelaban y
 * contra el simulador todo cuadraba. Es el caso exacto que advierte
 * CONTRIBUTING: un test que pasa contra el simulador no cierra nada.
 */
function indiceDeRuta(canal: number): number {
  return canal - 1;
}

/** La vuelta: índice de ruta a canal. */
function canalDeIndice(indice: number): number {
  return indice + 1;
}

/**
 * Cuántos canales mostrar mientras la consola todavía no dijo cuántos tiene.
 *
 * Pasa solo entre que se abre el socket y llega la primera línea. Doce es lo
 * que entra en una pantalla sin desplazar; en cuanto llega el volcado o una
 * trama de medidores, manda el número real.
 */
const CANALES_HASTA_SABER = 12;
