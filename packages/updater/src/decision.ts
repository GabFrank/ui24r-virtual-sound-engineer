import type { Bloqueo, ContextoDeActualizacion, Decision, Publicacion } from './types.ts';
import { compararVersiones, parsearVersion } from './version.ts';

/**
 * Por debajo de este nivel no se ofrece actualizar sin cargador conectado.
 *
 * La instalación en sí es atómica y una batería agotada a mitad de camino no
 * deja la aplicación rota. Lo que sí deja es una tablet apagada media hora
 * antes de un show, con la aplicación a medio descargar y sin tiempo para
 * volver a intentarlo.
 */
export const BATERIA_MINIMA_PORCENTAJE = 30;

/**
 * Decide si corresponde ofrecer una actualización.
 *
 * Es una función pura: recibe el catálogo ya leído y el contexto del
 * dispositivo, y no consulta nada. Toda la política vive acá para que se pueda
 * probar sin red, sin consola y sin tablet.
 */
export function decidirActualizacion(
  contexto: ContextoDeActualizacion,
  publicaciones: readonly Publicacion[],
): Decision {
  const instalada = parsearVersion(contexto.versionInstalada);
  if (instalada === null) {
    // Sin saber qué hay instalado no se puede decir que algo es más nuevo.
    // Ofrecer igual sería proponer una reinstalación a ciegas.
    return { tipo: 'VERSION_INSTALADA_ILEGIBLE', texto: contexto.versionInstalada };
  }

  const masNueva = [...publicaciones]
    .sort((a, b) => compararVersiones(b.version, a.version))
    .find((p) => compararVersiones(p.version, instalada) > 0);

  if (masNueva === undefined) return { tipo: 'AL_DIA' };

  const bloqueos = evaluarBloqueos(contexto);
  if (bloqueos.length > 0) {
    return { tipo: 'BLOQUEADA', publicacion: masNueva, bloqueos };
  }
  return { tipo: 'DISPONIBLE', publicacion: masNueva };
}

/** Devuelve todos los motivos, no el primero: el usuario merece la lista entera. */
export function evaluarBloqueos(contexto: ContextoDeActualizacion): readonly Bloqueo[] {
  const bloqueos: Bloqueo[] = [];

  if (contexto.sesionActiva) {
    bloqueos.push({
      motivo: 'SESION_ACTIVA',
      invariante: 'INV-034',
      explicacion:
        'Hay una sesión de sonido abierta. Actualizar reinicia la aplicación y ' +
        'cortaría la conexión con la consola en medio del trabajo.',
    });
  }
  if (contexto.conectadoAConsola && !contexto.sesionActiva) {
    // No se suma al de arriba: si ya hay sesión abierta, decir además que hay
    // conexión no agrega nada y llena la pantalla de motivos repetidos.
    bloqueos.push({
      motivo: 'CONECTADO_A_CONSOLA',
      invariante: 'INV-034',
      explicacion:
        'La aplicación está conectada a la consola. Desconectate antes de ' +
        'actualizar: al instalar, la aplicación se cierra y la conexión se corta.',
    });
  }
  if (contexto.transaccionEnCurso) {
    bloqueos.push({
      motivo: 'TRANSACCION_EN_CURSO',
      invariante: 'INV-034',
      explicacion:
        'Hay una transacción escribiendo en la consola. Si la aplicación se ' +
        'cierra ahora, quedaría a medio aplicar y sin nadie que la revierta.',
    });
  }
  if (!contexto.redDisponible) {
    bloqueos.push({
      motivo: 'SIN_RED',
      invariante: null,
      explicacion: 'No hay conexión a internet para descargar la actualización.',
    });
  }
  if (
    !contexto.enCargador &&
    contexto.bateriaPorcentaje !== null &&
    contexto.bateriaPorcentaje < BATERIA_MINIMA_PORCENTAJE
  ) {
    bloqueos.push({
      motivo: 'BATERIA_BAJA',
      invariante: null,
      explicacion:
        `La batería está por debajo del ${BATERIA_MINIMA_PORCENTAJE} %. ` +
        'Conectá el cargador antes de actualizar.',
    });
  }

  return bloqueos;
}
