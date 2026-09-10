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
    }));

    this.log.info('mixer', 'medicion_iniciada', {});
  }

  detener(): void {
    for (const f of this.desuscribir) f();
    this.desuscribir = [];
    this.dejarDeEscucharLaVuelta();
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
 * Cada cuánto reintenta conectar la aplicación, para poder decirlo en el
 * informe. El número vive en `MixerService`, que es quien reconecta.
 *
 * **Esta prueba ya no reintenta por su cuenta.** Lo hacía cuando la aplicación
 * no reconectaba sola, y medía entonces una reconexión que solo existía
 * mientras la pantalla de diagnóstico estuviera abierta. Ahora cronometra la
 * de verdad, que es la que el criterio 1 de SPK-P0.1 quiere medir.
 */
const INTERVALO_DE_REINTENTO_MS = 1000;

const SIN_MEDIR: readonly string[] = [
  'El eco de las escrituras propias (criterio 3 de SPK-P0.1): exige escribir, y en esta fase la aplicación no escribe nada.',
  'La comparación entre tres clientes a la vez (criterio 5): esta corrida da la huella de uno. Hay que generar la de los otros y compararlas.',
  'El alcance de la recuperación de instantáneas (SPK-P0.8) y la matriz de escritura (SPK-P0.2a): las dos exigen escribir.',
  `El tiempo de reconexión incluye hasta ${INTERVALO_DE_REINTENTO_MS} ms de espera: la aplicación reintenta a ese ritmo, y un corte puede empezar justo después de un intento.`,
];
