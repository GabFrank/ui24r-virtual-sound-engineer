import { Injectable, inject, signal, computed } from '@angular/core';
import type { MuestraVu } from '@vse/assistants';
import { Logger } from '../core/logger';
import { MixerService } from '../core/mixer.service';
import { MedicionesService } from '../core/mediciones.service';
import { ConnectionStateService } from '../core/connection.state';
import {
  medicionDeLaCaptura, DURACION_CAPTURA_S, CUENTA_REGRESIVA_S,
  INTERVALO_DE_MUESTREO_MS, cuantoSono, sonaronALaVez,
} from '../core/medicion-de-la-captura.ts';
import { analizarVentana } from '@vse/assistants';
import { LIMITES } from '@vse/domain';

/**
 * Escuchar la cuña de un músico después de moverla, y dejarlo anotado.
 *
 * ## Por qué existe, que no es para mostrar una barra
 *
 * **El motor exige una escucha entre un paso y el siguiente sobre el mismo
 * mando**, y la resuelve contra la tabla de mediciones pidiendo el identificador
 * exacto que la transacción declara. La pantalla de ganancia cumple eso desde el
 * 2026-09-19: aplica, vuelve a medir, guarda la ventana y la anota. **El envío a
 * monitor no**, y no por falta de servicio ni de motor: no había quien capturara.
 * Mientras no lo hubiera, ninguna cuña quedaba con escucha comprobada y el
 * segundo paso de cualquier rampa se rechazaba, que es justamente lo que la
 * pieza de monitor necesita poder hacer.
 *
 * ## Por qué no alcanza con copiar la captura de la ganancia
 *
 * Porque **el medidor del canal no se entera del envío**. La ganancia está aguas
 * arriba de ese medidor, así que moverla lo mueve; el envío a una cuña deriva del
 * canal hacia el bus y está antes del fader, de modo que subirlo lo deja
 * exactamente donde estaba. Una escucha comprobada sólo sobre el canal probaría
 * que el músico tocó, sin decir nada de si su cuña sonó, y con eso la aplicación
 * podría subir una cuña muda paso tras paso hasta el techo de nominal.
 *
 * Por eso esta captura muestrea **los dos**, en el mismo tic: el del músico y el
 * de su cuña. Es decisión del usuario del 2026-09-19, entre tres opciones
 * ([ADR-036](../../../../../docs/adr/ADR-036-la-escucha-de-una-cuna-se-comprueba-sobre-dos-medidores.md)),
 * y quien decide qué cuenta como escucha con esas dos series es
 * `medicionDeLaCaptura`, donde se puede probar.
 *
 * ## Lo que este servicio NO hace
 *
 * **No escribe nada en la consola** y no toca el motor de seguridad: sólo
 * escucha y guarda. Quien aplica el cambio es `EnvioAMonitorService`, que después
 * anota acá el identificador que esto devuelve.
 *
 * **Y ninguna pantalla lo llama todavía**, igual que el servicio de al lado.
 * Existe el camino y está probado; falta la pantalla por músico.
 */

/** Qué cuña escuchar y de quién. */
export interface CunaAEscuchar {
  /** El canal del músico, base uno: de él sale el envío. */
  readonly canal: number;
  /** El auxiliar que es su cuña, base uno. */
  readonly auxiliar: number;
  /**
   * El canal asignado, para poder decir de quién es esta escucha.
   *
   * `null` cuando el canal no está asignado a nadie. **Se guarda igual**: una
   * escucha sin dueño sigue siendo una escucha, y negarse a guardarla dejaría sin
   * rampa a una cuña de un canal que nadie nombró.
   */
  readonly channelId: string | null;
}

export type EstadoEscucha = 'INACTIVA' | 'CUENTA_REGRESIVA' | 'ESCUCHANDO' | 'LISTA';

export interface ResultadoEscucha {
  /**
   * La medición que quedó guardada, o `null` si no quedó.
   *
   * **Es lo que permite decirle al motor «acá se escuchó».** `null` cuando no
   * había sesión abierta, cuando la consola no estaba conectada al terminar, o
   * cuando la escritura falló. En los tres casos escuchar igual sirvió —se le
   * puede contar al usuario qué pasó— y lo que se pierde es el permiso para el
   * paso siguiente, que el motor niega con su propio nombre.
   */
  readonly medicionId: string | null;
  /** Cuánto sonaron el músico y su cuña **a la vez**, en segundos. */
  readonly sonoS: number;
  /** Si con esto alcanza para que el motor conceda otro paso. */
  readonly alcanzaParaOtroPaso: boolean;
}

/**
 * Los segundos de música que el motor pide para conceder otro paso de monitor.
 *
 * **Sale de la tabla del motor y no se escribe acá.** Este servicio lo usa sólo
 * para poder avisarle al músico «tocá un poco más» **antes** de que el motor
 * rechace, que es la diferencia entre pedir otra vuelta y un rechazo que aparece
 * un paso más tarde sin explicación. El veredicto sigue siendo del motor: un
 * número copiado acá que se separara del suyo haría que la aplicación prometiera
 * un permiso que después se niega, y el usuario lo viviría como que le miente.
 *
 * `?? 0` no es un valor por omisión con opinión: `LIMITES` es parcial por tipo y
 * esta clave está puesta. Si alguna vez no lo estuviera, avisar de más es el lado
 * seguro, porque el que corta igual es el motor.
 */
const ESCUCHA_MINIMA_S = LIMITES.MONITOR_AUX_SEND?.escuchaMinimaS ?? 0;

@Injectable({ providedIn: 'root' })
export class EscuchaDeLaCunaService {
  private readonly log = inject(Logger);
  private readonly mixer = inject(MixerService);
  private readonly mediciones = inject(MedicionesService);
  private readonly conexion = inject(ConnectionStateService);

  readonly estado = signal<EstadoEscucha>('INACTIVA');
  readonly segundosRestantes = signal(0);
  readonly cunaEnCurso = signal<number | null>(null);

  readonly escuchando = computed(
    () => this.estado() === 'ESCUCHANDO' || this.estado() === 'CUENTA_REGRESIVA',
  );

  /** Las dos series, alineadas por índice: se empujan en el mismo tic. */
  private muestrasDelCanal: MuestraVu[] = [];
  private muestrasDeLaCuna: MuestraVu[] = [];
  private temporizador: ReturnType<typeof setInterval> | null = null;
  private muestreo: ReturnType<typeof setInterval> | null = null;
  private resolverCuenta: (() => void) | null = null;

  /**
   * Escucha una ventana sobre una cuña y la deja guardada.
   *
   * `sessionId` no es opcional y no se saca de un servicio de sesión acá:
   * quien aplica el cambio ya lo tiene, y pedirlo hace imposible guardar una
   * medición colgada de una sesión distinta de la del cambio que la motiva.
   */
  async escuchar(c: CunaAEscuchar, sessionId: string): Promise<ResultadoEscucha> {
    if (this.escuchando()) throw new Error('ya hay una escucha en curso');

    this.cunaEnCurso.set(c.auxiliar);
    this.muestrasDelCanal = [];
    this.muestrasDeLaCuna = [];

    this.estado.set('CUENTA_REGRESIVA');
    await this.cuentaAtras(CUENTA_REGRESIVA_S);

    this.estado.set('ESCUCHANDO');
    this.log.info('audio', 'escucha_de_cuna_iniciada', {
      canal: c.canal, auxiliar: c.auxiliar, duracionS: DURACION_CAPTURA_S,
    });

    // **Cuándo EMPIEZA la ventana**, con huso explícito. El motor hace
    // `timestamp + duracionS` para saber si la escucha terminó: con la fecha del
    // final esa suma cae una ventana más adelante y la escucha no se daría por
    // terminada nunca. Es la misma decisión, y el mismo motivo, que en la captura
    // de ganancia.
    const empezoEl = new Date().toISOString();

    await this.recolectar(c);

    const delCanal = this.muestrasDelCanal;
    const deLaCuna = this.muestrasDeLaCuna;
    this.estado.set('LISTA');
    this.cunaEnCurso.set(null);

    const medicionId = await this.guardarLaEscucha(c, sessionId, empezoEl, delCanal, deLaCuna);
    // **La misma cuenta que va a la medición, no una parecida.** Se importa de
    // donde `medicionDeLaCaptura` la hace: una segunda copia acá podría decirle al
    // músico que alcanzó mientras el motor lee otro número y rechaza.
    const sonoS = cuantoSono(sonaronALaVez(delCanal, deLaCuna));

    this.log.info('audio', 'escucha_de_cuna_terminada', {
      canal: c.canal,
      auxiliar: c.auxiliar,
      sonoS: Number(sonoS.toFixed(1)),
      guardada: medicionId !== null,
    });

    return {
      medicionId,
      sonoS,
      // **Se compara contra lo que el motor exige, no contra un número de acá.**
      // Sirve para poder decirle al músico «tocá un poco más» antes de que el
      // motor rechace el paso siguiente; el veredicto sigue siendo del motor.
      alcanzaParaOtroPaso: medicionId !== null && sonoS >= ESCUCHA_MINIMA_S,
    };
  }

  /**
   * Guarda la ventana como medición y devuelve su identificador.
   *
   * **No interrumpe nada si falla.** Escuchar sirve por sí solo: lo que se pierde
   * es el permiso para el paso siguiente, y eso el motor lo dice con su propio
   * nombre en vez de dejarlo pasar.
   */
  private async guardarLaEscucha(
    c: CunaAEscuchar,
    sessionId: string,
    empezoEl: string,
    delCanal: readonly MuestraVu[],
    deLaCuna: readonly MuestraVu[],
  ): Promise<string | null> {
    // **Con la consola desconectada no hay escucha que guardar.** `MixerService`
    // sólo vacía sus listas cuando el usuario desconecta a propósito: si la
    // conexión se cae sola, los últimos niveles quedan ahí y la captura muestrea
    // la ventana entera de un número muerto. Medido el 2026-09-19 sobre la
    // captura de ganancia, y acá vale igual porque el mecanismo es el mismo.
    //
    // **Lo que esto alcanza, exacto:** la ventana que TERMINA con la consola
    // caída. Una caída que empieza y termina adentro no la ve ni ésta ni la
    // prueba del medidor quieto; para eso hay que mirar la frescura de las
    // tramas, y es una tarea aparte, anotada.
    if (!this.conexion.permiteEscribir()) {
      this.log.info('audio', 'escucha_de_cuna_sin_consola', {
        auxiliar: c.auxiliar, estado: this.conexion.estado(),
      });
      return null;
    }

    // Vacío no es un identificador: la tabla se lee por sesión y esa fila no la
    // encontraría nadie. El almacén lo rechaza igual; acá se evita el intento.
    if (sessionId === '') {
      this.log.info('audio', 'escucha_de_cuna_sin_sesion', { auxiliar: c.auxiliar });
      return null;
    }

    const id = `medicion-cuna-${c.canal}-${c.auxiliar}-${Date.now()}`;
    const m = medicionDeLaCaptura({
      id,
      sessionId,
      empezoEl,
      channelId: c.channelId,
      // **El análisis es del canal del músico y no de la cuña**, y tiene que ser
      // así: las métricas que se guardan describen a quién se escuchó, y
      // `channelId` nombra ese mismo canal. Guardar el margen de la cuña bajo el
      // identificador del canal sería una fila que se lee mal sin que nada lo
      // avise. Lo que aporta la cuña es el permiso, no el número.
      analisis: analizarVentana(delCanal),
      muestras: delCanal,
      muestrasDeLaCuna: deLaCuna,
    });

    try {
      await this.mediciones.guardar(m);
    } catch (e) {
      this.log.warn('audio', 'escucha_de_cuna_no_guardada', {
        auxiliar: c.auxiliar,
        motivo: e instanceof Error ? e.message : String(e),
      });
      return null;
    }

    this.log.info('audio', 'escucha_de_cuna_guardada', {
      canal: c.canal, auxiliar: c.auxiliar, id,
      senal: m.signalType,
      duracionS: Number(m.duracionS.toFixed(1)),
    });
    return id;
  }

  /** Corta la escucha en curso y limpia los dos temporizadores. */
  cancelar(): void {
    this.detenerTemporizadores();
    this.estado.set('INACTIVA');
    this.cunaEnCurso.set(null);
    // Se reasignan, no se vacían en el lugar: una ventana en curso que todavía
    // tenga una referencia a estos arreglos no debe recibir muestras de la
    // siguiente. Es el defecto que la captura de ganancia pagó con dos canales
    // mezclados en una recomendación.
    this.muestrasDelCanal = [];
    this.muestrasDeLaCuna = [];
    this.resolverCuenta?.();
    this.resolverCuenta = null;
    this.log.info('audio', 'escucha_de_cuna_cancelada');
  }

  private detenerTemporizadores(): void {
    if (this.temporizador !== null) clearInterval(this.temporizador);
    this.temporizador = null;
    if (this.muestreo !== null) clearInterval(this.muestreo);
    this.muestreo = null;
  }

  private recolectar(c: CunaAEscuchar): Promise<void> {
    const inicio = Date.now();
    const recoger = (): void => {
      const canal = this.mixer.canales().find((x) => x.indice === c.canal);
      const cuna = this.mixer.auxiliares().find((x) => x.indice === c.auxiliar);
      // **Las dos o ninguna, y eso es deliberado.** Las series se cruzan por
      // índice para preguntar si sonaron a la vez; empujar una sola cuando la otra
      // falta las desalinearía, y a partir de ahí la posición `i` de una y de la
      // otra dejarían de describir el mismo instante. Un tic sin las dos lecturas
      // es un instante del que no se sabe nada, y no se sabe nada es lo que hay
      // que registrar: nada.
      if (canal === undefined || cuna === undefined) return;
      const tMs = Date.now() - inicio;
      // `nivelPreProcesoDb` y no `nivelDb`: el segundo llega con el compresor
      // encima. Es el mismo byte que muestrea la captura de ganancia.
      this.muestrasDelCanal.push({
        tMs, db: canal.nivelPreProcesoDb, reduccionDb: canal.reduccionDb,
      });
      // `nivelDb` de la cuña es lo que sale hacia el parlante, después del fader
      // del auxiliar. Ver `EstadoAuxiliar`: el otro byte no incluye ese fader, y
      // ese fader es el que puede dejar la cuña muda sin que el envío lo delate.
      this.muestrasDeLaCuna.push({
        tMs, db: cuna.nivelDb, reduccionDb: cuna.reduccionDb,
      });
    };
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
