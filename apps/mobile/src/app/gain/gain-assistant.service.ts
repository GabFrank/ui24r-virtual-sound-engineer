import { Injectable, inject, signal, computed } from '@angular/core';
import {
  analizarVentana, proponerGanancia,
  type MuestraVu, type AnalisisDeGanancia, type PropuestaDeGanancia,
} from '@vse/assistants';
import type { ChannelAssignment } from '@vse/domain';
import { Logger } from '../core/logger';
import { MixerService } from '../core/mixer.service';
import { BandService } from '../core/band.service';

export type EstadoCaptura = 'INACTIVA' | 'CUENTA_REGRESIVA' | 'CAPTURANDO' | 'LISTA';

export interface ResultadoCaptura {
  readonly indice: number;
  readonly nombre: string;
  readonly analisis: AnalisisDeGanancia;
  readonly propuesta: PropuestaDeGanancia;
  readonly capturadaEl: string;
}

/** Duración de la ventana de captura, en segundos. */
export const DURACION_CAPTURA_S = 18;
const CUENTA_REGRESIVA_S = 3;

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

  readonly estado = signal<EstadoCaptura>('INACTIVA');
  readonly segundosRestantes = signal(0);
  readonly canalEnCurso = signal<number | null>(null);
  readonly resultados = signal<readonly ResultadoCaptura[]>([]);

  readonly capturando = computed(
    () => this.estado() === 'CAPTURANDO' || this.estado() === 'CUENTA_REGRESIVA',
  );

  private muestras: MuestraVu[] = [];
  private temporizador: ReturnType<typeof setInterval> | null = null;
  /** El muestreo de niveles, cada 50 ms. Vive aparte de la cuenta atrás. */
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

    await this.recolectar();

    const analisis = analizarVentana(this.muestras);
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

    const propuesta = proponerGanancia(analisis, perfil, gainActual, {
      repetidoEnDosCapturas: repetido,
      // El ruido de fondo real necesita la interfaz de audio. Hasta entonces
      // se usa el mínimo del perfil, lo que evita avisos falsos de ruido.
      snrDb: perfil.snrMinimoDb,
      calibracionValida: true,
    });

    const resultado: ResultadoCaptura = {
      indice,
      nombre: asignacion.nombreEnConsola,
      analisis,
      propuesta,
      capturadaEl: new Date().toISOString(),
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
    });

    return resultado;
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
      if (canal) this.muestras.push({ tMs: Date.now() - inicio, db: canal.nivelDb });
    };
    this.muestreo = setInterval(recoger, 50);
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
