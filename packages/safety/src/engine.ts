import {
  ownership, esEscribible, verificarLimite,
  maximoDeParametros, Q_MINIMO_SALIDA, REALCE_MAXIMO_SALA_DB,
} from '@vse/domain';
import { clasificarRuta } from '@vse/mixer-adapter';
import type { CambioPropuesto, ContextoSeguridad, Rechazo, Veredicto } from './types.ts';

/**
 * Safety Engine.
 *
 * Tiene autoridad sobre cualquier asistente: puede rechazar cualquier cambio,
 * y ningún asistente puede saltárselo. La razón no es jerárquica sino
 * práctica: los asistentes razonan sobre sonido, y el sonido a veces sugiere
 * mover algo que en ese momento no se debe tocar. Alguien tiene que saber que
 * el show ya empezó, que la ganancia quedó congelada al grabar, o que ese
 * auxiliar es el monitor del cantante.
 *
 * Cada regla cita la invariante que la origina, y ese identificador viaja
 * hasta el registro y hasta el mensaje que ve el usuario: cuando algo se
 * rechaza, se puede saber exactamente por qué y buscarlo en la documentación.
 */
export class SafetyEngine {
  private bloqueado = false;

  /** Escrituras que pasan incluso con el paro de emergencia activo (INV-019). */
  private static readonly LISTA_BLANCA: ReadonlySet<string> = new Set([
    'MEDIA_STOP', 'MTK_STOP', 'MUTE_PLAYER', 'ROLLBACK',
    'RESTAURAR_RESERVA', 'RESTAURAR_MUTES',
  ]);

  bloquear(): void { this.bloqueado = true; }
  desbloquear(): void { this.bloqueado = false; }
  get estaBloqueado(): boolean { return this.bloqueado; }

  esDeSeguridad(tipo: string): boolean {
    return SafetyEngine.LISTA_BLANCA.has(tipo);
  }

  /**
   * Evalúa una transacción completa.
   *
   * Devuelve **todos** los motivos de rechazo, no el primero. Si una
   * transacción viola tres reglas, quien la propuso necesita ver las tres:
   * arreglar una y volver a chocar con la siguiente es una forma lenta y
   * frustrante de descubrir lo mismo.
   */
  evaluar(
    cambios: readonly CambioPropuesto[],
    ctx: ContextoSeguridad,
    opciones: {
      readonly conexionPermiteEscribir: boolean;
      readonly snapshotVerificado: boolean;
      /**
       * Tipo de operación, para la lista blanca del paro de emergencia.
       *
       * Sin este dato, `evaluar` rechazaba **todo** con el paro activo,
       * incluido un retroceso. La lista blanca estaba escrita y no la
       * consultaba nadie: el retroceso funcionaba durante el paro por omisión
       * —porque no pasaba por el motor—, no por diseño.
       */
      readonly tipoDeOperacion?: string;
    },
  ): Veredicto {
    const rechazos: Rechazo[] = [];

    // Una transacción sin cambios no es una transacción. Aprobarla dejaba
    // pasar un veredicto favorable incluso en modos donde el máximo es cero.
    if (cambios.length === 0) {
      return {
        permitido: false,
        rechazos: [{
          codigo: 'DEMASIADOS_PARAMETROS',
          invariante: 'INV-005',
          mensaje: 'la transacción no propone ningún cambio',
          path: null,
        }],
      };
    }

    const deSeguridad = opciones.tipoDeOperacion !== undefined
      && this.esDeSeguridad(opciones.tipoDeOperacion);

    if (this.bloqueado && !deSeguridad) {
      rechazos.push({
        codigo: 'BLOQUEADO',
        invariante: 'INV-019',
        mensaje: 'el paro de emergencia está activo: solo pasan las escrituras de seguridad',
        path: null,
      });
    }

    if (!opciones.conexionPermiteEscribir) {
      rechazos.push({
        codigo: 'CONEXION',
        invariante: 'INV-017',
        mensaje: 'la conexión no está estable o el estado confirmado no es válido',
        path: null,
      });
    }

    if (!opciones.snapshotVerificado) {
      rechazos.push({
        codigo: 'SIN_INSTANTANEA',
        invariante: 'INV-001',
        mensaje: 'no hay instantánea previa verificada en la lista de la consola',
        path: null,
      });
    }

    if (ctx.nivelAutonomia === 'ASSISTED' && !ctx.aprobacionExplicita) {
      rechazos.push({
        codigo: 'SIN_APROBACION',
        invariante: 'INV-025',
        mensaje: 'el modo asistido exige una acción explícita del usuario por cada cambio',
        path: null,
      });
    }

    if (ctx.nivelAutonomia === 'AUTO' && ctx.confianza !== 'HIGH') {
      rechazos.push({
        codigo: 'CONFIANZA_INSUFICIENTE',
        invariante: 'INV-024',
        mensaje: `el modo automático exige confianza alta, y esta recomendación es ${ctx.confianza}`,
        path: null,
      });
    }

    const maximo = maximoDeParametros(ctx.nivelAutonomia, opciones.tipoDeOperacion);
    if (cambios.length > maximo) {
      rechazos.push({
        codigo: 'DEMASIADOS_PARAMETROS',
        invariante: 'INV-005',
        mensaje: `${cambios.length} parámetros en una transacción ${ctx.nivelAutonomia}, el máximo es ${maximo}`,
        path: null,
      });
    }

    for (const c of cambios) rechazos.push(...this.evaluarCambio(c, ctx));

    return rechazos.length === 0 ? { permitido: true } : { permitido: false, rechazos };
  }

  private evaluarCambio(c: CambioPropuesto, ctx: ContextoSeguridad): Rechazo[] {
    const salida: Rechazo[] = [];

    // Primero: que la ruta y la clase declarada digan lo mismo.
    //
    // INV-008 e INV-010 están enunciadas sobre RUTAS, pero el motor decidía
    // con la clase que declaraba quien proponía el cambio. Una auditoría lo
    // comprobó ejecutando: un envío a un auxiliar de monitor etiquetado como
    // fader de canal pasaba con permitido true. Era una comprobación de
    // honestidad, no un guardia: bastaba un error de tipeo en un asistente.
    const claseReal = clasificarRuta(c.path);
    if (claseReal === null) {
      salida.push({
        codigo: 'RUTA_DESCONOCIDA',
        invariante: 'INV-008',
        mensaje:
          `la ruta ${c.path} no corresponde a ningún parámetro conocido. ` +
          'Escribir en una ruta que el dominio no sabe clasificar es escribir a ciegas',
        path: c.path,
      });
      return salida;
    }
    if (claseReal !== c.kind) {
      salida.push({
        codigo: 'RUTA_INCONSISTENTE',
        invariante: 'INV-008',
        mensaje:
          `la ruta ${c.path} es de tipo ${claseReal}, pero el cambio se declaró ` +
          `como ${c.kind}. Manda la ruta`,
        path: c.path,
      });
      return salida;
    }

    const duenio = ownership(c.kind);

    if (duenio.owner === 'USER_ONLY') {
      salida.push({
        codigo: 'PARAMETRO_DEL_USUARIO',
        invariante: 'INV-008',
        mensaje: `${c.kind} pertenece al usuario y la aplicación nunca lo escribe. ${duenio.nota}`,
        path: c.path,
      });
      return salida; // Sin sentido seguir evaluando algo que no se escribe nunca.
    }

    if (!esEscribible(c.kind)) {
      salida.push({
        codigo: 'PARAMETRO_NO_ESCRIBIBLE',
        invariante: 'INV-008',
        mensaje: `${c.kind} todavía no es escribible en esta versión. ${duenio.nota}`,
        path: c.path,
      });
      return salida;
    }

    // La ganancia de entrada solo se toca durante la configuración de canales,
    // y nunca con una toma grabada: la grabación es posterior al preamplificador,
    // así que cambiarla haría que la toma deje de representar al show.
    if (c.kind === 'PREAMP_GAIN') {
      if (ctx.sessionState !== 'CHANNEL_SETUP') {
        salida.push({
          codigo: 'ESTADO_DE_SESION',
          invariante: 'INV-006',
          mensaje: `la ganancia de entrada solo se escribe en configuración de canales, y la sesión está en ${ctx.sessionState}`,
          path: c.path,
        });
      }
      if (ctx.hayTakeDeSoundcheckActivo) {
        salida.push({
          codigo: 'TAKE_ACTIVO',
          invariante: 'INV-006',
          mensaje:
            'hay una toma de soundcheck activa. La grabación es posterior al ' +
            'preamplificador: cambiar la ganancia haría que la toma deje de representar al show',
          path: c.path,
        });
      }
    }

    // La ecualización de salida solo se escribe sobre los buses que el perfil
    // del sistema de amplificación declara. Escribir en otro bus podría estar
    // tocando un monitor.
    if (c.kind === 'OUTPUT_EQ') {
      if (!ctx.busesDeSalidaPermitidos.has(c.path)) {
        salida.push({
          codigo: 'BUS_NO_PERMITIDO',
          invariante: 'INV-008',
          mensaje: `${c.path} no está entre los buses de salida declarados en el perfil del sistema`,
          path: c.path,
        });
      }

      // Un filtro estrecho de realce en un bus de salida es el camino corto al
      // acople. Las dos constantes existían en el dominio desde el principio y
      // ninguna regla las consultaba.
      if (c.q !== undefined && c.q < Q_MINIMO_SALIDA) {
        salida.push({
          codigo: 'Q_DEMASIADO_ESTRECHO',
          invariante: 'INV-004',
          mensaje:
            `Q de ${c.q} en un bus de salida: el mínimo es ${Q_MINIMO_SALIDA}. ` +
            'Un filtro estrecho de realce sobre el sistema es el camino corto al acople',
          path: c.path,
        });
      }
      const realce = c.valorPropuesto - c.valorEsperado;
      if (realce > REALCE_MAXIMO_SALA_DB) {
        salida.push({
          codigo: 'REALCE_EXCESIVO',
          invariante: 'INV-004',
          mensaje:
            `realce de ${realce.toFixed(1)} dB sobre el sistema: el máximo es ` +
            `${REALCE_MAXIMO_SALA_DB}. La corrección de sala atenúa, no realza`,
          path: c.path,
        });
      }
    }

    const delta = c.valorPropuesto - c.valorEsperado;
    const limite = verificarLimite({
      kind: c.kind,
      deltaSolicitado: delta,
      acumuladoEnSesion: ctx.acumuladoPorRuta.get(c.path) ?? 0,
      hayMedicionPosterior: ctx.rutasConMedicionPosterior.has(c.path),
      esPrimerCambioDelParametro: !ctx.rutasYaTocadas.has(c.path),
    });

    if (!limite.permitido) {
      const mapa: Record<string, { codigo: Rechazo['codigo']; inv: string }> = {
        DELTA_CAP: { codigo: 'DELTA_EXCEDIDO', inv: 'INV-004' },
        CUMULATIVE_CAP: { codigo: 'ACUMULADO_EXCEDIDO', inv: 'INV-004' },
        SIN_MEDICION_INTERMEDIA: { codigo: 'SIN_MEDICION_INTERMEDIA', inv: 'INV-004' },
        SIN_LIMITE_DECLARADO: { codigo: 'PARAMETRO_NO_ESCRIBIBLE', inv: 'INV-004' },
      };
      const m = mapa[limite.codigo]!;
      salida.push({
        codigo: m.codigo,
        invariante: m.inv,
        mensaje: limite.mensaje,
        path: c.path,
      });
    }

    return salida;
  }
}
