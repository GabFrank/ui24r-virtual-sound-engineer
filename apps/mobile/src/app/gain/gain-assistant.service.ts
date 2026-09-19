import { Injectable, inject, signal, computed } from '@angular/core';
import {
  analizarVentana, proponerGanancia,
  type MuestraVu, type AnalisisDeGanancia, type PropuestaDeGanancia,
} from '@vse/assistants';
import { DINAMICA_SIN_LEER, type ChannelAssignment, type DinamicaDeCanal } from '@vse/domain';
import { Logger } from '../core/logger';
import { MixerService } from '../core/mixer.service';
import { BandService } from '../core/band.service';
import { MedicionesService } from '../core/mediciones.service';
import { SesionService } from '../core/sesion.service';
import { ConnectionStateService } from '../core/connection.state';
import {
  medicionDeLaCaptura, INTERVALO_DE_MUESTREO_MS, DURACION_CAPTURA_S, CUENTA_REGRESIVA_S,
} from '../core/medicion-de-la-captura.ts';

export type EstadoCaptura = 'INACTIVA' | 'CUENTA_REGRESIVA' | 'CAPTURANDO' | 'LISTA';

export interface ResultadoCaptura {
  readonly indice: number;
  readonly nombre: string;
  readonly analisis: AnalisisDeGanancia;
  readonly propuesta: PropuestaDeGanancia;
  readonly capturadaEl: string;
  /**
   * La medición que quedó guardada de esta ventana, si quedó.
   *
   * **Es lo que permite decirle al motor «acá se escuchó».** Quien aplica un
   * cambio anota este identificador como `medicionPosteriorId` de su transacción,
   * y sin eso el motor rechaza el ajuste siguiente sobre el mismo canal aunque el
   * músico haya tocado.
   *
   * `null` cuando no había sesión abierta donde guardarla —la tabla se lee por
   * sesión y una fila huérfana no la encontraría nadie— o cuando la escritura
   * falló. **Medir sigue funcionando en los dos casos**: la pantalla de ganancia
   * también sirve para mirar cómo está un canal sin sesión, y perder eso por no
   * poder guardar sería cambiar una función por un registro.
   */
  readonly medicionId: string | null;
}

/**
 * Se reexporta porque la pantalla de ganancia la lee de acá desde antes.
 *
 * **La definición se mudó a `medicion-de-la-captura.ts`** el 2026-09-19, cuando
 * el envío a monitor empezó a escuchar también: una duración de ventana definida
 * dentro del módulo de una herramienta y copiada en la otra es exactamente cómo
 * una constante y su copia se separan.
 */
export { DURACION_CAPTURA_S };

/**
 * Conduce la captura de una ventana por canal y produce la recomendación.
 *
 * La cuenta regresiva no es decoración: el usuario está del otro lado del
 * escenario con un instrumento en la mano, y necesita saber cuándo empezar a
 * tocar la parte más fuerte que va a tocar en el show.
 */
@Injectable({ providedIn: 'root' })
export class GainAssistantService {
  private readonly log = inject(Logger);
  private readonly mixer = inject(MixerService);
  private readonly banda = inject(BandService);
  private readonly mediciones = inject(MedicionesService);
  private readonly sesion = inject(SesionService);
  private readonly conexion = inject(ConnectionStateService);

  readonly estado = signal<EstadoCaptura>('INACTIVA');
  readonly segundosRestantes = signal(0);
  readonly canalEnCurso = signal<number | null>(null);
  readonly resultados = signal<readonly ResultadoCaptura[]>([]);

  readonly capturando = computed(
    () => this.estado() === 'CAPTURANDO' || this.estado() === 'CUENTA_REGRESIVA',
  );

  private muestras: MuestraVu[] = [];
  private temporizador: ReturnType<typeof setInterval> | null = null;
  /** El muestreo de niveles. Vive aparte de la cuenta atrás. */
  private muestreo: ReturnType<typeof setInterval> | null = null;
  /** Para poder terminar la cuenta atrás al cancelar, y no dejarla colgada. */
  private resolverCuenta: (() => void) | null = null;

  resultadoDe(indice: number): ResultadoCaptura | undefined {
    return this.resultados().find((r) => r.indice === indice);
  }

  /**
   * Captura una ventana del canal indicado.
   *
   * Devuelve una promesa que resuelve con el resultado, para que la interfaz
   * pueda encadenar canales sin manejar el temporizador.
   */
  async capturar(asignacion: ChannelAssignment): Promise<ResultadoCaptura> {
    if (this.capturando()) throw new Error('ya hay una captura en curso');

    const indice = asignacion.ui24rInputIndex;
    this.canalEnCurso.set(indice);
    this.muestras = [];

    await this.contarRegresiva();

    this.estado.set('CAPTURANDO');
    this.log.info('audio', 'captura_iniciada', {
      canal: indice, duracionS: DURACION_CAPTURA_S,
    });

    // **Cuándo EMPIEZA la ventana, y por eso se toma acá y no al terminar.**
    // `Measurement.timestamp` es el principio de la captura y el motor hace
    // `timestamp + duracionS` para saber si la escucha terminó. Con la fecha del
    // final, esa suma cae dieciocho segundos más adelante y la escucha **nunca**
    // se da por terminada: el ajuste siguiente se rechazaría para siempre.
    // `capturadaEl`, que ya existía, se toma al final y es otra cosa.
    //
    // Sale de `toISOString()`, así que trae la `Z`: una fecha sin huso la rechaza
    // el motor en vez de adivinarle una, y con razón —medido, una medición de un
    // minuto antes de la escritura quedaba tres horas después—.
    //
    // **Queda antes de la primera muestra, y NO hay cota por arriba.** La primera
    // redacción decía «hasta 50 ms», «cuatro órdenes de magnitud menos que los
    // diez segundos» y «corre hacia el lado más seguro»: las tres eran falsas, y
    // las corrigió una auditoría el 2026-09-19. El muestreo sólo empuja si la
    // consola ya publicó ese canal, así que la primera muestra puede llegar
    // arbitrariamente más tarde; 10 s contra 50 ms son 200 veces, o sea dos
    // órdenes y pico, no cuatro; y adelantar el inicio **afloja** la condición de
    // que la ventana haya terminado, aunque endurece la de que la medición no sea
    // anterior a la escritura.
    //
    // Sigue siendo despreciable contra los diez segundos, y ahora eso está dicho
    // sin adornarlo: es un desfase chico de dirección mixta, no un margen seguro.
    const empezoEl = new Date().toISOString();

    await this.recolectar();

    // **La ventana se toma por referencia una sola vez.** El motivo que estaba
    // escrito acá --que `cancelar()` podía entrar en el medio y dejar que se
    // analizara una cosa y se guardara otra-- **describía algo que no puede
    // pasar**, y citaba mal su precedente: entre este análisis y la lectura de las
    // muestras adentro de `medicionDeLaCaptura` no hay ningún `await`, así que no
    // hay dónde entrar; y `cancelar()` **reasigna** el arreglo en vez de mutarlo,
    // de modo que una referencia local no lo habría salvado de nada. Lo cazó una
    // auditoría de fidelidad el 2026-09-19.
    //
    // Queda porque nombrar la ventana una vez es más claro que mirar dos veces un
    // campo mutable, no porque tape un peligro vivo. Justificar una decisión
    // inocua con un peligro inventado es la forma de defecto que este repositorio
    // persigue, y por eso se corrige en vez de borrarse.
    const muestras = this.muestras;
    const analisis = analizarVentana(muestras);
    const perfil = this.banda.perfilDe(asignacion);
    const canal = this.mixer.canales().find((c) => c.indice === indice);
    // `null` cuando la consola todavia no dijo la ganancia: proponer a partir
    // de un numero inventado es peor que no dar el valor absoluto.
    const gainActual = canal?.gainDb ?? null;

    // Segunda captura del mismo canal: es lo que permite subir la confianza,
    // porque un hallazgo que aparece una sola vez puede ser la interpretación
    // y no la fuente.
    const previa = this.resultadoDe(indice);
    const repetido = previa !== undefined &&
      Math.abs(previa.analisis.picoDb - analisis.picoDb) < 3;

    // Qué proceso tenía puesto el canal. Sin canal —la consola no está— no se
    // sabe, y «no se sabe» no es «no hay»: `DINAMICA_SIN_LEER` lo dice así y el
    // asistente avisa en vez de dar por limpio un canal que nadie miró.
    const dinamica: DinamicaDeCanal = canal?.dinamica ?? DINAMICA_SIN_LEER;

    const propuesta = proponerGanancia(analisis, perfil, gainActual, {
      repetidoEnDosCapturas: repetido,
      // El ruido de fondo real necesita la interfaz de audio. Hasta entonces
      // se usa el mínimo del perfil, lo que evita avisos falsos de ruido.
      snrDb: perfil.snrMinimoDb,
      calibracionValida: true,
      dinamica,
    });

    const resultado: ResultadoCaptura = {
      indice,
      nombre: asignacion.nombreEnConsola,
      analisis,
      propuesta,
      capturadaEl: new Date().toISOString(),
      medicionId: await this.guardarLaEscucha(empezoEl, asignacion, analisis, muestras),
    };

    this.resultados.update((prev) => [
      ...prev.filter((r) => r.indice !== indice),
      resultado,
    ].sort((a, b) => a.indice - b.indice));

    this.estado.set('LISTA');
    this.canalEnCurso.set(null);

    this.log.info('audio', 'captura_terminada', {
      canal: indice,
      picoDb: Number(analisis.picoDb.toFixed(1)),
      margenDb: Number(analisis.margenDb.toFixed(1)),
      deltaPropuestoDb: Number(propuesta.deltaDb.toFixed(1)),
      confianza: propuesta.confianza,
      // Queda en el registro cuánto apretaba el canal al medir: dos capturas
      // del mismo canal que difieren se explican mirando esto.
      reduccionEnPicoDb: Number(analisis.reduccionEnPicoDb.toFixed(1)),
      condicionadaPor: propuesta.condicionadaPor.join(', '),
    });

    return resultado;
  }

  /**
   * Guarda la ventana como medición y devuelve su identificador.
   *
   * **Es la mitad que faltaba del lazo.** La aplicación medía, le contaba al
   * usuario si el cambio sirvió, y la ventana se perdía. El motor de seguridad
   * exige una medición entre un cambio y el siguiente sobre el mismo parámetro y
   * la busca en la tabla `measurement`: con la tabla vacía, **el segundo ajuste
   * sobre el mismo canal se rechazaba siempre**.
   *
   * **Se guarda toda captura y no sólo la posterior a un cambio**, por dos
   * motivos. Uno es que la ventana de antes es la evidencia de la propuesta, y
   * tirarla dejaría el historial contando decisiones sin lo que las causó. El otro
   * es que quien captura no sabe si va a haber un cambio después: decidirlo acá
   * sería adivinar.
   *
   * **No interrumpe la captura si falla.** Medir sirve por sí solo —la pantalla
   * también se usa para mirar cómo está un canal— y una escritura fallida no es
   * motivo para no contarle al usuario lo que se acaba de oír. Lo que se pierde es
   * el permiso para el ajuste siguiente, y eso el motor lo dice con su propio
   * nombre en vez de dejarlo pasar.
   */
  private async guardarLaEscucha(
    empezoEl: string,
    asignacion: ChannelAssignment,
    analisis: AnalisisDeGanancia,
    muestras: readonly MuestraVu[],
  ): Promise<string | null> {
    // **Con la consola desconectada no hay escucha que guardar, y esto tapa la
    // causa de lo que `elMedidorSeMovio` tapa por el dato.** `MixerService` sólo
    // vacía la lista de canales cuando el usuario desconecta a propósito: si la
    // conexión se cae sola, la captura muestrea dieciocho segundos del último
    // número conocido. Medido el 2026-09-19: eso se guardaba como una escucha de
    // 17,95 segundos y autorizaba el paso siguiente con cero segundos de música.
    //
    // **Lo que esta mitad alcanza, exacto:** la ventana que TERMINA con la consola
    // caída. Una caída que empieza y termina adentro de la ventana no la ve ni
    // ésta ni la otra.
    //
    // **Retractado el 2026-09-19.** Acá decía que para eso «hay que mirar la
    // frescura de las tramas, y es una tarea aparte», y es falso. Lo midió una
    // auditoría adversarial del mismo día: `ConnectionStateService` **ya ve la
    // caída** --`fijarEstado` invalida el estado confirmado con cualquier estado
    // que no sea `CONNECTED`, y no vuelve hasta un volcado completo--, así que
    // `permiteEscribir()` es falso durante toda la caída. Lo que falla es que
    // esto lo consulta **una sola vez, al final**, mientras la captura ya
    // muestrea cada 50 ms. No hace falta ningún mecanismo de frescura, y el
    // agujero es el mismo para la ganancia que para la cuña: arreglarlo una vez
    // arregla las dos.
    //
    // **Medir sigue funcionando**: lo que no se guarda es el permiso.
    if (!this.conexion.permiteEscribir()) {
      this.log.info('audio', 'escucha_sin_consola', {
        canal: asignacion.ui24rInputIndex, estado: this.conexion.estado(),
      });
      return null;
    }

    const sessionId = this.sesion.actual()?.sesion.id ?? null;
    if (sessionId === null) {
      // **No es un fallo y no se registra como tal.** Sin sesión abierta no hay
      // a qué colgar la medición: la tabla se lee por sesión y una fila huérfana
      // no la encontraría nadie, porque la aplicación **no** activa las claves
      // foráneas de SQLite y la base la aceptaría en silencio.
      this.log.info('audio', 'escucha_sin_sesion', { canal: asignacion.ui24rInputIndex });
      return null;
    }

    // El identificador sigue la forma que ya usa el ejecutor para las
    // transacciones —`ganancia-<canal>-<instante>`—, en vez de inventar un
    // esquema nuevo para la fila de al lado.
    const id = `medicion-${asignacion.ui24rInputIndex}-${Date.now()}`;
    const m = medicionDeLaCaptura({
      id, sessionId, empezoEl, channelId: asignacion.id, analisis, muestras,
    });

    try {
      await this.mediciones.guardar(m);
    } catch (e) {
      this.log.warn('audio', 'escucha_no_guardada', {
        canal: asignacion.ui24rInputIndex,
        motivo: e instanceof Error ? e.message : String(e),
      });
      return null;
    }

    this.log.info('audio', 'escucha_guardada', {
      canal: asignacion.ui24rInputIndex,
      id,
      senal: m.signalType,
      duracionS: Number(m.duracionS.toFixed(1)),
    });
    return id;
  }

  /**
   * Cancela la captura en curso.
   *
   * Limpia **los dos** temporizadores y resuelve la promesa de la cuenta
   * atrás. Antes solo limpiaba el de la cuenta: el muestreo, que corre cada
   * 50 ms, se limpiaba en el `finally` de esa promesa, y como la promesa
   * nunca se resolvía, el `finally` no se ejecutaba. El muestreo seguía vivo
   * y, como `capturar()` reasigna el arreglo de muestras al empezar la
   * siguiente, **el muestreo huérfano del canal cancelado empujaba muestras
   * dentro de la ventana del canal nuevo**. Quien cancelaba porque se
   * equivocó de canal y medía el correcto obtenía una recomendación calculada
   * sobre dos canales mezclados, presentada con su confianza y su evidencia
   * como si fuera fiable.
   */
  cancelar(): void {
    this.detenerTemporizadores();
    this.estado.set('INACTIVA');
    this.canalEnCurso.set(null);
    this.muestras = [];
    this.resolverCuenta?.();
    this.resolverCuenta = null;
    this.log.info('audio', 'captura_cancelada');
  }

  private detenerTemporizadores(): void {
    if (this.temporizador !== null) clearInterval(this.temporizador);
    this.temporizador = null;
    if (this.muestreo !== null) clearInterval(this.muestreo);
    this.muestreo = null;
  }

  limpiar(): void {
    this.resultados.set([]);
  }

  private contarRegresiva(): Promise<void> {
    this.estado.set('CUENTA_REGRESIVA');
    return this.cuentaAtras(CUENTA_REGRESIVA_S);
  }

  private recolectar(): Promise<void> {
    const indice = this.canalEnCurso();
    const inicio = Date.now();
    const recoger = () => {
      if (indice === null) return;
      const canal = this.mixer.canales().find((c) => c.indice === indice);
      // **`nivelPreProcesoDb` y no `nivelDb`.** El segundo es el que la consola
      // dibuja en su tira y el que muestra la pantalla de Consola, pero llega
      // con el compresor encima: aconsejar ganancia sobre él es aconsejar sobre
      // una señal ya procesada. Medido el 2026-09-09.
      //
      // El nivel y la reducción se toman juntos y de la misma trama: describen
      // el mismo instante, y separarlos haría que el pico de una y la reducción
      // de otra terminaran en la misma cuenta.
      if (canal) {
        this.muestras.push({
          tMs: Date.now() - inicio,
          db: canal.nivelPreProcesoDb,
          reduccionDb: canal.reduccionDb,
        });
      }
    };
    // **La cadencia sale de la constante compartida y no de un número acá.** De
    // ella sale también el `sampleRate` de la medición que se guarda: con el valor
    // escrito en dos sitios, cambiar el temporizador dejaría todas las mediciones
    // declarando una cadencia que ya no es la suya.
    this.muestreo = setInterval(recoger, INTERVALO_DE_MUESTREO_MS);
    return this.cuentaAtras(DURACION_CAPTURA_S).finally(() => {
      if (this.muestreo !== null) clearInterval(this.muestreo);
      this.muestreo = null;
    });
  }

  private cuentaAtras(segundos: number): Promise<void> {
    return new Promise((resolve) => {
      this.resolverCuenta = resolve;
      this.segundosRestantes.set(segundos);
      this.temporizador = setInterval(() => {
        const quedan = this.segundosRestantes() - 1;
        this.segundosRestantes.set(quedan);
        if (quedan <= 0) {
          if (this.temporizador !== null) clearInterval(this.temporizador);
          this.temporizador = null;
          this.resolverCuenta = null;
          resolve();
        }
      }, 1000);
    });
  }
}
