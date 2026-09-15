import type { SessionState } from '@vse/domain';

/**
 * Cómo se le cuenta al usuario cada estado de la sesión.
 *
 * Los identificadores del dominio están en inglés y son técnicos, que es
 * correcto para el código. En pantalla no sirven: nadie de pie antes de un
 * show quiere leer `ROOM_OBSERVE`. La traducción vive acá, en un solo sitio,
 * y no dispersa por las plantillas.
 *
 * El `hace` no es decorativo: dice qué se puede hacer en ese estado, que es lo
 * único que el usuario necesita decidir.
 */
export interface DescripcionDeEstado {
  readonly etiqueta: string;
  readonly hace: string;
}

export const ESTADOS: Readonly<Record<SessionState, DescripcionDeEstado>> = {
  CREATED: {
    etiqueta: 'Creada',
    hace: 'Todavía sin configurar. El siguiente paso es conectar la consola.',
  },
  SETUP: {
    etiqueta: 'Configuración',
    hace: 'Conectar la consola y reconocer el equipo antes de medir nada.',
  },
  CALIBRATING: {
    etiqueta: 'Calibrando',
    hace: 'Ajustar la cadena de medición. Necesita el micrófono y la interfaz.',
  },
  ROOM_OBSERVE: {
    etiqueta: 'Observando la sala',
    hace: 'Medir cómo responde el recinto, sin corregir todavía.',
  },
  CHANNEL_SETUP: {
    etiqueta: 'Configurando canales',
    hace: 'Asignar entradas y ajustar ganancias. Es el único estado donde la ganancia se puede tocar.',
  },
  SOUNDCHECK_REC: {
    etiqueta: 'Grabando prueba',
    hace: 'Registrar una toma para poder mezclar después sin la banda tocando.',
  },
  MIX: {
    etiqueta: 'Mezclando',
    hace: 'Trabajar la relación entre fuentes.',
  },
  SOUNDCHECK_PLAY: {
    etiqueta: 'Reproduciendo prueba',
    hace: 'Escuchar la toma grabada en lugar de la banda.',
  },
  ROOM_CORRECT: {
    etiqueta: 'Corrigiendo la sala',
    hace: 'Aplicar corrección sobre los buses de salida.',
  },
  FULL_BAND: {
    etiqueta: 'Banda completa',
    hace: 'Con todos tocando: es donde se verifica que lo anterior se sostiene.',
  },
  RINGOUT: {
    etiqueta: 'Buscando realimentación',
    hace: 'Encontrar el margen antes del acople.',
  },
  SHOW: {
    etiqueta: 'En show',
    hace: 'Solo observación y ajustes mínimos. La ganancia queda congelada.',
  },
  CLOSED: {
    etiqueta: 'Cerrada',
    hace: 'Terminada. Queda en el historial.',
  },
};

/**
 * Estados en los que la aplicación no debería distraer con nada que no sea
 * lo que está pasando en la sala.
 */
// La lista vive en el dominio desde ADR-027, porque el motor de seguridad
// también la necesita: dos listas de lo mismo en dos capas se separan, y la que
// se separaría acá decide si la aplicación puede dejar un canal mudo en un show.
export { ESTADOS_EN_VIVO } from '@vse/domain';
