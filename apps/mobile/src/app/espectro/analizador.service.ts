import { Injectable, inject, signal, computed } from '@angular/core';
import {
  VigilanteDeRealimentacion, sospechososDeRealimentacion,
  type Candidata, type Sospechoso,
} from '@vse/assistants';
import { MixerService } from '../core/mixer.service';
import { Logger } from '../core/logger';

/**
 * El analizador de la consola, tomado prestado con permiso.
 *
 * **`var.rta` es global**: no hay una por cliente. Elegir qué mira el
 * analizador le cambia la pantalla al operador, en vivo y sin avisar (R-28).
 * ADR-025 decidió cómo se maneja eso:
 *
 * - **Permiso una vez por sesión**, no en cada préstamo. Un diálogo que aparece
 *   cada vez que se mira otro canal se acepta sin leer a los cinco minutos, y
 *   entonces protege menos que preguntar una vez y bien.
 * - **El préstamo dura lo que dura la pantalla abierta.** Dentro se puede
 *   cambiar de fuente libremente; al salir se devuelve la que el operador tenía.
 * - **Se devuelve lo que se leyó**, nunca una reconstrucción.
 *
 * **Se vigila el general y no un canal**, y eso es una decisión de fondo: la
 * realimentación es un lazo del sistema —sale por los parlantes y vuelve por un
 * micrófono— así que aparece en el general venga del canal que venga. Vigilar
 * un canal detecta solo ese; rotar entre canales detecta tarde y le hace saltar
 * el analizador al operador justo cuando lo necesita quieto.
 */

/** El general, que es lo más cercano a «qué está saliendo» sin micrófono. */
export const FUENTE_GENERAL = 'm';

export type EstadoDelPermiso = 'SIN_PEDIR' | 'CONCEDIDO' | 'RECHAZADO';

@Injectable({ providedIn: 'root' })
export class AnalizadorService {
  private readonly mixer = inject(MixerService);
  private readonly log = inject(Logger);

  private readonly vigilante = new VigilanteDeRealimentacion();
  private quitarOyente: (() => void) | null = null;

  private readonly _permiso = signal<EstadoDelPermiso>('SIN_PEDIR');
  private readonly _prestado = signal(false);
  private readonly _bandas = signal<readonly number[]>([]);
  private readonly _candidatas = signal<readonly Candidata[]>([]);

  readonly permiso = this._permiso.asReadonly();
  readonly prestado = this._prestado.asReadonly();
  readonly bandas = this._bandas.asReadonly();
  readonly candidatas = this._candidatas.asReadonly();

  /**
   * Qué fuente tenía el operador antes de que tocáramos nada.
   *
   * Sirve para contárselo en el diálogo de permiso: «vas a ver tu analizador
   * cambiar» es más honesto si además se dice de dónde a dónde.
   */
  readonly fuenteDelOperador = computed(() => this.mixer.api()?.fuenteOriginalDelAnalizador() ?? null);

  /**
   * Los canales que podrían estar produciendo lo que se detectó.
   *
   * **Es una pista y no un veredicto.** Que un canal tenga señal no prueba que
   * sea el culpable; lo concluyente es la negativa: un canal mudo queda
   * descartado, y eso ya reduce veinticuatro candidatos a los pocos abiertos.
   */
  readonly sospechosos = computed<readonly Sospechoso[]>(() =>
    this._candidatas().length === 0 ? [] : sospechososDeRealimentacion(
      this.mixer.canales().map((c) => ({
        indice: c.indice,
        nombre: c.nombre,
        nivelDb: c.nivelDb,
        silenciado: c.silenciado,
        // La marca de «en vivo» vive en la asignación de canales, que este
        // servicio no conoce. Va en `false` hasta que se cablee: sin nadie
        // marcado, la marca no descarta a nadie, que es el comportamiento
        // seguro.
        enVivo: false,
      })),
    ));

  conceder(): void {
    this._permiso.set('CONCEDIDO');
    this.log.info('mixer', 'permiso_analizador_concedido', {});
  }

  rechazar(): void {
    this._permiso.set('RECHAZADO');
    this.log.info('mixer', 'permiso_analizador_rechazado', {});
  }

  /**
   * Toma el analizador y empieza a vigilar. Sin permiso no hace nada.
   *
   * Devuelve `false` cuando no se pudo, para que la pantalla pueda decir por
   * qué en vez de quedarse en blanco.
   */
  empezar(fuente: string = FUENTE_GENERAL): boolean {
    if (this._permiso() !== 'CONCEDIDO') return false;
    const api = this.mixer.api();
    if (api === null || !api.tomarAnalizador(fuente)) return false;

    this.vigilante.reiniciar();
    this._candidatas.set([]);
    this.quitarOyente?.();
    this.quitarOyente = api.alEspectro((bandas) => {
      this._bandas.set(bandas);
      this._candidatas.set(this.vigilante.observar(bandas, Date.now()));
    });
    this._prestado.set(true);
    this.log.info('mixer', 'analizador_tomado', { fuente });
    return true;
  }

  /**
   * Devuelve el analizador al operador.
   *
   * **Se llama al salir de la pantalla, y tiene que llamarse siempre**: dejarlo
   * tomado significa que el operador abrió el espectro una vez y su analizador
   * quedó apuntando a otro lado el resto del día.
   */
  terminar(): void {
    this.quitarOyente?.();
    this.quitarOyente = null;
    this._bandas.set([]);
    this._candidatas.set([]);
    if (!this._prestado()) return;
    this.mixer.api()?.devolverAnalizador();
    this._prestado.set(false);
    this.log.info('mixer', 'analizador_devuelto', {});
  }
}
