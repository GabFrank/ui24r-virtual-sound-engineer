import { Injectable, computed, inject, signal } from '@angular/core';
import {
  estadisticaDeSegmentos, huellaDelEstado, informeEnMarkdown,
  type CicloDeReconexion, type InformeDeDiagnostico, type ModoDeCorte,
} from '@vse/diagnostico';
import { MixerService } from '../core/mixer.service';
import { Logger } from '../core/logger';

/**
 * La prueba de conexión, corrida desde la propia tablet.
 *
 * Por qué acá y no en un script de laptop: los dos números que decide SPK-P0.1
 * --cuánto tarda en reconectar y con qué cadencia llegan los medidores-- son
 * propiedades del aparato en esa red, no del protocolo. Medirlos en una laptop
 * daría los de la laptop.
 *
 * **Esta prueba no escribe nada.** Escucha, cronometra y calcula. El eco de las
 * escrituras propias --criterio 3 del spike-- se queda sin medir a propósito:
 * exige escribir, y en esta fase la aplicación no escribe.
 */
@Injectable({ providedIn: 'root' })
export class DiagnosticoService {
  private readonly mixer = inject(MixerService);
  private readonly log = inject(Logger);

  /**
   * Marcas de tiempo por tramo, separadas por flujo.
   *
   * Son dos porque miden cosas distintas: `RTA` no se apaga nunca y por eso
   * juzga la conexión; `VU2` se apaga en silencio y por eso juzga cuánto audio
   * hubo. Mezclarlas daba un solo número que no contestaba ninguna de las dos
   * preguntas, y que en una sala callada parecía una conexión rota.
   */
  private tramosRta: number[][] = [[]];
  private tramosVu: number[][] = [[]];
  private desuscribir: (() => void)[] = [];
  private comenzoEnMs = 0;
  private caidaEnMs: number | null = null;
  private caidaEnIso: string | null = null;
  private redVolvioEnMs: number | null = null;
  private redVolvioEnIso: string | null = null;
  private quitarOnline: (() => void) | null = null;
  private reintento: ReturnType<typeof setInterval> | null = null;

  readonly midiendo = signal(false);
  /** Tramas del analizador: la señal de vida. */
  readonly latidos = signal(0);
  /** Tramas de medidores: hay audio o no lo hay. */
  readonly tramas = signal(0);
  readonly ciclos = signal<readonly CicloDeReconexion[]>([]);
  readonly esperandoReconexion = signal(false);
  readonly modo = signal<ModoDeCorte>('router-apagado');

  /** La que contesta el criterio 4. */
  readonly cadenciaDelAnalizador = computed(() => {
    this.latidos();
    return estadisticaDeSegmentos(this.tramosRta);
  });

  readonly cadencia = computed(() => {
    this.tramas();
    return estadisticaDeSegmentos(this.tramosVu);
  });

  /**
   * Empieza a cronometrar.
   *
   * No hay duración fija: se para cuando quien mide decide que ya está. El
   * spike pide diez minutos de tramas, pero una sesión con la consola delante
   * no siempre da diez minutos seguidos, y media medición vale más que ninguna
   * mientras el informe diga cuánto duró.
   */
  iniciar(): void {
    if (this.midiendo()) return;
    this.tramosRta = [[]];
    this.tramosVu = [[]];
    this.latidos.set(0);
    this.tramas.set(0);
    this.comenzoEnMs = Date.now();
    this.midiendo.set(true);

    this.desuscribir.push(this.mixer.observarLatido(() => {
      this.tramosRta[this.tramosRta.length - 1]!.push(Date.now());
      this.latidos.update((n) => n + 1);
    }));

    this.desuscribir.push(this.mixer.observarTelemetria(() => {
      this.tramosVu[this.tramosVu.length - 1]!.push(Date.now());
      this.tramas.update((n) => n + 1);
    }));

    this.desuscribir.push(this.mixer.observarConexion((estado) => {
      if (estado === 'CONNECTED') return;
      // Primera señal de caída: se guarda la hora y se espera el volcado.
      if (this.caidaEnMs === null) {
        this.caidaEnMs = Date.now();
        this.caidaEnIso = new Date().toISOString();
        this.redVolvioEnMs = null;
        this.redVolvioEnIso = null;
        this.esperandoReconexion.set(true);
        // Tramo nuevo: el hueco entre la última trama de antes de la caída y la
        // primera de después es el corte, no la cadencia de la consola.
        this.tramosRta.push([]);
        this.tramosVu.push([]);
        this.escucharVuelta();
        this.reintentarHastaVolver();
      }
    }));

    this.desuscribir.push(this.mixer.observarVolcado(() => {
      if (this.caidaEnMs === null) return;
      const ahora = Date.now();
      const ciclo: CicloDeReconexion = {
        modo: this.modo(),
        caidaEn: this.caidaEnIso!,
        redVuelveEn: this.redVolvioEnIso,
        volcadoEn: new Date(ahora).toISOString(),
        msDesdeLaCaida: ahora - this.caidaEnMs,
        msDesdeQueVolvioLaRed: this.redVolvioEnMs === null ? null : ahora - this.redVolvioEnMs,
      };
      this.ciclos.update((prev) => [...prev, ciclo]);
      this.log.info('mixer', 'ciclo_reconexion', { ...ciclo });
      this.caidaEnMs = null;
      this.caidaEnIso = null;
      this.esperandoReconexion.set(false);
      this.dejarDeEscucharLaVuelta();
      this.dejarDeReintentar();
    }));

    this.log.info('mixer', 'medicion_iniciada', {});
  }

  detener(): void {
    for (const f of this.desuscribir) f();
    this.desuscribir = [];
    this.dejarDeEscucharLaVuelta();
    this.dejarDeReintentar();
    this.midiendo.set(false);
    this.esperandoReconexion.set(false);
    this.log.info('mixer', 'medicion_detenida', {
      latidos: this.latidos(),
      tramas: this.tramas(),
    });
  }

  /**
   * Marca a mano que la red volvió.
   *
   * El aviso del sistema es el bueno cuando llega, pero no siempre llega: en
   * Android, quitar y poner la red no siempre produce un evento. Este botón es
   * el suplente, y el informe distingue los dos casos en vez de mezclarlos.
   */
  marcarRedRestablecida(): void {
    if (this.caidaEnMs === null || this.redVolvioEnMs !== null) return;
    this.redVolvioEnMs = Date.now();
    this.redVolvioEnIso = new Date().toISOString();
  }

  borrarCiclos(): void {
    this.ciclos.set([]);
  }

  async informe(): Promise<InformeDeDiagnostico> {
    const info = await this.mixer.infoDispositivo().catch(() => null);
    const volcado = this.mixer.volcadoDelEstado();
    const valores = new Map<string, number>();
    for (const [clave, entrada] of volcado) valores.set(clave, entrada.valor);

    return {
      version: 2,
      generadoEn: new Date().toISOString(),
      dispositivo: {
        modelo: info?.modelo ?? null,
        firmware: info?.firmware ?? null,
        direccion: this.mixer.direccion() ?? 'sin conectar',
        agente: navigator.userAgent,
      },
      cadenciaDelAnalizador: this.cadenciaDelAnalizador(),
      cadenciaDeMedidores: this.cadencia(),
      duracionDeLaMedicionMs: this.comenzoEnMs === 0 ? 0 : Date.now() - this.comenzoEnMs,
      ciclos: this.ciclos(),
      huellaDelEstado: valores.size === 0 ? null : huellaDelEstado(valores),
      canalesLeidos: this.mixer.canales().length,
      sinMedir: SIN_MEDIR,
    };
  }

  async informeEnTexto(): Promise<{ markdown: string; json: string }> {
    const informe = await this.informe();
    return {
      markdown: informeEnMarkdown(informe),
      json: JSON.stringify(informe, null, 2),
    };
  }

  /**
   * Reintenta conectar mientras dure la caída.
   *
   * El adaptador **no reconecta solo**: al cerrarse el socket queda en
   * DISCONNECTED y ahí se queda. Cómo debe reconectar la aplicación es una
   * decisión que depende justamente de lo que mida este spike, así que no se
   * mete acá una máquina de reconexión que después haya que rehacer: el
   * reintento vive dentro de la prueba y desaparece con ella.
   *
   * El precio es que el tiempo medido incluye hasta un intervalo de espera de
   * más. El informe lo dice, porque un número que se presenta sin su margen se
   * lee como si no lo tuviera.
   */
  private reintentarHastaVolver(): void {
    if (this.reintento !== null) return;
    const url = this.mixer.direccion();
    if (url === null) return;
    this.reintento = setInterval(() => {
      void this.mixer.conectar(url).catch(() => { /* sigue sin haber red */ });
    }, INTERVALO_DE_REINTENTO_MS);
  }

  private dejarDeReintentar(): void {
    if (this.reintento !== null) clearInterval(this.reintento);
    this.reintento = null;
  }

  private escucharVuelta(): void {
    if (this.quitarOnline !== null) return;
    const alVolver = (): void => this.marcarRedRestablecida();
    globalThis.addEventListener('online', alVolver);
    this.quitarOnline = () => globalThis.removeEventListener('online', alVolver);
  }

  private dejarDeEscucharLaVuelta(): void {
    this.quitarOnline?.();
    this.quitarOnline = null;
  }
}

/**
 * Lo que esta prueba no puede contestar, dicho en el propio informe.
 *
 * Un informe que solo enumera lo que salió bien se lee como si lo demás
 * estuviera comprobado.
 */
/**
 * Cada cuánto se reintenta conectar mientras la red está caída.
 *
 * Un segundo: lo bastante seguido para no inflar la medición --el umbral del
 * criterio 1 son diez segundos-- y lo bastante espaciado para no castigar la
 * batería con intentos que van a fallar igual.
 */
const INTERVALO_DE_REINTENTO_MS = 1000;

const SIN_MEDIR: readonly string[] = [
  'El eco de las escrituras propias (criterio 3 de SPK-P0.1): exige escribir, y en esta fase la aplicación no escribe nada.',
  'La comparación entre tres clientes a la vez (criterio 5): esta corrida da la huella de uno. Hay que generar la de los otros y compararlas.',
  'El alcance de la recuperación de instantáneas (SPK-P0.8) y la matriz de escritura (SPK-P0.2a): las dos exigen escribir.',
  `El tiempo de reconexión incluye hasta ${INTERVALO_DE_REINTENTO_MS} ms de espera: el adaptador no reconecta solo, y la prueba reintenta a ese ritmo.`,
];
